import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { Alert, Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { triggerEarningsRefresh } from '@/lib/earningsRefresh';
import { transcribeWithGroq } from '@/lib/groq';
import { 
  type TaskData, 
  type Annotation, 
  type VideoAnnotation, 
  type TaskType, 
  type TaskStatus 
} from '@/types/taskDetail';
import { resolveTaskType } from '@/lib/inferTaskType';

interface UseTaskWorkbenchReturn {
  task: TaskData | null;
  loading: boolean;
  annotations: Annotation[];
  transcription: string;
  activeTool: string;
  selectedAnnotationId: string | null;
  taskType: TaskType;
  taskTypeLabel: string;
  saving: boolean;
  handleAITranscription: () => Promise<void>;
  handleAIFix: () => Promise<void>;
  handleSaveDraft: () => Promise<void>;
  handleSubmit: (navigateToNext?: boolean) => Promise<void>;
  handleAnnotationDelete: (annotationId: string) => void;
  handleExit: () => void;
  setActiveTool: (tool: string) => void;
  setSelectedAnnotationId: (id: string | null) => void;
  setAnnotations: (annotations: Annotation[]) => void;
  setTranscription: (text: string) => void;
  // Video controls
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  currentTime: number;
  duration: number;
  playbackSpeed: number;
  togglePlayPause: () => void;
  handleSeek: (e: any) => void;
  seekToTime: (seconds: number) => void;
  formatTime: (seconds: number) => string;
  speedUp: () => void;
  speedDown: () => void;
  resetToNormal: () => void;
  // Video annotations
  videoAnnotations: VideoAnnotation[];
  setVideoAnnotations: (annotations: VideoAnnotation[]) => void;
  handleAddObjectLabel: () => void;
  confirmObjectLabel: () => void;
  selectedObjectLabel: string;
  setSelectedObjectLabel: (label: string) => void;
  showLabelModal: boolean;
  setShowLabelModal: (show: boolean) => void;
  handleAnnotationSelect: (annotation: VideoAnnotation) => void;
  handleLabelChange: (annotationId: string, newLabel: string) => void;
}

export const useTaskWorkbench = (taskId: string | undefined, userId: string | undefined): UseTaskWorkbenchReturn => {
  const router = useRouter();

  // State management
  const [task, setTask] = useState<TaskData | null>(null);
  const [loading, setLoading] = useState(true);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [transcription, setTranscription] = useState('');
  const [activeTool, setActiveTool] = useState('pan');
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Video controls state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  // Video annotations state
  const [videoAnnotations, setVideoAnnotations] = useState<VideoAnnotation[]>([]);
  const [selectedObjectLabel, setSelectedObjectLabel] = useState('');
  const [showLabelModal, setShowLabelModal] = useState(false);

  // Computed values
  const taskType = task?.type || 'audio';
  const taskTypeLabel = taskType.charAt(0).toUpperCase() + taskType.slice(1);

  // Fetch task data
  useEffect(() => {
    if (!taskId) return;
    
    const fetchTask = async () => {
      try {
        setLoading(true);
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
        }
        
        if (!error && data) {
          const isVideo = data.category === 'video';
          const taskData: TaskData = {
            id: String(data.id),
            title: String(data.title ?? '') || 'İsimsiz Görev',
            status: (data.status ?? 'pending') as TaskStatus,
            price: data.price != null ? Number(data.price) : 0,
            type: resolveTaskType(data as Record<string, unknown>) as TaskType,
            category: data.category ?? null,
            audio_url: data.audio_url ?? data.audioUrl ?? null,
            content_url: data.content_url ?? null,
            file_url: data.file_url ?? null,
            image_url: data.image_url ?? data.imageUrl ?? null,
            video_url: data.video_url ?? data.videoUrl ?? null,
            transcription: data.transcription ?? '',
            annotation_data: data.annotation_data ?? null,
            language: data.language ?? null,
          };
          
          setTask(taskData);
          setTranscription(taskData.transcription ?? '');
          
          if (Array.isArray(taskData.annotation_data)) {
            setAnnotations(taskData.annotation_data as Annotation[]);
          }

          // Load video annotations if exists
          if (Array.isArray(data.annotation_data) && isVideo) {
            const videoAnns = (data.annotation_data as any[]).filter(ann => ann.timestamp).map(ann => ({
              id: ann.id,
              label: ann.label,
              timestamp: formatTime(ann.timestamp || ann.seconds || 0),
              seconds: ann.timestamp || ann.seconds || 0
            }));
            setVideoAnnotations(videoAnns);
          }
        }
      } finally {
        setLoading(false);
      }
    };
    
    fetchTask();
  }, [taskId]);

  // Video controls
  const togglePlayPause = useCallback(() => {
    setIsPlaying(prev => !prev);
  }, []);

  const handleSeek = useCallback((e: any) => {
    if (!duration) return;
    const { locationX } = e.nativeEvent;
    const percentage = locationX / 300; // Assuming progress bar width of 300
    const newTime = percentage * duration;
    setCurrentTime(newTime);
  }, [duration]);

  const seekToTime = useCallback((seconds: number) => {
    if (duration && seconds >= 0 && seconds <= duration) {
      setCurrentTime(seconds);
    }
  }, [duration]);

  const formatTime = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  const speedUp = useCallback(() => {
    setPlaybackSpeed(prev => Math.min(2, prev + 0.25));
  }, []);

  const speedDown = useCallback(() => {
    setPlaybackSpeed(prev => Math.max(0.5, prev - 0.25));
  }, []);

  const resetToNormal = useCallback(() => {
    setPlaybackSpeed(1);
  }, []);

  // Add annotation at current time
  const handleAddObjectLabel = useCallback(() => {
    if (!currentTime) return;
    
    setIsPlaying(false);
    setShowLabelModal(true);
  }, [currentTime]);

  const confirmObjectLabel = useCallback(() => {
    if (!selectedObjectLabel || !currentTime) return;
    
    const newAnnotation: VideoAnnotation = {
      id: `video-annotation-${Date.now()}`,
      label: selectedObjectLabel,
      timestamp: formatTime(currentTime),
      seconds: Math.floor(currentTime)
    };
    
    setVideoAnnotations(prev => [...prev, newAnnotation]);
    setShowLabelModal(false);
    setSelectedObjectLabel('');
    setIsPlaying(true);
  }, [selectedObjectLabel, currentTime, formatTime]);

  // Handle annotation selection in object list
  const handleAnnotationSelect = useCallback((annotation: VideoAnnotation) => {
    setSelectedAnnotationId(annotation.id);
    seekToTime(annotation.seconds);
  }, [seekToTime]);

  // Handle label change
  const handleLabelChange = useCallback((annotationId: string, newLabel: string) => {
    setVideoAnnotations(prev => 
      prev.map(ann => ann.id === annotationId ? { ...ann, label: newLabel } : ann)
    );
  }, []);

  // AI Transcription function
  const handleAITranscription = useCallback(async () => {
    if (!task?.audio_url) return;
    
    try {
      const result = await transcribeWithGroq({ fileUrl: task.audio_url });
      setTranscription(result.text);
    } catch (err) {
      console.error('AI Transcription Error:', err);
    }
  }, [task?.audio_url]);

  // AI Fix function
  const handleAIFix = useCallback(async () => {
    if (!transcription.trim()) return;
    
    try {
      await new Promise(resolve => setTimeout(resolve, 1500));
      setTranscription(prev => prev + ' (AI Fixed)');
    } catch (err) {
      console.error('AI Fix Error:', err);
    }
  }, [transcription]);

  // Save draft function
  const handleSaveDraft = useCallback(async () => {
    if (!taskId || !userId) return;
    
    setSaving(true);
    try {
      const annotationData = taskType === 'video' ? videoAnnotations : annotations;
      
      const { error } = await supabase
        .from('tasks')
        .update({
          transcription,
          annotation_data: annotationData,
          updated_at: new Date().toISOString(),
        })
        .eq('id', taskId);
        
      if (error) throw error;
      
      if (typeof window !== 'undefined') {
        window.alert('Kaydedildi');
      } else {
        Alert.alert('Başarılı', 'Kaydedildi');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (typeof window !== 'undefined') {
        window.alert('Hata: ' + errorMessage);
      } else {
        Alert.alert('Hata', errorMessage);
      }
    } finally {
      setSaving(false);
    }
  }, [taskId, userId, transcription, annotations, videoAnnotations, taskType]);

  // Submit function
  const handleSubmit = useCallback(async (navigateToNext: boolean = false) => {
    if (!taskId || !userId) return;
    
    setSaving(true);
    try {
      const annotationData = taskType === 'video' ? videoAnnotations : annotations;
      
      const { error } = await supabase
        .from('tasks')
        .update({
          status: 'submitted',
          transcription,
          annotation_data: annotationData,
          updated_at: new Date().toISOString(),
        })
        .eq('id', taskId);
        
      if (error) throw error;
      
      setTask(prev => prev ? { ...prev, status: 'submitted' } : null);
      triggerEarningsRefresh();

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
          .single();
          
        if (claimError) {
          if (claimError.code === 'PGRST116') {
            router.replace('/tasks');
          }
        } else if (claimedTask) {
          router.replace(`/task/${claimedTask.id}`);
        }
      } else {
        router.replace('/tasks');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (typeof window !== 'undefined') {
        window.alert('Hata: ' + errorMessage);
      } else {
        Alert.alert('Hata', errorMessage);
      }
    } finally {
      setSaving(false);
    }
  }, [taskId, userId, transcription, annotations, videoAnnotations, taskType, router]);

  // Handle annotation deletion
  const handleAnnotationDelete = useCallback((annotationId: string) => {
    setAnnotations(prev => prev.filter(ann => ann.id !== annotationId));
    setVideoAnnotations(prev => prev.filter(ann => ann.id !== annotationId));
    if (selectedAnnotationId === annotationId) {
      setSelectedAnnotationId(null);
    }
  }, [selectedAnnotationId]);

  // Handle exit
  const handleExit = useCallback(() => {
    router.replace('/tasks');
  }, [router]);

  return {
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
    // Video controls
    isPlaying,
    setIsPlaying,
    currentTime,
    duration,
    playbackSpeed,
    togglePlayPause,
    handleSeek,
    seekToTime,
    formatTime,
    speedUp,
    speedDown,
    resetToNormal,
    // Video annotations
    videoAnnotations,
    setVideoAnnotations,
    handleAddObjectLabel,
    confirmObjectLabel,
    selectedObjectLabel,
    setSelectedObjectLabel,
    showLabelModal,
    setShowLabelModal,
    handleAnnotationSelect,
    handleLabelChange,
  };
};
