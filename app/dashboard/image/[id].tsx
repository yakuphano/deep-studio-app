import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator, TextInput, Pressable, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { triggerEarningsRefresh } from '@/lib/earningsRefresh';
import { useAuth } from '@/contexts/AuthContext';
import AnnotationCanvas, { type Annotation, type Tool } from '@/components/AnnotationCanvas';
import { resolveTaskImageUrl } from '@/lib/audioUrl';
import WorkbenchImageToolRail from '@/components/workbench/WorkbenchImageToolRail';
import {
  ANNOTATION_LABELS,
  mergeAnnotationChipLabels,
  resolveAnnotationLabelColor,
  customLabelDefinitionsToMap,
  type CustomLabelDefinition,
} from '@/constants/annotationLabels';
import { WorkbenchObjectListChrome } from '@/components/workbench/WorkbenchObjectListChrome';
import { DEFAULT_BRUSH_COLOR } from '@/types/annotations';
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
}

export default function ImageTaskDetailScreen() {
  const params = useLocalSearchParams<{ id: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const navigateBackFromDetail = useCallback(() => {
    try {
      if (typeof router.canGoBack === 'function' && router.canGoBack()) {
        router.back();
      } else {
        router.replace('/dashboard/image');
      }
    } catch {
      router.replace('/dashboard/image');
    }
  }, [router]);
  const { t, i18n } = useTranslation();
  const { user, session, signOut, isAdmin } = useAuth();
  const [task, setTask] = useState<TaskData | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [activeTool, setActiveTool] = useState<Tool>('pan');
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<string>('');
  const [isBrushActive, setIsBrushActive] = useState(false);
  const [brushColor, setBrushColor] = useState(DEFAULT_BRUSH_COLOR);
  const [brushPaletteOpen, setBrushPaletteOpen] = useState(false);
  const [extraLabelDefinitions, setExtraLabelDefinitions] = useState<CustomLabelDefinition[]>([]);
  const canvasRef = useRef<any>(null);
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';

  // Audio specific states
  const [transcription, setTranscription] = useState('');
  const [transcribing, setTranscribing] = useState(false);
  const [aiFixing, setAiFixing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const progressBarWidth = useRef(0);
  const MIN_SPEED = 0.5;
  const MAX_SPEED = 3;

  const audioUrl = task?.audio_url;
  const imageUrl = task?.image_url;
  const videoUrl = task?.video_url;
  const isImageTask = task?.type === 'image' || (task?.category ?? '').toString().toLowerCase().includes('image');
  const isSubmitted = task?.status === 'submitted';

  const taskType: 'audio' | 'image' | 'video' = (() => {
    const hasImageUrl = !!task?.image_url;
    const hasVideoUrl = !!task?.video_url;
    const typeIsImage = task?.type === 'image';
    const typeIsVideo = task?.type === 'video';
    const categoryIsImage = (task?.category ?? '').toLowerCase() === 'image';
    const categoryIsVideo = (task?.category ?? '').toLowerCase() === 'video';
    
    // Image priority for this screen
    if (hasImageUrl || typeIsImage || categoryIsImage) return 'image';
    // Video fallback
    if (hasVideoUrl || typeIsVideo || categoryIsVideo) return 'video';
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
        const taskData: TaskData = {
          id: String(data.id),
          title: String(data.title ?? '') || 'İsimsiz Görev',
          status: data.status ?? 'pending',
          price: data.price != null ? Number(data.price) : 0,
          type: (data.type ?? (cat === 'video' ? 'video' : 'image')) as 'audio' | 'image' | 'video',
          category: data.category ?? null,
          audio_url: data.audio_url ?? data.audioUrl,
          image_url: data.image_url ?? data.imageUrl ?? null,
          file_url: data.file_url ?? null,
          transcription: data.transcription ?? '',
          annotation_data: data.annotation_data ?? null,
          language: data.language ?? null,
        };
        setTask(taskData);
        setTranscription(taskData.transcription ?? '');
        if (Array.isArray(taskData.annotation_data)) {
          setAnnotations(taskData.annotation_data as Annotation[]);
        }
      }
      setLoading(false);
    };
    fetchTask();
  }, [id]);

  useEffect(() => {
    if (activeTool !== 'brush') setBrushPaletteOpen(false);
  }, [activeTool]);

  const togglePlayPause = useCallback(() => {
    setIsPlaying(prev => !prev);
  }, []);

  const handleSeek = useCallback((e: any) => {
    if (!duration || !progressBarWidth.current) return;
    const { locationX } = e.nativeEvent;
    const percentage = locationX / progressBarWidth.current;
    setPosition(percentage * duration);
  }, [duration]);

  const formatTime = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
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

  const handleAITranscription = useCallback(async () => {
    if (!audioUrl) return;
    setTranscribing(true);
    try {
      // Mock AI transcription
      await new Promise(resolve => setTimeout(resolve, 2000));
      setTranscription('This is a sample transcription from the AI service.');
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
      // Mock AI fix
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
      const { error } = await supabase
        .from('tasks')
        .update({
          transcription,
          annotation_data: annotations,
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
  }, [id, user?.id, transcription, annotations, t]);

  const handleSubmit = useCallback(async (navigateToNext: boolean = false) => {
    if (!id || !user?.id) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('tasks')
        .update({
          status: 'submitted',
          transcription,
          annotation_data: annotations,
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
            router.replace('/dashboard');
            return;
          } else {
            throw claimError;
          }
        }
        
        if (claimedTask) {
          router.replace(`/task/${claimedTask.id}`);
        } else {
          router.replace('/dashboard');
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
  }, [id, user?.id, transcription, annotations, t, router]);

  const handleSubmitAndExit = () => handleSubmit(false);
  const handleSubmitNext = () => handleSubmit(true);
  const handleExit = useCallback(() => {
    navigateBackFromDetail();
  }, [navigateBackFromDetail]);

  const handleDeleteAnnotation = useCallback((id: string) => {
    setAnnotations(prev => prev.filter(a => a.id !== id));
    if (selectedAnnotationId === id) setSelectedAnnotationId(null);
  }, [selectedAnnotationId]);

  const handleUpdateAnnotationLabel = useCallback((id: string, label: string) => {
    setAnnotations(prev => prev.map(a => a.id === id ? { ...a, label } : a));
  }, []);

  const builtInLabelSet = useMemo(
    () => new Set<string>(ANNOTATION_LABELS as unknown as string[]),
    []
  );

  const handleAddExtraLabelOption = useCallback(
    (raw: string, color: string) => {
      const label = raw.trim();
      if (!label || builtInLabelSet.has(label)) return;
      const c = String(color ?? '').trim();
      setExtraLabelDefinitions((prev) => {
        const i = prev.findIndex((d) => d.label === label);
        if (i >= 0) {
          const next = [...prev];
          next[i] = { label, color: c };
          return next;
        }
        return [...prev, { label, color: c }];
      });
    },
    [builtInLabelSet]
  );

  const handleRemoveExtraLabelOption = useCallback((label: string) => {
    setExtraLabelDefinitions((prev) => prev.filter((d) => d.label !== label));
    setAnnotations((prev) =>
      prev.map((a) => {
        const cur =
          typeof a.label === 'object' && a.label !== null
            ? String((a.label as any).name ?? (a.label as any).label ?? '')
            : String(a.label ?? '');
        return cur === label ? { ...a, label: 'Other' } : a;
      })
    );
  }, []);

  const chipLabels = useMemo(
    () => mergeAnnotationChipLabels(extraLabelDefinitions.map((d) => d.label)),
    [extraLabelDefinitions]
  );

  const labelColorOverrides = useMemo(
    () => customLabelDefinitionsToMap(extraLabelDefinitions),
    [extraLabelDefinitions]
  );

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
      cuboid_wire: 'Cuboid (wire)',
      polyline: 'Polyline',
      semantic: 'Semantic',
      brush: 'Brush'
    };
    return names[type as keyof typeof names] ?? type;
  };

  const taskTypeLabel = (() => {
    const cat = (task?.category ?? '').toString().toLowerCase();
    const typ = (task?.type ?? '').toString().toLowerCase();
    if (cat.includes('polygon') || typ.includes('polygon')) return t('annotation.polygonAnnotation');
    if (cat.includes('bbox') || cat.includes('box') || typ.includes('bbox') || typ.includes('box')) return t('annotation.boundingBox');
    return task?.type === 'image' ? t('annotation.imageAnnotation') : t('annotation.annotation');
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

  if (taskType === 'image') {
    return (
      <View style={[styles.container, isWeb && styles.containerFullWidth]}>
        {/* Header with Back Button */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 20,
          paddingVertical: 8, // İNCELTİLDİ
          marginBottom: 4,
          backgroundColor: '#0f172a', // SAYFA RENGİ
          height: 40, // İNCELTİLDİ
          zIndex: 1000,
        }}>
          <TouchableOpacity 
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: 6,
              paddingHorizontal: 12,
              borderRadius: 8,
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              marginRight: 15,
            }} 
            onPress={navigateBackFromDetail}
          >
            <Ionicons name="arrow-back" size={20} color="#3b82f6" />
            <Text style={{ fontSize: 16, fontWeight: '600', color: '#3b82f6', marginLeft: 8 }}>Back</Text>
          </TouchableOpacity>
        </View>
        
        {/* Task Info Overlay */}
        <View style={styles.taskInfoBar}>
          <Text style={styles.taskInfoType}>{taskTypeLabel}</Text>
          <View style={styles.taskInfoPriceBadge}>
            <Text style={styles.taskInfoPriceText}>{task?.price ?? 0} TL</Text>
          </View>
        </View>
        <View style={styles.annotationLayout}>
          <View style={styles.leftToolbarCol}>
            <WorkbenchImageToolRail
              activeTool={activeTool}
              isBrushActive={isBrushActive}
              onToolChange={(t) => {
                setActiveTool(t);
                setIsBrushActive(false);
              }}
              onUndo={() => {
                try {
                  if (canvasRef.current?.handleUndo) {
                    canvasRef.current.handleUndo();
                  } else if (canvasRef.current?.undo) {
                    canvasRef.current.undo();
                  } else if (annotations && annotations.length > 0) {
                    setAnnotations((prev) => prev.slice(0, -1));
                  }
                } catch (e) {
                  console.error('Undo tool error:', e);
                }
              }}
              onResetImageView={() => {
                try {
                  canvasRef.current?.resetView?.();
                } catch (e) {
                  console.error('Reset view error:', e);
                }
              }}
              selectedAnnotationId={selectedAnnotationId}
              onDeleteSelected={() => {
                if (selectedAnnotationId) handleDeleteAnnotation(selectedAnnotationId);
              }}
              brushColor={brushColor}
              onBrushColorChange={setBrushColor}
              brushPaletteOpen={brushPaletteOpen}
              onBrushPaletteOpenChange={setBrushPaletteOpen}
            />
          </View>

          {/* Center Canvas */}
          <View style={styles.annotationMain}>
            <View style={[styles.annotationCanvasWrapFullWidth, styles.canvasWorkspace, styles.canvasWorkspaceWithGrid]}>
              {isWeb && (
                <View
                  style={[StyleSheet.absoluteFillObject, styles.canvasGridOverlay, { pointerEvents: 'none' }]}
                />
              )}
              <AnnotationCanvas
                ref={canvasRef}
                hideFloatingToolbar
                imageUrl={
                  resolveTaskImageUrl(
                    String(task.image_url ?? task.file_url ?? imageUrl ?? '').trim()
                  ) ?? undefined
                }
                initialAnnotations={task.annotation_data}
                taskId={task.id}
                annotations={annotations}
                onAnnotationsChange={setAnnotations}
                activeTool={activeTool}
                selectedId={selectedAnnotationId}
                onSelect={setSelectedAnnotationId}
                selectedLabel={selectedLabel}
                isBrushActive={isBrushActive}
                onToolChange={(tool) => {
                  try {
                    setActiveTool(tool);
                  } catch (e) {
                    console.error('Tool change error:', e);
                  }
                }}
                onUndo={() => {
                  if (canvasRef.current?.handleUndo) {
                    canvasRef.current.handleUndo();
                  } else if (canvasRef.current?.undo) {
                    canvasRef.current.undo();
                  } else if (annotations.length > 0) {
                    setAnnotations(prev => prev.slice(0, -1));
                  }
                }}
                brushColor={brushColor}
                onBrushColorChange={setBrushColor}
                brushPaletteOpen={brushPaletteOpen}
                onBrushPaletteOpenChange={setBrushPaletteOpen}
                labelColorOverrides={labelColorOverrides}
              />
            </View>
          </View>
          
          {/* Right Sidebar */}
          <View style={styles.rightSidebar}>
            <WorkbenchObjectListChrome
              extraLabelDefinitions={extraLabelDefinitions}
              onAddExtraLabelOption={handleAddExtraLabelOption}
              onRemoveExtraLabelOption={handleRemoveExtraLabelOption}
            />
            <ScrollView style={styles.objectList} showsVerticalScrollIndicator={false}>
              {annotations.length === 0 ? (
                <Text style={styles.objectListEmpty}>No objects yet</Text>
              ) : (
                annotations.map((a, idx) => {
                  const labelStr = typeof a.label === 'object' ? (a.label as any).name || (a.label as any).label : a.label;
                  const labelColor = labelStr
                    ? resolveAnnotationLabelColor(labelStr, labelColorOverrides)
                    : null;
                  return (
                    <View key={a.id} style={styles.objectCardWrap}>
                      <View style={[styles.objectCard, labelColor && { borderLeftColor: labelColor, borderLeftWidth: 4 }]}>
                        <View style={styles.objectCardHeader}>
                          <Text style={styles.objectCardTitle}>{getObjectDisplayName(a, idx)}</Text>
                          <TouchableOpacity
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            onPress={() => handleDeleteAnnotation(a.id)}
                          >
                            <Ionicons name="trash-outline" size={16} color="#94a3b8" />
                          </TouchableOpacity>
                        </View>
                       
                          <View style={styles.labelOptionsGrid}>
                            {chipLabels.map((label) => {
                              const isSelected = a.label === label;
                              const chipColor = resolveAnnotationLabelColor(
                                label,
                                labelColorOverrides
                              );
                              return (
                                <TouchableOpacity
                                  key={label}
                                  style={[
                                    styles.labelOptionChip,
                                    {
                                      borderColor: chipColor,
                                      backgroundColor: isSelected ? chipColor : 'transparent',
                                    }
                                  ]}
                                  onPress={() => {
                                    handleUpdateAnnotationLabel(a.id, label);
                                    setSelectedLabel(label);
                                  }}
                                >
                                  <Text style={[styles.labelOptionText, { color: isSelected ? '#fff' : chipColor }]}>
                                    {label}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>
            {isSubmitted && (
              <View style={styles.submittedBadgeCompact}>
                <Ionicons name="checkmark-circle" size={14} color="#fff" />
                <Text style={styles.submittedText}>{t('tasks.submitted')}</Text>
              </View>
            )}
          </View>
        </View>
        
        {/* Bottom Button Bar */}
        {!isSubmitted && (
          <View style={styles.bottomButtonBar}>
            <View style={styles.bottomLeftActions}>
              <TouchableOpacity
                style={styles.exitButton}
                onPress={handleExit}
                activeOpacity={0.8}
              >
                <Text style={styles.exitButtonText}>Exit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitExitButton, saving && styles.submitButtonDisabled]}
                onPress={handleSubmitAndExit}
                disabled={saving}
                activeOpacity={0.8}
              >
                <Text style={styles.submitExitButtonText}>
                  {saving ? t('taskDetail.saving') : 'Submit & Exit'}
                </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.bottomRightActions}>
              <TouchableOpacity
                style={[styles.submitButtonGreen, saving && styles.submitButtonDisabled]}
                onPress={handleSubmitNext}
                disabled={saving}
                activeOpacity={0.8}
              >
                <Text style={styles.submitButtonGreenText}>
                  {saving ? t('taskDetail.saving') : 'Submit'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  }

  // Audio task fallback
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={navigateBackFromDetail}
          activeOpacity={0.8}
        >
          <Ionicons name="arrow-back" size={20} color="#f1f5f9" />
          <Text style={styles.backText}>{t('taskDetail.back')}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('common.taskDetail')}</Text>
      </View>

      <ScrollView style={styles.content}>
        {task.title ? (
          <Text style={styles.taskTitle} numberOfLines={2}>
            {task.title}
          </Text>
        ) : null}
        <View style={styles.priceBadge}>
          <Text style={styles.priceBadgeText}>{t('tasks.fee')}: {task.price ?? 0} TL</Text>
        </View>

        <View style={styles.audioSection}>
          <Text style={styles.sectionLabel}>{t('taskDetail.audioLabel')}</Text>
          <View style={styles.audioCard}>
            {audioUrl && !isImageTask ? (
              <>
                {isWeb ? (
                  <AudioPlayer uri={audioUrl} />
                ) : (
                  <View style={styles.playerContent}>
                    <TouchableOpacity
                      style={styles.playButton}
                      onPress={togglePlayPause}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.playIcon}>{isPlaying ? '⏸' : '▶'}</Text>
                    </TouchableOpacity>
                    <View style={styles.playerInfo}>
                      <Pressable
                        style={styles.progressBar}
                        onLayout={(e) => {
                          progressBarWidth.current = e.nativeEvent.layout.width;
                        }}
                        onPress={handleSeek}
                      >
                        <View
                          style={[
                            styles.progressFill,
                            {
                              width: duration
                                ? `${Math.min(100, (position / duration) * 100)}%`
                                : '0%',
                            },
                          ]}
                        />
                      </Pressable>
                      <Text style={styles.timeText}>
                        {formatTime(position)}
                        {duration !== null ? ` / ${formatTime(duration)}` : ''}
                      </Text>
                    </View>
                  </View>
                )}
                <View style={styles.speedRow}>
                  <Text style={styles.speedLabel}>{t('taskDetail.playbackSpeed')}</Text>
                  <View style={styles.speedControlRow}>
                    <TouchableOpacity
                      style={[styles.speedBtn, playbackSpeed <= MIN_SPEED && styles.speedBtnDisabled]}
                      onPress={speedDown}
                      disabled={playbackSpeed <= MIN_SPEED}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.speedBtnText}>−</Text>
                    </TouchableOpacity>
                    <Pressable style={styles.speedValue} onPress={resetToNormal}>
                      <Text style={styles.speedValueText}>{playbackSpeed.toFixed(1)}x</Text>
                    </Pressable>
                    <TouchableOpacity
                      style={[styles.speedBtn, playbackSpeed >= MAX_SPEED && styles.speedBtnDisabled]}
                      onPress={speedUp}
                      disabled={playbackSpeed >= MAX_SPEED}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.speedBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </>
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
        {isSubmitted ? (
          <View style={styles.submittedBadge}>
            <Ionicons name="checkmark-circle" size={18} color="#fff" />
            <Text style={styles.submittedText}>{t('tasks.submitted')}</Text>
          </View>
        ) : (
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
        )}
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
    marginTop: 24 
  },
  
  // Content styles
  content: {
    flex: 1,
    padding: 16,
  },
  
  // Footer styles
  footer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: '#0f172a',
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  
  // Task info bar
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
  
  // Annotation layout
  annotationLayout: {
    flex: 1,
    flexDirection: 'row',
  },
  leftToolbarCol: {
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRightWidth: 1,
    borderRightColor: '#334155',
  },

  // Center area
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
  canvasWorkspaceWithGrid: {
    position: 'relative',
  },
  canvasGridOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px)',
    backgroundSize: '20px 20px',
    pointerEvents: 'none',
  },
  
  // Right sidebar
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
  objectList: { 
    flex: 1, 
    minHeight: 60 
  },
  objectListEmpty: { 
    fontSize: 12, 
    color: '#64748b', 
    fontStyle: 'italic' 
  },
  objectCardWrap: { 
    marginBottom: 8 
  },
  objectCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 12,
    marginBottom: 0,
    borderWidth: 1,
    borderColor: '#334155',
  },
  objectCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  objectCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f1f5f9',
    flex: 1,
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
  },
  labelOptionText: {
    fontSize: 10,
    fontWeight: '500',
  },
  
  // Bottom buttons
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
  bottomLeftActions: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  bottomRightActions: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
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
  submittedBadgeCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#22c55e',
  },
  submittedText: { 
    fontSize: 14, 
    color: '#fff', 
    fontWeight: '600' 
  },
  
  // Header styles
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f1f5f9',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f1f5f9',
    marginLeft: 16,
    flex: 1,
    textAlign: 'center',
  },
  taskTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#f1f5f9',
    paddingHorizontal: 16,
    marginBottom: 8,
    lineHeight: 28,
  },
  priceBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginLeft: 16,
    marginBottom: 16,
  },
  priceBadgeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#22c55e',
  },
  
  // Audio styles
  audioSection: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f1f5f9',
    marginBottom: 12,
  },
  audioCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  playerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  playButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: {
    fontSize: 20,
    color: '#fff',
    fontWeight: '600',
  },
  playerInfo: {
    flex: 1,
  },
  progressBar: {
    height: 4,
    backgroundColor: '#334155',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#3b82f6',
  },
  timeText: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 8,
  },
  speedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  speedLabel: {
    fontSize: 14,
    color: '#f1f5f9',
  },
  speedControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  speedBtn: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  speedBtnDisabled: {
    opacity: 0.5,
  },
  speedBtnText: {
    fontSize: 16,
    color: '#f1f5f9',
    fontWeight: '600',
  },
  speedValue: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 6,
  },
  speedValueText: {
    fontSize: 12,
    color: '#f1f5f9',
    fontWeight: '600',
  },
  noAudioText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    paddingVertical: 24,
  },
  
  // Transcription styles
  transcriptionSection: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  transcriptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontWeight: '600',
    color: '#fff',
  },
  transcriptionCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 12,
  },
  transcriptionInput: {
    fontSize: 14,
    color: '#f1f5f9',
    minHeight: 120,
    textAlignVertical: 'top',
  },
  
  // AI Button styles
  aiButtonWrapper: {
    marginBottom: 12,
  },
  aiTranscribeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
  },
  aiTranscribeButtonDisabled: {
    opacity: 0.6,
  },
  aiTranscribeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  
  submitContainer: {
    position: 'absolute',
    left: 20,
    right: 20,
  },
  submittedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#22c55e',
    borderRadius: 8,
  },
});
