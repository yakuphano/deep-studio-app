import React from 'react';
import { View, ScrollView, TouchableOpacity, Text, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useTaskDetail } from '@/hooks/useTaskDetail';
import { taskDetailStyles } from '@/theme/taskDetailStyles';
import { 
  type TaskData, 
  type TaskType 
} from '@/types/taskDetail';
import TaskHeader from '@/components/workbench/TaskHeader';
import { TaskMediaView } from '@/components/task/TaskMediaView';
import { TaskEditor } from '@/components/task/TaskEditor';
import WorkbenchSidebar from '@/components/workbench/WorkbenchSidebar';
import VideoPlayer from '../../components/VideoPlayer';

export default function TaskDetailScreen() {
  console.log('--- VIDEO TASARIM UYGULANDI ---');
  const params = useLocalSearchParams<{ id: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const { user } = useAuth();

  // Infinite loop protection
  if (!id || id === 'undefined' || typeof id !== 'string') {
    return <View style={taskDetailStyles.container}><Text style={taskDetailStyles.loadingText}>Loading...</Text></View>;
  }

  // Debug: Log ID parameter
  console.log('Task Detail Page Loaded with ID:', id);
  console.log('ID Params:', id);

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
    finalAudioUrl,
    handleAITranscription,
    handleAIFix,
    handleSaveDraft,
    handleSubmit,
    handleAnnotationDelete,
    handleExit,
    setActiveTool,
    setSelectedAnnotationId,
    setAnnotations,
    setTranscription
  } = useTaskDetail(id, user?.id);

  // Debug: Log task data and type
  console.log('DEBUG - Task Type:', task?.type, 'Task Data:', task);

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

  // Audio Task
  if (task?.type?.toLowerCase() === 'audio') {
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
            onAnnotationSelect={setSelectedAnnotationId}
            onAnnotationDelete={handleAnnotationDelete}
            onAnnotationsChange={setAnnotations}
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

  // Image Task
  if (task?.type?.toLowerCase() === 'image') {
    return (
      <View style={taskDetailStyles.container}>
        <TaskHeader title={task?.title || ''} price={task?.price} taskTypeLabel={taskTypeLabel} onBack={handleExit} />
        
        <View style={taskDetailStyles.annotationLayout}>
          <WorkbenchSidebar
            activeTool={activeTool}
            selectedAnnotationId={selectedAnnotationId}
            annotations={annotations}
            onToolChange={setActiveTool}
            onAnnotationSelect={setSelectedAnnotationId}
            onAnnotationDelete={handleAnnotationDelete}
            onAnnotationsChange={setAnnotations}
          />
          
          <TaskMediaView
            task={task}
            taskType={taskType}
            annotations={annotations}
            activeTool={activeTool}
            selectedAnnotationId={selectedAnnotationId}
            onToolChange={setActiveTool}
            onAnnotationSelect={setSelectedAnnotationId}
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

  // Default
  return (
    <View style={taskDetailStyles.container}>
      <TaskHeader title={task?.title || ''} price={task?.price} taskTypeLabel={taskTypeLabel} onBack={handleExit} />
      
      <View style={taskDetailStyles.annotationLayout}>
        <WorkbenchSidebar
          activeTool={activeTool}
          selectedAnnotationId={selectedAnnotationId}
          annotations={annotations}
          onToolChange={setActiveTool}
          onAnnotationSelect={setSelectedAnnotationId}
          onAnnotationDelete={handleAnnotationDelete}
          onAnnotationsChange={setAnnotations}
        />
        
        <TaskMediaView
          task={task}
          taskType={taskType}
          annotations={annotations}
          activeTool={activeTool}
          selectedAnnotationId={selectedAnnotationId}
          onToolChange={setActiveTool}
          onAnnotationSelect={setSelectedAnnotationId}
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