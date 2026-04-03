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

function TaskCard({ item, onPress, t }: { item: Task; onPress: (id: string) => void; t: (k: string) => string }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
        <View style={styles.cardMeta}>
          <Text style={styles.cardPrice}>
            {item.price ? `₺${item.price}` : t('tasks.free')}
          </Text>
          <Text style={styles.cardLang}>{item.language}</Text>
        </View>
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardDescription} numberOfLines={3}>
          {item.title}
        </Text>
      </View>
      <TouchableOpacity style={styles.detailBtn} onPress={() => onPress(item.id)}>
        <Text style={styles.detailBtnText}>{t('tasks.start')}</Text>
        <Ionicons name="arrow-forward" size={16} color="#10b981" />
      </TouchableOpacity>
    </View>
  );
}

export default function VideoTasksScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ type?: string }>();
  const { user, session } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const { width } = useWindowDimensions();

  const fetchTasks = useCallback(async () => {
    if (!user || !session) return;
    setLoading(true);
    try {
      const cols = 'id, title, status, price, language, category, type, video_url, image_url, transcription, is_pool_task, assigned_to';
      
      // My Tasks - assigned to current user (video only)
      const { data: assignedData, error: assignedErr } = await supabase
        .from('tasks')
        .select(cols)
        .eq('assigned_to', user.id)
        .eq('type', 'video')
        .or('status.neq.completed,status.neq.submitted')
        .order('created_at', { ascending: false });

      // Pool Tasks - unassigned video tasks
      const { data: poolData, error: poolErr } = await supabase
        .from('tasks')
        .select(cols)
        .eq('is_pool_task', true)
        .eq('type', 'video')
        .is('assigned_to', null)
        .order('created_at', { ascending: false })
        .limit(10);

      if (assignedErr || poolErr) {
        console.error('Video tasks fetch error:', assignedErr || poolErr);
        setTasks([]);
      } else {
        const allTasks = [...(assignedData || []), ...(poolData || [])];
        setTasks(allTasks as Task[]);
      }
    } catch (err) {
      console.error('Video tasks fetch error:', err);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [user, session]);

  useFocusEffect(
    useCallback(() => {
      fetchTasks();
    }, [fetchTasks])
  );

  const handleTaskPress = (taskId: string) => {
    router.push(`/task/${taskId}`);
  };

  const numColumns = width > 768 ? 2 : 1;

  const getCardMargin = () => {
    return numColumns > 1 ? 4 : 0;
  };

  if (!user || !session) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Yükleniyor...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backToSelection} onPress={() => router.setParams({ type: '' })}>
          <Ionicons name="arrow-back" size={18} color="#10b981" />
          <Text style={styles.backToSelectionText}>{t('tasks.pageTitle')}</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.pageTitle}>{t('tasks.pageTitleVideo')}</Text>

      {loading ? (
        <ActivityIndicator size="large" color="#10b981" style={{ marginTop: 40 }} />
      ) : tasks.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="videocam-outline" size={64} color="#64748b" />
          <Text style={styles.emptyStateText}>Henüz video etiketleme görevi bulunmuyor.</Text>
          <Text style={styles.emptyStateSubText}>Video görevleri atandığında burada görünecektir.</Text>
        </View>
      ) : (
        <FlatList
          data={tasks}
          renderItem={({ item }) => <TaskCard item={item} onPress={handleTaskPress} t={t} />}
          keyExtractor={(item) => item.id}
          numColumns={numColumns}
          contentContainerStyle={[styles.listContainer, numColumns > 1 && { paddingHorizontal: 4 }]}
          columnWrapperStyle={numColumns > 1 ? styles.columnWrapper : undefined}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    paddingHorizontal: 16,
    paddingTop: 60,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  backToSelection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  backToSelectionText: { fontSize: 14, color: '#10b981', fontWeight: '600' },
  pageTitle: { fontSize: 22, fontWeight: '700', color: '#f8fafc', marginBottom: 32 },
  loadingText: { 
    fontSize: 16, 
    color: '#94a3b8', 
    textAlign: 'center', 
    marginTop: 40 
  },
  listContainer: { gap: 16 },
  columnWrapper: { justifyContent: 'space-between' },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 20,
    marginBottom: 0,
    borderWidth: 1,
    borderColor: '#334155',
    minHeight: 180,
    flex: 1,
  },
  cardHeader: { marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#f1f5f9', marginBottom: 8 },
  cardMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardPrice: { fontSize: 14, fontWeight: '700', color: '#10b981' },
  cardLang: { fontSize: 12, color: '#94a3b8', backgroundColor: 'rgba(148, 163, 184, 0.1)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  cardBody: { flex: 1, justifyContent: 'center' },
  cardDescription: { fontSize: 14, color: '#94a3b8', lineHeight: 20, marginBottom: 16 },
  detailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: '#10b981',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  detailBtnText: { fontSize: 14, fontWeight: '600', color: '#10b981' },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 16,
  },
  emptyStateSubText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 8,
  },
});
