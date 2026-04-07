import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  useWindowDimensions,
  Image,
  Platform,
  RefreshControl,
} from 'react-native';
import { useRouter, useRootNavigationState } from 'expo-router';
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
  audio_url?: string | null;
  image_url?: string | null;
  video_url?: string | null;
  transcription?: string | null;
  is_pool_task?: boolean;
  assigned_to?: string | null;
};

function VideoTaskCard({
  item,
  onPress,
  t,
}: {
  item: Task;
  onPress: (id: string) => void;
  t: (k: string) => string;
}) {
  const [isHovered, setIsHovered] = useState(false);
  
  const formatPrice = (price: number | null) => {
    return price ? `₺${price}` : 'Ücretsiz';
  };

  const getLanguageLabel = (code: string) => {
    const languages: { [key: string]: string } = {
      'tr': 'Türkçe',
      'en': 'İngilizce',
      'de': 'Almanca',
      'fr': 'Fransızca',
      'es': 'İspanyolca',
      'it': 'İtalyanca',
    };
    return languages[code] || code;
  };

  return (
    <TouchableOpacity
      style={[styles.card, isHovered && styles.cardHovered]}
      onPressIn={() => setIsHovered(true)}
      onPressOut={() => setIsHovered(false)}
      onPress={() => onPress(item.id)}
      activeOpacity={0.8}
    >
      {/* Video Preview */}
      {item.video_url ? (
        <View style={styles.imageContainer}>
          <Image 
            source={{ uri: item.video_url }} 
            style={styles.taskImage}
            resizeMode="cover"
          />
          <View style={styles.imageOverlay} />
          <View style={styles.videoIconOverlay}>
            <Ionicons name="videocam" size={32} color="#ffffff" />
          </View>
        </View>
      ) : (
        <View style={styles.imageContainer}>
          <View style={styles.videoPlaceholder}>
            <Ionicons name="videocam-outline" size={48} color="#3b82f6" />
            <Text style={styles.videoPlaceholderText}>Video Önizleme</Text>
          </View>
        </View>
      )}
      
      {/* Header with title and price badge */}
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
        <View style={styles.priceBadge}>
          <Text style={styles.priceText}>{formatPrice(item.price)}</Text>
        </View>
      </View>
      
      {/* Content with metadata */}
      <View style={styles.cardBody}>
        <View style={styles.metadataRow}>
          <View style={styles.statusContainer}>
            <Ionicons name="time" size={14} color="#fbbf24" />
            <Text style={styles.statusText}>Bekliyor</Text>
          </View>
          <View style={styles.languageContainer}>
            <Ionicons name="globe" size={14} color="#3b82f6" />
            <Text style={styles.languageText}>{getLanguageLabel(item.language)}</Text>
          </View>
        </View>
      </View>
      
      {/* Footer with action button */}
      <View style={styles.cardFooter}>
        <TouchableOpacity style={styles.actionButton} onPress={() => onPress(item.id)}>
          <Ionicons name="arrow-forward" size={16} color="#ffffff" />
          <Text style={styles.actionButtonText}>Görevi Başlat</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
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

  // Render protection
  if (!user || !session) return <View><Text>Yükleniyor...</Text></View>;

  const fetchVideoTasks = useCallback(async (showLoading = true) => {
    if (!userId) return;
    if (showLoading) setLoading(true);
    
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('type', 'video')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('[video-tasks] Fetch error:', error);
        return;
      }
      
      console.log('[video-tasks] Fetched video tasks:', data?.length);
      setVideoTasks(data || []);
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

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchVideoTasks(false);
    setRefreshing(false);
  }, [fetchVideoTasks]);

  return (
    <View style={styles.container}>
      {/* Header with back button */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Ionicons name="arrow-back" size={20} color="#3b82f6" />
          <Text style={styles.backButtonText}>Geri Dön</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Video Görevleri</Text>
      </View>

      {/* Content */}
      <ScrollView
        style={styles.contentContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#3b82f6"
            colors={["#3b82f6"]}
          />
        }
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#3b82f6" />
            <Text style={styles.loadingText}>{t('common.loading')}</Text>
          </View>
        ) : videoTasks.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="videocam-outline" size={64} color="#64748b" />
            <Text style={styles.emptyText}>Henüz bu kategoride görev bulunmamaktadır</Text>
          </View>
        ) : (
          <View style={styles.gridContainer}>
            {videoTasks.map((item) => (
              <VideoTaskCard key={item.id} item={item} onPress={(id) => router.push(`/tasks/video/${id}`)} t={t} />
            ))}
          </View>
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
  contentContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3b82f6',
    marginLeft: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    flex: 1,
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    fontSize: 16,
    color: '#94a3b8',
    marginTop: 16,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 20,
    gap: 20,
  },
  card: {
    flex: 1,
    minWidth: 280,
    maxWidth: 380,
    backgroundColor: '#1e293b',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#334155',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
    overflow: 'hidden',
  },
  cardHovered: {
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 12,
    transform: [{ translateY: -2 }],
  },
  imageContainer: {
    height: 160,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
    position: 'relative',
  },
  taskImage: {
    width: '100%',
    height: '100%',
  },
  imageOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
  },
  videoIconOverlay: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -16 }, { translateY: -16 }],
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1e293b',
  },
  videoPlaceholderText: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 20,
    paddingBottom: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f1f5f9',
    lineHeight: 24,
    flex: 1,
    marginRight: 12,
  },
  priceBadge: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  priceText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
  cardBody: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  metadataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 12,
    color: '#fbbf24',
    fontWeight: '600',
    marginLeft: 4,
  },
  languageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  languageText: {
    fontSize: 12,
    color: '#3b82f6',
    fontWeight: '600',
    marginLeft: 4,
  },
  cardFooter: {
    padding: 20,
    paddingTop: 0,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3b82f6',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
    marginLeft: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
  },
  emptyText: {
    fontSize: 18,
    color: '#64748b',
    textAlign: 'center',
  },
});
