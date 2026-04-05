import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
  Alert,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { supabase } from '@/lib/supabase';
import { triggerEarningsRefresh } from '@/lib/earningsRefresh';
import { transcribeWithGroq } from '@/lib/groq';
import { useAuth } from '@/contexts/AuthContext';
import AnnotationCanvas, { type Annotation, type Tool } from '@/components/AnnotationCanvas';
import { ANNOTATION_LABELS, LABEL_COLORS } from '@/constants/annotationLabels';

const PLAYBACK_SPEED_STORAGE_KEY = 'deepstudio_playback_speed';
const MIN_SPEED = 0.1;
const MAX_SPEED = 3;
const SPEED_STEP = 0.1;

const clampSpeed = (n: number) =>
  Math.min(MAX_SPEED, Math.max(MIN_SPEED, Math.round(n * 10) / 10));

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
  transcription?: string;
  annotation_data?: unknown;
  language?: string | null;
}

interface VideoAnnotation {
  id: string;
  frameNumber: number;
  timestamp: number;
  annotations: Annotation[];
}

function WebVideoPlayer({ 
  src, 
  onFrameCapture,
  onTimeUpdate,
  onLoadedMetadata 
}: { 
  src: string; 
  onFrameCapture: (frameData: string, frameNumber: number, timestamp: number) => void;
  onTimeUpdate: (currentTime: number, duration: number) => void;
  onLoadedMetadata: (duration: number) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    
    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      onTimeUpdate(video.currentTime, duration);
    };
    
    const handleLoadedMetadata = () => {
      setDuration(video.duration);
      onLoadedMetadata(video.duration);
    };
    
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    
    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
    };
  }, [onTimeUpdate, onLoadedMetadata, duration]);
  
  const captureFrame = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const frameData = canvas.toDataURL('image/png');
    const frameNumber = Math.floor(currentTime * 30); // Assuming 30 FPS
    onFrameCapture(frameData, frameNumber, currentTime);
  };
  
  const togglePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;
    
    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
  };
  
  const seekTo = (time: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = time;
  };
  
  const changeSpeed = (speed: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = speed;
    setPlaybackSpeed(speed);
  };
  
  const skipFrame = (frames: number) => {
    const video = videoRef.current;
    if (!video) return;
    const frameTime = 1 / 30; // Assuming 30 FPS
    video.currentTime = Math.max(0, Math.min(duration, currentTime + (frames * frameTime)));
  };
  
  const formatTime = (time: number) => {
    const hours = Math.floor(time / 3600);
    const minutes = Math.floor((time % 3600) / 60);
    const seconds = Math.floor(time % 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };
  
  return React.createElement('div', { 
    style: { 
      position: 'relative', 
      width: '100%', 
      backgroundColor: '#1e293b',
      borderRadius: 8,
      overflow: 'hidden',
      border: '1px solid #334155'
    } as React.CSSProperties 
  }, [
    React.createElement('video', {
      key: 'video',
      ref: (el: HTMLVideoElement | null) => { videoRef.current = el; },
      src,
      style: {
        width: '100%',
        height: 'auto',
        backgroundColor: '#1e293b',
        outline: 'none',
      } as React.CSSProperties,
    }),
    React.createElement('canvas', {
      key: 'canvas',
      ref: (el: HTMLCanvasElement | null) => { canvasRef.current = el; },
      style: { display: 'none' } as React.CSSProperties,
    }),
    
    // Video Controls Overlay
    React.createElement('div', {
      key: 'controls',
      style: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        backdropFilter: 'blur(8px)',
        padding: '12px',
        borderTop: '1px solid #334155',
      } as React.CSSProperties
    }, [
      // Timeline
      React.createElement('div', {
        key: 'timeline',
        style: {
          marginBottom: '8px',
        } as React.CSSProperties
      }, [
        React.createElement('input', {
          key: 'seekbar',
          type: 'range',
          min: 0,
          max: duration,
          value: currentTime,
          onChange: (e: any) => seekTo(parseFloat(e.target.value)),
          style: {
            width: '100%',
            height: '4px',
            backgroundColor: '#334155',
            outline: 'none',
            borderRadius: '2px',
            cursor: 'pointer',
          } as React.CSSProperties,
        }),
        React.createElement('div', {
          key: 'time-display',
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: '4px',
          } as React.CSSProperties
        }, [
          React.createElement('span', {
            key: 'current-time',
            style: {
              color: '#f1f5f9',
              fontSize: '12px',
              fontWeight: '500',
            } as React.CSSProperties
          }, formatTime(currentTime)),
          React.createElement('span', {
            key: 'total-time',
            style: {
              color: '#94a3b8',
              fontSize: '12px',
              fontWeight: '500',
            } as React.CSSProperties
          }, formatTime(duration))
        ])
      ]),
      
      // Control Buttons
      React.createElement('div', {
        key: 'controls-row',
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
        } as React.CSSProperties
      }, [
        // Left Controls
        React.createElement('div', {
          key: 'left-controls',
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          } as React.CSSProperties
        }, [
          React.createElement('button', {
            key: 'play-pause',
            onClick: togglePlayPause,
            style: {
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              backgroundColor: '#3b82f6',
              border: 'none',
              color: 'white',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            } as React.CSSProperties
          }, isPlaying ? '⏸' : '▶'),
          React.createElement('button', {
            key: 'prev-frame',
            onClick: () => skipFrame(-1),
            style: {
              width: '32px',
              height: '32px',
              borderRadius: '6px',
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              color: '#f1f5f9',
              cursor: 'pointer',
              fontSize: '12px',
            } as React.CSSProperties
          }, '◀'),
          React.createElement('button', {
            key: 'next-frame',
            onClick: () => skipFrame(1),
            style: {
              width: '32px',
              height: '32px',
              borderRadius: '6px',
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              color: '#f1f5f9',
              cursor: 'pointer',
              fontSize: '12px',
            } as React.CSSProperties
          }, '▶')
        ]),
        
        // Right Controls
        React.createElement('div', {
          key: 'right-controls',
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          } as React.CSSProperties
        }, [
          React.createElement('select', {
            key: 'speed-select',
            value: playbackSpeed,
            onChange: (e: any) => changeSpeed(parseFloat(e.target.value)),
            style: {
              padding: '4px 8px',
              borderRadius: '6px',
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              color: '#f1f5f9',
              fontSize: '12px',
              cursor: 'pointer',
            } as React.CSSProperties
          }, [
            React.createElement('option', { key: '0.5x', value: 0.5 }, '0.5x'),
            React.createElement('option', { key: '1x', value: 1 }, '1x'),
            React.createElement('option', { key: '2x', value: 2 }, '2x'),
          ]),
          React.createElement('button', {
            key: 'capture-frame',
            onClick: captureFrame,
            style: {
              padding: '6px 12px',
              borderRadius: '6px',
              backgroundColor: '#10b981',
              border: 'none',
              color: 'white',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: '600',
            } as React.CSSProperties
          }, 'Capture Frame')
        ])
      ])
    ])
  ]);
}

