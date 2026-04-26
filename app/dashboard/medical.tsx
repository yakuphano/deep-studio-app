import React, { useEffect, useState, useCallback, useMemo } from 'react';
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
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { TaskListCard } from '@/components/tasks/TaskListCard';
import { taskListGridColumnCount, taskListCardSlotWidth } from '@/lib/taskListGrid';

type Task = {
  id: string;
  title: string;
  status: string;
  price: number | null;
  language: string;
  category?: string | null;
  type?: string | null;
  image_url?: string | null;
  is_pool_task?: boolean;
  assigned_to?: string | null;
};

function getLanguageLabel(code: string) {
  const languages: { [key: string]: string } = {
    tr: 'Türkçe',
    en: 'İngilizce',
    de: 'Almanca',
    fr: 'Fransızca',
    es: 'İspanyolca',
    it: 'İtalyanca',
  };
  return languages[code] || code;
}

const ACCENT = '#14b8a6';

export default function MedicalTasksScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const { user, session } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const { width } = useWindowDimensions();
  const numColumns = taskListGridColumnCount(width);
  const cardSlotWidth = useMemo(
    () => taskListCardSlotWidth(width, numColumns),
    [width, numColumns]
  );

  const userId = user?.id ?? session?.user?.id ?? null;
  const navigatorReady = rootNavigationState?.key != null;

  const fetchTasks = useCallback(
    async (showLoading = true) => {
      if (!userId) return;
      if (showLoading) setLoading(true);

      try {
        const { data, error } = await supabase
          .from('tasks')
          .select('*')
          .eq('type', 'medical')
          .eq('status', 'pending')
          .order('created_at', { ascending: false });

        if (error) {
          console.error('[medical-tasks] Fetch error:', error);
          return;
        }

        setTasks(data || []);
      } finally {
        setLoading(false);
      }
    },
    [userId]
  );

  useEffect(() => {
    if (!navigatorReady) return;
    if (!user || !session) {
      router.replace('/');
      return;
    }
    fetchTasks(true);
  }, [navigatorReady, userId, session]);

  useFocusEffect(
    useCallback(() => {
      if (userId && navigatorReady) fetchTasks(false);
    }, [userId, navigatorReady, fetchTasks])
  );

  const handleBack = useCallback(() => {
    router.push('/dashboard');
  }, [router]);

  if (!user || !session) {
    return (
      <View style={styles.authLoading}>
        <ActivityIndicator size="large" color={ACCENT} />
        <Text style={styles.authLoadingText}>Yükleniyor...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.breadcrumbRow}>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
          <Ionicons name="arrow-back" size={16} color="#5eead4" />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.breadcrumbText}>
          {`${t('nav.dashboard')} > ${t('nav.breadcrumbMedical')}`}
        </Text>
      </View>

      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>{t('tasks.pageTitleMedical')}</Text>
      </View>

      <View style={styles.body}>
        {loading ? (
          <ActivityIndicator size="large" color="#ffffff" style={styles.loader} />
        ) : tasks.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="medkit-outline" size={64} color={ACCENT} />
            <Text style={styles.emptyTitle}>No medical tasks</Text>
            <TouchableOpacity style={styles.emptyRefresh} onPress={() => fetchTasks(true)} activeOpacity={0.8}>
              <Ionicons name="refresh" size={20} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.emptyRefreshText}>Refresh Tasks</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.gridContainer}>
            <FlatList
              data={tasks}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TaskListCard
                  title={`${t('tasks.taskListHeadingMedical')} — ${item.title}`}
                  status={item.status}
                  price={item.price}
                  accent={ACCENT}
                  icon="medkit"
                  subtitle={getLanguageLabel(item.language)}
                  ctaLabel={t('tasks.startTask')}
                  style={[styles.cardSlot, { width: cardSlotWidth }]}
                  onPress={() => router.push(`/dashboard/medical/${item.id}`)}
                />
              )}
              numColumns={numColumns}
              key={numColumns}
              contentContainerStyle={numColumns > 1 ? { paddingHorizontal: 4 } : {}}
              columnWrapperStyle={numColumns > 1 ? styles.columnWrapper : undefined}
              showsVerticalScrollIndicator={false}
            />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  authLoading: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  authLoadingText: {
    color: '#f8fafc',
    fontSize: 15,
  },
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    paddingTop: 0,
  },
  body: {
    flex: 1,
    minHeight: 0,
  },
  loader: {
    flexGrow: 1,
    marginTop: 40,
  },
  breadcrumbRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexShrink: 0,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(20, 184, 166, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(20, 184, 166, 0.35)',
  },
  backText: { color: '#5eead4', fontSize: 14, fontWeight: '600' },
  breadcrumbText: { color: '#4b5563', fontSize: 12 },
  pageHeader: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingHorizontal: 20,
    paddingBottom: 8,
    flexShrink: 0,
    zIndex: 2,
  },
  pageTitle: {
    color: '#f8fafc',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 0.5,
    textAlign: 'center',
    width: '100%',
  },
  gridContainer: {
    flex: 1,
    alignSelf: 'stretch',
    width: '100%',
    maxWidth: '100%',
    paddingHorizontal: 20,
    paddingVertical: 5,
    paddingTop: 0,
    marginTop: 0,
  },
  columnWrapper: {
    justifyContent: 'flex-start',
    gap: 10,
  },
  cardSlot: {
    marginBottom: 10,
    minWidth: 0,
    flexGrow: 0,
    flexShrink: 0,
  },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#0f172a',
  },
  emptyTitle: {
    color: '#f8fafc',
    fontSize: 22,
    fontWeight: 'bold',
    marginTop: 16,
    textAlign: 'center',
  },
  emptyRefresh: {
    marginTop: 24,
    backgroundColor: ACCENT,
    paddingVertical: 14,
    paddingHorizontal: 30,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyRefreshText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
});
