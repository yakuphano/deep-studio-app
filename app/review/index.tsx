import React, { useMemo, useCallback, useEffect, useState } from 'react';
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
import { canAccessReviewQueue } from '@/lib/userRoles';
import { resolveTaskWorkbenchType } from '@/lib/taskWorkbenchPath';
import type { AppColors } from '@/theme/palettes';
import { useThemeColors } from '@/contexts/ThemeContext';
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

/** Supabase tek istekte çok satır; üst sınır yüksek tutuldu (QA tüm submitted görsün). */
const SUBMITTED_QUEUE_LIMIT = 5000;
const RECENT_REVIEW_LIMIT = 200;

export default function ReviewQueueScreen() {
  const themeColors = useThemeColors();
  const styles = useMemo(() => createStyles(themeColors), [themeColors]);

  const { t } = useTranslation();
  const router = useRouter();
  const { user, loading: authLoading, appRole } = useAuth();
  const [pending, setPending] = useState<QTask[]>([]);
  const [recent, setRecent] = useState<QTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'pending' | 'recent'>('pending');
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const allowed = canAccessReviewQueue(appRole);

  const load = useCallback(async () => {
    if (!user?.id || !allowed) return;
    setLoading(true);
    setLoadError(null);
    try {
      const { data: p, error: errP } = await supabase
        .from('tasks')
        .select('id, title, type, category, status, assigned_to, updated_at, company_name')
        .eq('status', 'submitted')
        .order('updated_at', { ascending: false })
        .limit(SUBMITTED_QUEUE_LIMIT);
      if (errP) {
        setLoadError(errP.message);
        setPending([]);
      } else {
        setPending((p ?? []) as QTask[]);
      }

      const { data: r, error: errR } = await supabase
        .from('tasks')
        .select('id, title, type, category, status, assigned_to, updated_at, company_name')
        .in('status', ['completed', 'rejected'])
        .order('updated_at', { ascending: false })
        .limit(RECENT_REVIEW_LIMIT);
      if (errR) {
        if (!errP) setLoadError(errR.message);
        setRecent([]);
      } else {
        setRecent((r ?? []) as QTask[]);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id, allowed]);

  useEffect(() => {
    if (authLoading) return;
    if (!user?.id) return;
    if (!allowed) {
      router.replace('/dashboard');
      return;
    }
    load();
  }, [authLoading, allowed, load, router, user?.id]);

  if (authLoading || (!allowed && loading)) {
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
          <Ionicons name="arrow-back" size={22} color={themeColors.text} />
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
            {t('qaReview.tabRecent')} ({recent.length})
          </Text>
        </TouchableOpacity>
      </View>

      {loadError ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{t('qaReview.loadError', { message: loadError })}</Text>
        </View>
      ) : null}

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
              <View style={styles.cardMetaRow}>
                <Text style={styles.statusPill}>{item.status}</Text>
                <Text style={styles.metaSmall}>{new Date(item.updated_at).toLocaleString()}</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

function createStyles(themeColors: AppColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: themeColors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: themeColors.border,
    gap: 12,
    backgroundColor: themeColors.surface,
  },
  back: { padding: 4 },
  headerText: { flex: 1 },
  title: { fontSize: 20, fontWeight: '800', color: themeColors.text },
  subtitle: { fontSize: 13, color: themeColors.textMuted, marginTop: 4 },
  tabRow: { flexDirection: 'row', padding: 12, gap: 8 },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: themeColors.surfaceElevated,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: themeColors.border,
  },
  tabActive: { backgroundColor: themeColors.accentMuted, borderColor: themeColors.accent },
  tabText: { fontSize: 14, fontWeight: '600', color: themeColors.textMuted },
  tabTextActive: { color: themeColors.accent },
  listContent: { padding: 16, paddingBottom: 40 },
  card: {
    backgroundColor: themeColors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: themeColors.border,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: themeColors.text },
  meta: { fontSize: 13, color: themeColors.textMuted, marginTop: 8 },
  metaSmall: { fontSize: 11, color: themeColors.textMuted },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    gap: 8,
    flexWrap: 'wrap',
  },
  statusPill: {
    fontSize: 11,
    fontWeight: '700',
    color: '#a5b4fc',
    textTransform: 'uppercase',
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  errorBanner: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
  },
  errorBannerText: { color: '#b91c1c', fontSize: 13, lineHeight: 18 },
  empty: { textAlign: 'center', color: themeColors.textMuted, marginTop: 40, fontSize: 15 },
});
}
