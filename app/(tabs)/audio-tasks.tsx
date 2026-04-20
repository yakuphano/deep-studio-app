import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  useWindowDimensions,
  Pressable,
} from 'react-native';
import { useRouter, useRootNavigationState, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

type TaskType = 'transcription' | 'image';

type Task = {
  id: string;
  title: string;
  status: string;
  price: number | null;
  language: string;
  category?: string | null;
  type?: string | null;
  audio_url?: string | null;
  image_url?: string | null;
  transcription?: string | null;
  is_pool_task?: boolean;
  assigned_to?: string | null;
};

function AudioTaskCard({
  item,
  onPress,
  t,
}: {
  item: Task;
  onPress: (id: string) => void;
  t: (k: string) => string;
}) {
  const duration = useAudioDuration(item.audio_url);
  return (
    <View style={[styles.card, styles.poolCard]}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
        <View style={styles.cardMeta}>
          <Text style={styles.cardPrice}>
            {item.price ? `₺${item.price}` : t('tasks.free')}
          </Text>
          <Text style={styles.cardLang}>{getLanguageLabel(item.language, t)}</Text>
        </View>
      </View>
      <View style={styles.cardBody}>
        {duration && (
          <Text style={styles.cardDuration}>{formatDuration(duration)}</Text>
        )}
        <Text style={styles.cardDescription} numberOfLines={3}>
          {item.title}
        </Text>
      </View>
      <TouchableOpacity style={styles.detailBtn} onPress={() => onPress(item.id)}>
        <Ionicons name="arrow-forward" size={14} color="#3b82f6" />
        <Text style={styles.detailBtnText}>{t('tasks.viewDetails')}</Text>
      </TouchableOpacity>
    </View>
  );
}

function useAudioDuration(url: string | null | undefined): number | null {
  const [duration, setDuration] = useState<number | null>(null);
  useEffect(() => {
    if (!url) return;
    if (typeof window !== 'undefined') {
      const audio = new (window as any).Audio(url);
      const onMeta = () => {
        setDuration(audio.duration * 1000);
        audio.removeEventListener('loadedmetadata', onMeta);
      };
      audio.addEventListener('loadedmetadata', onMeta);
      audio.load();
      return () => {
        audio.removeEventListener('loadedmetadata', onMeta);
        audio.src = '';
      };
    }
  }, [url]);
  return duration;
}

function formatDuration(ms: number | null): string {
  if (ms == null || ms <= 0) return '—';
  const secs = Math.round(ms / 1000);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function getLanguageLabel(code: string) {
  const key = `languages.${code}`;
  const label = t(key);
  return label !== key ? label : code;
}

export default function AudioTasksScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const params = useLocalSearchParams<{ type?: string }>();
  const taskType = (params.type === 'transcription' ? 'transcription' : params.type || null) as TaskType | null;

  const { user, session } = useAuth();
  const [audioTasks, setAudioTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const { width } = useWindowDimensions();
  const numColumns = width >= 900 ? 3 : width >= 600 ? 2 : 1;

  const userId = user?.id ?? session?.user?.id ?? null;
  const navigatorReady = rootNavigationState?.key != null;

  // Debug log before return
  console.log('Rendering audio tasks:', { audioTasks, loading, taskType, user, session });

  // Render protection
  if (!user || !session) return <View><Text>Yükleniyor...</Text></View>;

  const fetchAudioTasks = useCallback(async (showLoading = true) => {
    if (!userId) {
      console.log('[audio-tasks] fetchAudioTasks atlandı: userId yok');
      return;
    }
    if (showLoading) setLoading(true);
    try {
      const cols = 'id, title, status, price, language, category, type, audio_url, image_url, transcription, is_pool_task, assigned_to';
      
      // My Tasks - assigned to current user (audio only)
      const { data: assignedData, error: assignedErr } = await supabase
        .from('tasks')
        .select(cols)
        .eq('assigned_to', userId)
        .eq('status', 'pending')
        .or('category.eq.transcription,category.eq.audio,type.eq.transcription,type.eq.audio,audio_url.not.is.null')
        .order('created_at', { ascending: false });
      if (assignedErr) console.error('[audio-tasks] assignedData sorgu hatası:', assignedErr);
      console.log('[audio-tasks] DEBUG: assignedData count:', assignedData?.length);
      const assigned = assignedData ?? [];

      // Pool Tasks - available for claiming (audio only)
      const { data: poolData, error: poolErr } = await supabase
        .from('tasks')
        .select(cols)
        .is('assigned_to', null) // Sadece atanmamış görevler
        .eq('status', 'pending')
        .or('category.eq.transcription,category.eq.audio,type.eq.transcription,type.eq.audio,audio_url.not.is.null')
        .order('created_at', { ascending: false });
      if (poolErr) console.error('[audio-tasks] poolData sorgu hatası:', poolErr);
      console.log('[audio-tasks] DEBUG: poolData count:', poolData?.length);
      const pool = poolData ?? [];

      const allAudioTasks = [...pool, ...assigned];
      console.log('[audio-tasks] DEBUG: final audioTasks count:', allAudioTasks.length);
      
      // GEÇİCİ OLARAK TÜM GÖREVLERİ GÖSTER - FİLTRELEME DEVRE DIŞI
      const filteredTasks = allAudioTasks;
      
      console.log("🔍 MEVCUT KULLANICI DİLLERİ:", (user as any)?.languages || ['tr', 'en']);
      console.log("📊 VERİTABANINDAN GELEN HAM GÖREVLER:", allAudioTasks);
      console.log("✅ FİLTRELENMİŞ GÖREV SAYISI (TÜMÜ):", filteredTasks.length);
      setAudioTasks(filteredTasks);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!navigatorReady) return;
    if (!user || !session) {
      try {
        router.replace('/');
      } catch (_) {}
      return;
    }
    fetchAudioTasks(true);
  }, [navigatorReady, userId, session]);

  useFocusEffect(
    useCallback(() => {
      if (userId && navigatorReady) fetchAudioTasks(false);
    }, [userId, navigatorReady])
  );

  const handleClaim = useCallback(async (taskId: string) => {
    if (!userId) return;
    const claimed = audioTasks.find((t) => t.id === taskId);
    const { error } = await supabase
      .from('tasks')
      .update({ assigned_to: userId })
      .eq('id', taskId)
      .single();
    if (error) {
      console.error('[audio-tasks] Görev alma hatası:', error);
      if (typeof window !== 'undefined') {
        window.alert('Görev alınamadı: ' + error.message);
      } else {
        Alert.alert('Hata', 'Görev alınamadı');
      }
      return;
    }
    await fetchAudioTasks(false);
    router.push(`/task/${taskId}`);
  }, [userId, audioTasks, fetchAudioTasks]);

  const getLanguageLabel = (code: string) => {
    const key = `languages.${code}`;
    const label = t(key);
    return label !== key ? label : code;
  };

  return (
    <View style={styles.container}>
      {/* Standart Geri Butonu */}
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color="#3b82f6" />
        </TouchableOpacity>
      </View>

      <Text style={styles.pageTitle}>{t('tasks.pageTitleTranscription')}</Text>

      {loading ? (
        <ActivityIndicator size="large" color="#3b82f6" style={{ marginTop: 40 }} />
      ) : audioTasks.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="mic-outline" size={80} color="#475569" style={styles.emptyIcon} />
          <Text style={styles.emptyTitle}>No Audio Tasks</Text>
          <Text style={styles.emptyDescription}>Kendi dilinizde sesli görev bulunamadı.</Text>
          <TouchableOpacity style={styles.refreshButton} onPress={() => fetchAudioTasks(true)}>
            <Text style={styles.refreshButtonText}>Refresh</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={audioTasks}
          renderItem={({ item }) => (
            <AudioTaskCard item={item} onPress={handleClaim} t={t} />
          )}
          keyExtractor={(item) => item.id}
          numColumns={numColumns}
          contentContainerStyle={styles.listContainer}
          columnWrapperStyle={numColumns > 1 ? styles.columnWrapper : undefined}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', padding: 20 },
  headerRow: { marginBottom: 8 },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    padding: 10,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 10,
    alignSelf: 'flex-start',
    marginLeft: 20,
  },
  pageTitle: { fontSize: 22, fontWeight: '700', color: '#f8fafc', marginBottom: 32 },
  listContainer: { gap: 15 },
  columnWrapper: { justifyContent: 'space-between' },
  card: {
    flex: 1,
    margin: 4,
    backgroundColor: 'rgba(30, 41, 59, 0.6)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 16,
    minHeight: 180,
  },
  poolCard: { borderColor: 'rgba(59, 130, 246, 0.3)', borderLeftWidth: 4 },
  cardHeader: { marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#f1f5f9', marginBottom: 8 },
  cardMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardPrice: { fontSize: 14, fontWeight: '700', color: '#22c55e' },
  cardLang: { fontSize: 12, color: '#94a3b8', backgroundColor: 'rgba(148, 163, 184, 0.1)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  cardBody: { flex: 1 },
  cardDuration: { fontSize: 12, color: '#64748b', marginBottom: 8 },
  cardDescription: { fontSize: 14, color: '#cbd5e1', lineHeight: 20 },
  detailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  detailBtnText: {
    fontSize: 13,
    color: '#3b82f6',
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#f8fafc',
    marginTop: 20,
    textAlign: 'center',
  },
  emptyDescription: {
    fontSize: 16,
    color: '#94a3b8',
    marginTop: 8,
    textAlign: 'center',
  },
  refreshButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 24,
  },
  refreshButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
});
