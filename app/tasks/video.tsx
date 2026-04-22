import React, { useEffect, useState, useCallback } from 'react';
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
  Alert,
  Platform,
} from 'react-native';
import { useRouter, useRootNavigationState } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { TaskListCard } from '@/components/tasks/TaskListCard';

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
  const numColumns = width >= 1200 ? 4 : width >= 900 ? 3 : width >= 600 ? 2 : 1;

  const userId = user?.id ?? session?.user?.id ?? null;
  const navigatorReady = rootNavigationState?.key != null;

  if (!user || !session) return <View><Text>Loading...</Text></View>;

  const fetchVideoTasks = useCallback(
    async (showLoading = true) => {
      if (!userId) return;
      if (showLoading) setLoading(true);

      try {
        const cols =
          'id, title, status, price, language, category, type, video_url, is_pool_task, assigned_to';

        const { data: assignedData, error: assignedErr } = await supabase
          .from('tasks')
          .select(cols)
          .eq('assigned_to', userId)
          .eq('status', 'pending')
          .or('category.eq.video,type.eq.video');

        const { data: poolData, error: poolErr } = await supabase
          .from('tasks')
          .select(cols)
          .is('assigned_to', null)
          .eq('status', 'pending')
          .or('category.eq.video,type.eq.video');

        if (assignedErr || poolErr) {
          console.error('[tasks/video] fetch error', assignedErr || poolErr);
          setVideoTasks([]);
          return;
        }

        setVideoTasks([...(poolData || []), ...(assignedData || [])]);
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
      router.replace('/tasks');
    }
  }, []);

  const handleTaskPress = useCallback(
    async (taskId: string) => {
      if (!userId) return;

      const { data, error } = await supabase
        .from('tasks')
        .update({ assigned_to: userId })
        .eq('id', taskId)
        .is('assigned_to', null)
        .select();

      if (error || !data?.length) {
        const alreadyMine = videoTasks.find((x) => x.id === taskId)?.assigned_to === userId;
        if (alreadyMine) {
          router.push(`/task/${taskId}`);
          return;
        }
        Alert.alert('Uyarı', 'Bu görev alınamadı veya başkası tarafından alındı.');
        return;
      }

      await fetchVideoTasks(false);
      router.push(`/task/${taskId}`);
    },
    [userId, videoTasks, fetchVideoTasks]
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchVideoTasks(false);
    setRefreshing(false);
  }, [fetchVideoTasks]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerContainer}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Ionicons name="chevron-back" size={20} color="#a78bfa" />
          <Text style={styles.backLabel}>Back</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.pageTitle}>{t('tasks.pageTitleVideo')}</Text>

      {loading ? (
        <ActivityIndicator size="large" color="#8b5cf6" style={{ flex: 1 }} />
      ) : videoTasks.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="videocam-outline" size={64} color="#8b5cf6" />
          <Text style={styles.emptyTitle}>Görev Bulunamadı</Text>

          <TouchableOpacity style={styles.emptyRefresh} onPress={() => fetchVideoTasks(true)}>
            <Text style={styles.emptyRefreshText}>Görevleri Yenile</Text>
          </TouchableOpacity>
        </View>
      ) : (
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
              style={styles.cardSlot}
              onPress={() => handleTaskPress(item.id)}
            />
          )}
          numColumns={numColumns}
          key={numColumns}
          contentContainerStyle={styles.listContainer}
          columnWrapperStyle={numColumns > 1 ? styles.columnWrapper : undefined}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#8b5cf6" />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  headerContainer: {
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 10,
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.35)',
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  backLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#c4b5fd',
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 24,
    paddingHorizontal: 20,
    marginTop: 12,
  },
  listContainer: {
    gap: 0,
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  columnWrapper: {
    justifyContent: 'flex-start',
    gap: 10,
    marginBottom: 10,
  },
  cardSlot: {
    flex: 1,
    maxWidth: 220,
    minWidth: 0,
  },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#0f172a',
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 18,
    marginTop: 10,
  },
  emptyRefresh: {
    marginTop: 20,
    backgroundColor: '#8b5cf6',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  emptyRefreshText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});