export default function VideoAnnotationScreen() {
  const params = useLocalSearchParams<{ id: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { user, session, signOut, isAdmin } = useAuth();
  const [task, setTask] = useState<TaskData | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [activeTool, setActiveTool] = useState<'pan' | 'select' | 'bbox' | 'polygon' | 'points' | 'ellipse' | 'cuboid' | 'polyline' | 'semantic' | 'brush' | 'magic_wand'>('points');
  const canvasTool: Tool = activeTool as Tool;
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<string>('');
  const [isBrushActive, setIsBrushActive] = useState(false);
  const canvasRef = useRef<any>(null);
  const insets = useSafeAreaInsets();

  // Video specific states
  const [currentFrame, setCurrentFrame] = useState<string | null>(null);
  const [currentFrameNumber, setCurrentFrameNumber] = useState<number>(0);
  const [currentTimestamp, setCurrentTimestamp] = useState<number>(0);
  const [videoAnnotations, setVideoAnnotations] = useState<VideoAnnotation[]>([]);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

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
          title: String(data.title ?? ''),
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
        setVideoUrl(taskData.video_url ?? null);
        
        // Load existing video annotations
        if (taskData.annotation_data && Array.isArray(taskData.annotation_data)) {
          setVideoAnnotations(taskData.annotation_data as VideoAnnotation[]);
        }
      }
      setLoading(false);
    };
    fetchTask();
  }, [id]);

  const handleFrameCapture = (frameData: string, frameNumber: number, timestamp: number) => {
    setCurrentFrame(frameData);
    setCurrentFrameNumber(frameNumber);
    setCurrentTimestamp(timestamp);
    
    // Load annotations for this frame
    const frameAnnotations = videoAnnotations.find(a => a.frameNumber === frameNumber);
    if (frameAnnotations) {
      setAnnotations(frameAnnotations.annotations);
    } else {
      setAnnotations([]);
    }
  };

  const handleTimeUpdate = (currentTime: number, duration: number) => {
    setCurrentTimestamp(currentTime);
    setVideoDuration(duration);
  };

  const handleLoadedMetadata = (duration: number) => {
    setVideoDuration(duration);
  };

  const handleSaveDraft = async () => {
    if (!id || !user?.id) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('tasks')
        .update({
          annotation_data: videoAnnotations,
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
  };

  const handleSubmit = async (navigateToNext: boolean = false) => {
    if (!id || !user?.id) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('tasks')
        .update({
          status: 'submitted',
          annotation_data: videoAnnotations,
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
  };

  const handleSubmitAndExit = () => handleSubmit(false);
  const handleSubmitNext = () => handleSubmit(true);
  const handleExit = () => {
    try {
      router.back();
    } catch (_) {}
  };

  const handleDeleteAnnotation = (id: string) => {
    setAnnotations(prev => prev.filter(a => a.id !== id));
    if (selectedAnnotationId === id) setSelectedAnnotationId(null);
    
    // Update video annotations
    if (currentFrame) {
      setVideoAnnotations(prev => {
        const existingIndex = prev.findIndex(a => a.frameNumber === currentFrameNumber);
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = {
            ...updated[existingIndex],
            annotations: annotations.filter(a => a.id !== id)
          };
          return updated;
        } else {
          return [...prev, {
            id: `frame_${currentFrameNumber}`,
            frameNumber: currentFrameNumber,
            timestamp: currentTimestamp,
            annotations: annotations.filter(a => a.id !== id)
          }];
        }
      });
    }
  };

  const handleUpdateAnnotationLabel = (id: string, label: string) => {
    setAnnotations(prev => prev.map(a => a.id === id ? { ...a, label } : a));
    
    // Update video annotations
    if (currentFrame) {
      setVideoAnnotations(prev => {
        const existingIndex = prev.findIndex(a => a.frameNumber === currentFrameNumber);
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = {
            ...updated[existingIndex],
            annotations: annotations.map(a => a.id === id ? { ...a, label } : a)
          };
          return updated;
        } else {
          return [...prev, {
            id: `frame_${currentFrameNumber}`,
            frameNumber: currentFrameNumber,
            timestamp: currentTimestamp,
            annotations: annotations.map(a => a.id === id ? { ...a, label } : a)
          }];
        }
      });
    }
  };

  const getObjectDisplayName = (a: Annotation, idx: number) => {
    const labelStr = typeof a.label === 'object' ? (a.label as any).name || (a.label as any).label : a.label;
    return labelStr || `${a.type} ${idx + 1}`;
  };

  const isSubmitted = task?.status === 'submitted';

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading video task...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, Platform.OS === 'web' && styles.containerFullWidth]}>
      {/* Task Info Bar */}
      <View style={styles.taskInfoBar}>
        <Text style={styles.taskInfoType}>Video Annotation</Text>
        <View style={styles.taskInfoPriceBadge}>
          <Text style={styles.taskInfoPriceText}>{task?.price ?? 0} TL</Text>
        </View>
      </View>

      {/* Main Layout */}
      <View style={styles.annotationLayout}>
        {/* Left Toolbar */}
        <View style={styles.leftToolbarCol}>
          {/* Pan Tool */}
          <TouchableOpacity
            style={[styles.toolBtnLarge, activeTool === 'pan' && !isBrushActive && styles.toolBtnActivePurple]}
            onPress={() => { setActiveTool('pan'); setIsBrushActive(false); }}
            activeOpacity={0.8}
          >
            <Ionicons name="hand-right-outline" size={20} color="#f1f5f9" />
            <Text style={styles.toolBtnLargeText}>Pan</Text>
          </TouchableOpacity>
          
          {/* Undo Button */}
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
          >
            <Ionicons name="arrow-undo-outline" size={20} color="#f1f5f9" />
            <Text style={styles.toolBtnLargeText}>Undo</Text>
          </TouchableOpacity>
          
          {/* Bounding Box Tool */}
          <TouchableOpacity
            style={[styles.toolBtnLarge, activeTool === 'bbox' && !isBrushActive && styles.toolBtnActivePurple]}
            onPress={() => { setActiveTool('bbox'); setIsBrushActive(false); }}
            activeOpacity={0.8}
          >
            <Ionicons name="square-outline" size={20} color="#f1f5f9" />
            <Text style={styles.toolBtnLargeText}>BBox</Text>
          </TouchableOpacity>
          
          {/* Polygon Tool */}
          <TouchableOpacity
            style={[styles.toolBtnLarge, activeTool === 'polygon' && !isBrushActive && styles.toolBtnActivePurple]}
            onPress={() => { setActiveTool('polygon'); setIsBrushActive(false); }}
            activeOpacity={0.8}
          >
            <Ionicons name="git-merge-outline" size={20} color="#f1f5f9" />
            <Text style={styles.toolBtnLargeText}>Polygon</Text>
          </TouchableOpacity>
          
          {/* Polyline Tool */}
          <TouchableOpacity
            style={[styles.toolBtnLarge, activeTool === 'polyline' && !isBrushActive && styles.toolBtnActivePurple]}
            onPress={() => { setActiveTool('polyline'); setIsBrushActive(false); }}
            activeOpacity={0.8}
          >
            <Ionicons name="create-outline" size={20} color="#f1f5f9" />
            <Text style={styles.toolBtnLargeText}>Polyline</Text>
          </TouchableOpacity>
          
          {/* Brush Tool */}
          <TouchableOpacity
            style={[styles.toolBtnLarge, activeTool === 'brush' && styles.toolBtnActivePurple]}
            onPress={() => { setActiveTool('brush'); setIsBrushActive(true); }}
            activeOpacity={0.8}
          >
            <Ionicons name="brush-outline" size={20} color="#f1f5f9" />
            <Text style={styles.toolBtnLargeText}>Brush</Text>
          </TouchableOpacity>
          
          {/* Delete Button */}
          <TouchableOpacity
            style={[styles.toolBtnLarge, styles.deleteToolBtn]}
            onPress={() => selectedAnnotationId && handleDeleteAnnotation(selectedAnnotationId)}
            activeOpacity={0.8}
          >
            <Ionicons name="trash-outline" size={20} color="#ef4444" />
            <Text style={[styles.toolBtnLargeText, styles.deleteToolBtnText]}>Delete</Text>
          </TouchableOpacity>
        </View>
        
        {/* Center - Video Canvas */}
        <View style={styles.annotationMain}>
          {/* Video Player */}
          {Platform.OS === 'web' && videoUrl ? (
            <WebVideoPlayer 
              src={videoUrl} 
              onFrameCapture={handleFrameCapture}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
            />
          ) : (
            <View style={styles.videoPlaceholder}>
              <Ionicons name="videocam-outline" size={48} color="#64748b" />
              <Text style={styles.videoPlaceholderText}>Video player not available on mobile</Text>
            </View>
          )}
          
          {/* Annotation Canvas - Only show when frame is captured */}
          {currentFrame && (
            <View style={[styles.annotationCanvasWrapFullWidth, styles.canvasWorkspace]}>
              <AnnotationCanvas
                ref={canvasRef}
                imageUrl={currentFrame}
                initialAnnotations={[]}
                taskId={task?.id || ''}
                annotations={annotations}
                onAnnotationsChange={setAnnotations}
                activeTool={canvasTool}
                selectedId={selectedAnnotationId}
                onSelect={setSelectedAnnotationId}
                selectedLabel={selectedLabel}
                isBrushActive={isBrushActive}
                onUndo={() => {
                  if (canvasRef.current?.handleUndo) {
                    canvasRef.current.handleUndo();
                  } else {
                    if (annotations.length > 0) {
                      setAnnotations(prev => prev.slice(0, -1));
                    }
                  }
                }}
              />
            </View>
          )}
        </View>
        
        {/* Right Sidebar - Object List */}
        <View style={styles.rightSidebar}>
          <Text style={styles.rightSidebarTitle}>OBJECTS</Text>
          <ScrollView style={styles.objectList} showsVerticalScrollIndicator={false}>
            {!currentFrame ? (
              <Text style={styles.objectListEmpty}>Capture a frame to start annotating</Text>
            ) : annotations.length === 0 ? (
              <Text style={styles.objectListEmpty}>No objects yet</Text>
            ) : (
              annotations.map((a, idx) => {
                const labelStr = typeof a.label === 'object' ? (a.label as any).name || (a.label as any).label : a.label;
                const labelColor = labelStr ? LABEL_COLORS[labelStr] || LABEL_COLORS['Other'] : null;
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
                        {ANNOTATION_LABELS.map((label) => {
                          const isSelected = a.label === label;
                          const chipColor = LABEL_COLORS[label] ?? '#94a3b8';
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
                      
                      {/* Time Range Info */}
                      <View style={styles.timeRangeInfo}>
                        <Text style={styles.timeRangeLabel}>Frame: {currentFrameNumber}</Text>
                        <Text style={styles.timeRangeLabel}>Time: {Math.floor(currentTimestamp)}s</Text>
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
            <TouchableOpacity style={styles.exitButton} onPress={handleExit}>
              <Text style={styles.exitButtonText}>Exit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submitExitButton, saving && styles.submitButtonDisabled]}
              onPress={handleSubmitAndExit}
              disabled={saving}
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
    width: 80,
    minWidth: 80,
    maxWidth: 80,
    padding: 8,
    backgroundColor: '#0f172a',
    borderRightWidth: 1,
    borderRightColor: '#334155',
    flexDirection: 'column',
    gap: 8,
  },
  toolBtnLarge: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'column',
    gap: 2,
  },
  toolBtnActivePurple: {
    backgroundColor: '#7c3aed',
    borderColor: '#7c3aed',
  },
  toolBtnLargeText: { 
    fontSize: 9, 
    color: '#f1f5f9', 
    marginTop: 1, 
    fontWeight: '500' 
  },
  deleteToolBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: '#ef4444',
  },
  deleteToolBtnText: { 
    color: '#ef4444' 
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
  
  // Video specific
  videoPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 8,
    margin: 16,
  },
  videoPlaceholderText: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 8,
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
  timeRangeInfo: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  timeRangeLabel: {
    fontSize: 11,
    color: '#64748b',
    marginBottom: 2,
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
});
