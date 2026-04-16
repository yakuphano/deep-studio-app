import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
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
import { videoWorkbenchStyles } from '@/theme/videoWorkbenchStyles';
import { 
  type TaskData, 
  type VideoAnnotation, 
  type WebVideoPlayerProps, 
  type VideoPlayerState, 
  type TranscriptionState, 
  type AnnotationTool, 
  type TimeRange, 
  type FrameData 
} from '@/types/video';
import { useVideoWorkbench } from '@/hooks/useVideoWorkbench';
import { VideoSidebar } from '@/components/video/VideoSidebar';
import { TranscriptionEditor } from '@/components/video/TranscriptionEditor';
import { VideoHeader } from '@/components/video/VideoHeader';

const PLAYBACK_SPEED_STORAGE_KEY = 'deepstudio_playback_speed';
const MIN_SPEED = 0.1;
const MAX_SPEED = 3;
const SPEED_STEP = 0.1;

const clampSpeed = (n: number) =>
  Math.min(MAX_SPEED, Math.max(MIN_SPEED, Math.round(n * 10) / 10));

function WebVideoPlayer({ 
  src, 
  onFrameCapture,
  onTimeUpdate,
  onLoadedMetadata 
}: WebVideoPlayerProps) {
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
    }
    
    const handleLoadedMetadata = () => {
      setDuration(video.duration);
      onLoadedMetadata(video.duration);
    }
    
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
    }
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
  }
  
  const togglePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;
    
    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
  }
  
  const seekTo = (time: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = time;
  }
  
  const changeSpeed = (speed: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = speed;
    setPlaybackSpeed(speed);
  }
  
  const skipFrame = (frames: number) => {
    const video = videoRef.current;
    if (!video) return;
    const frameTime = 1 / 30; // Assuming 30 FPS
    video.currentTime = Math.max(0, Math.min(duration, currentTime + (frames * frameTime)));
  }
  
  const formatTime = (time: number) => {
    const hours = Math.floor(time / 3600);
    const minutes = Math.floor((time % 3600) / 60);
    const seconds = Math.floor(time % 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  
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
          }, isPlaying ? 'â¸' : 'â–¶'),
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
          }, 'â—€'),
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
          }, 'â–¶')
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
  const [activeTool, setActiveTool] = useState<'pan' | 'select' | 'bbox' | 'polygon' | 'points' | 'ellipse' | 'cuboid' | 'polyline' | 'semantic' | 'brush' | 'magic_wand'>('points');
  const canvasTool: Tool = activeTool as Tool;
  const [selectedLabel, setSelectedLabel] = useState<string>('');
  const [isBrushActive, setIsBrushActive] = useState(false);
  const canvasRef = useRef<any>(null);
  const insets = useSafeAreaInsets();

  // Use video workbench hook
  const {
    currentFrame,
    currentFrameNumber,
    currentTimestamp,
    videoAnnotations,
    videoDuration,
    videoUrl,
    task,
    saving,
    loading,
    annotations,
    selectedAnnotationId,
    transcription,
    isTranscribing,
    loadVideo,
    handleAITranscription,
    handleFrameCapture,
    handleTimeUpdate,
    handleLoadedMetadata,
    handleSaveDraft,
    handleSubmit,
    togglePlayPause,
    handleDeleteAnnotation,
    handleUpdateAnnotationLabel,
    setAnnotations,
    setSelectedAnnotationId,
    setTranscription,
    setSaving,
    setLoading,
  } = useVideoWorkbench(id);

  useEffect(() => {
    loadVideo();
  }, [loadVideo]);

  const handleSubmitAndExit = () => handleSubmit(false);
  const handleSubmitNext = () => handleSubmit(true);
  const handleExit = () => {
    try {
      router.back();
    } catch (_) {}
  }

  const getObjectDisplayName = (a: Annotation, idx: number) => {
    const labelStr = typeof a.label === 'object' ? (a.label as any).name || (a.label as any).label : a.label;
    return labelStr || `${a.type} ${idx + 1}`;
  }

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
      <VideoHeader 
        task={task} 
        isSubmitted={isSubmitted} 
        handleExit={handleExit} 
      />

      {/* Main Layout */}
      <View style={styles.annotationLayout}>
        {/* Left Toolbar */}
        <VideoSidebar
          activeTool={activeTool}
          setActiveTool={setActiveTool}
          isBrushActive={isBrushActive}
          setIsBrushActive={setIsBrushActive}
          selectedAnnotationId={selectedAnnotationId}
          handleDeleteAnnotation={handleDeleteAnnotation}
          canvasRef={canvasRef}
        />
        
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
                      <TranscriptionEditor
                        transcription={transcription}
                        setTranscription={setTranscription}
                        isTranscribing={isTranscribing}
                        handleAITranscription={handleAITranscription}
                        currentFrame={currentFrame}
                        currentFrameNumber={currentFrameNumber}
                        currentTimestamp={currentTimestamp}
                      />
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>
      
      {/* Bottom Button Bar */}
      {!isSubmitted && (
        <View style={videoWorkbenchStyles.bottomButtonBar}>
          <View style={videoWorkbenchStyles.bottomLeftActions}>
            <TouchableOpacity style={videoWorkbenchStyles.exitButton} onPress={handleExit}>
              <Text style={videoWorkbenchStyles.exitButtonText}>Exit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[videoWorkbenchStyles.submitExitButton, saving && videoWorkbenchStyles.submitButtonDisabled]}
              onPress={handleSubmitAndExit}
              disabled={saving}
            >
              <Text style={videoWorkbenchStyles.submitExitButtonText}>
                {saving ? t('taskDetail.saving') : 'Submit & Exit'}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={videoWorkbenchStyles.bottomRightActions}>
            <TouchableOpacity
              style={[videoWorkbenchStyles.submitButtonGreen, saving && videoWorkbenchStyles.submitButtonDisabled]}
              onPress={handleSubmitNext}
              disabled={saving}
            >
              <Text style={videoWorkbenchStyles.submitButtonGreenText}>
                {saving ? t('taskDetail.saving') : 'Submit Next'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
};