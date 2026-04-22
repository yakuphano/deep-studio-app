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
  audio_url?: string | null;
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
  return languages[code] || code;
}

export default function ImageTasksScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const { user, session } = useAuth();
  const [imageTasks, setImageTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const { width } = useWindowDimensions();
  const numColumns = width > 1400 ? 4 : width > 1000 ? 3 : width > 600 ? 2 : 1;

  const userId = user?.id ?? session?.user?.id ?? null;
  const navigatorReady = rootNavigationState?.key != null;

  if (!user || !session) return <View><Text>Yükleniyor...</Text></View>;

  const fetchImageTasks = useCallback(async (showLoading = true) => {
    if (!userId) return;
    if (showLoading) setLoading(true);

    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('type', 'image')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[image-tasks] Fetch error:', error);
        return;
      }

      setImageTasks(data || []);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!navigatorReady) return;
    if (!user || !session) {
      router.replace('/');
      return;
    }
    fetchImageTasks(true);
  }, [navigatorReady, userId, session]);

  useFocusEffect(
    useCallback(() => {
      if (userId && navigatorReady) fetchImageTasks(false);
    }, [userId, navigatorReady])
  );

  const handleBack = useCallback(() => {
    router.push('/tasks');
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backRow} onPress={handleBack}>
          <Ionicons name="arrow-back" size={20} color="#3b82f6" />
          <Text style={styles.backLabel}>Back</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#ffffff" style={{ flex: 1 }} />
      ) : imageTasks.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="alert-circle-outline" size={64} color="#64748b" />
          <Text style={styles.emptyTitle}>Görev Bulunamadı</Text>

          <TouchableOpacity style={styles.emptyRefresh} onPress={() => fetchImageTasks(true)}>
            <Text style={styles.emptyRefreshText}>Görevleri Yenile</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.gridContainer}>
          <FlatList
            data={imageTasks}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TaskListCard
                title={`${t('tasks.taskListHeadingImage')} - ${item.title}`}
                status={item.status}
                price={item.price}
                accent="#ec4899"
                icon="image"
                subtitle={getLanguageLabel(item.language)}
                ctaLabel={t('tasks.startTask')}
                style={styles.cardSlot}
                onPress={() => router.push(`/tasks/image/${item.id}`)}
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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    paddingTop: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginBottom: 4,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    padding: 8,
    borderRadius: 8,
  },
  backLabel: {
    color: '#3b82f6',
    marginLeft: 5,
    fontWeight: 'bold',
  },
  gridContainer: {
    maxWidth: 1200,
    alignSelf: 'center',
    width: '100%',
    paddingLeft: 20,
    paddingHorizontal: 20,
    paddingVertical: 5,
    paddingTop: 0,
    marginTop: -20,
  },
  columnWrapper: {
    justifyContent: 'flex-start',
    gap: 0,
  },
  cardSlot: {
    flex: 1,
    maxWidth: 220,
    margin: 2,
    marginRight: 10,
    marginBottom: 10,
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
    backgroundColor: '#ec4899',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  emptyRefreshText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});
