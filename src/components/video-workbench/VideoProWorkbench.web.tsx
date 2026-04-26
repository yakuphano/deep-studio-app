import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import AnnotationCanvas, { type Annotation, type Tool } from '@/components/AnnotationCanvas';
import BrushColorPalette from '@/components/workbench/BrushColorPalette';
import VideoMultiFrameObjectList from '@/components/video-workbench/VideoMultiFrameObjectList';
import { DEFAULT_BRUSH_COLOR } from '@/types/annotations';
import {
  ANNOTATION_LABELS,
  customLabelDefinitionsToMap,
  mergeAnnotationChipLabels,
  type CustomLabelDefinition,
} from '@/constants/annotationLabels';
import { videoProWorkbenchStyles as S, proColors } from '@/theme/videoProWorkbenchTheme';
import { useVideoWorkbench } from '@/hooks/useVideoWorkbench';
import { WebVideoPlayer, type WebVideoPlayerHandle } from '@/components/video-workbench/WebVideoPlayer.web';

const FPS = 30;

type Props = { taskId: string };

export default function VideoProWorkbench({ taskId }: Props) {
  const router = useRouter();
  const { t } = useTranslation();
  const videoRef = useRef<WebVideoPlayerHandle>(null);
  const canvasRef = useRef<any>(null);
  const [activeTool, setActiveTool] = useState<Tool>('bbox');
  const [selectedLabel, setSelectedLabel] = useState<string>(String(ANNOTATION_LABELS[0] ?? 'Other'));
  const [trackMode, setTrackMode] = useState(false);
  const [extraLabelDefinitions, setExtraLabelDefinitions] = useState<CustomLabelDefinition[]>([]);
  const [brushColor, setBrushColor] = useState(DEFAULT_BRUSH_COLOR);
  const [brushPaletteOpen, setBrushPaletteOpen] = useState(false);

  const {
    currentFrame,
    currentFrameNumber,
    videoAnnotations,
    thumbnailCache,
    videoUrl,
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
  } = useVideoWorkbench(taskId);

  useEffect(() => {
    loadVideo();
  }, [loadVideo]);

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

  const handleRemoveExtraLabelOption = useCallback(
    (label: string) => {
      setExtraLabelDefinitions((prev) => prev.filter((d) => d.label !== label));
      const relabel = (a: Annotation) => {
        const cur =
          typeof a.label === 'object' && a.label !== null
            ? String((a.label as any).name ?? (a.label as any).label ?? '')
            : String(a.label ?? '');
        return cur === label ? ({ ...a, label: 'Other' } as Annotation) : a;
      };
      setAnnotations((prev) => prev.map(relabel));
      setVideoAnnotations((prev) =>
        prev.map((block) => ({
          ...block,
          annotations: (block.annotations ?? []).map(relabel),
        }))
      );
    },
    [setAnnotations, setVideoAnnotations]
  );

  const labelColorOverrides = useMemo(
    () => customLabelDefinitionsToMap(extraLabelDefinitions),
    [extraLabelDefinitions]
  );

  const chipLabels = useMemo(
    () => mergeAnnotationChipLabels(extraLabelDefinitions.map((d) => d.label)),
    [extraLabelDefinitions]
  );

  const onUpdateLabelForFrame = useCallback(
    (frameNumber: number, annId: string, label: string) => {
      if (frameNumber === currentFrameNumber) {
        handleUpdateAnnotationLabel(annId, label);
        setVideoAnnotations((prev) =>
          prev.map((b) => ({
            ...b,
            annotations: (b.annotations ?? []).map((a: Annotation) =>
              a.id === annId ? { ...a, label } : a
            ),
          }))
        );
      } else {
        setVideoAnnotations((prev) =>
          prev.map((b) =>
            b.frameNumber !== frameNumber
              ? b
              : {
                  ...b,
                  annotations: (b.annotations ?? []).map((a: Annotation) =>
                    a.id === annId ? { ...a, label } : a
                  ),
                }
          )
        );
      }
      setSelectedLabel(label);
    },
    [currentFrameNumber, handleUpdateAnnotationLabel, setVideoAnnotations]
  );

  const onDeleteAnnotationForFrame = useCallback(
    (frameNumber: number, annId: string) => {
      if (frameNumber === currentFrameNumber) {
        handleDeleteAnnotation(annId);
        setVideoAnnotations((prev) =>
          prev.map((b) => ({
            ...b,
            annotations: (b.annotations ?? []).filter((a: Annotation) => a.id !== annId),
          }))
        );
      } else {
        setVideoAnnotations((prev) =>
          prev.map((b) =>
            b.frameNumber !== frameNumber
              ? b
              : {
                  ...b,
                  annotations: (b.annotations ?? []).filter((a: Annotation) => a.id !== annId),
                }
          )
        );
        if (selectedAnnotationId === annId) setSelectedAnnotationId(null);
      }
    },
    [currentFrameNumber, handleDeleteAnnotation, selectedAnnotationId, setVideoAnnotations, setSelectedAnnotationId]
  );

  const onJumpToFrame = useCallback((_: number, timestamp: number) => {
    if (typeof document !== 'undefined') {
      const el = document.activeElement as HTMLElement | null;
      el?.blur?.();
    }
    videoRef.current?.pause();
    videoRef.current?.seekToTime(timestamp);
  }, []);

  const onSelectObjectFromList = useCallback(
    (_frameNumber: number, annotationId: string, timestamp: number) => {
      if (typeof document !== 'undefined') {
        const el = document.activeElement as HTMLElement | null;
        el?.blur?.();
      }
      requestSelectAnnotationAfterFrameCapture(annotationId);
      videoRef.current?.pause();
      videoRef.current?.seekToTime(timestamp);
    },
    [requestSelectAnnotationAfterFrameCapture]
  );

  const effectiveTool: Tool = trackMode ? 'magic_wand' : activeTool;

  const setTool = useCallback((tool: Tool) => {
    setTrackMode(false);
    setActiveTool(tool);
    if (tool !== 'brush') setBrushPaletteOpen(false);
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
      if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        videoRef.current?.stepFrames(e.shiftKey ? -10 : -1);
        return;
      }
      if (e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        videoRef.current?.stepFrames(e.shiftKey ? 10 : 1);
        return;
      }
      if (!e.ctrlKey && !e.metaKey) {
        if (e.key === 'v' || e.key === 'V') setTool('select');
        if (e.key === 'b' || e.key === 'B') setTool('bbox');
        if (e.key === 'p' || e.key === 'P') setTool('polygon');
        if (e.key === 'o' || e.key === 'O') setTool('points');
        if (e.key === 'l' || e.key === 'L') setTool('polyline');
        if (e.key === 'f' || e.key === 'F') setTool('brush');
        if (e.key === 't' || e.key === 'T') setTrackMode((m) => !m);
        if (e.key === 'Delete' || e.key === 'Backspace') {
          if (selectedAnnotationId) handleDeleteAnnotation(selectedAnnotationId);
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        canvasRef.current?.handleUndo?.();
      }
      const num = parseInt(e.key, 10);
      if (!e.ctrlKey && !e.metaKey && num >= 1 && num <= 9) {
        const lab = chipLabels[num - 1];
        if (lab) setSelectedLabel(lab);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chipLabels, handleDeleteAnnotation, selectedAnnotationId, setTool]);

  const isSubmitted = task?.status === 'submitted';

  if (loading || !taskId) {
    return (
      <View style={S.root}>
        <Text style={S.loadingText}>{loading ? 'Loading…' : 'Missing task'}</Text>
      </View>
    );
  }

  return (
    <View style={S.root}>
      <View style={S.backHeaderRow}>
        <TouchableOpacity style={S.backButton} onPress={() => router.back()} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={20} color="#3b82f6" />
          <Text style={S.backButtonText}>{t('taskDetail.back')}</Text>
        </TouchableOpacity>
      </View>

      <View style={S.mainRow}>
        <ScrollView
          style={S.leftToolRail}
          contentContainerStyle={S.leftToolRailContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity
            style={[S.toolRailBtn, activeTool === 'select' && !trackMode && S.toolRailBtnActive]}
            onPress={() => setTool('select')}
            accessibilityLabel="Select"
            {...(Platform.OS === 'web' ? ({ title: 'Select (V)' } as object) : {})}
          >
            <Ionicons name="hand-left-outline" size={18} color={proColors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[S.toolRailBtn, activeTool === 'bbox' && !trackMode && S.toolRailBtnActive]}
            onPress={() => setTool('bbox')}
            accessibilityLabel="Bounding box"
            {...(Platform.OS === 'web' ? ({ title: 'Bounding box (B)' } as object) : {})}
          >
            <Ionicons name="square-outline" size={18} color={proColors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[S.toolRailBtn, activeTool === 'polygon' && !trackMode && S.toolRailBtnActive]}
            onPress={() => setTool('polygon')}
            accessibilityLabel="Polygon"
            {...(Platform.OS === 'web' ? ({ title: 'Polygon (P)' } as object) : {})}
          >
            <Ionicons name="git-merge-outline" size={18} color={proColors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[S.toolRailBtn, activeTool === 'points' && !trackMode && S.toolRailBtnActive]}
            onPress={() => setTool('points')}
            accessibilityLabel="Points"
            {...(Platform.OS === 'web' ? ({ title: 'Points (O)' } as object) : {})}
          >
            <Ionicons name="locate-outline" size={18} color={proColors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[S.toolRailBtn, activeTool === 'polyline' && !trackMode && S.toolRailBtnActive]}
            onPress={() => setTool('polyline')}
            accessibilityLabel="Polyline"
            {...(Platform.OS === 'web' ? ({ title: 'Polyline (L)' } as object) : {})}
          >
            <Ionicons name="analytics-outline" size={18} color={proColors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[S.toolRailBtn, activeTool === 'brush' && !trackMode && S.toolRailBtnActive]}
            onPress={() => {
              setTool('brush');
              setBrushPaletteOpen((o) => !o);
            }}
            accessibilityLabel="Brush"
            {...(Platform.OS === 'web' ? ({ title: 'Brush (F)' } as object) : {})}
          >
            <Ionicons name="brush-outline" size={18} color={proColors.text} />
          </TouchableOpacity>
          {activeTool === 'brush' && brushPaletteOpen ? (
            <View style={{ width: 52, alignSelf: 'center', marginBottom: 4 }}>
              <BrushColorPalette
                currentColor={brushColor}
                onSelectColor={(c) => {
                  setBrushColor(c);
                  setBrushPaletteOpen(false);
                }}
                width={52}
              />
            </View>
          ) : null}
          <TouchableOpacity
            style={[S.toolRailBtn, trackMode && S.toolRailBtnActive]}
            onPress={() => setTrackMode((m) => !m)}
            accessibilityLabel="Track"
            {...(Platform.OS === 'web' ? ({ title: 'Track (T)' } as object) : {})}
          >
            <Ionicons name="color-wand-outline" size={18} color={proColors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={S.toolRailBtn}
            onPress={() => canvasRef.current?.handleUndo?.()}
            accessibilityLabel="Undo"
            {...(Platform.OS === 'web' ? ({ title: 'Undo (Ctrl+Z)' } as object) : {})}
          >
            <Ionicons name="arrow-undo-outline" size={18} color={proColors.text} />
          </TouchableOpacity>
        </ScrollView>

        <View style={S.center}>
          <View style={S.centerStack}>
            {currentFrame ? (
              <View style={S.canvasWrap}>
                <View style={S.canvasFitBar} pointerEvents="box-none">
                  <TouchableOpacity
                    style={S.canvasFitButton}
                    onPress={() => canvasRef.current?.resetView?.()}
                    activeOpacity={0.85}
                    accessibilityLabel={t('annotation.resetView')}
                    {...(Platform.OS === 'web'
                      ? ({ title: t('annotation.resetView') } as object)
                      : {})}
                  >
                    <Ionicons name="contract-outline" size={20} color={proColors.text} />
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
                    isBrushActive={activeTool === 'brush'}
                    onToolChange={(tool) => setTool(tool as Tool)}
                    onUndo={() => canvasRef.current?.handleUndo?.()}
                    labelColorOverrides={labelColorOverrides}
                    hideFloatingToolbar
                    brushColor={brushColor}
                    onBrushColorChange={setBrushColor}
                    brushPaletteOpen={brushPaletteOpen}
                    onBrushPaletteOpenChange={setBrushPaletteOpen}
                  />
                </View>
              </View>
            ) : (
              <View style={[S.canvasWrap, { backgroundColor: proColors.bg }]} />
            )}

            <View style={S.videoWrap}>
              {videoUrl ? (
                <WebVideoPlayer
                  key={videoUrl}
                  ref={videoRef}
                  src={videoUrl}
                  fps={FPS}
                  onFrameCapture={handleFrameCapture}
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={handleLoadedMetadata}
                />
              ) : (
                <View style={{ flex: 1, backgroundColor: proColors.bg }} />
              )}
            </View>
          </View>
        </View>

        <View style={S.rightPanel}>
          <View style={{ flex: 1, minHeight: 0, alignSelf: 'stretch' }}>
            <VideoMultiFrameObjectList
              videoAnnotations={videoAnnotations}
              thumbnailCache={thumbnailCache}
              currentFrameNumber={currentFrameNumber}
              selectedAnnotationId={selectedAnnotationId}
              extraLabelDefinitions={extraLabelDefinitions}
              onAddExtraLabelOption={handleAddExtraLabelOption}
              onRemoveExtraLabelOption={handleRemoveExtraLabelOption}
              onJumpToFrame={onJumpToFrame}
              onSelectObject={onSelectObjectFromList}
              onUpdateAnnotationLabel={onUpdateLabelForFrame}
              onDeleteAnnotation={onDeleteAnnotationForFrame}
            />
          </View>
        </View>
      </View>

      {!isSubmitted && (
        <View style={S.bottomButtonBar}>
          <View style={S.bottomLeftActions}>
            <TouchableOpacity style={S.exitButton} onPress={() => router.back()} activeOpacity={0.8}>
              <Text style={S.exitButtonText}>Exit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[S.submitExitButton, saving && S.submitButtonDisabled]}
              onPress={() => void handleSubmit(false)}
              disabled={saving}
              activeOpacity={0.8}
            >
              <Text style={S.submitExitButtonText}>
                {saving ? t('taskDetail.saving') : 'Submit & Exit'}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={S.bottomRightActions}>
            <TouchableOpacity
              style={[S.submitButtonGreen, saving && S.submitButtonDisabled]}
              onPress={() => void handleSubmit(true)}
              disabled={saving}
              activeOpacity={0.8}
            >
              <Text style={S.submitButtonGreenText}>
                {saving ? t('taskDetail.saving') : 'Submit'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}
