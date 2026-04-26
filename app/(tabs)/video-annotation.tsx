import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import AnnotationCanvas, { type Annotation, type Tool } from '@/components/AnnotationCanvas';
import { ANNOTATION_LABELS, LABEL_COLORS } from '@/constants/annotationLabels';
import { videoWorkbenchStyles } from '@/theme/videoWorkbenchStyles';
import { useVideoWorkbench } from '@/hooks/useVideoWorkbench';
import { VideoSidebar } from '@/components/video/VideoSidebar';
import { TranscriptionEditor } from '@/components/video/TranscriptionEditor';
import { VideoHeader } from '@/components/video/VideoHeader';
import VideoProWorkbench from '@/components/video-workbench/VideoProWorkbench';

const styles = videoWorkbenchStyles;

function VideoAnnotationMobile({ taskId }: { taskId?: string }) {
  const router = useRouter();
  const { t } = useTranslation();
  const [activeTool, setActiveTool] = useState<
    'pan' | 'select' | 'bbox' | 'polygon' | 'points' | 'ellipse' | 'cuboid' | 'polyline' | 'semantic' | 'brush' | 'magic_wand'
  >('pan');
  const canvasTool: Tool = activeTool as Tool;
  const [selectedLabel, setSelectedLabel] = useState<string>('');
  const [optionalNotesOpen, setOptionalNotesOpen] = useState(false);
  const canvasRef = useRef<any>(null);

  const {
    currentFrame,
    currentFrameNumber,
    currentTimestamp,
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
    handleSubmit,
    handleDeleteAnnotation,
    handleUpdateAnnotationLabel,
    setAnnotations,
    setSelectedAnnotationId,
    setTranscription,
  } = useVideoWorkbench(taskId ?? '');

  useEffect(() => {
    loadVideo();
  }, [loadVideo]);

  const handleSubmitAndExit = () => handleSubmit(false);
  const handleSubmitNext = () => handleSubmit(true);
  const handleExit = () => {
    try {
      router.back();
    } catch (_) {}
  };

  const getObjectDisplayName = (a: Annotation, idx: number) => {
    const labelStr =
      typeof a.label === 'object' ? (a.label as any).name || (a.label as any).label : a.label;
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
    <View style={styles.container}>
      <VideoHeader task={task} isSubmitted={isSubmitted} handleExit={handleExit} />

      <View style={styles.annotationLayout}>
        <VideoSidebar
          activeTool={activeTool}
          setActiveTool={(tool) =>
            setActiveTool(
              tool as
                | 'pan'
                | 'select'
                | 'bbox'
                | 'polygon'
                | 'points'
                | 'ellipse'
                | 'cuboid'
                | 'polyline'
                | 'semantic'
                | 'brush'
                | 'magic_wand'
            )
          }
          selectedAnnotationId={selectedAnnotationId}
          handleDeleteAnnotation={handleDeleteAnnotation}
          canvasRef={canvasRef}
        />

        <View style={styles.annotationMain}>
          <View style={styles.videoPlaceholder}>
            <Ionicons name="videocam-outline" size={48} color="#64748b" />
            <Text style={styles.videoPlaceholderText}>
              Video playback is available on web. Open this task in a desktop browser for the full workbench.
            </Text>
          </View>

          {currentFrame && videoUrl ? (
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
                isBrushActive={false}
                onUndo={() => {
                  if (canvasRef.current?.handleUndo) {
                    canvasRef.current.handleUndo();
                  } else if (annotations.length > 0) {
                    setAnnotations((prev) => prev.slice(0, -1));
                  }
                }}
              />
            </View>
          ) : null}
        </View>

        <View style={styles.rightSidebar}>
          <Text style={styles.rightSidebarTitle}>OBJECTS</Text>
          <ScrollView style={styles.objectList} showsVerticalScrollIndicator={false}>
            {!currentFrame ? (
              <Text style={styles.objectListEmpty}>Capture a frame on web to annotate</Text>
            ) : annotations.length === 0 ? (
              <Text style={styles.objectListEmpty}>No objects yet</Text>
            ) : (
              annotations.map((a, idx) => {
                const labelStr =
                  typeof a.label === 'object' ? (a.label as any).name || (a.label as any).label : a.label;
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
                                },
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
          {currentFrame ? (
            <View style={styles.optionalNotesBlock}>
              <TouchableOpacity
                style={styles.optionalNotesToggle}
                onPress={() => setOptionalNotesOpen((o) => !o)}
                activeOpacity={0.85}
              >
                <Text style={styles.optionalNotesToggleText}>
                  {optionalNotesOpen ? '▼ Notes / AI' : '▶ Notes / AI (optional)'}
                </Text>
              </TouchableOpacity>
              {optionalNotesOpen ? (
                <TranscriptionEditor
                  transcription={transcription}
                  setTranscription={setTranscription}
                  isTranscribing={isTranscribing}
                  handleAITranscription={handleAITranscription}
                  currentFrame={currentFrame}
                  currentFrameNumber={currentFrameNumber}
                  currentTimestamp={currentTimestamp}
                />
              ) : null}
            </View>
          ) : null}
        </View>
      </View>

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
}

export default function VideoAnnotationScreen() {
  const params = useLocalSearchParams<{ id: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  if (Platform.OS === 'web') {
    return <VideoProWorkbench taskId={id ?? ''} />;
  }

  return <VideoAnnotationMobile taskId={id} />;
}
