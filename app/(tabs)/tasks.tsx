import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { useRouter, useRootNavigationState } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/contexts/AuthContext';

function useAudioDuration(url: string | null | undefined): number | null {
  const [duration, setDuration] = useState<number | null>(null);
  useEffect(() => {
    if (!url) return;
    if (typeof window !== 'undefined') {
      const audio = new (window as any).Audio(url);
      const onMeta = () => {
        const d = audio.duration;
        if (Number.isFinite(d)) setDuration(d * 1000);
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

type Task = {
  id: string;
  title: string;
  status: string;
  price: number | null;
  language: string;
  audio_url?: string | null;
  transcription?: string | null;
  is_pool_task?: boolean;
  assigned_to?: string | null;
};

function formatDuration(ms: number | null): string {
  if (ms == null || ms <= 0) return '—';
  const secs = Math.round(ms / 1000);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function PoolTaskCard({
  item,
  t,
  getLanguageLabel,
  onClaim,
}: {
  item: Task;
  t: (k: string) => string;
  getLanguageLabel: (code: string) => string;
  onClaim: (id: string) => void;
}) {
  const duration = useAudioDuration(item.audio_url);
  return (
    <View style={[styles.card, styles.poolCard]}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.duration}>{formatDuration(duration)}</Text>
      </View>
      <View style={styles.cardFooter}>
        <Text style={styles.langBadge}>{getLanguageLabel(item.language || 'tr')}</Text>
        <Text style={styles.price}>{item.price ?? 0} TL</Text>
        <TouchableOpacity style={styles.claimBtn} onPress={() => onClaim(item.id)}>
          <Ionicons name="hand-left" size={16} color="#fff" />
          <Text style={styles.claimBtnText}>{t('tasks.claim')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function TaskCard({
  item,
  t,
  getLanguageLabel,
  onOpenDetail,
}: {
  item: Task;
  t: (k: string) => string;
  getLanguageLabel: (code: string) => string;
  onOpenDetail: (id: string) => void;
}) {
  const duration = useAudioDuration(item.audio_url);
  const isCompleted = item.status === 'completed' || item.status === 'submitted';

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.duration}>{formatDuration(duration)}</Text>
      </View>
      <View style={styles.cardFooter}>
        <Text style={styles.langBadge}>{getLanguageLabel(item.language || 'tr')}</Text>
        <Text style={styles.price}>{item.price ?? 0} TL</Text>
        {isCompleted ? (
          <View style={styles.submittedBadge}>
            <Text style={styles.submittedText}>{t('tasks.submitted')}</Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.detailBtn} onPress={() => onOpenDetail(item.id)}>
            <Text style={styles.detailBtnText}>{t('tasks.openTask')}</Text>
            <Ionicons name="arrow-forward" size={14} color="#3b82f6" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export default function TasksScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const { user, session } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [poolTasks, setPoolTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const { width } = useWindowDimensions();
  const numColumns = width >= 900 ? 3 : width >= 600 ? 2 : 1;

  const userId = user?.id ?? session?.user?.id ?? null;
  const navigatorReady = rootNavigationState?.key != null;

  const fetchTasks = useCallback(async (showLoading = true) => {
    if (!userId) {
      console.log('[tasks] fetchTasks atlandı: userId yok');
      return;
    }
    if (showLoading) setLoading(true);
    try {
      const cols = 'id, title, status, price, language, category, audio_url, transcription, is_pool_task, assigned_to';
      const { data: profile } = await supabase.from('profiles').select('languages_expertise').eq('id', userId).single();
      const expertise = Array.isArray(profile?.languages_expertise) ? profile.languages_expertise.filter((c: string) => c && c !== 'unspecified') : [];
      const userLangs = expertise.length > 0 ? expertise : ['tr'];

      const { data: assignedData, error: assignedErr } = await supabase
        .from('tasks')
        .select(cols)
        .eq('assigned_to', userId)
        .order('created_at', { ascending: false });
      if (assignedErr) console.error('[tasks] assignedData sorgu hatası:', assignedErr);
      const assigned = (assignedData ?? []).filter((r) => {
        const cat = (r.category ?? 'transcription').toLowerCase();
        return cat === 'transcription' || !r.category;
      });

      const { data: poolData, error: poolErr } = await supabase
        .from('tasks')
        .select(cols)
        .eq('is_pool_task', true)
        .is('assigned_to', null)
        .eq('status', 'pending')
        .in('language', userLangs.length > 0 ? userLangs : ['tr'])
        .order('created_at', { ascending: false });
      if (poolErr) console.error('[tasks] poolData sorgu hatası:', poolErr);
      const pool = (poolData ?? []).filter((r) => {
        const cat = (r.category ?? 'transcription').toLowerCase();
        return cat === 'transcription' || !r.category;
      });

      console.log('[tasks] Aktif Kullanıcı ID:', userId);
      console.log('[tasks] Gelen Atanmış Görev Sayısı:', assigned.length);
      console.log('[tasks] Gelen Havuz Görev Sayısı:', pool.length);

      setTasks(assigned);
      setPoolTasks(pool);
    } catch (err) {
      console.error('[tasks] fetchTasks hata:', err);
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
    fetchTasks();
  }, [navigatorReady, userId, session, fetchTasks]);

  useFocusEffect(
    useCallback(() => {
      if (userId && navigatorReady) fetchTasks(false);
    }, [userId, navigatorReady, fetchTasks])
  );

  useEffect(() => {
    if (!userId || !navigatorReady) return;
    const channelName = `tasks-realtime-${userId}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks' },
        (payload) => {
          console.log('[tasks] Realtime event:', payload.eventType, payload.new ?? payload.old);
          fetchTasks(false);
        }
      )
      .subscribe((status) => {
        console.log('[tasks] Realtime channel status:', status);
        if (status === 'CHANNEL_ERROR') {
          console.error('[tasks] Supabase Realtime channel hatası');
        }
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, navigatorReady, fetchTasks]);

  const handleClaim = useCallback(async (taskId: string) => {
    if (!userId) return;
    const claimed = poolTasks.find((t) => t.id === taskId);
    const { error } = await supabase
      .from('tasks')
      .update({ assigned_to: userId, is_pool_task: false })
      .eq('id', taskId)
      .is('assigned_to', null)
      .eq('is_pool_task', true);
    if (!error) {
      setPoolTasks((prev) => prev.filter((t) => t.id !== taskId));
      if (claimed) {
        setTasks((prev) => [{ ...claimed, assigned_to: userId, is_pool_task: false }, ...prev]);
      }
    }
  }, [userId, poolTasks]);

  const getLanguageLabel = (code: string) => {
    const key = `languages.${code}`;
    const label = t(key);
    return label !== key ? label : code;
  };

  if (!user || !session) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#3b82f6" style={{ marginTop: 40 }} />
      </View>
    );
  }

  const poolItems = poolTasks.map((t) => ({ ...t, _isPool: true as const }));
  const assignedItems = tasks.map((t) => ({ ...t, _isPool: false as const }));
  const allItems = [...poolItems, ...assignedItems];

  return (
    <View style={styles.container}>
      <Text style={styles.pageTitle}>{t('tasks.pageTitleTranscription')}</Text>

      {loading ? (
        <ActivityIndicator size="large" color="#3b82f6" style={{ marginTop: 40 }} />
      ) : allItems.length === 0 ? (
        <View style={styles.emptyBox}>
          <Ionicons name="mic-outline" size={48} color="#64748b" style={{ marginBottom: 12 }} />
          <Text style={styles.emptyText}>{t('tasks.empty')}</Text>
        </View>
      ) : (
        <FlatList
          data={allItems}
          keyExtractor={(item) => item.id}
          numColumns={numColumns}
          key={numColumns}
          columnWrapperStyle={numColumns > 1 ? styles.row : undefined}
          renderItem={({ item }) => (
            <View style={[styles.cardWrapper, numColumns > 1 && { flex: 1 }]}>
              {item._isPool ? (
                <PoolTaskCard
                item={item}
                t={t}
                getLanguageLabel={getLanguageLabel}
                onClaim={handleClaim}
              />
            ) : (
              <TaskCard
                item={item}
                t={t}
                getLanguageLabel={getLanguageLabel}
                onOpenDetail={(id) => router.push(`/task/${id}` as any)}
              />
              )}
            </View>
          )}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    padding: 24,
    paddingTop: 20,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 24,
  },
  list: { paddingBottom: 40 },
  row: { gap: 12, marginBottom: 12, paddingHorizontal: 4 },
  cardWrapper: { marginBottom: 12, minWidth: 0 },
  card: {
    backgroundColor: 'rgba(30, 41, 59, 0.5)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 8,
  },
  cardTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#f1f5f9',
    lineHeight: 20,
  },
  duration: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '500',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  langBadge: {
    fontSize: 12,
    color: '#60a5fa',
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderRadius: 6,
  },
  price: {
    fontSize: 14,
    color: '#22c55e',
    fontWeight: '600',
  },
  submittedBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
  },
  submittedText: {
    fontSize: 12,
    color: '#22c55e',
    fontWeight: '600',
  },
  detailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
  },
  detailBtnText: {
    fontSize: 13,
    color: '#3b82f6',
    fontWeight: '600',
  },
  emptyBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    color: '#94a3b8',
    textAlign: 'center',
    fontSize: 16,
  },
  poolCard: { borderColor: 'rgba(59, 130, 246, 0.3)', borderLeftWidth: 4 },
  claimBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#22c55e',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  claimBtnText: { fontSize: 13, color: '#fff', fontWeight: '600' },
});
