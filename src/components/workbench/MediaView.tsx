import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import AnnotationCanvas, { type Annotation, type Tool } from '@/components/AnnotationCanvas';
import AudioPlayer from "@/components/AudioPlayer";
import { supabase } from '@/lib/supabase';

interface MediaViewProps {
  task: {
    id: string;
    title: string;
    type?: 'audio' | 'image' | 'video' | string | null;
    category?: string | null;
    audio_url?: string;
    image_url?: string | null;
    video_url?: string | null;
    file_url?: string | null;
    transcription?: string;
    annotation_data?: unknown;
  };
  annotations: Annotation[];
  onAnnotationsChange: (annotations: Annotation[]) => void;
  activeTool: Tool;
  onUndo: () => void;
  canvasRef: React.RefObject<any>;
  isWeb: boolean;
}

export default function MediaView({ 
  task, 
  annotations, 
  onAnnotationsChange, 
  activeTool, 
  onUndo, 
  canvasRef,
  isWeb 
}: MediaViewProps) {
  
  const [processedAudioUrl, setProcessedAudioUrl] = useState<string | null>(null);
  const [audioLoading, setAudioLoading] = useState(true);
  
  // FIX: Process audio URL with useEffect to prevent undefined errors
  useEffect(() => {
    const processAudioUrl = async () => {
      setAudioLoading(true);
      console.log('MediaView - Processing audio URL for task:', task?.id);
      
      const rawAudioUrl = task?.audio_url;
      
      if (!rawAudioUrl) {
        console.log('MediaView - No audio URL provided');
        setProcessedAudioUrl(null);
        setAudioLoading(false);
        return;
      }
      
      // If URL is already full, use as-is
      if (rawAudioUrl.startsWith('http://') || rawAudioUrl.startsWith('https://')) {
        console.log('MediaView - URL is already full:', rawAudioUrl);
        setProcessedAudioUrl(rawAudioUrl);
        setAudioLoading(false);
        return;
      }
      
      // If relative path, use Supabase getPublicUrl
      try {
        const { data } = supabase.storage
          .from('task-assets')
          .getPublicUrl(rawAudioUrl.replace(/^\//, ''));
        
        const fullUrl = data.publicUrl;
        console.log('MediaView - Supabase public URL:', fullUrl);
        setProcessedAudioUrl(fullUrl);
      } catch (error) {
        console.error('MediaView - Error getting Supabase URL:', error);
        setProcessedAudioUrl(null);
      } finally {
        setAudioLoading(false);
      }
    };
    
    processAudioUrl();
  }, [task?.id, task?.audio_url]);
  
  // FIX: Log null URLs and prevent crashes
  const imageUrl = task?.image_url;
  const videoUrl = task?.video_url;
  const fileUrl = task?.file_url;
  
  console.log('MediaView - Task URLs:', {
    image_url: imageUrl,
    audio_url: task?.audio_url,
    processed_audio_url: processedAudioUrl,
    video_url: videoUrl,
    file_url: fileUrl,
    task_id: task?.id
  });

  const taskType: 'audio' | 'image' | 'video' = (() => {
    const hasImageUrl = !!imageUrl;
    const hasVideoUrl = !!videoUrl;
    const typeIsImage = task?.type === 'image';
    const typeIsVideo = task?.type === 'video';
    const categoryIsImage = (task?.category ?? '').toLowerCase() === 'image';
    const categoryIsVideo = (task?.category ?? '').toLowerCase() === 'video';
    
    // Image priority for this screen
    if (hasImageUrl || typeIsImage || categoryIsImage) return 'image';
    // Video fallback
    if (hasVideoUrl || typeIsVideo || categoryIsVideo) return 'video';
    // Default to audio
    return 'audio';
  })();

  if (taskType === 'image') {
    return (
      <View style={styles.canvasContainer}>
        <AnnotationCanvas
          imageUrl={imageUrl}
          initialAnnotations={annotations}
          taskId={task.id}
          annotations={annotations}
          onAnnotationsChange={onAnnotationsChange}
          activeTool={activeTool}
        />
      </View>
    );
  }

  if (taskType === 'audio') {
    return (
      <View style={styles.audioContainer}>
        <Text style={styles.audioLabel}>Audio Task</Text>
        {!audioLoading && processedAudioUrl && Platform.OS === 'web' ? (
          <View style={styles.audioPlayerWrapper}>
            <AudioPlayer uri={processedAudioUrl} />
          </View>
        ) : (
          <View style={styles.audioPlaceholder}>
            {audioLoading ? (
              <ActivityIndicator size="large" color="#3b82f6" />
            ) : (
              <Text style={styles.placeholderText}>
                {processedAudioUrl ? 'Audio player available on web platform' : 'No audio URL available'}
              </Text>
            )}
            {!processedAudioUrl && !audioLoading && (
              <Text style={styles.errorText}>
                Error: audio_url is null or undefined
              </Text>
            )}
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.placeholderContainer}>
      <ActivityIndicator size="large" color="#3b82f6" />
      <Text style={styles.placeholderText}>Unsupported media type: {taskType}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  canvasContainer: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  audioContainer: {
    flex: 1,
    padding: 20,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
  },
  audioLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#f1f5f9',
    marginBottom: 20,
    textAlign: 'center',
  },
  audioPlayerWrapper: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  audioPlaceholder: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 40,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
  },
  placeholderText: {
    color: '#94a3b8',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 10,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  placeholderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f172a',
  },
});
