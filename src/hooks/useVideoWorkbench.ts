import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import { supabase } from '@/lib/supabase';
import { transcribeWithGroq } from '@/lib/groq';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { triggerEarningsRefresh } from '@/lib/earningsRefresh';
import { useAuth } from '@/contexts/AuthContext';
import { resolvePlayableTaskVideoUrl } from '@/lib/taskVideoUrl';
import { 
  type TaskData, 
  type VideoAnnotation, 
  type TranscriptionState,
  type AnnotationTool 
} from '@/types/video';

export const useVideoWorkbench = (taskId: string) => {
  const router = useRouter();
  const { t } = useTranslation();
  const { user, session } = useAuth();

  // Video specific states
  const [currentFrame, setCurrentFrame] = useState<string | null>(null);
  const [currentFrameNumber, setCurrentFrameNumber] = useState<number>(0);
  const [currentTimestamp, setCurrentTimestamp] = useState<number>(0);
  const [videoAnnotations, setVideoAnnotations] = useState<VideoAnnotation[]>([]);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [task, setTask] = useState<TaskData | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [annotations, setAnnotations] = useState<any[]>([]);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);

  // Transcription state
  const [transcription, setTranscription] = useState<string>('');
  const [isTranscribing, setIsTranscribing] = useState(false);

  // Load video task
  const loadVideo = useCallback(async () => {
    if (!taskId) {
      setTask(null);
      setVideoUrl(null);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', taskId)
      .single();
      
    if (error) {
      console.log('Detay Hatası:', error);
      if (typeof window !== 'undefined') {
        window.alert('Supabase Detay Hatası: ' + error.message);
      } else {
        Alert.alert('Hata', 'Supabase Detay Hatası: ' + error.message);
      }
      setLoading(false);
      return;
    }
    
    if (!error && data) {
      const cat = (data.category ?? '').toString().toLowerCase();
      const taskData: TaskData = {
        id: String(data.id),
        title: String(data.title ?? ''),
        status: data.status ?? 'pending',
        price: data.price != null ? Number(data.price) : 0,
        type: (data.type ?? (cat === 'video' ? 'video' : 'audio')) as 'audio' | 'image' | 'video',
        category: data.category ?? null,
        audio_url: data.audio_url ?? data.audioUrl,
        image_url: data.image_url ?? data.imageUrl ?? null,
        video_url: data.video_url ?? data.videoUrl ?? null,
        transcription: data.transcription ?? '',
        annotation_data: data.annotation_data ?? null,
        language: data.language ?? null,
      };
      
      setTask(taskData);
      const playable = await resolvePlayableTaskVideoUrl({
        taskId: String(data.id),
        rawVideoUrl: taskData.video_url,
        session,
      });
      setVideoUrl(playable ?? (taskData.video_url ? String(taskData.video_url) : null));
      
      // Load existing video annotations
      if (taskData.annotation_data && Array.isArray(taskData.annotation_data)) {
        setVideoAnnotations(taskData.annotation_data as VideoAnnotation[]);
      }
    }
    setLoading(false);
  }, [taskId, session]);

  // Handle AI transcription
  const handleAITranscription = useCallback(async () => {
    if (!currentFrame || isTranscribing) return;
    
    setIsTranscribing(true);
    try {
      const transcriptionText = await transcribeWithGroq(currentFrame);
      setTranscription(transcriptionText);
    } catch (error) {
      console.error('Transcription error:', error);
      Alert.alert('Hata', 'Transcription başarısız oldu');
    } finally {
      setIsTranscribing(false);
    }
  }, [currentFrame, isTranscribing]);

  // Handle frame capture
  const handleFrameCapture = useCallback((frameData: string, frameNumber: number, timestamp: number) => {
    setCurrentFrame(frameData);
    setCurrentFrameNumber(frameNumber);
    setCurrentTimestamp(timestamp);
    
    // Load annotations for this frame
    const frameAnnotations = videoAnnotations.find(a => a.frameNumber === frameNumber);
    if (frameAnnotations) {
      setAnnotations(frameAnnotations.annotations);
    } else {
      setAnnotations([]);
    }
  }, [videoAnnotations]);

  // Handle time update
  const handleTimeUpdate = useCallback((currentTime: number, duration: number) => {
    setCurrentTimestamp(currentTime);
    setVideoDuration(duration);
  }, []);

  // Handle loaded metadata
  const handleLoadedMetadata = useCallback((duration: number) => {
    setVideoDuration(duration);
  }, []);

  // Save draft
  const handleSaveDraft = useCallback(async () => {
    if (!taskId || !user?.id) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('tasks')
        .update({
          annotation_data: videoAnnotations,
          updated_at: new Date().toISOString(),
        })
        .eq('id', taskId);
        
      if (error) throw error;
      
      if (typeof window !== 'undefined') {
        window.alert(t('taskDetail.saveSuccess') || 'Kaydedildi');
      } else {
        Alert.alert(t('taskDetail.successTitle') || 'Başarılı', t('taskDetail.saveSuccess') || 'Kaydedildi');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (typeof window !== 'undefined') {
        window.alert(t('login.errorTitle') + ': ' + errorMessage);
      } else {
        Alert.alert(t('login.errorTitle'), errorMessage);
      }
    } finally {
      setSaving(false);
    }
  }, [taskId, user?.id, videoAnnotations, t]);

  // Handle submit
  const handleSubmit = useCallback(async (navigateToNext: boolean = false) => {
    if (!taskId || !user?.id) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('tasks')
        .update({
          status: 'submitted',
          annotation_data: videoAnnotations,
          updated_at: new Date().toISOString(),
        })
        .eq('id', taskId);
        
      if (error) throw error;
      
      setTask((prev) => (prev ? { ...prev, status: 'submitted' } : null));
      triggerEarningsRefresh();

      if (navigateToNext) {
        const { data: claimedTask, error: claimError } = await supabase
          .from('tasks')
          .update({ 
            assigned_to: user.id, 
            is_pool_task: false 
          })
          .is('assigned_to', null)
          .is('is_pool_task', true)
          .neq('status', 'submitted')
          .neq('status', 'completed')
          .neq('id', taskId)
          .order('created_at', { ascending: false })
          .limit(1)
          .select('id')
          .single();
          
        if (claimError) {
          if (claimError.code === 'PGRST116') {
            router.replace('/dashboard');
            return;
          } else {
            throw claimError;
          }
        }
        
        if (claimedTask) {
          router.replace(`/task/${claimedTask.id}`);
        } else {
          router.replace('/dashboard');
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (typeof window !== 'undefined') {
        window.alert(t('login.errorTitle') + ': ' + errorMessage);
      } else {
        Alert.alert(t('login.errorTitle'), errorMessage);
      }
    } finally {
      setSaving(false);
    }
  }, [taskId, user?.id, videoAnnotations, t, router]);

  // Toggle play/pause (placeholder for video player)
  const togglePlayPause = useCallback(() => {
    // This would be implemented in the video player component
    console.log('Toggle play/pause');
  }, []);

  // Delete annotation
  const handleDeleteAnnotation = useCallback((id: string) => {
    setAnnotations(prev => prev.filter(a => a.id !== id));
    if (selectedAnnotationId === id) setSelectedAnnotationId(null);
    
    // Update video annotations
    if (currentFrame) {
      setVideoAnnotations(prev => {
        const existingIndex = prev.findIndex(a => a.frameNumber === currentFrameNumber);
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = {
            ...updated[existingIndex],
            annotations: annotations.filter(a => a.id !== id)
          };
          return updated;
        } else {
          return [...prev, {
            id: `frame_${currentFrameNumber}`,
            frameNumber: currentFrameNumber,
            timestamp: currentTimestamp,
            annotations: annotations.filter(a => a.id !== id)
          }];
        }
      });
    }
  }, [selectedAnnotationId, currentFrame, currentFrameNumber, currentTimestamp, annotations]);

  // Update annotation label
  const handleUpdateAnnotationLabel = useCallback((id: string, label: string) => {
    setAnnotations(prev => prev.map(a => a.id === id ? { ...a, label } : a));
    
    // Update video annotations
    if (currentFrame) {
      setVideoAnnotations(prev => {
        const existingIndex = prev.findIndex(a => a.frameNumber === currentFrameNumber);
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = {
            ...updated[existingIndex],
            annotations: annotations.map(a => a.id === id ? { ...a, label } : a)
          };
          return updated;
        } else {
          return [...prev, {
            id: `frame_${currentFrameNumber}`,
            frameNumber: currentFrameNumber,
            timestamp: currentTimestamp,
            annotations: annotations.map(a => a.id === id ? { ...a, label } : a)
          }];
        }
      });
    }
  }, [currentFrame, currentFrameNumber, currentTimestamp, annotations]);

  return {
    // States
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
    
    // Functions
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
  };
};
