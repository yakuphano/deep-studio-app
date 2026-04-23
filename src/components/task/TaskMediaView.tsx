import React, { useImperativeHandle, useRef, forwardRef } from 'react';
import { View, Text } from 'react-native';
import { taskDetailStyles } from '@/theme/taskDetailStyles';
import { type TaskData, type TaskType } from '@/types/taskDetail';
import AudioPlayer from '@/components/AudioPlayer';
import VideoPlayer from '@/components/VideoPlayer';
import AnnotationCanvas from '@/components/AnnotationCanvas.web';
import { resolveTaskImageUrl } from '@/lib/audioUrl';

export type TaskMediaViewCanvasHandle = {
  /** Zoom/pan sonrası görüntüyü konteynıra sığdırıp ortalar */
  resetImageView: () => void;
  /** Tuval içi geri al (polyline taslak noktası + anotasyon geçmişi) */
  undo: () => void;
};

interface TaskMediaViewProps {
  task: TaskData | null;
  taskType: TaskType;
  annotations: any[];
  activeTool: string;
  selectedAnnotationId: string | null;
  onToolChange: (tool: string) => void;
  onAnnotationSelect: (id: string | null) => void;
  onAnnotationDelete: (id: string) => void;
  onAnnotationsChange: (annotations: any[]) => void;
  getAudioUrl?: (task: TaskData | null) => string | null;
  finalAudioUrl?: string | null;
  /** Sol sütunda araçlar varken canvas üstündeki mini toolbar */
  hideCanvasToolbar?: boolean;
  selectedLabel?: string | null;
  /** Sol rail ile fırça rengi / palet senkronu */
  brushColor?: string;
  onBrushColorChange?: (color: string) => void;
  brushPaletteOpen?: boolean;
  onBrushPaletteOpenChange?: (open: boolean) => void;
}

export const TaskMediaView = forwardRef<TaskMediaViewCanvasHandle | null, TaskMediaViewProps>(
  function TaskMediaView(
    {
      task,
      taskType,
      annotations,
      activeTool,
      selectedAnnotationId,
      onToolChange,
      onAnnotationSelect,
      onAnnotationDelete,
      onAnnotationsChange,
      getAudioUrl,
      finalAudioUrl,
      hideCanvasToolbar = false,
      selectedLabel = null,
      brushColor,
      onBrushColorChange,
      brushPaletteOpen,
      onBrushPaletteOpenChange,
    },
    ref
  ) {
    const annotationCanvasRef = useRef<{ resetView: () => void; undo?: () => void } | null>(null);

    useImperativeHandle(
      ref,
      () => ({
        resetImageView: () => annotationCanvasRef.current?.resetView?.(),
        undo: () => annotationCanvasRef.current?.undo?.(),
      }),
      []
    );

    const rawImageRef = task?.image_url || task?.file_url;
    const rawStr =
      rawImageRef != null && String(rawImageRef).trim() !== '' ? String(rawImageRef).trim() : null;
    /** file:// / zip:// yüklenmez; yalnızca https / blob / storage public yolu */
    const imageUrl = resolveTaskImageUrl(rawStr);
    const audioUrl =
      finalAudioUrl || getAudioUrl?.(task) || task?.audio_url || task?.content_url;
    const videoUrl = task?.video_url;

    const typeLower = (task?.type ?? '').toString().toLowerCase();
    const categoryLower = (task?.category ?? '').toString().toLowerCase();
    const hasDedicatedImageUrl = String(task?.image_url ?? '').trim().length > 0;
    const isImageMedia =
      typeLower === 'image' ||
      categoryLower === 'image' ||
      (hasDedicatedImageUrl && typeLower !== 'video');
    const isAudioOrTranscription =
      !isImageMedia &&
      (typeLower === 'audio' ||
        typeLower === 'transcription' ||
        categoryLower === 'transcription' ||
        categoryLower.includes('audio') ||
        categoryLower.includes('transcription'));

    // Check if task type is undefined
    if (!task?.type) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <Text style={{ color: '#64748b', fontSize: 16 }}>Loading task type...</Text>
        </View>
      );
    }

    // Görüntü — ses oynatıcıdan önce (yanlış tip / eksik type ile ses gösterimini önler)
    if (isImageMedia) {
      return (
        <View style={taskDetailStyles.annotationMain}>
          <View style={taskDetailStyles.annotationCanvas}>
            {imageUrl ? (
              <AnnotationCanvas
                ref={annotationCanvasRef}
                imageUrl={imageUrl}
                annotations={annotations}
                activeTool={activeTool as any}
                selectedId={selectedAnnotationId}
                onSelect={onAnnotationSelect}
                selectedLabel={selectedLabel}
                onToolChange={onToolChange as any}
                onAnnotationsChange={onAnnotationsChange}
                hideFloatingToolbar={hideCanvasToolbar}
                brushColor={brushColor}
                onBrushColorChange={onBrushColorChange}
                brushPaletteOpen={brushPaletteOpen}
                onBrushPaletteOpenChange={onBrushPaletteOpenChange}
              />
            ) : (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16 }}>
                <Text style={{ color: '#94a3b8', fontSize: 14, textAlign: 'center', lineHeight: 22 }}>
                  {rawStr
                    ? 'Görüntü bu adresten yüklenemiyor (çoğunlukla eski file://, blob: veya zip:// kaydı). Admin → Create Image Task ile dosyayı yeniden yükleyin; görüntü Supabase Storage’a gider ve https ile açılır.'
                    : 'Bu görevde image_url tanımlı değil.'}
                </Text>
              </View>
            )}
          </View>
        </View>
      );
    }

    // Ses / transkripsiyon görevleri (type veya category transcription olabilir)
    if (isAudioOrTranscription) {
      return (
        <View style={taskDetailStyles.audioSection}>
          <View style={taskDetailStyles.audioHeader}>
            <View style={taskDetailStyles.sectionActions}>
              <View style={taskDetailStyles.submittedBadgeCompact}>
                <Text style={taskDetailStyles.submittedText}>Audio Task</Text>
              </View>
            </View>
          </View>
          <View style={taskDetailStyles.audioPlayerWrapper}>
            {audioUrl ? (
              <AudioPlayer audioUri={audioUrl} />
            ) : (
              <Text style={taskDetailStyles.noAudioText}>No audio file available</Text>
            )}
          </View>
        </View>
      );
    }

    // Video task - ONLY show VideoPlayer
    if (task?.type?.toLowerCase() === 'video') {
      return (
        <View style={taskDetailStyles.mediaContainer}>
          {videoUrl && (
            <VideoPlayer
              videoUrl={videoUrl}
              annotations={annotations}
              onAnnotationsChange={onAnnotationsChange}
            />
          )}
        </View>
      );
    }

    // Unknown task type - show error
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Text style={{ color: '#ef4444', fontSize: 16 }}>Unknown task type: {task?.type}</Text>
      </View>
    );
  }
);
