import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import { canAccessReviewQueue } from '@/lib/userRoles';
import { resolveTaskWorkbenchType } from '@/lib/taskWorkbenchPath';

type QTask = {
  id: string;
  title: string;
  type: string | null;
  category?: string | null;
  status: string;
  assigned_to: string | null;
  updated_at: string;
  company_name?: string | null;
};

export default function ReviewQueueScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const { appRole, loading: profileLoading } = useProfile();
  const [pending, setPending] = useState<QTask[]>([]);
  const [recent, setRecent] = useState<QTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'pending' | 'recent'>('pending');
  const [refreshing, setRefreshing] = useState(false);

  const allowed = canAccessReviewQueue(appRole);

  const load = useCallback(async () => {
    if (!user?.id || !allowed) return;
    setLoading(true);
    try {
      const { data: p } = await supabase
        .from('tasks')
        .select('id, title, type, category, status, assigned_to, updated_at, company_name')
        .eq('status', 'submitted')
        .order('updated_at', { ascending: false })
        .limit(100);
      setPending((p ?? []) as QTask[]);

      const { data: r } = await supabase
        .from('tasks')
        .select('id, title, type, category, status, assigned_to, updated_at, company_name')
        .eq('status', 'completed')
        .order('updated_at', { ascending: false })
        .limit(40);
      setRecent((r ?? []) as QTask[]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id, allowed]);

  useEffect(() => {
    if (profileLoading) return;
    if (!allowed) {
      router.replace('/dashboard');
      return;
    }
    load();
  }, [profileLoading, allowed, load, router]);

  if (profileLoading || (!allowed && loading)) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#38bdf8" />
      </View>
    );
  }

  if (!allowed) return null;

  const list = tab === 'pending' ? pending : recent;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.back} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color="#f8fafc" />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.title}>{t('qaReview.title')}</Text>
          <Text style={styles.subtitle}>{t('qaReview.subtitle')}</Text>
        </View>
      </View>

      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, tab === 'pending' && styles.tabActive]}
          onPress={() => setTab('pending')}
        >
          <Text style={[styles.tabText, tab === 'pending' && styles.tabTextActive]}>
            {t('qaReview.tabPending')} ({pending.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'recent' && styles.tabActive]}
          onPress={() => setTab('recent')}
        >
          <Text style={[styles.tabText, tab === 'recent' && styles.tabTextActive]}>
            {t('qaReview.tabRecent')}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#38bdf8" />
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#38bdf8" />}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <Text style={styles.empty}>{tab === 'pending' ? t('qaReview.emptyPending') : t('qaReview.emptyRecent')}</Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push(`/review/${item.id}` as any)}
              activeOpacity={0.85}
            >
              <View style={styles.cardTop}>
                <Ionicons name="clipboard-outline" size={22} color="#38bdf8" />
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {item.title}
                </Text>
              </View>
              <Text style={styles.meta}>
                {resolveTaskWorkbenchType(item as unknown as Record<string, unknown>)} · {item.company_name || '—'}
              </Text>
              <Text style={styles.metaSmall}>{new Date(item.updated_at).toLocaleString()}</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    gap: 12,
  },
  back: { padding: 4 },
  headerText: { flex: 1 },
  title: { fontSize: 20, fontWeight: '800', color: '#f8fafc' },
  subtitle: { fontSize: 13, color: '#94a3b8', marginTop: 4 },
  tabRow: { flexDirection: 'row', padding: 12, gap: 8 },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
  },
  tabActive: { backgroundColor: 'rgba(56, 189, 248, 0.25)' },
  tabText: { fontSize: 14, fontWeight: '600', color: '#94a3b8' },
  tabTextActive: { color: '#e0f2fe' },
  listContent: { padding: 16, paddingBottom: 40 },
  card: {
    backgroundColor: 'rgba(30, 41, 59, 0.9)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: '#f1f5f9' },
  meta: { fontSize: 13, color: '#94a3b8', marginTop: 8 },
  metaSmall: { fontSize: 11, color: '#64748b', marginTop: 4 },
  empty: { textAlign: 'center', color: '#64748b', marginTop: 40, fontSize: 15 },
});
