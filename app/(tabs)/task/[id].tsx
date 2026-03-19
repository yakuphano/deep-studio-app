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
import { supabase } from '../../../src/lib/supabase';
import { triggerEarningsRefresh } from '../../../src/lib/earningsRefresh';
import { transcribeAudio } from '../../../src/lib/whisper';
import { useAuth } from '../../../src/contexts/AuthContext';

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
  audio_url?: string;
  transcription?: string;
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
  const { t } = useTranslation();
  const { user, session } = useAuth();
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
  const isSeeking = useRef(false);
  const progressBarWidth = useRef(0);
  const insets = useSafeAreaInsets();

  const audioUrl = task?.audio_url ?? null;
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
    if (Platform.OS !== 'web' || !audioUrl) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
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
  }, [playbackSpeed, audioUrl]);

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
        const taskData: TaskData = {
          id: String(data.id),
          title: String(data.title ?? ''),
          status: data.status ?? 'pending',
          price: data.price != null ? Number(data.price) : 0,
          audio_url: data.audio_url ?? data.audioUrl,
          transcription: displayText,
        };
        setTask(taskData);
        setTranscription(displayText);
      }
      setLoading(false);
    };
    fetchTask();
  }, [id]);

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

  const handleSubmit = async () => {
    if (!id || !user?.id) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('tasks')
        .update({
          transcription: transcription.trim(),
          status: 'submitted',
          updated_at: new Date().toISOString(),
        })
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

  const handleAITranscription = async () => {
    console.log('BUTON ÇALIŞTI');
    if (transcribing) return;

    const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
    console.log('EXPO_PUBLIC_GEMINI_API_KEY:', apiKey ? 'OK' : 'YOK');
    if (!apiKey) {
      const msg = 'Gemini API anahtarı (.env EXPO_PUBLIC_GEMINI_API_KEY) tanımlı değil.';
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
      const res = await fetch(audioUrl);
      if (!res.ok) {
        throw new Error(`Audio fetch failed: ${res.status}`);
      }
      const blob = await res.blob();
      const mimeType = resolveMimeType(blob.type, audioUrl);
      const ext = mimeType.includes('webm') ? 'webm' : mimeType.includes('mpeg') || mimeType.includes('mp3') ? 'mp3' : mimeType.includes('wav') ? 'wav' : 'm4a';
      const safeName = `audio_${Date.now()}.${ext}`;
      const result = await transcribeAudio('', mimeType, safeName, blob);
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
        console.error('Gemini Gerçek Hata (transcribeAudio döndü):', msg);
        if (typeof window !== 'undefined') {
          window.alert(msg);
        } else {
          Alert.alert(t('login.errorTitle'), msg);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Gemini Gerçek Hata:', msg);
      console.error('Gemini Error (full):', err);
      const s = String(msg).toLowerCase();
      const isApiError = s.includes('429') || s.includes('quota') || s.includes('404') || s.includes('model');
      const errorMsg = isApiError ? 'API Kotası doldu veya model ismi hatalı.' : (msg || 'Ses dosyası okunamadı veya API hatası oluştu.');
      if (typeof window !== 'undefined') {
        window.alert(errorMsg);
      } else {
        Alert.alert(t('login.errorTitle'), errorMsg);
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
        <Text style={styles.loadingText}>{t('earnings.daily.loading')}</Text>
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
                <ActivityIndicator size="small" color="#fff" />
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  scroll: { flex: 1 },
  scrollContent: { padding: 12, paddingBottom: 24 },
  loadingText: { color: '#94a3b8', fontSize: 14, textAlign: 'center', marginTop: 24 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
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
});
