import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { View, ScrollView, TouchableOpacity, Text, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useTaskWorkbench } from '@/hooks/useTaskWorkbench';
import { taskDetailStyles } from '@/theme/taskDetailStyles';
import TaskHeader from '@/components/workbench/TaskHeader';
import { TaskMediaView, type TaskMediaViewCanvasHandle } from '@/components/task/TaskMediaView';
import { TaskEditor } from '@/components/task/TaskEditor';
import VideoPlayer from '../../components/VideoPlayer';
import ImageAnnotationThreeColumn from '@/components/workbench/ImageAnnotationThreeColumn';
import { ANNOTATION_LABELS } from '@/constants/annotationLabels';

export default function TaskDetailScreen() {
  const params = useLocalSearchParams<{ id: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const { user } = useAuth();

  // Infinite loop protection
  if (!id || id === 'undefined' || typeof id !== 'string') {
    return <View style={taskDetailStyles.container}><Text style={taskDetailStyles.loadingText}>Loading...</Text></View>;
  }

  // Use extracted hooks
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
  } = useTaskWorkbench(id, user?.id);

  const [selectedLabel, setSelectedLabel] = useState<string>(
    String(ANNOTATION_LABELS[0] ?? 'Other')
  );
  const imageCanvasRef = useRef<TaskMediaViewCanvasHandle | null>(null);
  const activeToolRef = useRef(activeTool);
  useLayoutEffect(() => {
    activeToolRef.current = activeTool;
  }, [activeTool]);

  const handleUpdateAnnotationLabel = useCallback(
    (annotationId: string, label: string) => {
      setSelectedLabel(label);
      setAnnotations((prev: any[]) =>
        prev.map((a) => (a.id === annotationId ? { ...a, label } : a))
      );
    },
    [setAnnotations]
  );

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

  // Loading guard
  if (loading || !task) {
    return (
      <View style={taskDetailStyles.container}>
        <Text style={taskDetailStyles.loadingText}>Loading task...</Text>
      </View>
    );
  }

  // Check if task type is undefined
  if (!task?.type) {
    return (
      <View style={taskDetailStyles.container}>
        <Text style={taskDetailStyles.loadingText}>Loading task type...</Text>
      </View>
    );
  }

  const typeLc = (task?.type ?? '').toString().toLowerCase();
  const catLc = (task?.category ?? '').toString().toLowerCase();
  const hasImageUrl = String(task?.image_url ?? '').trim().length > 0;
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

  // Video Task
  if (task?.type?.toLowerCase() === 'video') {
    const videoUrl = task?.video_url;
    
    return (
      <View style={taskDetailStyles.container}>
        <TaskHeader title={task?.title || ''} price={task?.price} taskTypeLabel={taskTypeLabel} onBack={handleExit} />
        
        <ScrollView style={taskDetailStyles.scroll} contentContainerStyle={taskDetailStyles.scrollContent}>
          {/* VideoPlayer - En Üstte */}
          <View style={{ marginBottom: 16 }}>
            {videoUrl ? (
              <View style={{
                height: 200,
                backgroundColor: '#000',
                borderRadius: 8,
                justifyContent: 'center',
                alignItems: 'center',
                borderWidth: 1,
                borderColor: '#e2e8f0'
              }}>
                <Text style={{ color: '#fff', fontSize: 14 }}>Video Player</Text>
                <Text style={{ color: '#64748b', fontSize: 12, marginTop: 8 }}>
                  {videoUrl}
                </Text>
              </View>
            ) : (
              <View style={{ 
                height: 200, 
                backgroundColor: '#f1f5f9', 
                justifyContent: 'center', 
                alignItems: 'center',
                borderRadius: 8,
                borderWidth: 1,
                borderColor: '#e2e8f0'
              }}>
                <Text style={{ color: '#64748b', fontSize: 16 }}>No video available</Text>
              </View>
            )}
          </View>
          
          {/* TRANSCRIPTION Başlığı ve Butonlar */}
          <View style={{ paddingHorizontal: 16 }}>
            {/* TRANSCRIPTION Header */}
            <Text style={{
              fontSize: 14,
              fontWeight: '600',
              color: '#64748b',
              marginBottom: 12,
              textTransform: 'uppercase',
            }}>
              TRANSCRIPTION
            </Text>

            {/* Small Purple Buttons - Side by Side */}
            <View style={{
              flexDirection: 'row',
              alignSelf: 'flex-start',
              gap: 8,
              marginBottom: 16,
            }}>
              <TouchableOpacity
                style={{
                  backgroundColor: '#8b5cf6',
                  paddingVertical: 6,
                  paddingHorizontal: 12,
                  borderRadius: 4,
                }}
                onPress={handleAITranscription}
              >
                <Text style={{
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: '500',
                }}>
                  AI Yazıya Dök
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  backgroundColor: '#8b5cf6',
                  paddingVertical: 6,
                  paddingHorizontal: 12,
                  borderRadius: 4,
                }}
                onPress={handleAIFix}
              >
                <Text style={{
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: '500',
                }}>
                  Yazım Kurallarını Düzelt
                </Text>
              </TouchableOpacity>
            </View>

            {/* Large White TextInput */}
            <TextInput
              style={{
                backgroundColor: '#fff',
                borderRadius: 8,
                padding: 16,
                fontSize: 16,
                color: '#000',
                minHeight: 120,
                textAlignVertical: 'top',
                borderWidth: 1,
                borderColor: '#e2e8f0',
              }}
              value={transcription}
              onChangeText={setTranscription}
              placeholder="Enter transcription here..."
              placeholderTextColor="#64748b"
              multiline
            />
          </View>
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