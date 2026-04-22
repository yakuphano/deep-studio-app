import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  SafeAreaView,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useTranslation } from 'react-i18next';
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
  const { width } = useWindowDimensions();
  const numColumns = width >= 1200 ? 4 : width >= 900 ? 3 : width >= 600 ? 2 : 1;

  const [videoTasks, setVideoTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    let isMounted = true;

    try {
      setLoading(true);

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const uid = session?.user?.id;

      if (!uid) {
        if (isMounted) setLoading(false);
        return;
      }

      const cols =
        'id, title, status, price, language, category, type, video_url, is_pool_task, assigned_to';

      const { data: assignedData, error: assignedErr } = await supabase
        .from('tasks')
        .select(cols)
        .eq('assigned_to', uid)
        .eq('status', 'pending')
        .or('category.eq.video,type.eq.video');

      const { data: poolData, error: poolErr } = await supabase
        .from('tasks')
        .select(cols)
        .is('assigned_to', null)
        .eq('status', 'pending')
        .or('category.eq.video,type.eq.video');

      if (assignedErr || poolErr) {
        console.error('[video-tasks] fetch error', assignedErr || poolErr);
        if (isMounted) {
          setVideoTasks([]);
          setLoading(false);
        }
        return;
      }

      if (isMounted) {
        const allTasks = [...(poolData || []), ...(assignedData || [])];
        setVideoTasks(allTasks);
        setLoading(false);
      }
    } catch (error) {
      console.error('[video-tasks] error', error);
      if (isMounted) setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleClaim = async (taskId: string) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) return;

    const { data, error } = await supabase
      .from('tasks')
      .update({ assigned_to: uid })
      .eq('id', taskId)
      .is('assigned_to', null)
      .select();

    if (!error && data && data.length > 0) {
      router.push(`/task/${taskId}`);
    } else {
      Alert.alert('Uyarı', 'Bu görev alınamadı veya başkası tarafından alındı.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.breadcrumbRow}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={16} color="#a78bfa" />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.breadcrumbText}>Tasks {'>'} Video</Text>
      </View>

      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>
          {t('tasks.pageTitleVideo') || 'Video Annotation Tasks'}
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#8b5cf6" style={{ flex: 1 }} />
      ) : videoTasks.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="videocam-outline" size={80} color="#8b5cf6" style={styles.emptyIcon} />
          <Text style={styles.emptyTitle}>No Video Tasks</Text>
          <Text style={styles.emptyDescription}>No video tasks found in your language.</Text>

          <TouchableOpacity style={styles.coloredRefreshButton} onPress={() => loadData()} activeOpacity={0.8}>
            <Ionicons name="refresh" size={20} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.buttonText}>Refresh Tasks</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={videoTasks}
          keyExtractor={(item) => item.id}
          numColumns={numColumns}
          key={numColumns}
          columnWrapperStyle={numColumns > 1 ? styles.columnWrapper : undefined}
          contentContainerStyle={styles.listContainer}
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
              onPress={() => handleClaim(item.id)}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  breadcrumbRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignItems: 'center',
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
  pageTitle: { color: '#ffffff', fontSize: 24, fontWeight: 'bold', letterSpacing: 0.5 },
  listContainer: { paddingHorizontal: 20, paddingBottom: 20 },
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginTop: -50,
  },
  emptyIcon: { marginBottom: 20 },
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
  coloredRefreshButton: {
    marginTop: 25,
    backgroundColor: '#8b5cf6',
    paddingVertical: 14,
    paddingHorizontal: 30,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 5,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
});
