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

function TaskSelectionCards({
  onSelect,
  t,
}: {
  onSelect: (type: TaskType) => void;
  t: (k: string) => string;
}) {
  const { width } = useWindowDimensions();
  const cardSize = width >= 800 ? 200 : Math.min(width * 0.4, 160);
  return (
    <View style={styles.dashboard}>
      <Text style={styles.dashboardTitle}>{t('tasks.pageTitle')}</Text>
      <View style={[styles.cardsRow, width < 600 && styles.cardsColumn]}>
        <Pressable
          style={({ pressed }) => [styles.selectionCard, pressed && styles.cardPressed]}
          onPress={() => onSelect('transcription')}
        >
          <View style={[styles.cardIcon, { backgroundColor: 'rgba(59, 130, 246, 0.2)' }]}>
            <Ionicons name="mic" size={cardSize * 0.35} color="#3b82f6" />
          </View>
          <Text style={styles.cardLabel}>{t('tasks.cardAudioTranscription')}</Text>
          <Text style={styles.cardHint}>{t('tasks.listenToAudio')} • {t('tasks.transcribeHere')}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.selectionCard, pressed && styles.cardPressed]}
          onPress={() => onSelect('image')}
        >
          <View style={[styles.cardIcon, { backgroundColor: 'rgba(245, 114, 182, 0.2)' }]}>
            <Ionicons name="image" size={cardSize * 0.35} color="#f472b6" />
          </View>
          <Text style={styles.cardLabel}>{t('tasks.cardImageAnnotation')}</Text>
          <Text style={styles.cardHint}>BBox • Polygon</Text>
        </Pressable>
      </View>
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

type TaskType = 'transcription' | 'image';

type Task = {
  id: string;
  title: string;
  status: string;
  price: number | null;
  language: string;
  category?: string | null;
  audio_url?: string | null;
  image_url?: string | null;
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

function matchCategory(category: string | null | undefined, taskType: TaskType): boolean {
  const cat = (category ?? 'transcription').toLowerCase();
  if (taskType === 'transcription') return cat === 'transcription' || !category;
  if (taskType === 'image') return cat === 'image';
  return true;
}

export default function TasksScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const params = useLocalSearchParams<{ type?: string }>();
  const taskType = (params.type === 'image' ? 'image' : params.type === 'transcription' ? 'transcription' : null) as TaskType | null;

  const { user, session } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [poolTasks, setPoolTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const { width } = useWindowDimensions();
  const numColumns = width >= 900 ? 3 : width >= 600 ? 2 : 1;

  const userId = user?.id ?? session?.user?.id ?? null;
  const navigatorReady = rootNavigationState?.key != null;

  const setTypeAndFetch = useCallback((type: TaskType) => {
    router.replace(`/tasks?type=${type}` as any);
  }, [router]);

  const fetchTasks = useCallback(async (showLoading = true, filterType: TaskType | null = taskType) => {
    if (!userId) {
      console.log('[tasks] fetchTasks atlandı: userId yok');
      return;
    }
    const type = filterType ?? 'transcription';
    if (showLoading) setLoading(true);
    try {
      const cols = 'id, title, status, price, language, category, audio_url, image_url, transcription, is_pool_task, assigned_to';
      const { data: profile } = await supabase.from('profiles').select('languages_expertise').eq('id', userId).single();
      const expertise = Array.isArray(profile?.languages_expertise) ? profile.languages_expertise.filter((c: string) => c && c !== 'unspecified') : [];
      const userLangs = expertise.length > 0 ? expertise : ['tr'];

      const { data: assignedData, error: assignedErr } = await supabase
        .from('tasks')
        .select(cols)
        .eq('assigned_to', userId)
        .order('created_at', { ascending: false });
      if (assignedErr) console.error('[tasks] assignedData sorgu hatası:', assignedErr);
      const assigned = (assignedData ?? []).filter((r) => matchCategory(r.category, type));

      let poolQuery = supabase
        .from('tasks')
        .select(cols)
        .eq('is_pool_task', true)
        .is('assigned_to', null)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (type !== 'image' && userLangs.length > 0) {
        poolQuery = poolQuery.in('language', userLangs) as typeof poolQuery;
      }
      const { data: poolData, error: poolErr } = await poolQuery;
      if (poolErr) console.error('[tasks] poolData sorgu hatası:', poolErr);
      const pool = (poolData ?? []).filter((r) => matchCategory(r.category, type));

      setTasks(assigned);
      setPoolTasks(pool);
    } catch (err) {
      console.error('[tasks] fetchTasks hata:', err);
    } finally {
      setLoading(false);
    }
  }, [userId, taskType]);

  useEffect(() => {
    if (!navigatorReady) return;
    if (!user || !session) {
      try {
        router.replace('/');
      } catch (_) {}
      return;
    }
    fetchTasks(true, taskType ?? 'transcription');
  }, [navigatorReady, userId, session, taskType, fetchTasks]);

  useFocusEffect(
    useCallback(() => {
      if (userId && navigatorReady && taskType) fetchTasks(false, taskType);
    }, [userId, navigatorReady, taskType, fetchTasks])
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

  if (!taskType) {
    return (
      <View style={styles.container}>
        <TaskSelectionCards onSelect={setTypeAndFetch} t={t} />
      </View>
    );
  }

  const poolItems = poolTasks.map((t) => ({ ...t, _isPool: true as const }));
  const assignedItems = tasks.map((t) => ({ ...t, _isPool: false as const }));
  const allItems = [...poolItems, ...assignedItems];

  const pageTitle = taskType === 'image' ? t('tasks.pageTitleImage') : t('tasks.pageTitleTranscription');
  const emptyText = taskType === 'image' ? t('tasks.emptyImage') : t('tasks.empty');
  const emptyIcon = taskType === 'image' ? 'image-outline' : 'mic-outline';

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backToSelection} onPress={() => router.setParams({ type: '' })}>
          <Ionicons name="arrow-back" size={18} color="#3b82f6" />
          <Text style={styles.backToSelectionText}>{t('tasks.pageTitle')}</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.pageTitle}>{pageTitle}</Text>

      {loading ? (
        <ActivityIndicator size="large" color="#3b82f6" style={{ marginTop: 40 }} />
      ) : allItems.length === 0 ? (
        <View style={styles.emptyBox}>
          <Ionicons name={emptyIcon as any} size={48} color="#64748b" style={{ marginBottom: 12 }} />
          <Text style={styles.emptyText}>{emptyText}</Text>
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
  dashboard: { flex: 1, padding: 24, paddingTop: 20 },
  dashboardTitle: { fontSize: 22, fontWeight: '700', color: '#f8fafc', marginBottom: 32 },
  cardsRow: { flexDirection: 'row', gap: 24, flexWrap: 'wrap' },
  cardsColumn: { flexDirection: 'column' },
  selectionCard: {
    flex: 1,
    minWidth: 200,
    maxWidth: 380,
    backgroundColor: 'rgba(30, 41, 59, 0.6)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardPressed: { opacity: 0.85 },
  cardIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  cardLabel: { fontSize: 18, fontWeight: '600', color: '#f1f5f9', marginBottom: 8 },
  cardHint: { fontSize: 13, color: '#94a3b8' },
  headerRow: { marginBottom: 8 },
  backToSelection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 0,
  },
  backToSelectionText: { fontSize: 14, color: '#3b82f6', fontWeight: '600' },
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
