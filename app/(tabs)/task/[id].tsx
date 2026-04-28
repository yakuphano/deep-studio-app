import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { View, ScrollView, TouchableOpacity, Text, TextInput, Platform, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useTaskWorkbench } from '@/hooks/useTaskWorkbench';
import { taskDetailStyles } from '@/theme/taskDetailStyles';
import TaskHeader from '@/components/workbench/TaskHeader';
import { TaskMediaView, type TaskMediaViewCanvasHandle } from '@/components/task/TaskMediaView';
import { TaskEditor } from '@/components/task/TaskEditor';
import ImageAnnotationThreeColumn from '@/components/workbench/ImageAnnotationThreeColumn';
import {
  ANNOTATION_LABELS,
  MEDICAL_ANNOTATION_LABELS,
  shouldUseMedicalAnnotationPreset,
  mergeAnnotationChipLabels,
  type CustomLabelDefinition,
} from '@/constants/annotationLabels';

export default function TaskDetailScreen() {
  const params = useLocalSearchParams<{ id: string | string[] }>();
  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const taskId =
    typeof rawId === 'string' && rawId.length > 0 && rawId !== 'undefined' ? rawId : undefined;
  const router = useRouter();
  const { user } = useAuth();

  const {
    task,
    loading,
    annotations,
    transcription,
    activeTool,
    selectedAnnotationId,
    taskType,
    taskTypeLabel,
    saving,
    handleAITranscription,
    handleAIFix,
    handleSaveDraft,
    handleSubmit,
    handleAnnotationDelete,
    handleExit,
    setActiveTool,
    setSelectedAnnotationId,
    setAnnotations,
    setTranscription,
  } = useTaskWorkbench(taskId, user?.id);

  const [selectedLabel, setSelectedLabel] = useState<string>('');
  const [extraLabelDefinitions, setExtraLabelDefinitions] = useState<CustomLabelDefinition[]>([]);
  const imageCanvasRef = useRef<TaskMediaViewCanvasHandle | null>(null);
  const activeToolRef = useRef(activeTool);
  useLayoutEffect(() => {
    activeToolRef.current = activeTool;
  }, [activeTool]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (!taskId) return;
    if (loading || !task) return;
    const tl = String(task.type ?? '').toLowerCase();
    const cat = String(task.category ?? '').toLowerCase();
    const hasVideoUrl = String(task.video_url ?? '').trim().length > 0;
    const isVideo =
      tl === 'video' || cat.includes('video') || (hasVideoUrl && tl !== 'image' && tl !== 'audio');
    if (!isVideo) return;
    router.replace(`/(tabs)/video-annotation?id=${encodeURIComponent(taskId)}` as any);
  }, [loading, task, taskId, router]);

  const handleUpdateAnnotationLabel = useCallback(
    (annotationId: string, label: string) => {
      setSelectedLabel(label);
      setAnnotations((prev: any[]) =>
        prev.map((a) => (a.id === annotationId ? { ...a, label } : a))
      );
    },
    [setAnnotations]
  );

  const useMedicalPreset = shouldUseMedicalAnnotationPreset(null, task?.type, task?.category);
  const chipPreset = useMedicalPreset ? MEDICAL_ANNOTATION_LABELS : ANNOTATION_LABELS;

  const builtInLabelSet = useMemo(
    () => new Set<string>(chipPreset as unknown as string[]),
    [chipPreset]
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
      setAnnotations((prev: any[]) =>
        prev.map((a) => {
          const cur =
            typeof a.label === 'object' && a.label !== null
              ? String((a.label as any).name ?? (a.label as any).label ?? '')
              : String(a.label ?? '');
          const fallback = (chipPreset as readonly string[]).includes('Other')
            ? 'Other'
            : String(chipPreset[0] ?? 'Other');
          return cur === label ? { ...a, label: fallback } : a;
        })
      );
    },
    [setAnnotations, chipPreset]
  );

  const chipLabelsForBootstrap = useMemo(
    () => mergeAnnotationChipLabels(extraLabelDefinitions.map((d) => d.label), chipPreset),
    [extraLabelDefinitions, chipPreset]
  );

  useEffect(() => {
    if (!task) return;
    setSelectedLabel((s) => {
      if (!s || !chipLabelsForBootstrap.includes(s)) return chipLabelsForBootstrap[0] ?? '';
      return s;
    });
  }, [task?.id, chipLabelsForBootstrap]);

  const handleUndoAnnotations = useCallback(() => {
    const canvasUndo = imageCanvasRef.current?.undo;
    if (typeof canvasUndo === 'function') {
      canvasUndo();
      return;
    }
    setAnnotations((prev: any[]) => (prev.length > 0 ? prev.slice(0, -1) : prev));
  }, [setAnnotations]);

  /** Tuval onSelect(id): pan, select, bbox, cuboid, semantic veya magic_wand aktifken uygulanır; diğer araçlarda yok sayılır. Nesne listesi doğrudan seçer. */
  const handleCanvasAnnotationSelect = useCallback(
    (annotationId: string | null) => {
      if (annotationId !== null) {
        const t = activeToolRef.current;
        if (
          t !== 'pan' &&
          t !== 'select' &&
          t !== 'cuboid' &&
          t !== 'bbox' &&
          t !== 'semantic' &&
          t !== 'magic_wand'
        )
          return;
      }
      setSelectedAnnotationId(annotationId);
    },
    [setSelectedAnnotationId]
  );

  const finalAudioUrl =
    task?.audio_url || task?.content_url || task?.file_url || null;

  if (!taskId) {
    return (
      <View style={taskDetailStyles.container}>
        <Text style={taskDetailStyles.loadingText}>Loading...</Text>
      </View>
    );
  }

  // Loading guard
  if (loading || !task) {
    return (
      <View style={taskDetailStyles.container}>
        <Text style={taskDetailStyles.loadingText}>Loading task...</Text>
      </View>
    );
  }

  const hasVideoUrl = String(task?.video_url ?? '').trim().length > 0;
  const hasTypeField = task?.type != null && String(task.type).trim() !== '';
  if (!hasTypeField && !hasVideoUrl) {
    return (
      <View style={taskDetailStyles.container}>
        <Text style={taskDetailStyles.loadingText}>Loading task type...</Text>
      </View>
    );
  }

  const typeLc = (task?.type ?? '').toString().toLowerCase();
  const catLc = (task?.category ?? '').toString().toLowerCase();
  const hasImageUrl = String(task?.image_url ?? '').trim().length > 0;
  const isVideoTaskRoute =
    typeLc === 'video' ||
    catLc === 'video' ||
    catLc.includes('video') ||
    (hasVideoUrl && !hasImageUrl);

  /** Görsel görev: tip veya (video olmayan) image_url — ses arayüzüne düşmesini engeller */
  const isImageTask =
    typeLc === 'image' ||
    catLc === 'image' ||
    (hasImageUrl && typeLc !== 'video');
  const isAudioLike =
    !isImageTask &&
    (typeLc === 'audio' ||
      typeLc === 'transcription' ||
      catLc.includes('transcription') ||
      catLc.includes('audio'));

  if (isVideoTaskRoute) {
    if (Platform.OS === 'web') {
      return (
        <View style={[taskDetailStyles.container, { justifyContent: 'center', alignItems: 'center', padding: 24 }]}>
          <ActivityIndicator size="large" color="#8b5cf6" />
          <Text style={{ color: '#94a3b8', marginTop: 16, textAlign: 'center' }}>
            Video annotation açılıyor…
          </Text>
        </View>
      );
    }
    return (
      <View style={taskDetailStyles.container}>
        <TaskHeader title={task?.title || ''} price={task?.price} taskTypeLabel={taskTypeLabel} onBack={handleExit} />
        <ScrollView style={taskDetailStyles.scroll} contentContainerStyle={taskDetailStyles.scrollContent}>
          <TaskMediaView
            ref={imageCanvasRef}
            task={task}
            taskType="video"
            annotations={annotations}
            activeTool={activeTool}
            selectedAnnotationId={selectedAnnotationId}
            onToolChange={setActiveTool}
            onAnnotationSelect={handleCanvasAnnotationSelect}
            onAnnotationDelete={handleAnnotationDelete}
            onAnnotationsChange={setAnnotations}
            selectedLabel={selectedLabel}
            labelColorOverrides={Object.fromEntries(
              extraLabelDefinitions.map((d) => [d.label, d.color] as const)
            )}
          />
        </ScrollView>
        <View style={taskDetailStyles.bottomButtonBar}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity style={taskDetailStyles.exitButton} onPress={handleExit}>
              <Text style={taskDetailStyles.exitButtonText}>Exit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={taskDetailStyles.submitExitButton} onPress={() => handleSubmit(false)}>
              <Text style={taskDetailStyles.submitExitButtonText}>Submit & Exit</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={taskDetailStyles.submitButtonGreen} onPress={() => handleSubmit(true)}>
            <Text style={taskDetailStyles.submitButtonGreenText}>Submit Next</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Görüntü etiketleme — ses düzeninden önce
  if (isImageTask) {
    return (
      <View style={taskDetailStyles.container}>
        <TaskHeader title={task?.title || ''} price={task?.price} taskTypeLabel={taskTypeLabel} onBack={handleExit} />

        <View style={{ flex: 1, minHeight: 0 }}>
          <ImageAnnotationThreeColumn
            activeTool={activeTool}
            onToolChange={(t) => setActiveTool(t)}
            onUndo={handleUndoAnnotations}
            onResetImageView={() => imageCanvasRef.current?.resetImageView()}
            selectedAnnotationId={selectedAnnotationId}
            annotations={annotations}
            onSelectAnnotation={setSelectedAnnotationId}
            onUpdateAnnotationLabel={handleUpdateAnnotationLabel}
            onDeleteAnnotation={handleAnnotationDelete}
            extraLabelDefinitions={extraLabelDefinitions}
            onAddExtraLabelOption={handleAddExtraLabelOption}
            onRemoveExtraLabelOption={handleRemoveExtraLabelOption}
            builtInChipLabels={chipPreset}
          >
            <TaskMediaView
              ref={imageCanvasRef}
              task={task}
              taskType={taskType}
              annotations={annotations}
              activeTool={activeTool}
              selectedAnnotationId={selectedAnnotationId}
              onToolChange={setActiveTool}
              onAnnotationSelect={handleCanvasAnnotationSelect}
              onAnnotationDelete={handleAnnotationDelete}
              onAnnotationsChange={setAnnotations}
              finalAudioUrl={finalAudioUrl}
              hideCanvasToolbar
              selectedLabel={selectedLabel}
            />
          </ImageAnnotationThreeColumn>
        </View>
        
        <View style={taskDetailStyles.bottomButtonBar}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity style={taskDetailStyles.exitButton} onPress={handleExit}>
              <Text style={taskDetailStyles.exitButtonText}>Exit</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={taskDetailStyles.submitExitButton}
              onPress={() => void handleSubmit(false)}
              disabled={saving}
            >
              <Text style={taskDetailStyles.submitExitButtonText}>Submit & Exit</Text>
            </TouchableOpacity>
          </View>
          
          <TouchableOpacity
            style={taskDetailStyles.submitButtonGreen}
            onPress={() => void handleSubmit(true)}
            disabled={saving}
          >
            <Text style={taskDetailStyles.submitButtonGreenText}>Submit Next</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Ses / transkripsiyon görevleri
  if (isAudioLike) {
    return (
      <View style={taskDetailStyles.container}>
        <TaskHeader title={task?.title || ''} price={task?.price} taskTypeLabel={taskTypeLabel} onBack={handleExit} />
        
        <ScrollView style={taskDetailStyles.scroll} contentContainerStyle={taskDetailStyles.scrollContent}>
          <TaskMediaView
            task={task}
            taskType={taskType}
            annotations={annotations}
            activeTool={activeTool}
            selectedAnnotationId={selectedAnnotationId}
            onToolChange={setActiveTool}
            onAnnotationSelect={handleCanvasAnnotationSelect}
            onAnnotationDelete={handleAnnotationDelete}
            onAnnotationsChange={setAnnotations}
            finalAudioUrl={finalAudioUrl}
          />
          
          <TaskEditor
            transcription={transcription}
            onTranscriptionChange={setTranscription}
            onSaveDraft={handleSaveDraft}
            onAITranscription={handleAITranscription}
            onAIFix={handleAIFix}
            taskType={taskType}
          />
        </ScrollView>
        
        <View style={taskDetailStyles.bottomButtonBar}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity style={taskDetailStyles.exitButton} onPress={handleExit}>
              <Text style={taskDetailStyles.exitButtonText}>Exit</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={taskDetailStyles.submitExitButton} onPress={() => handleSubmit(false)}>
              <Text style={taskDetailStyles.submitExitButtonText}>Submit & Exit</Text>
            </TouchableOpacity>
          </View>
          
          <TouchableOpacity style={taskDetailStyles.submitButtonGreen} onPress={() => handleSubmit(true)}>
            <Text style={taskDetailStyles.submitButtonGreenText}>Submit Next</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Default
  return (
    <View style={taskDetailStyles.container}>
      <TaskHeader title={task?.title || ''} price={task?.price} taskTypeLabel={taskTypeLabel} onBack={handleExit} />
      
      <View style={{ flex: 1, minHeight: 0 }}>
        <TaskMediaView
          task={task}
          taskType={taskType}
          annotations={annotations}
          activeTool={activeTool}
          selectedAnnotationId={selectedAnnotationId}
          onToolChange={setActiveTool}
          onAnnotationSelect={handleCanvasAnnotationSelect}
          onAnnotationDelete={handleAnnotationDelete}
          onAnnotationsChange={setAnnotations}
          finalAudioUrl={finalAudioUrl}
        />
      </View>
      
      <View style={taskDetailStyles.bottomButtonBar}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity style={taskDetailStyles.exitButton} onPress={handleExit}>
            <Text style={taskDetailStyles.exitButtonText}>Exit</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={taskDetailStyles.submitExitButton} onPress={() => handleSubmit(false)}>
            <Text style={taskDetailStyles.submitExitButtonText}>Submit & Exit</Text>
          </TouchableOpacity>
        </View>
        
        <TouchableOpacity style={taskDetailStyles.submitButtonGreen} onPress={() => handleSubmit(true)}>
          <Text style={taskDetailStyles.submitButtonGreenText}>Submit Next</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}