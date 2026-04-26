import { useState, useEffect, useCallback } from 'react';
import { Alert, Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { triggerEarningsRefresh } from '@/lib/earningsRefresh';
import { transcribeWithGroq } from '@/lib/groq';
import { resolveTaskType } from '@/lib/inferTaskType';

interface TaskData {
  id: string;
  title: string;
  status?: string;
  price?: number | null;
  type?: 'audio' | 'image' | 'video' | string | null;
  category?: string | null;
  audio_url?: string;
  content_url?: string;
  audioUrl?: string;
  image_url?: string | null;
  video_url?: string | null;
  file_url?: string | null;
  transcription?: string;
  annotation_data?: unknown;
  language?: string | null;
}

interface VideoAnnotation {
  id: string;
  label: string;
  timestamp: string;
  seconds: number;
}

export const useTaskDetail = (taskId: string, userId: string | undefined) => {
  const [task, setTask] = useState<TaskData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);

  // Debug: Log hook parameters
  console.log('useTaskDetail - taskId:', taskId);
  console.log('useTaskDetail - userId:', userId);
  const [saving, setSaving] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [transcribing, setTranscribing] = useState(false);
  const [aiFixing, setAiFixing] = useState(false);

  // Fetch task data
  const fetchTask = useCallback(async () => {
    // Prevent multiple simultaneous fetches
    if (isFetching) {
      console.log('FETCH SKIP - already fetching, skipping');
      return;
    }

    console.log('FETCH START - fetchTask called with taskId:', taskId);
    if (!taskId || taskId === 'undefined' || taskId === '') {
      console.log('FETCH ERROR - invalid or empty taskId, returning');
      setLoading(false);
      return;
    }
    
    setIsFetching(true);
    try {
      console.log('FETCH PROGRESS - setting loading to true');
      setLoading(true);
      console.log('FETCH PROGRESS - making Supabase query for taskId:', taskId);
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', taskId)
        .maybeSingle();

      if (error) {
        console.error('FETCH ERROR - Supabase Error:', error);
        if (typeof window !== 'undefined') {
          window.alert('Supabase Error: ' + error.message);
        } else {
          Alert.alert('Error', 'Supabase Error: ' + error.message);
        }
        return;
      }

      console.log('FETCH PROGRESS - DATA RECEIVED:', data);
      if (!data) {
        const msg =
          'Task not found. It may have been deleted, the ID may be invalid, or your account may not have access.';
        if (typeof window !== 'undefined') {
          window.alert(msg);
        } else {
          Alert.alert('Error', msg);
        }
        setTask(null);
        return;
      }

      const taskData: TaskData = {
        id: String(data.id),
        title: String(data.title ?? '') || 'Untitled Task',
        status: data.status ?? 'pending',
        price: data.price != null ? Number(data.price) : 0,
        type: resolveTaskType(data as Record<string, unknown>) as TaskData['type'],
        category: data.category ?? null,
        audio_url: data.audio_url ?? data.audioUrl,
        content_url: data.content_url,
        audioUrl: data.audioUrl,
        image_url: data.image_url ?? data.imageUrl ?? null,
        video_url: data.video_url ?? data.videoUrl ?? null,
        file_url: data.file_url ?? null,
        transcription: data.transcription ?? '',
        annotation_data: data.annotation_data ?? null,
        language: data.language ?? null,
      };
      console.log('FETCH PROGRESS - setting task data:', taskData);
      setTask(taskData);
      setTranscription(taskData.transcription ?? '');
    } catch (error) {
      console.error('FETCH ERROR - Unexpected error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      Alert.alert('Error', 'Failed to load task: ' + errorMessage);
      setTask(null);
    } finally {
      console.log('FETCH END - setting loading to false');
      setLoading(false);
      setIsFetching(false);
    }
  }, [taskId]);

  // Normalize audio URL
  const getAudioUrl = useCallback((task: TaskData | null) => {
    if (!task) return null;
    
    const audioUrl = task.audio_url || task.content_url || task.audioUrl || task.file_url;
    
    if (!audioUrl) {
      console.error(`No audio URL found for task ${task.id}. Available fields:`, {
        audio_url: task.audio_url,
        content_url: task.content_url,
        audioUrl: task.audioUrl,
        file_url: task.file_url
      });
    }
    
    return audioUrl;
  }, []);

  // AI Transcription
  const handleAITranscription = useCallback(async () => {
    // Video task için video_url kullan
    const videoUrl = task?.video_url;
    if (!videoUrl) {
      console.error('No video URL found for transcription');
      return;
    }
    
    setTranscribing(true);
    try {
      // Mock video transcription - replace with actual implementation
      await new Promise(resolve => setTimeout(resolve, 1500));
      setTranscription('Video transcription placeholder: This is a sample transcription of the video content.');
      console.log('Video transcription completed for:', videoUrl);
    } catch (error) {
      console.error('AI Transcription Error:', error);
      Alert.alert('Error', 'Failed to transcribe video');
    } finally {
      setTranscribing(false);
    }
  }, [task?.video_url]);

  // AI Fix
  const handleAIFix = useCallback(async () => {
    if (!transcription.trim()) return;
    
    setAiFixing(true);
    try {
      // Mock AI fix - replace with actual implementation
      await new Promise(resolve => setTimeout(resolve, 1500));
      setTranscription(prev => prev + ' (AI Fixed)');
    } catch (error) {
      console.error('AI Fix Error:', error);
      Alert.alert('Error', 'Failed to fix transcription');
    } finally {
      setAiFixing(false);
    }
  }, [transcription]);

  // Save draft
  const handleSaveDraft = useCallback(async (annotations: any[]) => {
    if (!taskId || !userId) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('tasks')
        .update({
          transcription,
          annotation_data: annotations,
          updated_at: new Date().toISOString(),
        })
        .eq('id', taskId);
      
      if (error) throw error;
      
      if (typeof window !== 'undefined') {
        window.alert('Saved successfully');
      } else {
        Alert.alert('Success', 'Saved successfully');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (typeof window !== 'undefined') {
        window.alert('Error: ' + errorMessage);
      } else {
        Alert.alert('Error', errorMessage);
      }
    } finally {
      setSaving(false);
    }
  }, [taskId, userId, transcription]);

  // Submit task
  const handleSubmit = useCallback(async (annotations: any[], navigateToNext: boolean = false) => {
    if (!taskId || !userId) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('tasks')
        .update({
          status: 'submitted',
          transcription,
          annotation_data: annotations,
          updated_at: new Date().toISOString(),
        })
        .eq('id', taskId);
      
      if (error) throw error;
      
      setTask(prev => prev ? { ...prev, status: 'submitted' } : null);
      triggerEarningsRefresh();

      // Navigate to next task if requested
      if (navigateToNext) {
        const { data: claimedTask, error: claimError } = await supabase
          .from('tasks')
          .update({ 
            assigned_to: userId, 
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
          .maybeSingle();

        if (claimError) throw claimError;

        if (claimedTask && typeof window !== 'undefined') {
          window.location.href = `/task/${claimedTask.id}`;
        } else if (typeof window !== 'undefined') {
          window.location.href = '/dashboard';
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (typeof window !== 'undefined') {
        window.alert('Error: ' + errorMessage);
      } else {
        Alert.alert('Error', errorMessage);
      }
    } finally {
      setSaving(false);
    }
  }, [taskId]);

  useEffect(() => {
    console.log('useEffect - taskId:', taskId);
    if (taskId && taskId !== 'undefined' && taskId !== '') {
      console.log('useEffect - calling fetchTask');
      fetchTask();
    }
  }, [taskId]);

  // Normalize audio URL for external components
  const finalAudioUrl =
    task?.audio_url || task?.content_url || task?.audioUrl || task?.file_url;

  return {
    task,
    loading,
    saving,
    transcription,
    transcribing,
    aiFixing,
    setTranscription,
    getAudioUrl,
    finalAudioUrl,
    handleAITranscription,
    handleAIFix,
    handleSaveDraft,
    handleSubmit,
    refetch: fetchTask,
  };
};
