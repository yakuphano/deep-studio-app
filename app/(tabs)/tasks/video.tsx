import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

interface TaskData {
  id: string;
  title: string;
  status?: string;
  price?: number | null;
  type?: 'audio' | 'image' | 'video' | string | null;
  category?: string | null;
  audio_url?: string;
  image_url?: string | null;
  video_url?: string | null;
  transcription?: string;
  annotation_data?: unknown;
  language?: string | null;
}

export default function VideoTasksScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { user, session } = useAuth();
  const [tasks, setTasks] = useState<TaskData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    if (!user?.id) return;
    
    setLoading(true);
    try {
      // Fetch assigned video tasks
      const { data: assignedTasks, error: assignedError } = await supabase
        .from('tasks')
        .select('*')
        .eq('assigned_to', user.id)
        .or(`category.eq.video,type.eq.video`)
        .in('status', ['pending', 'in_progress'])
        .order('created_at', { ascending: false });

      // Fetch pool video tasks
      const { data: poolTasks, error: poolError } = await supabase
        .from('tasks')
        .select('*')
        .is('is_pool_task', true)
        .or(`category.eq.video,type.eq.video`)
        .in('status', ['pending', 'in_progress'])
        .order('created_at', { ascending: false });

      if (assignedError || poolError) {
        console.error('Error fetching video tasks:', assignedError || poolError);
        if (typeof window !== 'undefined') {
          window.alert('Error fetching video tasks');
        } else {
          Alert.alert('Error', 'Failed to fetch video tasks');
        }
      } else {
        const allTasks = [...(assignedTasks || []), ...(poolTasks || [])];
        setTasks(allTasks);
      }
    } catch (error) {
      console.error('Error fetching video tasks:', error);
      if (typeof window !== 'undefined') {
        window.alert('Error fetching video tasks');
      } else {
        Alert.alert('Error', 'Failed to fetch video tasks');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchTasks();
    setRefreshing(false);
  };

  const handleTaskPress = (taskId: string) => {
    router.push(`/task/${taskId}`);
  };

  const TaskCard = ({ task }: { task: TaskData }) => (
    <TouchableOpacity
      style={styles.taskCard}
      onPress={() => handleTaskPress(task.id)}
      activeOpacity={0.8}
    >
      <View style={styles.taskHeader}>
        <Text style={styles.taskTitle} numberOfLines={2}>
          {task.title}
        </Text>
        <View style={styles.taskPriceBadge}>
          <Text style={styles.taskPriceText}>${task.price ?? 0}</Text>
        </View>
      </View>
      <View style={styles.taskMeta}>
        <View style={styles.taskStatus}>
          <View style={[styles.statusDot, getStatusColor(task.status)]} />
          <Text style={styles.statusText}>
            {task.status === 'pending' ? 'Pending' : task.status === 'in_progress' ? 'In Progress' : 'Completed'}
          </Text>
        </View>
        {task.video_url && (
          <View style={styles.taskType}>
            <Ionicons name="videocam-outline" size={16} color="#10b981" />
            <Text style={styles.taskTypeText}>Video</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'completed':
        return { backgroundColor: '#22c55e' };
      case 'in_progress':
        return { backgroundColor: '#f59e0b' };
      default:
        return { backgroundColor: '#6b7280' };
    }
  };

  const getCardMargin = () => {
    return 4; // 4px margin for grid layout
  };

  const numColumns = 2; // Always 2 columns for simplicity

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 8, paddingBottom: 80 },
          numColumns > 1 && { paddingHorizontal: 4 }
        ]}
      >
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.8}
          >
            <Ionicons name="arrow-back" size={20} color="#f1f5f9" />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Video Annotation Tasks</Text>
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={handleRefresh}
            disabled={refreshing}
            activeOpacity={0.8}
          >
            <Ionicons 
              name="refresh" 
              size={20} 
              color="#f1f5f9" 
              style={{ transform: [{ rotate: refreshing ? '180deg' : '0deg' }] }}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{tasks.length}</Text>
            <Text style={styles.statLabel}>Total Tasks</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>
              {tasks.filter(t => t.status === 'pending').length}
            </Text>
            <Text style={styles.statLabel}>Pending</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>
              {tasks.filter(t => t.status === 'in_progress').length}
            </Text>
            <Text style={styles.statLabel}>In Progress</Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#3b82f6" />
            <Text style={styles.loadingText}>Loading video tasks...</Text>
          </View>
        ) : tasks.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="videocam-outline" size={48} color="#64748b" />
            <Text style={styles.emptyTitle}>No Video Tasks</Text>
            <Text style={styles.emptyText}>
              There are no video annotation tasks available at the moment.
            </Text>
            <TouchableOpacity
              style={styles.refreshButton}
              onPress={handleRefresh}
              disabled={refreshing}
              activeOpacity={0.8}
            >
              <Ionicons name="refresh" size={20} color="#f1f5f9" />
              <Text style={styles.refreshButtonText}>Refresh</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView
            style={styles.taskList}
            contentContainerStyle={numColumns > 1 ? { paddingHorizontal: 4 } : {}}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.taskGrid}>
              {tasks.map((task) => (
                <View key={task.id} style={[styles.taskCardWrapper, { marginHorizontal: getCardMargin() }]}>
                  <TaskCard task={task} />
                </View>
              ))}
            </View>
          </ScrollView>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
  },
  backText: {
    fontSize: 14,
    color: '#f1f5f9',
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f1f5f9',
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
  },
  refreshButtonText: {
    fontSize: 14,
    color: '#f1f5f9',
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#f1f5f9',
  },
  statLabel: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 4,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  loadingText: {
    fontSize: 16,
    color: '#94a3b8',
    marginTop: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#f1f5f9',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 32,
    lineHeight: 20,
  },
  taskList: {
    flex: 1,
  },
  taskGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  taskCardWrapper: {
    width: '50%',
    marginBottom: 8,
  },
  taskCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  taskHeader: {
    marginBottom: 12,
  },
  taskTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f1f5f9',
    lineHeight: 18,
    marginBottom: 8,
  },
  taskPriceBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  taskPriceText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#22c55e',
  },
  taskMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  taskStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '500',
  },
  taskType: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  taskTypeText: {
    fontSize: 12,
    color: '#10b981',
    fontWeight: '500',
  },
});
