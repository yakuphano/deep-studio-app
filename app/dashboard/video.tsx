import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  SafeAreaView,
  useWindowDimensions,
  RefreshControl,
  Platform,
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
  video_url?: string | null;
  image_url?: string | null;
  transcription?: string | null;
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
  return languages[code] || code?.toUpperCase() || '';
}

export default function VideoTasksScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const { user, session } = useAuth();
  const [videoTasks, setVideoTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { width } = useWindowDimensions();
  const numColumns = taskListGridColumnCount(width);
  const cardSlotWidth = useMemo(
    () => taskListCardSlotWidth(width, numColumns),
    [width, numColumns]
  );

  const userId = user?.id ?? session?.user?.id ?? null;
  const navigatorReady = rootNavigationState?.key != null;

  const fetchVideoTasks = useCallback(
    async (showLoading = true) => {
      if (!userId) return;
      if (showLoading) setLoading(true);

      try {
        const { data, error } = await supabase
          .from('tasks')
          .select('*')
          .eq('status', 'pending')
          .or('type.eq.video,category.eq.video,video_url.not.is.null')
          .order('created_at', { ascending: false });

        if (error) {
          console.error('[tasks/video] Fetch error:', error);
          return;
        }

        setVideoTasks((data as Task[]) || []);
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
    fetchVideoTasks(true);
  }, [navigatorReady, userId, session]);

  useFocusEffect(
    useCallback(() => {
      if (userId && navigatorReady) fetchVideoTasks(false);
    }, [userId, navigatorReady])
  );

  const handleBack = useCallback(() => {
    if (Platform.OS === 'web') {
      router.back();
    } else {
      router.replace('/dashboard');
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchVideoTasks(false);
    setRefreshing(false);
  }, [fetchVideoTasks]);

  if (!user || !session) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.authLoading}>
          <ActivityIndicator size="large" color="#8b5cf6" />
          <Text style={styles.authLoadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.breadcrumbRow}>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
          <Ionicons name="arrow-back" size={16} color="#a78bfa" />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.breadcrumbText}>
          {`${t('nav.dashboard')} > ${t('nav.breadcrumbVideo')}`}
        </Text>
      </View>

      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>
          {t('tasks.pageTitleVideo') || 'Video Annotation Tasks'}
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#8b5cf6" style={{ flex: 1 }} />
      ) : videoTasks.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="videocam-outline" size={64} color="#8b5cf6" />
          <Text style={styles.emptyTitle}>No Video Tasks</Text>
          <TouchableOpacity style={styles.emptyRefresh} onPress={() => fetchVideoTasks(true)} activeOpacity={0.8}>
            <Ionicons name="refresh" size={20} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.emptyRefreshText}>Refresh Tasks</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.gridContainer}>
          <FlatList
            data={videoTasks}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TaskListCard
                title={`${t('tasks.taskListHeadingVideo')} - ${item.title}`}
                status={item.status}
                price={item.price}
                accent="#8b5cf6"
                icon="videocam"
                subtitle={item.language ? getLanguageLabel(item.language) : null}
                ctaLabel={t('tasks.startTask')}
                style={[styles.cardSlot, { width: cardSlotWidth }]}
                onPress={() => router.push(`/dashboard/video/${item.id}`)}
              />
            )}
            numColumns={numColumns}
            key={numColumns}
            contentContainerStyle={[
              styles.listContainer,
              numColumns > 1 ? { paddingHorizontal: 4 } : {},
            ]}
            columnWrapperStyle={numColumns > 1 ? styles.columnWrapper : undefined}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#8b5cf6" />
            }
          />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  authLoading: {
    flex: 1,
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
  },
  breadcrumbRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.35)',
  },
  backText: { color: '#c4b5fd', fontSize: 14, fontWeight: '600' },
  breadcrumbText: { color: '#4b5563', fontSize: 12 },
  pageHeader: { alignItems: 'center', marginTop: 10, marginBottom: 15 },
  pageTitle: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: 'bold',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  gridContainer: {
    flex: 1,
    alignSelf: 'stretch',
    width: '100%',
    maxWidth: '100%',
    paddingHorizontal: 20,
    minHeight: 0,
  },
  listContainer: {
    gap: 0,
    paddingBottom: 24,
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
    backgroundColor: '#8b5cf6',
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
