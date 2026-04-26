import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Platform, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import AnnotationCanvas, { type Annotation, type Tool } from '@/components/AnnotationCanvas';
import VideoAnnotationTimeline from '@/components/video-workbench/VideoAnnotationTimeline.web';
import AnnotatorVideoRightPanel from '@/components/video-workbench/AnnotatorVideoRightPanel.web';
import WorkbenchVideoToolRail from '@/components/video-workbench/WorkbenchVideoToolRail.web';
import { createVideoProWorkbenchStyles, desktopWorkbenchDark } from '@/theme/videoProWorkbenchTheme';
import { useVideoWorkbench } from '@/hooks/useVideoWorkbench';
import { WebVideoPlayer, type WebVideoPlayerHandle } from '@/components/video-workbench/WebVideoPlayer.web';
import { useAuth } from '@/contexts/AuthContext';
import { WorkbenchObjectListChrome } from '@/components/workbench/WorkbenchObjectListChrome';
import {
  ANNOTATION_LABELS,
  mergeAnnotationChipLabels,
  customLabelDefinitionsToMap,
  type CustomLabelDefinition,
} from '@/constants/annotationLabels';

const FPS = 30;
const C = desktopWorkbenchDark;

type Props = { taskId: string };

export default function VideoProWorkbench({ taskId }: Props) {
  const router = useRouter();
  const { t } = useTranslation();
  const { user } = useAuth();
  const videoRef = useRef<WebVideoPlayerHandle>(null);
  const canvasRef = useRef<any>(null);

  const S = useMemo(() => createVideoProWorkbenchStyles(C), []);

  const [extraLabelDefinitions, setExtraLabelDefinitions] = useState<CustomLabelDefinition[]>([]);
  const [activeTool, setActiveTool] = useState<Tool>('bbox');
  /** Yeni çizimler canvas’ta boş etiketle oluşur; sınıf sağ panel veya 1–5 ile atanır */
  const [selectedLabel, setSelectedLabel] = useState<string>('');
  const [trackMode, setTrackMode] = useState(false);

  const {
    currentFrame,
    currentFrameNumber,
    videoAnnotations,
    videoUrl,
    videoDuration,
    task,
    saving,
    loading,
    annotations,
    selectedAnnotationId,
    loadVideo,
    handleFrameCapture,
    handleTimeUpdate,
    handleLoadedMetadata,
    handleSubmit,
    handleDeleteAnnotation,
    handleUpdateAnnotationLabel,
    setAnnotations,
    setVideoAnnotations,
    setSelectedAnnotationId,
    requestSelectAnnotationAfterFrameCapture,
    getSubmitValidationMessages,
  } = useVideoWorkbench(taskId);

  useEffect(() => {
    loadVideo();
  }, [loadVideo]);

  const totalFrames = useMemo(() => {
    const d = Number.isFinite(videoDuration) && videoDuration > 0 ? videoDuration : 0;
    return Math.max(1, Math.floor(d * FPS) + 1);
  }, [videoDuration]);

  const progressPct = useMemo(() => {
    const annotated = new Set<number>();
    for (const b of videoAnnotations) {
      if ((b.annotations ?? []).length > 0) annotated.add(b.frameNumber);
    }
    const denom = Math.max(1, totalFrames - 1);
    return Math.min(100, Math.round((annotated.size / denom) * 100));
  }, [videoAnnotations, totalFrames]);

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
            ? String((a.label as { name?: string }).name ?? (a.label as { label?: string }).label ?? '')
            : String(a.label ?? '');
        return cur === label ? { ...a, label: 'Other' } : a;
      })
    );
  }, [setAnnotations]);

  const chipLabels = useMemo(
    () => mergeAnnotationChipLabels(extraLabelDefinitions.map((d) => d.label)),
    [extraLabelDefinitions]
  );

  const labelColorOverrides = useMemo(
    () => customLabelDefinitionsToMap(extraLabelDefinitions),
    [extraLabelDefinitions]
  );

  const onSeekTimelineFrame = useCallback(
    (frame: number) => {
      const max = Math.max(0, totalFrames - 1);
      const clamped = Math.max(0, Math.min(max, frame));
      const t = clamped / FPS;
      videoRef.current?.pause();
      videoRef.current?.seekToTime(t);
    },
    [FPS, totalFrames]
  );

  const frameJumpControl = useMemo(
    () => ({
      totalFrames,
      currentFrameNumber,
      onJumpFrame: onSeekTimelineFrame,
    }),
    [totalFrames, currentFrameNumber, onSeekTimelineFrame]
  );

  const onUpdateLabelForSelected = useCallback(
    (annId: string, label: string) => {
      handleUpdateAnnotationLabel(annId, label);
      setVideoAnnotations((prev) =>
        prev.map((b) =>
          b.frameNumber !== currentFrameNumber
            ? b
            : {
                ...b,
                annotations: (b.annotations ?? []).map((a: Annotation) =>
                  a.id === annId ? { ...a, label } : a
                ),
              }
        )
      );
    },
    [currentFrameNumber, handleUpdateAnnotationLabel, setVideoAnnotations]
  );

  const trySubmit = useCallback(
    (navigateNext: boolean) => {
      const msgs = getSubmitValidationMessages();
      const incomplete = msgs.length > 0 || progressPct < 100;
      if (incomplete && typeof window !== 'undefined') {
        const ok = window.confirm(
          'Some frames still have missing annotations.\n\nSubmit anyway?'
        );
        if (!ok) return;
      }
      void handleSubmit(navigateNext);
    },
    [getSubmitValidationMessages, handleSubmit, progressPct]
  );

  const navigateBack = useCallback(() => {
    try {
      if (typeof router.canGoBack === 'function' && router.canGoBack()) {
        router.back();
      } else {
        router.replace('/dashboard/video' as never);
      }
    } catch {
      router.replace('/dashboard/video' as never);
    }
  }, [router]);

  const effectiveTool: Tool = trackMode ? 'magic_wand' : activeTool;

  const setTool = useCallback((t: Tool) => {
    setTrackMode(false);
    setActiveTool(t);
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el?.closest?.('input, textarea, select')) return;

      if (e.code === 'Space') {
        e.preventDefault();
        videoRef.current?.togglePlayPause();
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        videoRef.current?.stepFrames(e.shiftKey ? -10 : -1);
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        videoRef.current?.stepFrames(e.shiftKey ? 10 : 1);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) {
          /* redo not available */
        } else {
          canvasRef.current?.handleUndo?.();
        }
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        const ids = annotations.map((a) => a.id).filter(Boolean);
        if (ids.length === 0) return;
        const cur = selectedAnnotationId ? ids.indexOf(selectedAnnotationId) : -1;
        const next = ids[(cur + 1) % ids.length];
        setSelectedAnnotationId(next ?? null);
        return;
      }
      if (!e.ctrlKey && !e.metaKey) {
        if (e.key === 'v' || e.key === 'V') setTool('select');
        if (e.key === 'b' || e.key === 'B') setTool('bbox');
        if (e.key === 'p' || e.key === 'P') setTool('polygon');
        if (e.key === 'k' || e.key === 'K') setTool('points');
        if (e.key === 'z' || e.key === 'Z') setTool('pan');
        if (e.key === 't' || e.key === 'T') setTrackMode((m) => !m);
        if (e.key === 'Delete' || e.key === 'Backspace') {
          if (selectedAnnotationId) handleDeleteAnnotation(selectedAnnotationId);
        }
      }
      const num = parseInt(e.key, 10);
      const quickLabels = chipLabels.slice(0, 9);
      if (!e.ctrlKey && !e.metaKey && num >= 1 && num <= quickLabels.length) {
        const lab = quickLabels[num - 1];
        if (!lab) return;
        if (selectedAnnotationId) {
          onUpdateLabelForSelected(selectedAnnotationId, lab);
        } else {
          setSelectedLabel(lab);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    annotations,
    chipLabels,
    handleDeleteAnnotation,
    onUpdateLabelForSelected,
    selectedAnnotationId,
    setTool,
  ]);

  const isSubmitted = task?.status === 'submitted';

  if (loading || !taskId) {
    return (
      <View style={S.root}>
        <Text style={S.loadingText}>{loading ? 'Loading…' : 'Missing task'}</Text>
      </View>
    );
  }

  return (
    <View style={[S.root, { backgroundColor: C.bg, flex: 1, position: 'relative' as const }]}>
      {/* Görüntü görevi üst şeridi: Back + sağ üstte tür + fiyat */}
      <View style={topStyles.headerStrip}>
        <TouchableOpacity style={topStyles.backBtn} onPress={navigateBack} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={20} color="#3b82f6" />
          <Text style={topStyles.backBtnText}>{t('taskDetail.back')}</Text>
        </TouchableOpacity>
      </View>

      <View style={topStyles.taskInfoBar} pointerEvents="box-none">
        <Text style={topStyles.taskInfoType}>{t('tasks.cardVideoAnnotation')}</Text>
        <View style={topStyles.taskInfoPriceBadge}>
          <Text style={topStyles.taskInfoPriceText}>{task?.price ?? 0} TL</Text>
        </View>
      </View>

      <View style={{ flex: 1, minHeight: 0, minWidth: 0, width: '100%', maxWidth: '100%' }}>
      <View style={[S.mainRow, { flex: 1, minHeight: 0, minWidth: 0, width: '100%', maxWidth: '100%' }]}>
        <View
          style={{
            alignItems: 'center',
            backgroundColor: '#0f172a',
            borderRightWidth: 1,
            borderRightColor: '#334155',
          }}
        >
          <WorkbenchVideoToolRail
            activeTool={activeTool}
            trackMode={trackMode}
            onToolChange={(t) => setTool(t)}
            onToggleTrack={() => setTrackMode((m) => !m)}
            onUndo={() => canvasRef.current?.handleUndo?.()}
            onResetView={() => canvasRef.current?.resetView?.()}
            selectedAnnotationId={selectedAnnotationId}
            onDeleteSelected={() => {
              if (selectedAnnotationId) handleDeleteAnnotation(selectedAnnotationId);
            }}
          />
        </View>

        <View
          style={[
            S.centerColumn,
            {
              flex: 1,
              minWidth: 0,
              flexShrink: 1,
              backgroundColor: C.bg,
              overflow: 'hidden',
            },
          ]}
        >
          <View style={[S.centerStack, { flex: 1, minHeight: 0, minWidth: 0, backgroundColor: C.bg }]}>
            {currentFrame ? (
              <View style={[S.canvasWrap, { flex: 1, backgroundColor: C.bg }]}>
                <View style={S.canvasFitBar} pointerEvents="box-none">
                  <TouchableOpacity
                    style={S.canvasFitButton}
                    onPress={() => canvasRef.current?.resetView?.()}
                    activeOpacity={0.85}
                    {...(Platform.OS === 'web' ? ({ title: 'Reset view' } as object) : {})}
                  >
                    <Ionicons name="contract-outline" size={20} color={C.text} />
                  </TouchableOpacity>
                </View>
                <View style={S.canvasWorkspace}>
                  <AnnotationCanvas
                    key={currentFrameNumber}
                    ref={canvasRef}
                    imageUrl={currentFrame}
                    initialAnnotations={[]}
                    taskId={task?.id || ''}
                    annotations={annotations}
                    onAnnotationsChange={setAnnotations}
                    activeTool={effectiveTool}
                    selectedId={selectedAnnotationId}
                    onSelect={setSelectedAnnotationId}
                    selectedLabel={selectedLabel}
                    isBrushActive={false}
                    onToolChange={(tl) => setTool(tl as Tool)}
                    onUndo={() => canvasRef.current?.handleUndo?.()}
                    labelColorOverrides={labelColorOverrides}
                    hideFloatingToolbar
                  />
                </View>
              </View>
            ) : (
              <View style={[S.canvasWrap, { flex: 1, backgroundColor: C.bg }]} />
            )}

            <View style={[S.videoWrap, { flex: 1.35, backgroundColor: C.bg }]}>
              {videoUrl ? (
                <WebVideoPlayer
                  key={videoUrl}
                  ref={videoRef}
                  src={videoUrl}
                  fps={FPS}
                  chrome={C}
                  frameJump={frameJumpControl}
                  onFrameCapture={handleFrameCapture}
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={handleLoadedMetadata}
                />
              ) : (
                <View style={{ flex: 1, backgroundColor: C.bg }} />
              )}
            </View>
          </View>

          <VideoAnnotationTimeline
            colors={C}
            totalFrames={totalFrames}
            currentFrameNumber={currentFrameNumber}
            videoAnnotations={videoAnnotations}
            onSeekFrame={onSeekTimelineFrame}
          />
        </View>

        <View
          style={{
            width: 300,
            minWidth: 300,
            maxWidth: 300,
            flexGrow: 0,
            flexShrink: 0,
            alignSelf: 'stretch',
            minHeight: 0,
            flexDirection: 'column',
            backgroundColor: C.panel,
            borderLeftWidth: 1,
            borderLeftColor: '#334155',
            zIndex: 2,
          }}
        >
          <View style={{ paddingHorizontal: 10, paddingTop: 10, paddingBottom: 4 }}>
            <WorkbenchObjectListChrome
              extraLabelDefinitions={extraLabelDefinitions}
              onAddExtraLabelOption={handleAddExtraLabelOption}
              onRemoveExtraLabelOption={handleRemoveExtraLabelOption}
            />
          </View>
          <View style={{ flex: 1, minHeight: 0 }}>
            <AnnotatorVideoRightPanel
              colors={C}
              annotations={annotations}
              selectedId={selectedAnnotationId}
              onSelect={setSelectedAnnotationId}
              onUpdateLabel={onUpdateLabelForSelected}
              onDelete={handleDeleteAnnotation}
              chipLabels={chipLabels}
              labelColorOverrides={labelColorOverrides}
            />
          </View>
        </View>
      </View>
      </View>

      {!isSubmitted ? (
        <View style={bottomStyles.bottomButtonBar}>
          <View style={bottomStyles.bottomLeftActions}>
            <TouchableOpacity style={bottomStyles.exitButton} onPress={navigateBack} activeOpacity={0.8}>
              <Text style={bottomStyles.exitButtonText}>Exit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[bottomStyles.submitExitButton, saving && bottomStyles.submitButtonDisabled]}
              onPress={() => trySubmit(false)}
              disabled={saving}
              activeOpacity={0.8}
            >
              <Text style={bottomStyles.submitExitButtonText}>{saving ? 'Saving…' : 'Submit & Exit'}</Text>
            </TouchableOpacity>
          </View>
          <View style={bottomStyles.bottomRightActions}>
            <TouchableOpacity
              style={[bottomStyles.submitButtonGreen, saving && bottomStyles.submitButtonDisabled]}
              onPress={() => trySubmit(true)}
              disabled={saving}
              activeOpacity={0.8}
            >
              <Text style={bottomStyles.submitButtonGreenText}>{saving ? 'Saving…' : 'Submit'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={bottomStyles.bottomButtonBar}>
          <TouchableOpacity style={bottomStyles.exitButton} onPress={navigateBack} activeOpacity={0.8}>
            <Text style={bottomStyles.exitButtonText}>Exit</Text>
          </TouchableOpacity>
          <View style={bottomStyles.submittedBadge}>
            <Ionicons name="checkmark-circle" size={16} color="#fff" />
            <Text style={bottomStyles.submittedText}>Submitted</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const topStyles = StyleSheet.create({
  headerStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
    marginBottom: 4,
    backgroundColor: '#0f172a',
    minHeight: 40,
    maxHeight: 44,
    zIndex: 1000,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
  },
  backBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3b82f6',
    marginLeft: 8,
  },
  taskInfoBar: {
    position: 'absolute' as const,
    top: 16,
    right: 16,
    zIndex: 1001,
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
});

/** `app/dashboard/image/[id].tsx` alt çubuğu ile aynı düzen */
const bottomStyles = StyleSheet.create({
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
    flexShrink: 1,
    flexWrap: 'wrap',
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
    fontWeight: '600',
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
    fontWeight: '600',
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
    fontWeight: '600',
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submittedBadge: {
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
    fontWeight: '600',
  },
});
