import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
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
  const { width } = useWindowDimensions();
  const numColumns = width > 1400 ? 4 : width > 1000 ? 3 : width > 600 ? 2 : 1;

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

  const TaskCard = ({ task }: { task: TaskData }) => {
    const [isHovered, setIsHovered] = useState(false);

    return (
      <TouchableOpacity
        style={[styles.taskCard, isHovered && styles.cardHovered]}
        onPressIn={() => setIsHovered(true)}
        onPressOut={() => setIsHovered(false)}
        onPress={() => handleTaskPress(task.id)}
        activeOpacity={0.8}
      >
        {/* Video Header with Icon */}
        <View style={styles.videoHeader}>
          <View style={styles.videoIconContainer}>
            <Ionicons name="videocam" size={44} color="#7c3aed" />
          </View>
        </View>
        
        {/* Title */}
        <View style={styles.titleContainer}>
          <Text style={styles.titleText}>Video Task - {task.title}</Text>
        </View>
        
        {/* Metadata Row */}
        <View style={styles.metadataRow}>
          <View style={styles.statusChip}>
            <Ionicons name="time" size={14} color="#fbbf24" />
            <Text style={styles.statusChipText}>Pending</Text>
          </View>
          <View style={styles.priceChip}>
            <Text style={styles.priceChipText}>₺{task.price ?? 10}</Text>
          </View>
        </View>
        
        {/* Full Width Button */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.fullWidthButton} onPress={() => handleTaskPress(task.id)}>
            <Text style={styles.buttonText}>Start Task</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

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

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      
      {/* Header with back button */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace('/(tabs)/tasks');
            }
          }}
          activeOpacity={0.8}
          hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
        >
          <Ionicons name="arrow-back" size={20} color="#3b82f6" />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>Loading image tasks...</Text>
        </View>
      ) : tasks.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="image-outline" size={48} color="#64748b" />
          <Text style={styles.emptyTitle}>No Image Tasks</Text>
          <Text style={styles.emptyText}>
            There are no image annotation tasks available at the moment.
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
        <View style={styles.gridContainer}>
          <FlatList
            data={tasks}
            renderItem={({ item }) => (
              <TaskCard task={item} />
            )}
            keyExtractor={(item) => item.id}
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
    marginBottom: 5, // ✅ Azaltıldı: 8 -> 5
    marginTop: 0, // ✅ Tamamen kaldırıldı
    paddingTop: 0, // ✅ Tamamen kaldırıldı
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6, // ✅ Azaltıldı: 8 -> 6
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
  },
  backText: {
    fontSize: 14,
    color: '#3b82f6',
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f1f5f9',
    marginBottom: 5, // ✅ Azaltıldı: 0 -> 5 (başlık altı)
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
    paddingTop: 40, // ✅ Azaltıldı: 60 -> 40
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
    paddingTop: 40, // ✅ Azaltıldı: 60 -> 40
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
    flex: 1,
    aspectRatio: 1, // ✅ Kare görünüm
    maxWidth: 280, // ✅ Geniş kart
    margin: 4,
    marginRight: 16, // ✅ Kartlar arası boşluk
    marginBottom: 16,
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 10,
    paddingBottom: 15, // ✅ Artırıldı: 8 -> 15
    borderWidth: 1,
    borderColor: '#334155',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  videoHeader: {
    backgroundColor: '#1a1d1e', // ✅ Koyu gri arka plan
    height: 120, // ✅ Header yüksekliği
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#2d3748', // ✅ Daha açık iç arka plan
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleContainer: {
    padding: 12,
    paddingBottom: 8,
  },
  titleText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  metadataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(251, 191, 36, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fbbf24',
    marginLeft: 4,
  },
  priceChip: {
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  priceChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#22c55e',
  },
  buttonContainer: {
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  fullWidthButton: {
    backgroundColor: '#7c3aed', // ✅ Mor tema
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8, // Azaltıldı: 16 -> 8
  },
  cardHeader: {
    padding: 8, // Azaltıldı: 10 -> 8
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  taskTitle: {
    fontSize: 14, // Küçültüldü: 16 -> 14
    fontWeight: '700',
    color: '#f1f5f9',
    lineHeight: 18,
    flex: 1,
    marginRight: 8,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 2, // ✅ Azaltıldı: 4 -> 2
  },
  taskPriceBadge: {
    backgroundColor: '#7c3aed',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  taskPriceText: {
    fontSize: 10, // Küçültüldü: 14 -> 10
    fontWeight: '700',
    color: '#ffffff',
  },
  taskMeta: {
    marginBottom: 8, // Azaltıldı: 16 -> 8
  },
  cardBody: {
    padding: 6, // Azaltıldı: 8 -> 6
  },
  metadataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between', // ✅ Yan yana diz
    marginBottom: 6, // Azaltıldı: 8 -> 6
    gap: 8, // ✅ Aralık eklendi
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '500',
    color: '#fbbf24',
    marginLeft: 4,
  },
  priceText: {
    fontSize: 10, // Küçültüldü: 12 -> 10
    fontWeight: '700',
    color: '#ffffff',
  },
  inlineActionButton: {
    backgroundColor: '#7c3aed', // ✅ Mor tema
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10, // ✅ Artırıldı: 8 -> 10
    paddingVertical: 4,
    borderRadius: 4,
    height: 28, // ✅ Badge'ler ile aynı
  },
  inlineActionText: {
    fontSize: 11, // ✅ Artırıldı: 10 -> 11
    fontWeight: '600',
    color: '#ffffff',
    marginRight: 4,
  },
  gridContainer: {
    maxWidth: 1200,
    alignSelf: 'center',
    width: '100%',
    paddingLeft: 20,
    paddingHorizontal: 20,
    paddingVertical: 5,
    paddingTop: 0,
    marginTop: -20, // ✅ Daha fazla yukarı çek
  },
  columnWrapper: {
    justifyContent: 'flex-start', // ✅ Soldan başla
    gap: 0, // ✅ Margin ile kontrol
  },
  taskStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  priceBadgeInline: {
    backgroundColor: '#7c3aed', // ✅ Mor tema
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
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
