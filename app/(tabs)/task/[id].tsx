import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator, TextInput, Pressable, Platform, Modal } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { triggerEarningsRefresh } from '@/lib/earningsRefresh';
import { useAuth } from '@/contexts/AuthContext';
import AnnotationCanvas, { type Annotation, type Tool } from '@/components/AnnotationCanvas';
import { ANNOTATION_LABELS, LABEL_COLORS } from '@/constants/annotationLabels';
import AudioPlayer from "../../../components/AudioPlayer";

interface TaskData {
  id: string;
  title: string;
  status?: string;
  price?: number | null;
  type?: 'audio' | 'image' | 'video' | string | null;
  category?: string | null;
  audio_url?: string;
  image_url?: string | null;
  video_url?: string | null;
  file_url?: string | null;
  transcription?: string;
  annotation_data?: unknown;
  language?: string | null;
  new_field?: string;
  another_new_field?: string;
}

interface VideoAnnotation {
  id: string;
  label: string;
  timestamp: string; // Format: "01:24"
  seconds: number; // Format: 84
}

export default function TaskDetailScreen() {
  const params = useLocalSearchParams<{ id: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { user, session, signOut, isAdmin } = useAuth();
  const [task, setTask] = useState<TaskData | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [activeTool, setActiveTool] = useState<'pan' | 'select' | 'bbox' | 'polygon' | 'points' | 'ellipse' | 'cuboid' | 'polyline' | 'semantic' | 'brush' | 'magic_wand'>('pan');
  const canvasTool: Tool = activeTool as Tool;
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<string>('');
  const [isBrushActive, setIsBrushActive] = useState(false);
  const canvasRef = useRef<any>(null);
  const videoRef = useRef<any>(null);
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';

  // Video specific states
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoAnnotations, setVideoAnnotations] = useState<VideoAnnotation[]>([]);
  const progressBarWidth = useRef(0);
  const MIN_SPEED = 0.5;
  const MAX_SPEED = 3;

  // Modal states
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [selectedObjectLabel, setSelectedObjectLabel] = useState('');

  // Audio specific states
  const [transcription, setTranscription] = useState('');
  const [transcribing, setTranscribing] = useState(false);
  const [aiFixing, setAiFixing] = useState(false);

  const audioUrl = task?.audio_url;
  const imageUrl = task?.image_url;
  const videoUrl = task?.video_url;
  const isImageTask = task?.type === 'image' || (task?.category ?? '').toString().toLowerCase().includes('image');
  const isVideoTask = task?.category === 'video' || task?.type === 'video';
  const isSubmitted = task?.status === 'submitted';

  const taskType: 'audio' | 'image' | 'video' = (() => {
    const hasImageUrl = !!task?.image_url;
    const hasVideoUrl = !!task?.video_url;
    const typeIsImage = task?.type === 'image';
    const typeIsVideo = task?.type === 'video';
    const categoryIsImage = (task?.category ?? '').toLowerCase() === 'image';
    const categoryIsVideo = (task?.category ?? '').toLowerCase() === 'video';
    
    // Video priority - check video first
    if (hasVideoUrl || typeIsVideo || categoryIsVideo) return 'video';
    // Image fallback
    if (hasImageUrl || typeIsImage || categoryIsImage) return 'image';
    // Default to audio
    return 'audio';
  })();

  useEffect(() => {
    if (!id) return;
    const fetchTask = async () => {
      const taskId = String(id);
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', taskId)
        .single();
      if (error) {
        console.log('Detay Hatası:', error);
        if (typeof window !== 'undefined') {
          window.alert('Supabase Detay Hatası: ' + error.message);
        } else {
          Alert.alert('Hata', 'Supabase Detay Hatası: ' + error.message);
        }
      }
      if (!error && data) {
        const cat = (data.category ?? '').toString().toLowerCase();
        const isVideo = data.category === 'video';
        const taskData: TaskData = {
          id: String(data.id),
          title: String(data.title ?? '') || 'İsimsiz Görev',
          status: data.status ?? 'pending',
          price: data.price != null ? Number(data.price) : 0,
          type: (data.type ?? (cat === 'video' ? 'video' : 'audio')) as 'audio' | 'image' | 'video',
          category: data.category ?? null,
          audio_url: data.audio_url ?? data.audioUrl,
          image_url: data.image_url ?? data.imageUrl ?? null,
          video_url: data.video_url ?? data.videoUrl ?? null,
          transcription: data.transcription ?? '',
          annotation_data: data.annotation_data ?? null,
          language: data.language ?? null,
        };
        setTask(taskData);
        setTranscription(taskData.transcription ?? '');
        if (Array.isArray(taskData.annotation_data)) {
          setAnnotations(taskData.annotation_data as Annotation[]);
        }
        // Load video annotations if exists
        if (Array.isArray(data.annotation_data) && isVideo) {
          const videoAnns = (data.annotation_data as any[]).filter(ann => ann.timestamp).map(ann => ({
            id: ann.id,
            label: ann.label,
            timestamp: formatTime(ann.timestamp || ann.seconds || 0),
            seconds: ann.timestamp || ann.seconds || 0
          }));
          setVideoAnnotations(videoAnns);
        }
      }
      setLoading(false);
    };
    fetchTask();
  }, [id]);

  // Video controls
  const togglePlayPause = useCallback(() => {
    setIsPlaying(prev => !prev);
  }, []);

  const handleSeek = useCallback((e: any) => {
    if (!duration || !progressBarWidth.current) return;
    const { locationX } = e.nativeEvent;
    const percentage = locationX / progressBarWidth.current;
    const newTime = percentage * duration;
    setPosition(newTime);
    setCurrentTime(newTime);
    if (videoRef.current) {
      videoRef.current.seek(newTime);
    }
  }, [duration]);

  const seekToTime = useCallback((seconds: number) => {
    if (duration && seconds >= 0 && seconds <= duration) {
      setPosition(seconds);
      setCurrentTime(seconds);
      if (videoRef.current) {
        videoRef.current.seek(seconds);
      }
    }
  }, [duration]);

  const formatTime = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  const speedUp = useCallback(() => {
    setPlaybackSpeed(prev => Math.min(MAX_SPEED, prev + 0.25));
  }, []);

  const speedDown = useCallback(() => {
    setPlaybackSpeed(prev => Math.max(MIN_SPEED, prev - 0.25));
  }, []);

  const resetToNormal = useCallback(() => {
    setPlaybackSpeed(1);
  }, []);

  // Add annotation at current time - Saniye Yakalama Mantığı
  const handleAddObjectLabel = useCallback(() => {
    if (!currentTime) return;
    
    // Videoyu durdur
    setIsPlaying(false);
    
    // Modalı aç
    setShowLabelModal(true);
  }, [currentTime]);

  const confirmObjectLabel = useCallback(() => {
    if (!selectedObjectLabel || !currentTime) return;
    
    const newAnnotation: VideoAnnotation = {
      id: `video-annotation-${Date.now()}`,
      label: selectedObjectLabel,
      timestamp: formatTime(currentTime),
      seconds: Math.floor(currentTime)
    };
    
    setVideoAnnotations(prev => [...prev, newAnnotation]);
    
    // Modalı kapat
    setShowLabelModal(false);
    setSelectedObjectLabel('');
    
    // Videoyu devam ettir
    setIsPlaying(true);
  }, [selectedObjectLabel, currentTime, formatTime]);

  // Handle annotation selection in object list
  const handleAnnotationSelect = useCallback((annotation: VideoAnnotation) => {
    setSelectedAnnotationId(annotation.id);
    seekToTime(annotation.seconds);
  }, [seekToTime]);

  // Handle label change
  const handleLabelChange = useCallback((annotationId: string, newLabel: string) => {
    setVideoAnnotations(prev => 
      prev.map(ann => ann.id === annotationId ? { ...ann, label: newLabel } : ann)
    );
  }, []);

  // Handle annotation deletion
  const handleAnnotationDelete = useCallback((annotationId: string) => {
    setVideoAnnotations(prev => prev.filter(ann => ann.id !== annotationId));
    if (selectedAnnotationId === annotationId) setSelectedAnnotationId(null);
  }, [selectedAnnotationId]);

  // Audio functions
  const handleAITranscription = useCallback(async () => {
    if (!audioUrl) return;
    setTranscribing(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 2000));
      setTranscription('This is a sample transcription from AI service.');
    } catch (err) {
      console.error('AI Transcription Error:', err);
    } finally {
      setTranscribing(false);
    }
  }, [audioUrl]);

  const handleAIFix = useCallback(async () => {
    if (!transcription.trim()) return;
    setAiFixing(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1500));
      setTranscription(prev => prev + ' (AI Fixed)');
    } catch (err) {
      console.error('AI Fix Error:', err);
    } finally {
      setAiFixing(false);
    }
  }, [transcription]);

  const handleSaveDraft = useCallback(async () => {
    if (!id || !user?.id) return;
    setSaving(true);
    try {
      // Prepare annotation data with timestamp information
      const annotationData = isVideoTask ? videoAnnotations : annotations;
      
      const { error } = await supabase
        .from('tasks')
        .update({
          transcription,
          annotation_data: annotationData,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw error;
      if (typeof window !== 'undefined') {
        window.alert(t('taskDetail.saveSuccess') || 'Kaydedildi');
      } else {
        Alert.alert(t('taskDetail.successTitle') || 'Başarılı', t('taskDetail.saveSuccess') || 'Kaydedildi');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (typeof window !== 'undefined') {
        window.alert(t('login.errorTitle') + ': ' + errorMessage);
      } else {
        Alert.alert(t('login.errorTitle'), errorMessage);
      }
    } finally {
      setSaving(false);
    }
  }, [id, user?.id, transcription, annotations, videoAnnotations, isVideoTask, t]);

  const handleSubmit = useCallback(async (navigateToNext: boolean = false) => {
    if (!id || !user?.id) return;
    setSaving(true);
    try {
      // Prepare annotation data with timestamp information
      const annotationData = isVideoTask ? videoAnnotations : annotations;
      
      const { error } = await supabase
        .from('tasks')
        .update({
          status: 'submitted',
          transcription,
          annotation_data: annotationData,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw error;
      setTask((prev) => (prev ? { ...prev, status: 'submitted' } : null));
      triggerEarningsRefresh();

      if (navigateToNext) {
        const { data: claimedTask, error: claimError } = await supabase
          .from('tasks')
          .update({ 
            assigned_to: user.id, 
            is_pool_task: false 
          })
          .is('assigned_to', null)
          .is('is_pool_task', true)
          .neq('status', 'submitted')
          .neq('status', 'completed')
          .neq('id', id)
          .order('created_at', { ascending: false })
          .limit(1)
          .select('id')
          .single();
        
        if (claimError) {
          if (claimError.code === 'PGRST116') {
            router.replace('/tasks');
            return;
          } else {
            throw claimError;
          }
        }
        
        if (claimedTask) {
          router.replace(`/task/${claimedTask.id}`);
        } else {
          router.replace('/tasks');
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (typeof window !== 'undefined') {
        window.alert(t('login.errorTitle') + ': ' + errorMessage);
      } else {
        Alert.alert(t('login.errorTitle'), errorMessage);
      }
    } finally {
      setSaving(false);
    }
  }, [id, user?.id, transcription, annotations, videoAnnotations, isVideoTask, t, router]);

  const handleSubmitAndExit = () => handleSubmit(false);
  const handleSubmitNext = () => handleSubmit(true);
  const handleExit = () => {
    try {
      router.back();
    } catch (_) {}
  };

  const getObjectDisplayName = (a: Annotation, idx: number) => {
    const labelStr = typeof a.label === 'object' ? (a.label as any).name || (a.label as any).label : a.label;
    return labelStr || `${a.type} ${idx + 1}`;
  };

  const getAnnotationTypeName = (type: string) => {
    const names = {
      bbox: 'Bounding Box',
      polygon: 'Polygon',
      points: 'Points',
      ellipse: 'Ellipse',
      cuboid: 'Cuboid',
      polyline: 'Polyline',
      semantic: 'Semantic',
      brush: 'Brush'
    };
    return names[type] || type;
  };

  const taskTypeLabel = (() => {
    const cat = (task?.category ?? '').toString().toLowerCase();
    const typ = (task?.type ?? '').toString().toLowerCase();
    const isVideo = task?.category === 'video';
    
    // Video priority
    if (cat.includes('video') || typ.includes('video')) return 'Video Annotation';
    if (cat.includes('polygon') || typ.includes('polygon')) return t('annotation.polygonAnnotation');
    if (cat.includes('bbox') || cat.includes('box') || typ.includes('bbox') || typ.includes('box')) return t('annotation.boundingBox');
    
    // Default based on task type
    return isVideo ? 'Video Annotation' : 
           taskType === 'image' ? 'Image Annotation' : 
           'Audio Transcription';
  })();

  // Loading guard
  if (loading || !task) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Görev yükleniyor...</Text>
      </View>
    );
  }
  // Video Task - Simplified 2 Column Layout
  if (isVideoTask) {
    return (
      <View style={[styles.container, isWeb && styles.containerFullWidth]}>
        {/* Top Bar with Back Button */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backButton} onPress={handleExit}>
            <Ionicons name="arrow-back" size={20} color="#3b82f6" />
            <Text style={styles.backButtonText}>Geri Dön</Text>
          </TouchableOpacity>
          
          <Text style={styles.topBarTitle}>Video Player</Text>
        </View>
        
        <View style={styles.videoLayout}>
          {/* Center Column - Video Player (70%) */}
          <View style={styles.videoCenterColumn}>
            <View style={styles.centerColumnHeader}>
              <Text style={styles.centerColumnTitle}>VIDEO PLAYER</Text>
            </View>
            
            <View style={styles.videoPlayerContainer}>
              {videoUrl ? (
                <>
                  <View style={styles.videoPlaceholder}>
                    <Ionicons name="videocam" size={48} color="#3b82f6" />
                    <Text style={styles.videoPlaceholderText}>Video Player</Text>
                    <Text style={styles.videoUrlText}>{videoUrl}</Text>
                  </View>
                  
                  <View style={styles.videoControls}>
                    <TouchableOpacity style={styles.playButton} onPress={togglePlayPause}>
                      <Ionicons name={isPlaying ? "pause" : "play"} size={24} color="#fff" />
                    </TouchableOpacity>
                    
                    <View style={styles.timeDisplay}>
                      <Text style={styles.timeText}>
                        {formatTime(position)} / {formatTime(duration || 0)}
                      </Text>
                    </View>
                    
                    <View style={styles.speedControls}>
                      <TouchableOpacity style={styles.speedButton} onPress={speedDown}>
                        <Text style={styles.speedButtonText}>-</Text>
                      </TouchableOpacity>
                      <Text style={styles.speedText}>{playbackSpeed}x</Text>
                      <TouchableOpacity style={styles.speedButton} onPress={speedUp}>
                        <Text style={styles.speedButtonText}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  
                  <View style={styles.seekBar}>
                    <View 
                      style={styles.seekBarProgress}
                      onLayout={(e) => {
                        progressBarWidth.current = e.nativeEvent.layout.width;
                      }}
                    >
                      <View 
                        style={[
                          styles.seekBarFill,
                          { width: duration ? `${(position / (duration || 1)) * 100}%` : '0%' }
                        ]}
                      />
                    </View>
                    <TouchableOpacity
                      style={styles.seekBarThumb}
                      onPress={handleSeek}
                    />
                  </View>
                </>
              ) : (
                <View style={styles.videoPlaceholder}>
                  <Ionicons name="videocam-off" size={48} color="#64748b" />
                  <Text style={styles.videoPlaceholderText}>No Video Available</Text>
                </View>
              )}
            </View>
            
            {/* Etiketle Button Outside Video Container */}
            <View style={styles.videoControlBar}>
              <TouchableOpacity 
                style={styles.etiketleButton} 
                onPress={handleAddObjectLabel}
              >
                <Ionicons name="add" size={16} color="#ffffff" />
                <Text style={styles.etiketleButtonText}>Select Object</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Right Column - Object List (30%) */}
          <View style={styles.videoRightColumn}>
            <View style={styles.rightColumnHeader}>
              <Text style={styles.rightColumnTitle}>OBJECT LIST</Text>
            </View>
            
            <View style={styles.objectList}>
              {videoAnnotations.length === 0 ? (
                <Text style={styles.objectListEmpty}>No objects marked yet</Text>
              ) : (
                videoAnnotations.map((annotation) => (
                  <View 
                    key={annotation.id} 
                    style={[
                      styles.objectCard,
                      selectedAnnotationId === annotation.id && styles.objectCardSelected
                    ]}
                  >
                    <View style={styles.objectCardHeader}>
                      <TouchableOpacity 
                        style={styles.objectCardTitleContainer}
                        onPress={() => handleAnnotationSelect(annotation)}
                      >
                        <Text style={styles.objectCardTitle}>
                          {annotation.label}
                        </Text>
                        <View style={styles.timestampBadge}>
                          <Text style={styles.timestampText}>{annotation.timestamp}</Text>
                        </View>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.deleteToolBtn,
                          selectedAnnotationId === annotation.id && styles.deleteToolBtnActive
                        ]}
                        onPress={() => handleAnnotationDelete(annotation.id)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="trash-outline" size={16} color="#ef4444" />
                      </TouchableOpacity>
                    </View>
                    <View style={styles.labelOptionsGrid}>
                      {ANNOTATION_LABELS.map((label) => (
                        <TouchableOpacity
                          key={label}
                          style={[
                            styles.labelOptionChip,
                            annotation.label === label && {
                              backgroundColor: LABEL_COLORS[label] || '#3b82f6',
                              borderColor: LABEL_COLORS[label] || '#3b82f6',
                            },
                          ]}
                          onPress={() => handleLabelChange(annotation.id, label)}
                        >
                          <Text
                            style={[
                              styles.labelOptionText,
                              annotation.label === label && { color: '#fff' },
                            ]}
                          >
                            {label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ))
              )}
            </View>
          </View>
        </View>

        {/* Label Selection Modal */}
        <Modal
          visible={showLabelModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowLabelModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Nesne Türünü Seç</Text>
              <View style={styles.modalLabelGrid}>
                {ANNOTATION_LABELS.map((label) => (
                  <TouchableOpacity
                    key={label}
                    style={[
                      styles.modalLabelOption,
                      selectedObjectLabel === label && styles.modalLabelOptionSelected
                    ]}
                    onPress={() => setSelectedObjectLabel(label)}
                  >
                    <Text style={[
                      styles.modalLabelText,
                      selectedObjectLabel === label && { color: '#fff' }
                    ]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.modalCancelButton}
                  onPress={() => setShowLabelModal(false)}
                >
                  <Text style={styles.modalCancelText}>İptal</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modalConfirmButton,
                    !selectedObjectLabel && styles.modalConfirmButtonDisabled
                  ]}
                  onPress={confirmObjectLabel}
                  disabled={!selectedObjectLabel}
                >
                  <Text style={styles.modalConfirmText}>Ekle</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <View style={styles.footer}>
          <View style={styles.bottomButtonBar}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity style={styles.exitButton} onPress={handleExit}>
                <Text style={styles.exitButtonText}>Exit</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.submitExitButton} onPress={() => handleSubmit(false)}>
                <Text style={styles.submitExitButtonText}>Submit & Exit</Text>
              </TouchableOpacity>
            </View>
            
            <TouchableOpacity style={styles.submitButtonGreen} onPress={() => handleSubmit(true)}>
              <Text style={styles.submitButtonGreenText}>Submit</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // Image Task - Original 2 Column Layout
  if (taskType === 'image') {
    return (
      <View style={[styles.container, isWeb && styles.containerFullWidth]}>
        <View style={styles.taskInfoBar}>
          <Text style={styles.taskInfoType}>{taskTypeLabel}</Text>
          <View style={styles.taskInfoPriceBadge}>
            <Text style={styles.taskInfoPriceText}>{task?.price ?? 0} TL</Text>
          </View>
        </View>
        <View style={styles.annotationLayout}>
          <View style={styles.leftToolbarCol}>
            <TouchableOpacity
              style={[styles.toolBtnLarge, activeTool === 'pan' && !isBrushActive && styles.toolBtnActivePurple]}
              onPress={() => { setActiveTool('pan'); setIsBrushActive(false); }}
              activeOpacity={0.8}
              {...(isWeb ? { accessibilityLabel: 'Pan (G)', title: 'Pan (G)' } as any : {})}
            >
              <Ionicons name="hand-right-outline" size={20} color="#f1f5f9" />
              <Text style={styles.toolBtnLargeText}>Pan</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.toolBtnLarge, activeTool === 'undo' && !isBrushActive && styles.toolBtnActivePurple]}
              onPress={() => {
                if (canvasRef.current?.handleUndo) {
                  canvasRef.current.handleUndo();
                } else {
                  if (annotations.length > 0) {
                    setAnnotations(prev => prev.slice(0, -1));
                  }
                }
              }}
              activeOpacity={0.8}
              {...(isWeb ? { accessibilityLabel: 'Undo (V)', title: 'Undo (V)' } as any : {})}
            >
              <Ionicons name="arrow-undo-outline" size={20} color="#f1f5f9" />
              <Text style={styles.toolBtnLargeText}>Undo</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.toolBtnLarge, activeTool === 'bbox' && !isBrushActive && styles.toolBtnActivePurple]}
              onPress={() => { setActiveTool('bbox'); setIsBrushActive(false); }}
              activeOpacity={0.8}
              {...(isWeb ? { accessibilityLabel: 'Bounding Box (R)', title: 'Bounding Box (R)' } as any : {})}
            >
              <Ionicons name="square-outline" size={20} color="#f1f5f9" />
              <Text style={styles.toolBtnLargeText}>BBox</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.toolBtnLarge, activeTool === 'polygon' && !isBrushActive && styles.toolBtnActivePurple]}
              onPress={() => { setActiveTool('polygon'); setIsBrushActive(false); }}
              activeOpacity={0.8}
              {...(isWeb ? { accessibilityLabel: 'Polygon (P)', title: 'Polygon (P)' } as any : {})}
            >
              <Ionicons name="git-merge-outline" size={20} color="#f1f5f9" />
              <Text style={styles.toolBtnLargeText}>Polygon</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.toolBtnLarge, activeTool === 'points' && !isBrushActive && styles.toolBtnActivePurple]}
              onPress={() => { setActiveTool('points'); setIsBrushActive(false); }}
              activeOpacity={0.8}
              {...(isWeb ? { accessibilityLabel: 'Points (N)', title: 'Points (N)' } as any : {})}
            >
              <Ionicons name="radio-button-off-outline" size={20} color="#f1f5f9" />
              <Text style={styles.toolBtnLargeText}>Points</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.toolBtnLarge, styles.deleteToolBtn]}
              onPress={() => selectedAnnotationId && handleAnnotationDelete(selectedAnnotationId)}
              activeOpacity={0.8}
              {...(isWeb ? { accessibilityLabel: 'Delete Selected', title: 'Delete Selected' } as any : {})}
            >
              <Ionicons name="trash-outline" size={20} color="#ef4444" />
              <Text style={styles.deleteToolBtnText}>Delete</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.annotationMain}>
            <View style={styles.annotationCanvasWrapFullWidth}>
              <View style={styles.canvasWorkspace}>
                <AnnotationCanvas
                  ref={canvasRef}
                  imageUrl={imageUrl}
                  initialAnnotations={task?.annotation_data}
                  taskId={task?.id || ''}
                  annotations={annotations}
                  onAnnotationsChange={setAnnotations}
                  activeTool={canvasTool}
                  selectedAnnotationId={selectedAnnotationId}
                  onSelectAnnotation={setSelectedAnnotationId}
                  onUndo={() => {
                    if (annotations.length > 0) {
                      setAnnotations(prev => prev.slice(0, -1));
                    }
                  }}
                />
              </View>
            </View>
          </View>

          <View style={styles.rightSidebar}>
            <Text style={styles.rightSidebarTitle}>Objects</Text>
            <View style={styles.objectList}>
              {annotations.length === 0 ? (
                <Text style={styles.objectListEmpty}>No objects yet</Text>
              ) : (
                annotations.map((annotation, idx) => (
                  <View key={annotation.id} style={styles.objectCardWrap}>
                    <View style={styles.objectCard}>
                      <View style={styles.objectCardHeader}>
                        <Text style={styles.objectCardTitle}>
                          {getObjectDisplayName(annotation, idx)}
                        </Text>
                        <TouchableOpacity
                          style={[
                            styles.deleteToolBtn,
                            selectedAnnotationId === annotation.id && styles.deleteToolBtnActive
                          ]}
                          onPress={() => handleAnnotationDelete(annotation.id)}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="trash-outline" size={14} color="#ef4444" />
                        </TouchableOpacity>
                      </View>
                      <View style={styles.labelOptionsGrid}>
                        {ANNOTATION_LABELS.map((label) => (
                          <TouchableOpacity
                            key={label}
                            style={[
                              styles.labelOptionChip,
                              annotation.label === label && {
                                backgroundColor: LABEL_COLORS[label] || '#3b82f6',
                                borderColor: LABEL_COLORS[label] || '#3b82f6',
                              },
                            ]}
                            onPress={() => handleLabelChange(annotation.id, label)}
                          >
                            <Text
                              style={[
                                styles.labelOptionText,
                                annotation.label === label && { color: '#fff' },
                              ]}
                            >
                              {label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  </View>
                ))
              )}
            </View>
          </View>
        </View>

        <View style={styles.footer}>
          <View style={styles.bottomButtonBar}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity style={styles.exitButton} onPress={handleExit}>
                <Text style={styles.exitButtonText}>Exit</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.submitExitButton} onPress={() => handleSubmit(false)}>
                <Text style={styles.submitExitButtonText}>Submit & Exit</Text>
              </TouchableOpacity>
            </View>
            
            <TouchableOpacity style={styles.submitButtonGreen} onPress={() => handleSubmit(true)}>
              <Text style={styles.submitButtonGreenText}>Submit</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // Audio task
  return (
    <View style={[styles.container, isWeb && styles.containerFullWidth]}>
      <View style={styles.taskInfoBar}>
        <Text style={styles.taskInfoType}>{taskTypeLabel}</Text>
        <View style={styles.taskInfoPriceBadge}>
          <Text style={styles.taskInfoPriceText}>{task?.price ?? 0} TL</Text>
        </View>
      </View>
      
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.audioSection}>
          <View style={styles.audioHeader}>
            <Text style={styles.sectionLabel}>{t('taskDetail.audioLabel')}</Text>
          </View>
          <View style={styles.audioPlayerWrapper}>
            {audioUrl ? (
              <AudioPlayer
                audioUrl={audioUrl}
                isPlaying={isPlaying}
                setIsPlaying={setIsPlaying}
                position={position}
                setPosition={setPosition}
                duration={duration}
                setDuration={setDuration}
                playbackSpeed={playbackSpeed}
                setPlaybackSpeed={setPlaybackSpeed}
                progressBarWidth={progressBarWidth}
                onSeek={handleSeek}
                formatTime={formatTime}
                speedUp={speedUp}
                speedDown={speedDown}
                resetToNormal={resetToNormal}
                MIN_SPEED={MIN_SPEED}
                MAX_SPEED={MAX_SPEED}
              />
            ) : (
              <Text style={styles.noAudioText}>{t('taskDetail.noAudio')}</Text>
            )}
          </View>
        </View>

        <View style={styles.transcriptionSection}>
          <View style={styles.transcriptionHeader}>
            <Text style={styles.sectionLabel}>{t('taskDetail.transcriptionLabel')}</Text>
          </View>
          <View style={styles.aiButtonWrapper}>
            <Pressable
              style={[
                styles.aiTranscribeButton,
                transcribing && styles.aiTranscribeButtonDisabled,
                { zIndex: 9999 },
              ]}
              onPress={handleAITranscription}
              disabled={transcribing}
            >
              {transcribing ? (
                <>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={styles.aiTranscribeButtonText}>
                    {t('taskDetail.aiTranscribing')}
                  </Text>
                </>
              ) : (
                <>
                  <Ionicons name="sparkles" size={18} color="#fff" />
                  <Text style={styles.aiTranscribeButtonText}>
                    {t('taskDetail.aiTranscribe')}
                  </Text>
                </>
              )}
            </Pressable>
          </View>
          <View style={styles.transcriptionCard}>
            <TextInput
              style={styles.transcriptionInput}
              placeholder={t('taskDetail.transcriptionPlaceholder')}
              placeholderTextColor="#64748b"
              value={transcription}
              onChangeText={setTranscription}
              multiline
              textAlignVertical="top"
              editable={true}
            />
          </View>
          <View style={styles.aiButtonWrapper}>
            <Pressable
              style={[
                styles.aiTranscribeButton,
                aiFixing && styles.aiTranscribeButtonDisabled,
                { zIndex: 9999 },
              ]}
              onPress={handleAIFix}
              disabled={aiFixing}
            >
              {aiFixing ? (
                <>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={styles.aiTranscribeButtonText}>
                    AI Fixing...
                  </Text>
                </>
              ) : (
                <>
                  <Ionicons name="sparkles" size={18} color="#fff" />
                  <Text style={styles.aiTranscribeButtonText}>
                    ✨ AI Fix
                  </Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.bottomButtonBar}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity style={styles.exitButton} onPress={handleExit}>
              <Text style={styles.exitButtonText}>Exit</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.submitExitButton} onPress={() => handleSubmit(false)}>
              <Text style={styles.submitExitButtonText}>Submit & Exit</Text>
            </TouchableOpacity>
          </View>
          
          <TouchableOpacity style={styles.submitButtonGreen} onPress={() => handleSubmit(true)}>
            <Text style={styles.submitButtonGreenText}>Submit</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#0f172a',
  },
  containerFullWidth: {
    width: '100%',
    maxWidth: '100%',
    alignSelf: 'stretch',
    marginHorizontal: 0,
    paddingHorizontal: 0,
    marginLeft: 0,
    marginRight: 0,
  },
  loadingText: { 
    color: '#94a3b8', 
    fontSize: 14, 
    textAlign: 'center', 
    marginTop: 4 
  },
  
  // Top Bar Styles
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 4,
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3b82f6',
    marginLeft: 8,
  },
  addObjectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3b82f6',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  addObjectButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  
  // Video Layout Styles (70/30)
  videoLayout: {
    flex: 1,
    flexDirection: 'row',
  },
  videoCenterColumn: {
    flex: 0.7,
    backgroundColor: '#0f172a',
  },
  videoRightColumn: {
    flex: 0.3,
    backgroundColor: '#1e293b',
    borderLeftWidth: 1,
    borderLeftColor: '#334155',
  },
  centerColumnHeader: {
    padding: 4,
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  centerColumnTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#f1f5f9',
    textAlign: 'center',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  rightColumnHeader: {
    padding: 4,
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  rightColumnTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#f1f5f9',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  
  // Video Player Styles
  videoPlayerContainer: {
    flex: 1,
    padding: 8,
  },
  videoPlaceholder: {
    flex: 1,
    minHeight: 500,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 0,
  },
  videoPlaceholderText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#3b82f6',
    marginTop: 8,
    marginBottom: 4,
  },
  videoUrlText: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
  },
  videoControlBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
    marginTop: 0,
    paddingBottom: 4,
    marginVertical: 4,
  },
  etiketleButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 30,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  etiketleButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  videoControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  playButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  timeDisplay: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  timeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f1f5f9',
  },
  speedControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  speedButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
  },
  speedButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#f1f5f9',
  },
  speedText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f1f5f9',
    minWidth: 50,
    textAlign: 'center',
  },
  seekBar: {
    height: 8,
    backgroundColor: '#1e293b',
    borderRadius: 4,
    overflow: 'hidden',
    marginHorizontal: 16,
  },
  seekBarProgress: {
    height: '100%',
    backgroundColor: '#3b82f6',
    borderRadius: 4,
  },
  seekBarFill: {
    height: '100%',
    backgroundColor: '#3b82f6',
  },
  seekBarThumb: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 16,
    height: '100%',
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#3b82f6',
  },
  
  // Object List Styles
  objectList: {
    flex: 1,
  },
  objectListEmpty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  objectCard: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  objectCardSelected: {
    borderColor: '#3b82f6',
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
  },
  objectCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  objectCardTitleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  objectCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f1f5f9',
  },
  timestampBadge: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  timestampText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#ffffff',
  },
  deleteToolBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: '#ef4444',
    borderWidth: 1,
    borderRadius: 4,
    padding: 4,
  },
  deleteToolBtnActive: {
    backgroundColor: '#ef4444',
  },
  labelOptionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  labelOptionChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#334155',
  },
  labelOptionText: {
    fontSize: 10,
    fontWeight: '500',
    color: '#94a3b8',
  },
  
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 24,
    width: '80%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: '#334155',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f1f5f9',
    textAlign: 'center',
    marginBottom: 20,
  },
  modalLabelGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  modalLabelOption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
  },
  modalLabelOptionSelected: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  modalLabelText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#f1f5f9',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#64748b',
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  modalConfirmButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
  },
  modalConfirmButtonDisabled: {
    backgroundColor: '#64748b',
  },
  modalConfirmText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  
  // Original Image Layout Styles (preserved)
  taskInfoBar: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 1000,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  taskInfoType: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8',
    backgroundColor: 'rgba(148, 163, 184, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  taskInfoPriceBadge: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  taskInfoPriceText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#22c55e',
  },
  annotationLayout: {
    flex: 1,
    flexDirection: 'row',
  },
  leftToolbarCol: {
    width: 42,
    minWidth: 42,
    maxWidth: 42,
    padding: 3,
    backgroundColor: '#0f172a',
    borderRightWidth: 1,
    borderRightColor: '#334155',
    flexDirection: 'column',
    gap: 3,
    paddingBottom: 120,
  },
  toolBtnLarge: {
    width: 40,
    height: 40,
    borderRadius: 4,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'column',
    padding: 6,
    gap: 1,
  },
  toolBtnActivePurple: {
    backgroundColor: '#7c3aed',
    borderColor: '#7c3aed',
  },
  toolBtnLargeText: { 
    fontSize: 8, 
    color: '#f1f5f9', 
    marginTop: 1, 
    fontWeight: '500' 
  },
  deleteToolBtnText: { 
    color: '#ef4444' 
  },
  annotationMain: { 
    flex: 1, 
    minWidth: 0, 
    minHeight: 300 
  },
  annotationCanvasWrapFullWidth: { 
    flex: 1, 
    width: '100%', 
    minHeight: 400, 
    alignSelf: 'stretch' 
  },
  canvasWorkspace: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#334155',
  },
  rightSidebar: {
    width: 280,
    minWidth: 280,
    maxWidth: 280,
    padding: 8,
    backgroundColor: '#1e293b',
    borderLeftWidth: 1,
    borderLeftColor: '#334155',
    flexDirection: 'column',
  },
  rightSidebarTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#f1f5f9',
    marginBottom: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  objectCardWrap: { 
    marginBottom: 8 
  },
  footer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: '#0f172a',
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  bottomButtonBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#0f172a',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  exitButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  exitButtonText: { 
    fontSize: 14, 
    color: '#ef4444', 
    fontWeight: '600' 
  },
  submitExitButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#3b82f6',
  },
  submitExitButtonText: { 
    fontSize: 14, 
    color: '#fff', 
    fontWeight: '600' 
  },
  submitButtonGreen: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#22c55e',
  },
  submitButtonGreenText: { 
    fontSize: 14, 
    color: '#fff', 
    fontWeight: '600' 
  },
  submitButtonDisabled: { 
    opacity: 0.6 
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  audioSection: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  audioHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f1f5f9',
  },
  audioPlayerWrapper: {
    padding: 16,
  },
  noAudioText: {
    fontSize: 14,
    color: '#64748b',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 20,
  },
  transcriptionSection: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  transcriptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  aiButtonWrapper: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  aiTranscribeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#22c55e',
    borderRadius: 8,
  },
  aiTranscribeButtonDisabled: { 
    opacity: 0.6 
  },
  aiTranscribeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  transcriptionCard: {
    margin: 16,
    backgroundColor: '#0f172a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  transcriptionInput: {
    minHeight: 120,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: '#f1f5f9',
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
});