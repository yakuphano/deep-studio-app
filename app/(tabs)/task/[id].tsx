import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
  Alert,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { supabase } from '@/lib/supabase';
import { triggerEarningsRefresh } from '@/lib/earningsRefresh';
import { transcribeWithGroq } from '@/lib/groq';
import { useAuth } from '@/contexts/AuthContext';
import AnnotationCanvas, { type Annotation, type Tool } from '@/components/AnnotationCanvas';
import { ANNOTATION_LABELS, LABEL_COLORS } from '@/constants/annotationLabels';

const PLAYBACK_SPEED_STORAGE_KEY = 'deepstudio_playback_speed';
const MIN_SPEED = 0.1;
const MAX_SPEED = 3;
const SPEED_STEP = 0.1;

const clampSpeed = (n: number) =>
  Math.min(MAX_SPEED, Math.max(MIN_SPEED, Math.round(n * 10) / 10));

function resolveMimeType(blobType: string, url: string): string {
  const normalized = blobType?.split(';')[0]?.trim().toLowerCase();
  if (normalized && ['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/m4a', 'audio/wav', 'audio/webm', 'audio/ogg'].includes(normalized)) {
    if (normalized === 'audio/mp3') return 'audio/mpeg';
    if (normalized === 'audio/m4a') return 'audio/mp4';
    return normalized;
  }
  const path = (url || '').toLowerCase();
  if (path.includes('.mp3')) return 'audio/mpeg';
  if (path.includes('.webm')) return 'audio/webm';
  if (path.includes('.wav')) return 'audio/wav';
  if (path.includes('.m4a') || path.includes('.mp4')) return 'audio/mp4';
  if (path.includes('.ogg')) return 'audio/ogg';
  return 'audio/mpeg';
}

interface TaskData {
  id: string;
  title: string;
  status?: string;
  price?: number | null;
  type?: 'audio' | 'image' | string | null;
  category?: string | null;
  audio_url?: string;
  image_url?: string | null;
  transcription?: string;
  annotation_data?: unknown;
  language?: string | null;
}

function WebAudioPlayer({ src, playbackRate }: { src: string; playbackRate: number }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    const el = audioRef.current;
    if (el) el.playbackRate = playbackRate;
  }, [playbackRate, src]);
  return React.createElement('audio', {
    ref: (el: HTMLAudioElement | null) => { audioRef.current = el; },
    controls: true,
    src,
    style: {
      width: '100%',
      height: 48,
      backgroundColor: '#1e293b',
      borderRadius: 8,
      outline: 'none',
    } as React.CSSProperties,
  });
}

