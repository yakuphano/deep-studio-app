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
import { ANNOTATION_LABELS } from '@/constants/annotationLabels';

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
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [activeTool, setActiveTool] = useState<'select' | 'pan' | 'bbox' | 'polygon' | 'points'>('points');
  const canvasTool: Tool = activeTool === 'pan' || activeTool === 'points' ? 'select' : activeTool;
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<string>(ANNOTATION_LABELS[0] ?? 'Araba');
  const [isBrushActive, setIsBrushActive] = useState(false);
  const [collapsedObjects, setCollapsedObjects] = useState<Record<string, boolean>>({});
  const isSeeking = useRef(false);
  const progressBarWidth = useRef(0);
  const insets = useSafeAreaInsets();

  const audioUrl = task?.audio_url ?? null;
  const imageUrl = task?.image_url ?? null;
  const taskType: 'audio' | 'image' =
    !!task?.image_url || task?.type === 'image'
      ? 'image'
      : ((task?.category ?? '').toLowerCase() === 'image' ? 'image' : 'audio');
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
    if (!task?.audio_url) return;
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

  const handleSubmit = async () => {
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
      if (typeof window !== 'undefined') {
        window.alert(t('taskDetail.taskCompleted'));
      } else {
        Alert.alert(t('taskDetail.successTitle'), t('taskDetail.taskCompleted'));
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
      if (typeof window !== 'undefined') {
        window.alert(t('taskDetail.taskCompleted'));
      } else {
        Alert.alert(t('taskDetail.successTitle'), t('taskDetail.taskCompleted'));
      }
      router.replace('/tasks');
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
      if (typeof window !== 'undefined') {
        window.alert(t('taskDetail.taskCompleted'));
      } else {
        Alert.alert(t('taskDetail.successTitle'), t('taskDetail.taskCompleted'));
      }
      const { data: nextTasks } = await supabase
        .from('tasks')
        .select('id')
        .or(`assigned_to.eq.${user.id},and(assigned_to.is.null,is_pool_task.eq.true)`)
        .neq('id', id)
        .neq('status', 'submitted')
        .neq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(1);
      const nextId = nextTasks?.[0]?.id;
      if (nextId) {
        router.replace(`/task/${nextId}`);
      } else {
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
        if (typeof window !== 'undefined') {
          window.alert(t('taskDetail.saveSuccess'));
        } else {
          Alert.alert(t('taskDetail.successTitle'), t('taskDetail.saveSuccess'));
        }
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

  if (!session || !user) {
    return null;
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

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
      prev.map((a) => (a.id === annotationId ? { ...a, label } : a))
    );
  };
  const handleDeleteAnnotation = (annotationId: string) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== annotationId));
    if (selectedAnnotationId === annotationId) setSelectedAnnotationId(null);
  };

  const getObjectDisplayName = (a: Annotation, idx: number) => {
    const n = idx + 1;
    if (a.type === 'bbox') return `Kutu #${n}`;
    return `Nokta #${n}`;
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
            <TouchableOpacity
              style={[styles.toolBtnLarge, activeTool === 'select' && !isBrushActive && styles.toolBtnActivePurple]}
              onPress={() => { setActiveTool('select'); setIsBrushActive(false); }}
              activeOpacity={0.8}
              {...(isWeb ? { accessibilityLabel: 'Seç', title: 'Seç' } as any : {})}
            >
              <Ionicons name="hand-left-outline" size={20} color="#f1f5f9" />
              <Text style={styles.toolBtnLargeText}>Seç</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toolBtnLarge, activeTool === 'pan' && !isBrushActive && styles.toolBtnActivePurple]}
              onPress={() => { setActiveTool('pan'); setIsBrushActive(false); }}
              activeOpacity={0.8}
              {...(isWeb ? { accessibilityLabel: 'Pan', title: 'Pan' } as any : {})}
            >
              <Ionicons name="move-outline" size={20} color="#f1f5f9" />
              <Text style={styles.toolBtnLargeText}>Pan</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toolBtnLarge, activeTool === 'bbox' && !isBrushActive && styles.toolBtnActivePurple]}
              onPress={() => { setActiveTool('bbox'); setIsBrushActive(false); }}
              activeOpacity={0.8}
              {...(isWeb ? { accessibilityLabel: 'Box (R)', title: 'Box (R)' } as any : {})}
            >
              <Ionicons name="square-outline" size={20} color="#f1f5f9" />
              <Text style={styles.toolBtnLargeText}>Box (R)</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toolBtnLarge, activeTool === 'polygon' && !isBrushActive && styles.toolBtnActivePurple]}
              onPress={() => { setActiveTool('polygon'); setIsBrushActive(false); }}
              activeOpacity={0.8}
              {...(isWeb ? { accessibilityLabel: 'Polygon (P)', title: 'Polygon (P)' } as any : {})}
            >
              <Ionicons name="resize-outline" size={20} color="#f1f5f9" />
              <Text style={styles.toolBtnLargeText}>Polygon (P)</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toolBtnLarge, activeTool === 'points' && !isBrushActive && styles.toolBtnActivePurple]}
              onPress={() => { setActiveTool('points'); setIsBrushActive(false); }}
              activeOpacity={0.8}
              {...(isWeb ? { accessibilityLabel: 'Points (N)', title: 'Points (N)' } as any : {})}
            >
              <Ionicons name="ellipse-outline" size={20} color="#f1f5f9" />
              <Text style={styles.toolBtnLargeText}>Points (N)</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toolBtnLarge]}
              onPress={() => selectedAnnotationId && handleDeleteAnnotation(selectedAnnotationId)}
            >
              <Ionicons name="trash-outline" size={20} color="#f1f5f9" />
              <Text style={styles.toolBtnLargeText}>Sil</Text>
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
          {/* Right Sidebar - 260px fixed */}
          <View style={styles.rightSidebar}>
            <Text style={styles.rightSidebarTitle}>Nesne Listesi</Text>
            <ScrollView style={styles.objectList} showsVerticalScrollIndicator={false}>
              {annotations.length === 0 ? (
                <Text style={styles.objectListEmpty}>Henüz nesne yok</Text>
              ) : (
                annotations.map((a, idx) => {
                  const isCollapsed = collapsedObjects[a.id] ?? false;
                  return (
                    <View key={a.id} style={styles.objectItemWrap}>
                      <TouchableOpacity
                        style={[
                          styles.objectItem,
                          a.id === selectedAnnotationId && styles.objectItemActivePurple,
                        ]}
                        onPress={() => setSelectedAnnotationId(a.id)}
                      >
                        <TouchableOpacity
                          style={styles.collapseBtn}
                          onPress={() => toggleCollapsed(a.id)}
                        >
                          <Ionicons name={isCollapsed ? 'chevron-forward' : 'chevron-down'} size={14} color="#94a3b8" />
                        </TouchableOpacity>
                        <Text style={styles.objectItemLabel}>{getObjectDisplayName(a, idx)}</Text>
                        <TouchableOpacity
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          onPress={() => handleDeleteAnnotation(a.id)}
                        >
                          <Ionicons name="trash-outline" size={14} color="#94a3b8" />
                        </TouchableOpacity>
                      </TouchableOpacity>
                      {!isCollapsed && (
                        <View style={styles.perObjectLabels}>
                          {ANNOTATION_LABELS.map((l) => (
                            <TouchableOpacity
                              key={l}
                              style={[styles.labelChipPill, (a.label === l || (!a.label && l === selectedLabel)) && styles.labelChipActivePurple]}
                              onPress={() => {
                                handleUpdateAnnotationLabel(a.id, l);
                                setSelectedLabel(l);
                              }}
                            >
                              <Text style={styles.labelChipTextSmall}>{l}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
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
            <TouchableOpacity
              style={styles.exitButton}
              onPress={handleExit}
              activeOpacity={0.8}
            >
              <Text style={styles.exitButtonText}>Exit</Text>
            </TouchableOpacity>
            <View style={styles.submitGroup}>
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
            {audioUrl ? (
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
        </View>
      </ScrollView>
      <View style={[styles.submitContainer, { bottom: insets.bottom + 20, right: 20 }]}>
        {isSubmitted ? (
          <View style={styles.submittedBadge}>
            <Ionicons name="checkmark-circle" size={18} color="#fff" />
            <Text style={styles.submittedText}>{t('tasks.submitted')}</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.submitButton, saving && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={saving}
            activeOpacity={0.8}
          >
            <Text style={styles.submitButtonText}>
              {saving ? t('taskDetail.saving') : t('tasks.submit')}
            </Text>
          </TouchableOpacity>
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
    width: 260,
    minWidth: 260,
    maxWidth: 260,
    padding: 8,
    backgroundColor: '#1e293b',
    borderLeftWidth: 1,
    borderLeftColor: '#334155',
    flexDirection: 'column',
  },
  rightSidebarTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94a3b8',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  objectList: { flex: 1, minHeight: 60 },
  objectListEmpty: { fontSize: 12, color: '#64748b', fontStyle: 'italic' },
  objectItemWrap: { marginBottom: 8 },
  objectItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    gap: 8,
  },
  objectItemActive: { borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.15)' },
  objectItemActivePurple: { borderColor: '#7c3aed', backgroundColor: 'rgba(124, 58, 237, 0.2)' },
  objectItemLabel: { flex: 1, fontSize: 12, color: '#f1f5f9', fontWeight: '600' },
  collapseBtn: { padding: 4 },
  perObjectLabels: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  labelChipSmall: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
  },
  labelChipPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
  },
  labelChipActivePurple: {
    backgroundColor: '#7c3aed',
    borderColor: '#7c3aed',
  },
  labelChipTextSmall: { fontSize: 11, color: '#f1f5f9' },
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
});