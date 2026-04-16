import React from 'react';
import { View, Image, ScrollView, Text } from 'react-native';
import { taskDetailStyles } from '@/theme/taskDetailStyles';
import { type TaskData, type TaskType } from '@/types/taskDetail';
import AudioPlayer from '@/components/AudioPlayer';
import VideoPlayer from '@/components/VideoPlayer';
import AnnotationCanvas from '@/components/AnnotationCanvas.web';

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
}

export const TaskMediaView: React.FC<TaskMediaViewProps> = ({
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
}) => {
  const imageUrl = task?.image_url || task?.file_url;
  const audioUrl = finalAudioUrl || getAudioUrl?.(task) || task?.audio_url;
  const videoUrl = task?.video_url;

  // Check if task type is undefined
  if (!task?.type) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Text style={{ color: '#64748b', fontSize: 16 }}>Loading task type...</Text>
      </View>
    );
  }

  // Audio task - ONLY show AudioPlayer
  if (task?.type?.toLowerCase() === 'audio') {
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

  // Image task - ONLY show AnnotationCanvas
  if (task?.type?.toLowerCase() === 'image') {
    return (
      <View style={taskDetailStyles.annotationMain}>
        <View style={taskDetailStyles.annotationCanvas}>
          {imageUrl ? (
            <AnnotationCanvas
              imageUrl={imageUrl}
              annotations={annotations}
              activeTool={activeTool}
              selectedAnnotationId={selectedAnnotationId}
              onToolChange={onToolChange}
              onAnnotationSelect={onAnnotationSelect}
              onAnnotationDelete={onAnnotationDelete}
              onAnnotationsChange={onAnnotationsChange}
            />
          ) : (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ color: '#64748b', fontSize: 16 }}>No image available</Text>
            </View>
          )}
        </View>
      </View>
    );
  }

  // Unknown task type - show error
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
      <Text style={{ color: '#ef4444', fontSize: 16 }}>Unknown task type: {task?.type}</Text>
    </View>
  );
};