export default function TaskDetailScreen() {
  const params = useLocalSearchParams<{ id: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { user, session, signOut, isAdmin } = useAuth();
  const [task, setTask] = useState<TaskData | null>(null);
  const [transcription, setTranscription] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState<number | null>(null);
  const [position, setPosition] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [transcribing, setTranscribing] = useState(false);
  const [aiFixing, setAiFixing] = useState(false);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [activeTool, setActiveTool] = useState<'pan' | 'select' | 'bbox' | 'polygon' | 'points' | 'ellipse' | 'cuboid' | 'polyline' | 'semantic' | 'brush' | 'magic_wand'>('points');
  const canvasTool: Tool = activeTool === 'pan' ? 'select' : activeTool;
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<string>('');
  const [isBrushActive, setIsBrushActive] = useState(false);
  const [collapsedObjects, setCollapsedObjects] = useState<Record<string, boolean>>({});
  const isSeeking = useRef(false);
  const progressBarWidth = useRef(0);
  const insets = useSafeAreaInsets();

  const audioUrl = task?.audio_url ?? null;
  const imageUrl = task?.image_url ?? null;

  // Improved task type detection with debugging
  const taskType: 'audio' | 'image' = (() => {
    const hasImageUrl = !!task?.image_url;
    const typeIsImage = task?.type === 'image';
    const categoryIsImage = (task?.category ?? '').toLowerCase() === 'image';
    const result = hasImageUrl || typeIsImage || categoryIsImage ? 'image' : 'audio';
    
    console.log('[TaskDetail] Task type detection:', {
      id: task?.id,
      type: task?.type,
      category: task?.category,
      image_url: !!task?.image_url,
      audio_url: !!task?.audio_url,
      hasImageUrl,
      typeIsImage,
      categoryIsImage,
      detectedType: result
    });
    
    return result;
  })();

  const isImageTask = taskType === 'image';
  const isWeb = Platform.OS === 'web';

  useEffect(() => {
    AsyncStorage.getItem(PLAYBACK_SPEED_STORAGE_KEY).then((v) => {
      if (v) {
        const n = clampSpeed(parseFloat(v));
        setPlaybackSpeed(n);
      }
    });
  }, []);

  const setSpeedAndSave = async (speed: number) => {
    const clamped = clampSpeed(speed);
    setPlaybackSpeed(clamped);
    await AsyncStorage.setItem(PLAYBACK_SPEED_STORAGE_KEY, String(clamped));
    if (sound && Platform.OS !== 'web') {
      try {
        await sound.setRateAsync(clamped, false);
      } catch (e) {
        console.warn('setRateAsync:', e);
      }
    }
  };

  const speedUp = () => setSpeedAndSave(playbackSpeed + SPEED_STEP);
  const speedDown = () => setSpeedAndSave(playbackSpeed - SPEED_STEP);
  const resetToNormal = () => setSpeedAndSave(1);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      if (isImageTask) {
        if (e.key === 'r' || e.key === 'R') {
          e.preventDefault();
          setActiveTool('bbox');
          setIsBrushActive(false);
          return;
        }
        if (e.key === 'p' || e.key === 'P') {
          e.preventDefault();
          setActiveTool('polygon');
          setIsBrushActive(false);
          return;
        }
        if (e.key === 'v' || e.key === 'V') {
          e.preventDefault();
          setActiveTool('select');
          setIsBrushActive(false);
          return;
        }
        if (e.key === 'n' || e.key === 'N') {
          e.preventDefault();
          setActiveTool('points');
          setIsBrushActive(false);
          return;
        }
      }
      if (!audioUrl) return;
      if (e.key === 'u' || e.key === 'U') {
        e.preventDefault();
        setSpeedAndSave(playbackSpeed + SPEED_STEP);
      } else if (e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        setSpeedAndSave(playbackSpeed - SPEED_STEP);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [playbackSpeed, audioUrl, isImageTask]);

  useEffect(() => {
    if (!id) return;
    const fetchTask = async () => {
      const taskId = String(id);
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
        const trans = data.transcription ?? data.transcription_text ?? '';
        const desc = data.description ?? '';
        const isAiTranscription = trans && ![
          'Metin oluşturulamadı',
          'Ses kaydedildi, analiz için bakiye bekleniyor',
          'AI Hatası:',
          'AI Analizi şu an yapılamıyor',
        ].some((p) => String(trans).startsWith(p) || trans === p);
        const displayText = isAiTranscription ? trans : '';
        const cat = (data.category ?? '').toString().toLowerCase();
        const taskData: TaskData = {
          id: String(data.id),
          title: String(data.title ?? ''),
          status: data.status ?? 'pending',
          price: data.price != null ? Number(data.price) : 0,
          type: (data.type ?? (cat === 'image' ? 'image' : 'audio')) as 'audio' | 'image',
          category: data.category ?? null,
          audio_url: data.audio_url ?? data.audioUrl,
          image_url: data.image_url ?? data.imageUrl ?? null,
          transcription: displayText,
          annotation_data: data.annotation_data ?? null,
          language: data.language ?? null,
        };
        setTask(taskData);
        setTranscription(displayText);
        console.log('[TaskDetail] Task yüklendi:', { id: taskData.id, type: taskData.type, category: taskData.category, image_url: !!taskData.image_url });
      }
      setLoading(false);
    };
    fetchTask();
  }, [id]);

  useEffect(() => {
    if (task?.annotation_data && Array.isArray(task.annotation_data)) {
      setAnnotations(task.annotation_data as Annotation[]);
    } else if (task?.annotation_data && typeof task.annotation_data === 'object' && (task.annotation_data as { annotations?: Annotation[] }).annotations) {
      setAnnotations((task.annotation_data as { annotations: Annotation[] }).annotations);
    } else {
      setAnnotations([]);
    }
  }, [task?.id, task?.annotation_data]);

  useEffect(() => {
    return () => {
      if (sound) sound.unloadAsync();
    };
  }, [sound]);

  const loadAndPlay = async () => {
    if (!task?.audio_url || isImageTask) {
      console.log('[TaskDetail] Audio load skipped: no audio URL or image task');
      return;
    }
    try {
      if (sound) await sound.unloadAsync();
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: task.audio_url },
        { shouldPlay: true, isLooping: false }
      );
      await newSound.setRateAsync(playbackSpeed, false);
      const status = await newSound.getStatusAsync();
      if (status.isLoaded) setDuration(status.durationMillis ?? null);
      newSound.setOnPlaybackStatusUpdate((s) => {
        if (s.isLoaded && !isSeeking.current) {
          setPosition(s.positionMillis ?? 0);
          if (s.didJustFinish && !s.isLooping) {
            setIsPlaying(false);
            setPosition(0);
          }
        }
      });
      setSound(newSound);
      setIsPlaying(true);
    } catch (err) {
      console.error('Ses yüklenirken hata:', err);
    }
  };

  const togglePlayPause = async () => {
    if (isPlaying && sound) {
      await sound.pauseAsync();
      setIsPlaying(false);
    } else if (sound) {
      await sound.playAsync();
      setIsPlaying(true);
    } else {
      await loadAndPlay();
    }
  };

  const handleSeek = async (evt: { nativeEvent: { locationX: number } }) => {
    if (!sound || duration == null || duration <= 0) return;
    const w = progressBarWidth.current;
    if (w <= 0) return;
    const { locationX } = evt.nativeEvent;
    const ratio = Math.max(0, Math.min(1, locationX / w));
    const newPosition = ratio * duration;
    isSeeking.current = true;
    setPosition(newPosition);
    try {
      await sound.setPositionAsync(newPosition);
    } finally {
      isSeeking.current = false;
    }
  };

  const formatTime = (ms: number) => {
    const secs = Math.floor(ms / 1000);
    const mins = Math.floor(secs / 60);
    return `${mins}:${(secs % 60).toString().padStart(2, '0')}`;
  };

  const handleSaveDraft = async () => {
    if (!id || !user?.id) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('tasks')
        .update({
          annotation_data: { annotations },
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
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
  };

  const handleSubmit = async (navigateToNext: boolean = false) => {
    if (!id || !user?.id) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        status: 'submitted',
        updated_at: new Date().toISOString(),
      };
      if (isImageTask) {
        payload.annotation_data = { annotations };
      } else {
        payload.transcription = transcription.trim();
      }
      const { error } = await supabase
        .from('tasks')
        .update(payload)
        .eq('id', id);
      if (error) throw error;
      setTask((prev) => (prev ? { ...prev, status: 'submitted' } : null));
      triggerEarningsRefresh();
      // Silent success - no alert

      if (navigateToNext) {
        // Atomic update to claim next available pool task
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
          .neq('id', id) // Exclude current task
          .order('created_at', { ascending: false })
          .limit(1)
          .select('id')
          .single();
        
        if (claimError) {
          // Check if it's "No rows returned" error (someone else claimed the task)
          if (claimError.code === 'PGRST116') {
            // Try once more to get the next available task
            const { data: retryTask, error: retryError } = await supabase
              .from('tasks')
              .update({ 
                assigned_to: user.id, 
                is_pool_task: false 
              })
              .is('assigned_to', null)
              .is('is_pool_task', true)
              .neq('status', 'submitted')
              .neq('status', 'completed')
              .neq('id', id) // Exclude current task
              .order('created_at', { ascending: false })
              .limit(1)
              .select('id')
              .single();
            
            if (retryError || !retryTask) {
              // No more tasks available
              if (typeof window !== 'undefined') {
                window.alert('All tasks completed!');
              } else {
                Alert.alert('Completed', 'All tasks completed!');
              }
              router.replace('/tasks');
              return;
            }
            
            router.replace(`/task/${retryTask.id}`);
            return;
          } else {
            throw claimError;
          }
        }
        
        if (claimedTask) {
          router.replace(`/task/${claimedTask.id}`);
        } else {
          if (typeof window !== 'undefined') {
            window.alert('All tasks completed!');
          } else {
            Alert.alert('Completed', 'All tasks completed!');
          }
          router.replace('/tasks');
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
  };

  const handleSubmitAndExit = async () => {
    await handleSubmit(false);
    router.replace('/tasks');
  };

  const handleSubmitNext = async () => {
    if (!id || !user?.id) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        status: 'submitted',
        updated_at: new Date().toISOString(),
      };
      if (isImageTask) {
        payload.annotation_data = { annotations };
      } else {
        payload.transcription = transcription.trim();
      }
      const { error } = await supabase
        .from('tasks')
        .update(payload)
        .eq('id', id);
      if (error) throw error;
      triggerEarningsRefresh();
      // Silent success - no alert
      // Atomic update to claim next available pool task
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
        .neq('id', id) // Exclude current task
        .order('created_at', { ascending: false })
        .limit(1)
        .select('id')
        .single();
      
      if (claimError) {
        // Check if it's "No rows returned" error (someone else claimed the task)
        if (claimError.code === 'PGRST116') {
          // Try once more to get the next available task
          const { data: retryTask, error: retryError } = await supabase
            .from('tasks')
            .update({ 
              assigned_to: user.id, 
              is_pool_task: false 
            })
            .is('assigned_to', null)
            .is('is_pool_task', true)
            .neq('status', 'submitted')
            .neq('status', 'completed')
            .neq('id', id) // Exclude current task
            .order('created_at', { ascending: false })
            .limit(1)
            .select('id')
            .single();
          
          if (retryError || !retryTask) {
            // No more tasks available
            if (typeof window !== 'undefined') {
              window.alert('All tasks completed!');
            } else {
              Alert.alert('Completed', 'All tasks completed!');
            }
            router.replace('/tasks');
            return;
          }
          
          router.replace(`/task/${retryTask.id}`);
          return;
        } else {
          throw claimError;
        }
      }
      
      if (claimedTask) {
        router.replace(`/task/${claimedTask.id}`);
      } else {
        if (typeof window !== 'undefined') {
          window.alert('All tasks completed!');
        } else {
          Alert.alert('Completed', 'All tasks completed!');
        }
        router.replace('/tasks');
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
  };

  const handleExit = () => {
    router.replace('/tasks');
  };

  const handleAITranscription = async () => {
    if (transcribing) return;

    const apiKey = process.env.EXPO_PUBLIC_GROQ_API_KEY;
    if (!apiKey || apiKey === 'gsk_your_key_here' || (typeof apiKey === 'string' && apiKey.trim() === '')) {
      const msg = 'Groq API anahtarı (.env EXPO_PUBLIC_GROQ_API_KEY) tanımlı değil.';
      if (typeof window !== 'undefined') {
        window.alert(msg);
      } else {
        Alert.alert(t('login.errorTitle'), msg);
      }
      return;
    }

    if (!audioUrl) {
      if (typeof window !== 'undefined') {
        window.alert(t('taskDetail.noAudio'));
      } else {
        Alert.alert(t('login.errorTitle'), t('taskDetail.noAudio'));
      }
      return;
    }
    setTranscribing(true);
    try {
      const result = await transcribeWithGroq({
        fileUrl: audioUrl,
        language: task?.language ?? undefined,
      });
      if (!result.error && result.text?.trim()) {
        setTranscription(result.text.trim());
        await supabase
          .from('tasks')
          .update({
            transcription: result.text.trim(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', id);
        // Silent success - no alert
      } else {
        const msg = result.error ?? t('adminErrors.aiAnalysisFailed');
        console.error('[Groq] transcribeWithGroq hatası:', msg);
        const displayMsg = /meşgul|quota|429|rate/i.test(msg) ? 'Groq servisi şu an meşgul' : msg;
        if (typeof window !== 'undefined') {
          window.alert(displayMsg);
        } else {
          Alert.alert(t('login.errorTitle'), displayMsg);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[Groq] transcribe hatası (detay):', err);
      const displayMsg = /meşgul|quota|429|rate/i.test(msg) ? 'Groq servisi şu an meşgul' : (msg || 'Ses dosyası okunamadı veya API hatası.');
      if (typeof window !== 'undefined') {
        window.alert(displayMsg);
      } else {
        Alert.alert(t('login.errorTitle'), displayMsg);
      }
    } finally {
      setTranscribing(false);
    }
  };

  const handleAIFix = async () => {
    if (aiFixing || !transcription.trim()) return;

    const apiKey = process.env.EXPO_PUBLIC_GROQ_API_KEY;
    if (!apiKey || apiKey === 'gsk_your_key_here' || (typeof apiKey === 'string' && apiKey.trim() === '')) {
      const msg = 'Groq API anahtarı (.env EXPO_PUBLIC_GROQ_API_KEY) tanımlı değil.';
      if (typeof window !== 'undefined') {
        window.alert(msg);
      } else {
        Alert.alert(t('login.errorTitle'), msg);
      }
      return;
    }

    setAiFixing(true);
    try {
      // Try primary model first, fallback to instant model if needed
      const models = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];
      let lastError: Error | null = null;
      
      for (const model of models) {
        try {
          console.log(`Trying model: ${model}`);
          const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: model,
              messages: [
                {
                  role: 'system',
                  content: 'Sen profesyonel bir editörsün. Sana verilen bozuk Türkçe ses dökümünü (transcription) anlamı bozmadan, sadece imla hatalarını düzelterek, noktalama işaretlerini ekleyerek ve büyük-küçük harf düzenlemesini yaparak geri döndür. Sadece düzeltilmiş metni ver, başka açıklama yapma.'
                },
                {
                  role: 'user',
                  content: `Metin: ${transcription}`
                }
              ]
            }),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.log(`Groq API Error with ${model}:`, errorData);
            lastError = new Error(`Groq API error with ${model}: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
            continue; // Try next model
          }

          const data = await response.json();
          console.log(`Groq API Success with ${model}:`, data);
          const fixedText = data.choices?.[0]?.message?.content?.trim();
          
          if (fixedText) {
            setTranscription(fixedText);
            // Silent success - no alert
            return; // Success, exit the function
          } else {
            lastError = new Error('No response from Groq API');
            continue; // Try next model
          }
        } catch (err) {
          console.log(`Error with ${model}:`, err);
          lastError = err instanceof Error ? err : new Error(String(err));
          continue; // Try next model
        }
      }
      
      // If we get here, all models failed
      throw lastError || new Error('All models failed');
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.log('AI Fix Error:', errorMessage);
      if (typeof window !== 'undefined') {
        window.alert('AI Fix Error: ' + errorMessage);
      } else {
        Alert.alert('AI Fix Error', errorMessage);
      }
    } finally {
      setAiFixing(false);
    }
  };

  if (!task) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Görev bulunamadı. (ID: {id ?? 'yok'})</Text>
      </View>
    );
  }

  const isSubmitted = task?.status === 'completed' || task?.status === 'submitted';

  const handleUpdateAnnotationLabel = (annotationId: string, label: string) => {
    setAnnotations((prev) =>
      prev.map((a) => (a.id === annotationId ? { ...a, label: typeof label === 'object' ? (label as any).name || (label as any).label || JSON.stringify(label) : label } : a))
    );
  };
  const handleDeleteAnnotation = (annotationId: string) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== annotationId));
    if (selectedAnnotationId === annotationId) setSelectedAnnotationId(null);
  };

  const getObjectDisplayName = (a: Annotation, idx: number) => {
    const n = idx + 1;
    if (a.type === 'bbox') return `Kutu #${n}`;
    if (a.type === 'polygon') return `Polygon #${n}`;
    if (a.type === 'point') return `Nokta #${n}`;
    return `Nesne #${n}`;
  };

  const toggleCollapsed = (annotationId: string) => {
    setCollapsedObjects((prev) => ({ ...prev, [annotationId]: !prev[annotationId] }));
  };

  const taskTypeLabel = (() => {
    const cat = (task?.category ?? '').toString().toLowerCase();
    const typ = (task?.type ?? '').toString().toLowerCase();
    if (cat.includes('polygon') || typ.includes('polygon')) return 'Polygon Annotation';
    if (cat.includes('bbox') || cat.includes('box') || typ.includes('bbox') || typ.includes('box')) return 'Bounding Box';
    return task?.type === 'image' ? 'Image Annotation' : 'Annotation';
  })();

  if (taskType === 'image') {
    return (
      <View style={[styles.container, isWeb && styles.containerFullWidth]}>
        {/* Task Info Overlay - right above canvas */}
        <View style={styles.taskInfoBar}>
          <Text style={styles.taskInfoType}>{taskTypeLabel}</Text>
          <View style={styles.taskInfoPriceBadge}>
            <Text style={styles.taskInfoPriceText}>{task?.price ?? 0} TL</Text>
          </View>
        </View>
        <View style={styles.annotationLayout}>
          {/* Left Toolbar - 80px, 60x60 buttons, purple active */}
          <View style={styles.leftToolbarCol}>
            {/* Pan Tool */}
            <TouchableOpacity
              style={[styles.toolBtnLarge, activeTool === 'pan' && !isBrushActive && styles.toolBtnActivePurple]}
              onPress={() => { setActiveTool('pan'); setIsBrushActive(false); }}
              activeOpacity={0.8}
              {...(isWeb ? { accessibilityLabel: 'Pan', title: 'Pan' } as any : {})}
            >
              <Ionicons name="hand-outline" size={20} color="#f1f5f9" />
              <Text style={styles.toolBtnLargeText}>Pan</Text>
            </TouchableOpacity>
            
            {/* Select Tool */}
            <TouchableOpacity
              style={[styles.toolBtnLarge, activeTool === 'select' && !isBrushActive && styles.toolBtnActivePurple]}
              onPress={() => { setActiveTool('select'); setIsBrushActive(false); }}
              activeOpacity={0.8}
              {...(isWeb ? { accessibilityLabel: 'Select', title: 'Select' } as any : {})}
            >
              <Ionicons name="finger-print-outline" size={20} color="#f1f5f9" />
              <Text style={styles.toolBtnLargeText}>Select</Text>
            </TouchableOpacity>
            
            {/* Bounding Box Tool */}
            <TouchableOpacity
              style={[styles.toolBtnLarge, activeTool === 'bbox' && !isBrushActive && styles.toolBtnActivePurple]}
              onPress={() => { setActiveTool('bbox'); setIsBrushActive(false); }}
              activeOpacity={0.8}
              {...(isWeb ? { accessibilityLabel: 'Bounding Box (R)', title: 'Bounding Box (R)' } as any : {})}
            >
              <Ionicons name="square-outline" size={20} color="#f1f5f9" />
              <Text style={styles.toolBtnLargeText}>Bounding Box (R)</Text>
            </TouchableOpacity>
            
            {/* Polygon Tool */}
            <TouchableOpacity
              style={[styles.toolBtnLarge, activeTool === 'polygon' && !isBrushActive && styles.toolBtnActivePurple]}
              onPress={() => { setActiveTool('polygon'); setIsBrushActive(false); }}
              activeOpacity={0.8}
              {...(isWeb ? { accessibilityLabel: 'Polygon (P)', title: 'Polygon (P)' } as any : {})}
            >
              <Ionicons name="git-merge-outline" size={20} color="#f1f5f9" />
              <Text style={styles.toolBtnLargeText}>Polygon (P)</Text>
            </TouchableOpacity>
            
            {/* Points Tool */}
            <TouchableOpacity
              style={[styles.toolBtnLarge, activeTool === 'points' && !isBrushActive && styles.toolBtnActivePurple]}
              onPress={() => { setActiveTool('points'); setIsBrushActive(false); }}
              activeOpacity={0.8}
              {...(isWeb ? { accessibilityLabel: 'Points (N)', title: 'Points (N)' } as any : {})}
            >
              <Ionicons name="radio-button-off-outline" size={20} color="#f1f5f9" />
              <Text style={styles.toolBtnLargeText}>Points (N)</Text>
            </TouchableOpacity>
            
            {/* Ellipse Tool */}
            <TouchableOpacity
              style={[styles.toolBtnLarge, activeTool === 'ellipse' && !isBrushActive && styles.toolBtnActivePurple]}
              onPress={() => { setActiveTool('ellipse'); setIsBrushActive(false); }}
              activeOpacity={0.8}
              {...(isWeb ? { accessibilityLabel: 'Ellipse', title: 'Ellipse' } as any : {})}
            >
              <Ionicons name="ellipse-outline" size={20} color="#f1f5f9" />
              <Text style={styles.toolBtnLargeText}>Ellipse</Text>
            </TouchableOpacity>
            
            {/* Cuboid Tool */}
            <TouchableOpacity
              style={[styles.toolBtnLarge, activeTool === 'cuboid' && !isBrushActive && styles.toolBtnActivePurple]}
              onPress={() => { setActiveTool('cuboid'); setIsBrushActive(false); }}
              activeOpacity={0.8}
              {...(isWeb ? { accessibilityLabel: 'Cuboid', title: 'Cuboid' } as any : {})}
            >
              <Ionicons name="cube-outline" size={20} color="#f1f5f9" />
              <Text style={styles.toolBtnLargeText}>Cuboid</Text>
            </TouchableOpacity>
            
            {/* Polyline Tool */}
            <TouchableOpacity
              style={[styles.toolBtnLarge, activeTool === 'polyline' && !isBrushActive && styles.toolBtnActivePurple]}
              onPress={() => { setActiveTool('polyline'); setIsBrushActive(false); }}
              activeOpacity={0.8}
              {...(isWeb ? { accessibilityLabel: 'Polyline', title: 'Polyline' } as any : {})}
            >
              <Ionicons name="create-outline" size={20} color="#f1f5f9" />
              <Text style={styles.toolBtnLargeText}>Polyline</Text>
            </TouchableOpacity>
            
            {/* Semantic Segmentation Tool */}
            <TouchableOpacity
              style={[styles.toolBtnLarge, activeTool === 'semantic' && !isBrushActive && styles.toolBtnActivePurple]}
              onPress={() => { setActiveTool('semantic'); setIsBrushActive(false); }}
              activeOpacity={0.8}
              {...(isWeb ? { accessibilityLabel: 'Semantic Segmentation', title: 'Semantic Segmentation' } as any : {})}
            >
              <Ionicons name="color-filter-outline" size={20} color="#f1f5f9" />
              <Text style={styles.toolBtnLargeText}>Semantic</Text>
            </TouchableOpacity>
            
            {/* Brush Tool */}
            <TouchableOpacity
              style={[styles.toolBtnLarge, activeTool === 'brush' && !isBrushActive && styles.toolBtnActivePurple]}
              onPress={() => { setActiveTool('brush'); setIsBrushActive(false); }}
              activeOpacity={0.8}
              {...(isWeb ? { accessibilityLabel: 'Brush', title: 'Brush' } as any : {})}
            >
              <Ionicons name="brush-outline" size={20} color="#f1f5f9" />
              <Text style={styles.toolBtnLargeText}>Brush</Text>
            </TouchableOpacity>
            
            {/* Magic Wand Tool */}
            <TouchableOpacity
              style={[styles.toolBtnLarge, activeTool === 'magic_wand' && !isBrushActive && styles.toolBtnActivePurple]}
              onPress={() => { setActiveTool('magic_wand'); setIsBrushActive(false); }}
              activeOpacity={0.8}
              {...(isWeb ? { accessibilityLabel: 'Magic Wand', title: 'Magic Wand' } as any : {})}
            >
              <Ionicons name="sparkles" size={20} color="#f1f5f9" />
              <Text style={styles.toolBtnLargeText}>Magic Wand</Text>
            </TouchableOpacity>
            
            {/* Delete Button - Kırmızı, en alta */}
            <TouchableOpacity
              style={[styles.toolBtnLarge, styles.deleteToolBtn]}
              onPress={() => selectedAnnotationId && handleDeleteAnnotation(selectedAnnotationId)}
              activeOpacity={0.8}
              {...(isWeb ? { accessibilityLabel: 'Delete Selected', title: 'Delete Selected' } as any : {})}
            >
              <Ionicons name="trash-outline" size={20} color="#ef4444" />
              <Text style={[styles.toolBtnLargeText, styles.deleteToolBtnText]}>Sil</Text>
            </TouchableOpacity>
          </View>
          {/* Center Canvas */}
          <View style={styles.annotationMain}>
            <View style={[styles.annotationCanvasWrapFullWidth, styles.canvasWorkspace, styles.canvasWorkspaceWithGrid]}>
              {isWeb && (
                <View
                  pointerEvents="none"
                  style={[StyleSheet.absoluteFillObject, styles.canvasGridOverlay]}
                />
              )}
              <AnnotationCanvas
                imageUrl={imageUrl ?? undefined}
                initialAnnotations={task.annotation_data}
                taskId={task.id}
                annotations={annotations}
                onAnnotationsChange={setAnnotations}
                activeTool={canvasTool}
                selectedId={selectedAnnotationId}
                onSelect={setSelectedAnnotationId}
                selectedLabel={selectedLabel}
                isBrushActive={isBrushActive}
              />
            </View>
          </View>
          {/* Right Sidebar - 280px fixed */}
          <View style={styles.rightSidebar}>
            <Text style={styles.rightSidebarTitle}>NESNE LİSTESİ</Text>
            <ScrollView style={styles.objectList} showsVerticalScrollIndicator={false}>
              {annotations.length === 0 ? (
                <Text style={styles.objectListEmpty}>Henüz nesne yok</Text>
              ) : (
                annotations.map((a, idx) => {
                  const labelStr = typeof a.label === 'object' ? (a.label as any).name || (a.label as any).label : a.label;
                  const labelColor = labelStr ? LABEL_COLORS[labelStr] || LABEL_COLORS['Diğer'] : null;
                  return (
                    <View key={a.id} style={styles.objectCardWrap}>
                      <View style={[styles.objectCard, labelColor && { borderLeftColor: labelColor, borderLeftWidth: 4 }]}>
                        <View style={styles.objectCardHeader}>
                          <Text style={styles.objectCardTitle}>{getObjectDisplayName(a, idx)}</Text>
                          <TouchableOpacity
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            onPress={() => handleDeleteAnnotation(a.id)}
                          >
                            <Ionicons name="trash-outline" size={16} color="#94a3b8" />
                          </TouchableOpacity>
                        </View>
                       
                          <View style={styles.labelOptionsGrid}>
                            {ANNOTATION_LABELS.map((label) => {
                              const isSelected = a.label === label;
                              const chipColor = LABEL_COLORS[label] ?? '#94a3b8';
                              return (
                                <TouchableOpacity
                                  key={label}
                                  style={[
                                    styles.labelOptionChip,
                                    {
                                      borderColor: chipColor,
                                      backgroundColor: isSelected ? chipColor : 'transparent',
                                    }
                                  ]}
                                  onPress={() => {
                                    handleUpdateAnnotationLabel(a.id, label);
                                    setSelectedLabel(label);
                                  }}
                                >
                                  <Text style={[styles.labelOptionText, { color: isSelected ? '#fff' : chipColor }]}>
                                    {label}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>
            {isSubmitted && (
              <View style={styles.submittedBadgeCompact}>
                <Ionicons name="checkmark-circle" size={14} color="#fff" />
                <Text style={styles.submittedText}>{t('tasks.submitted')}</Text>
              </View>
            )}
          </View>
        </View>
        {/* Bottom Button Bar */}
        {!isSubmitted && (
          <View style={styles.bottomButtonBar}>
            <View style={styles.bottomLeftActions}>
              <TouchableOpacity
                style={styles.exitButton}
                onPress={handleExit}
                activeOpacity={0.8}
              >
                <Text style={styles.exitButtonText}>Exit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitExitButton, saving && styles.submitButtonDisabled]}
                onPress={handleSubmitAndExit}
                disabled={saving}
                activeOpacity={0.8}
              >
                <Text style={styles.submitExitButtonText}>
                  {saving ? t('taskDetail.saving') : 'Submit & Exit'}
                </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.bottomRightActions}>
              <TouchableOpacity
                style={[styles.submitButtonGreen, saving && styles.submitButtonDisabled]}
                onPress={handleSubmitNext}
                disabled={saving}
                activeOpacity={0.8}
              >
                <Text style={styles.submitButtonGreenText}>
                  {saving ? t('taskDetail.saving') : 'Submit'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  }

  if (taskType === 'audio') {
    return (
      <View style={styles.container}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 8, paddingBottom: 80 }]}
          keyboardShouldPersistTaps="handled"
        >
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => {
              try {
                router.back();
              } catch (_) {}
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="arrow-back" size={20} color="#f1f5f9" />
            <Text style={styles.backText}>{t('taskDetail.back')}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('common.taskDetail')}</Text>
        </View>

        {task.title ? (
          <Text style={styles.taskTitle} numberOfLines={2}>
            {task.title}
          </Text>
        ) : null}
        <View style={styles.priceBadge}>
          <Text style={styles.priceBadgeText}>{t('tasks.fee')}: {task.price ?? 0} TL</Text>
        </View>

        <View style={styles.audioSection}>
          <Text style={styles.sectionLabel}>{t('taskDetail.audioLabel')}</Text>
          <View style={styles.audioCard}>
            {audioUrl && !isImageTask ? (
              <>
                {isWeb ? (
                  <WebAudioPlayer src={audioUrl} playbackRate={playbackSpeed} />
                ) : (
                  <View style={styles.playerContent}>
                    <TouchableOpacity
                      style={styles.playButton}
                      onPress={togglePlayPause}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.playIcon}>{isPlaying ? '⏸' : '▶'}</Text>
                    </TouchableOpacity>
                    <View style={styles.playerInfo}>
                      <Pressable
                        style={styles.progressBar}
                        onLayout={(e) => {
                          progressBarWidth.current = e.nativeEvent.layout.width;
                        }}
                        onPress={handleSeek}
                      >
                        <View
                          style={[
                            styles.progressFill,
                            {
                              width: duration
                                ? `${Math.min(100, (position / duration) * 100)}%`
                                : '0%',
                            },
                          ]}
                        />
                      </Pressable>
                      <Text style={styles.timeText}>
                        {formatTime(position)}
                        {duration !== null ? ` / ${formatTime(duration)}` : ''}
                      </Text>
                    </View>
                  </View>
                )}
                <View style={styles.speedRow}>
                  <Text style={styles.speedLabel}>{t('taskDetail.playbackSpeed')}</Text>
                  <View style={styles.speedControlRow}>
                    <TouchableOpacity
                      style={[styles.speedBtn, playbackSpeed <= MIN_SPEED && styles.speedBtnDisabled]}
                      onPress={speedDown}
                      disabled={playbackSpeed <= MIN_SPEED}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.speedBtnText}>−</Text>
                    </TouchableOpacity>
                    <Pressable style={styles.speedValue} onPress={resetToNormal}>
                      <Text style={styles.speedValueText}>{`${playbackSpeed.toFixed(1)}x`}</Text>
                    </Pressable>
                    <TouchableOpacity
                      style={[styles.speedBtn, playbackSpeed >= MAX_SPEED && styles.speedBtnDisabled]}
                      onPress={speedUp}
                      disabled={playbackSpeed >= MAX_SPEED}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.speedBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </>
            ) : (
              <Text style={styles.noAudioText}>{t('taskDetail.noAudio')}</Text>
            )}
          </View>
        </View>

        <View style={styles.transcriptionSection}>
          <View style={styles.transcriptionHeader}>
            <Text style={styles.sectionLabel}>{t('taskDetail.transcriptionLabel')}</Text>
          </View>
          <View style={styles.aiButtonWrapper}>
            <Pressable
              style={[
                styles.aiTranscribeButton,
                transcribing && styles.aiTranscribeButtonDisabled,
                { zIndex: 9999 },
              ]}
              onPress={handleAITranscription}
              disabled={transcribing}
            >
              {transcribing ? (
                <>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={styles.aiTranscribeButtonText}>
                    {t('taskDetail.aiTranscribing')}
                  </Text>
                </>
              ) : (
                <>
                  <Ionicons name="sparkles" size={18} color="#fff" />
                  <Text style={styles.aiTranscribeButtonText}>
                    {t('taskDetail.aiTranscribe')}
                  </Text>
                </>
              )}
            </Pressable>
          </View>
          <View style={styles.transcriptionCard}>
            <TextInput
              style={styles.transcriptionInput}
              placeholder={t('taskDetail.transcriptionPlaceholder')}
              placeholderTextColor="#64748b"
              value={transcription}
              onChangeText={setTranscription}
              multiline
              textAlignVertical="top"
              editable={true}
            />
          </View>
          <View style={styles.aiButtonWrapper}>
            <Pressable
              style={[
                styles.aiTranscribeButton,
                aiFixing && styles.aiTranscribeButtonDisabled,
                { zIndex: 9999 },
              ]}
              onPress={handleAIFix}
              disabled={aiFixing}
            >
              {aiFixing ? (
                <>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={styles.aiTranscribeButtonText}>
                    AI Fixing...
                  </Text>
                </>
              ) : (
                <>
                  <Ionicons name="sparkles" size={18} color="#fff" />
                  <Text style={styles.aiTranscribeButtonText}>
                    ✨ AI Fix
                  </Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </ScrollView>
      <View style={[styles.submitContainer, { bottom: insets.bottom + 20, left: 20, right: 20 }]}>
        {isSubmitted ? (
          <View style={styles.submittedBadge}>
            <Ionicons name="checkmark-circle" size={18} color="#fff" />
            <Text style={styles.submittedText}>{t('tasks.submitted')}</Text>
          </View>
        ) : (
          <View style={[styles.bottomButtonBar, { justifyContent: 'space-between', flexDirection: 'row', width: '100%', paddingHorizontal: 20 }]}>
  {/* SOL GRUP: Exit ve Submit & Exit yan yana */}
  <View style={{ flexDirection: 'row', gap: 10 }}>
    <TouchableOpacity style={styles.exitButton} onPress={handleExit}>
      <Text style={styles.exitButtonText}>Exit</Text>
    </TouchableOpacity>
    
    <TouchableOpacity style={styles.submitExitButton} onPress={() => handleSubmit(false)}>
      <Text style={styles.submitExitButtonText}>Submit & Exit</Text>
    </TouchableOpacity>
  </View>

  {/* SAĞ GRUP: Sadece Submit butonu */}
  <TouchableOpacity style={styles.submitButtonGreen} onPress={() => handleSubmit(true)}>
    <Text style={styles.submitButtonGreenText}>Submit</Text>
  </TouchableOpacity>
</View>
        )}
      </View>
    </View>
  );
  }

  return null;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  containerFullWidth:
    Platform.OS === 'web'
      ? ({
          width: '100%' as const,
          maxWidth: '100%' as const,
          alignSelf: 'stretch' as const,
          marginHorizontal: 0,
          paddingHorizontal: 0,
          marginLeft: 0,
          marginRight: 0,
        } as const)
      : {},
  scroll: { flex: 1 },
  scrollContent: { padding: 12, paddingBottom: 24 },
  loadingText: { color: '#94a3b8', fontSize: 14, textAlign: 'center', marginTop: 24 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  imageHeaderCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  annotBadge: {
    backgroundColor: 'rgba(30, 41, 59, 0.9)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  annotBadgeCorner: {
    backgroundColor: 'rgba(30, 41, 59, 0.9)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  annotBadgeText: { fontSize: 11, color: '#94a3b8' },
  annotationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  headerCenterMenu: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  headerNavItem: { fontSize: 14, color: '#f1f5f9', fontWeight: '500' },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  yonetimBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#7c3aed',
  },
  yonetimText: { fontSize: 13, color: '#fff', fontWeight: '600' },
  langRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  langBtn: { fontSize: 13, color: '#94a3b8', fontWeight: '500' },
  langBtnActive: { color: '#f1f5f9', fontWeight: '600' },
  langSep: { fontSize: 12, color: '#64748b' },
  cikisBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  cikisText: { fontSize: 13, color: '#ef4444', fontWeight: '600' },
  balanceIndicator: { marginLeft: 4 },
  balanceText: { fontSize: 13, fontWeight: '600', color: '#22c55e' },
  canvasTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0f172a',
  },
  canvasTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 0,
  },
  backLink: { padding: 4 },
  backLinkText: { fontSize: 12, color: '#94a3b8' },
  canvasWorkspace: {
    borderWidth: 0,
    overflow: 'hidden',
  },
  canvasWorkspaceWithGrid: { position: 'relative' as const },
  canvasGridOverlay:
    Platform.OS === 'web'
      ? ({
          backgroundImage:
            'linear-gradient(rgba(51,65,85,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(51,65,85,0.18) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        } as any)
      : {},
  backButtonCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  backTextCompact: { fontSize: 12, color: '#f1f5f9', fontWeight: '600' },
  imageHeaderCenter: { flex: 1, marginLeft: 4 },
  headerTitleCompact: { fontSize: 12, color: '#94a3b8', marginBottom: 2 },
  priceBadgeCompact: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    marginRight: 8,
  },
  backText: { fontSize: 14, color: '#f1f5f9', fontWeight: '600' },
  headerTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: '#f1f5f9' },
  taskTitle: { fontSize: 14, color: '#94a3b8', marginBottom: 4 },
  priceBadge: {
    alignSelf: 'flex-start', backgroundColor: 'rgba(34, 197, 94, 0.15)',
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginBottom: 8,
  },
  priceBadgeText: { fontSize: 12, fontWeight: '600', color: '#22c55e' },
  sectionLabel: { fontSize: 12, fontWeight: '600', color: '#94a3b8', marginBottom: 4 },
  audioSection: { marginBottom: 10 },
  audioCard: {
    backgroundColor: '#1e293b', borderRadius: 8, padding: 12, borderWidth: 1, borderColor: '#334155',
  },
  playerContent: { flexDirection: 'row', alignItems: 'center' },
  playButton: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#3b82f6',
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  playIcon: { fontSize: 20, color: '#fff' },
  playerInfo: { flex: 1 },
  progressBar: { height: 6, backgroundColor: '#334155', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#3b82f6', borderRadius: 3 },
  timeText: { fontSize: 11, color: '#94a3b8', marginTop: 4 },
  noAudioText: { fontSize: 13, color: '#64748b' },
  speedRow: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#334155' },
  speedLabel: { fontSize: 11, color: '#94a3b8', marginBottom: 6 },
  speedControlRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  speedBtn: {
    width: 36, height: 36, borderRadius: 8, backgroundColor: '#334155',
    borderWidth: 1, borderColor: '#475569', justifyContent: 'center', alignItems: 'center',
  },
  speedBtnDisabled: { opacity: 0.4 },
  speedBtnText: { fontSize: 18, color: '#f1f5f9', fontWeight: '600' },
  speedValue: { minWidth: 52, paddingHorizontal: 12, paddingVertical: 6, alignItems: 'center', justifyContent: 'center' },
  speedValueText: { fontSize: 15, color: '#3b82f6', fontWeight: '700' },
  transcriptionSection: { marginBottom: 10, overflow: 'visible' as const },
  transcriptionHeader: { marginBottom: 6 },
  aiButtonWrapper: {
    position: 'relative' as const,
    zIndex: 9999,
    marginBottom: 8,
    overflow: 'visible' as const,
  },
  aiTranscribeButton: {
    position: 'relative' as const,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#8b5cf6',
    alignSelf: 'flex-start',
    zIndex: 9999,
  },
  aiTranscribeButtonDisabled: { opacity: 0.6 },
  aiTranscribeButtonText: { fontSize: 14, color: '#fff', fontWeight: '600' },
  transcriptionCard: {
    backgroundColor: '#1e293b', borderRadius: 8, borderWidth: 1, borderColor: '#334155', overflow: 'hidden',
  },
  transcriptionInput: {
    backgroundColor: 'transparent', borderWidth: 0, padding: 12, fontSize: 15, lineHeight: 22,
    color: '#f1f5f9', minHeight: 140,
  },
  submitContainer: {
    position: 'absolute',
    alignSelf: 'flex-end',
  },
  submitButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  submittedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: '#22c55e',
    borderWidth: 0,
  },
  submittedText: { fontSize: 14, color: '#fff', fontWeight: '600' },
  annotationLayout: {
    flex: 1,
    flexDirection: 'row' as const,
    minHeight: 0,
    backgroundColor: '#0f172a',
    gap: 0,
    width: '100%' as const,
  },
  annotationLayoutColumn: { flex: 1, flexDirection: 'column', minHeight: 400 },
  taskInfoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  taskInfoType: { fontSize: 14, color: '#94a3b8', fontWeight: '500' },
  taskInfoPriceBadge: {
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  taskInfoPriceText: { fontSize: 13, fontWeight: '700', color: '#22c55e' },
  leftToolbarCol: {
    width: 80,
    flexDirection: 'column' as const,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#1a2332',
    borderRightWidth: 1,
    borderRightColor: '#334155',
    gap: 6,
  },
  toolBtnLarge: {
    width: 60,
    height: 60,
    minWidth: 60,
    minHeight: 60,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
  },
  toolBtnActivePurple: {
    backgroundColor: '#7c3aed',
    borderColor: '#7c3aed',
  },
  toolBtnLargeText: { fontSize: 10, color: '#f1f5f9', marginTop: 2, fontWeight: '500' },
  rightSidebar: {
    width: 280,
    minWidth: 280,
    maxWidth: 280,
    padding: 8,
    backgroundColor: '#1e293b',
    borderLeftWidth: 1,
    borderLeftColor: '#334155',
    flexDirection: 'column',
  },
  rightSidebarTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#f1f5f9',
    marginBottom: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  objectList: { flex: 1, minHeight: 60 },
  objectListEmpty: { fontSize: 12, color: '#64748b', fontStyle: 'italic' },
  objectCardWrap: { marginBottom: 8 },
  objectCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 12,
    marginBottom: 0,
    borderWidth: 1,
    borderColor: '#334155',
  },
  objectCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  objectCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f1f5f9',
  },
  selectedLabelBadge: {
    backgroundColor: '#3b82f6',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  selectedLabelText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  labelOptionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  labelOptionChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    backgroundColor: 'transparent',
    borderWidth: 1,
  },
  labelOptionText: {
    fontSize: 10,
    fontWeight: '500',
  },
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
  exitButtonText: { fontSize: 14, color: '#ef4444', fontWeight: '600' },
  submitGroup: { flexDirection: 'row', gap: 12 },
  submitExitButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#3b82f6',
  },
  submitExitButtonText: { fontSize: 14, color: '#fff', fontWeight: '600' },
  submitButtonGreen: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#22c55e',
  },
  submitButtonGreenText: { fontSize: 14, color: '#fff', fontWeight: '600' },
  footerButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#3b82f6',
  },
  footerButtonText: { fontSize: 14, color: '#fff', fontWeight: '600' },
  sidebarFooter: {
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#334155',
    gap: 8,
    flexDirection: 'column' as const,
  },
  kaydetButton: {
    backgroundColor: '#334155',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  kaydetButtonText: { fontSize: 14, color: '#f1f5f9', fontWeight: '600' },
  tamamlaButton: {
    backgroundColor: '#22c55e',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  tamamlaButtonText: { fontSize: 14, color: '#fff', fontWeight: '600' },
  submittedBadgeCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#22c55e',
  },
  submitButtonCompact: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  toolbarFixed: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 6,
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    minWidth: 64,
  },
  annotationMain: { flex: 1, minWidth: 0, minHeight: 300, padding: 0, margin: 0, marginHorizontal: 0 },
  toolbar: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  toolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
  },
  toolBtnActive: { borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.2)' },
  toolBtnDisabled: { opacity: 0.6 },
  toolBtnText: { fontSize: 12, color: '#f1f5f9', fontWeight: '600' },
  annotationCanvasWrap: { flex: 1, minHeight: 400 },
  annotationCanvasWrapFullWidth: { flex: 1, width: '100%', minHeight: 400, alignSelf: 'stretch' },
  labelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 },
  labelRowText: { fontSize: 13, color: '#94a3b8', marginRight: 4 },
  labelChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  labelChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
  },
  labelChipActive: { borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.2)' },
  labelChipText: { fontSize: 12, color: '#f1f5f9', fontWeight: '500' },
  deleteToolBtn: {
    borderColor: '#ef4444',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  deleteToolBtnText: {
    color: '#ef4444',
  },
});