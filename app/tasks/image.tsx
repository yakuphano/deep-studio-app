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
  transcription?: string | null;
  is_pool_task?: boolean;
  assigned_to?: string | null;
};

function ImageTaskCard({
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
      {/* Image Preview */}
      {item.image_url && (
        <View style={styles.imageContainer}>
          <Image 
            source={{ uri: item.image_url }} 
            style={styles.taskImage}
            resizeMode="cover"
          />
          <View style={styles.imageOverlay} />
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
            <Ionicons name="globe" size={14} color="#f472b6" />
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

export default function ImageTasksScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const { user, session } = useAuth();
  const [imageTasks, setImageTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const { width } = useWindowDimensions();
  const numColumns = width >= 1200 ? 4 : width >= 900 ? 3 : width >= 600 ? 2 : 1;

  const userId = user?.id ?? session?.user?.id ?? null;
  const navigatorReady = rootNavigationState?.key != null;

  // Render protection
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
      
      console.log('[image-tasks] Fetched image tasks:', data?.length);
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
    if (Platform.OS === 'web') {
      router.back();
    } else {
      router.replace('/tasks');
    }
  }, []);

  return (
    <View style={styles.container}>
      {/* Custom Back Button */}
      <TouchableOpacity style={styles.backToSelection} onPress={handleBack}>
        <Ionicons name="arrow-back" size={20} color="#3b82f6" />
        <Text style={styles.backToSelectionText}>Geri Dön</Text>
      </TouchableOpacity>

      {/* Content */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#f472b6" />
          <Text style={styles.loadingText}>{t('common.loading')}</Text>
        </View>
      ) : imageTasks.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="image-outline" size={64} color="#64748b" />
          <Text style={styles.emptyText}>Henüz bu kategoride görev bulunmamaktadır</Text>
        </View>
      ) : (
        <View style={styles.gridContainer}>
          {imageTasks.map((item) => (
            <ImageTaskCard key={item.id} item={item} onPress={(id) => router.push(`/tasks/image/${id}`)} t={t} />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    paddingTop: 60, // ✅ Status bar altında kalmaması için
  },
  backToSelection: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    padding: 10, // ✅ Tek padding değeri
    borderRadius: 8, // ✅ Border radius
    backgroundColor: '#1e293b', // ✅ Koyu lacivert kutu
    marginHorizontal: 20,
    marginBottom: 16,
  },
  backToSelectionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3b82f6', // ✅ Mavi yazı
    marginLeft: 8,
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
    overflow: 'hidden',
  },
  cardHovered: {
    borderColor: '#f472b6',
    transform: [{ scale: 1.02 }],
  },
  imageContainer: {
    width: '100%',
    height: 180,
    backgroundColor: '#0f172a',
    position: 'relative',
  },
  taskImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  imageOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 12,
    background: 'linear-gradient(to top, rgba(15, 23, 42, 0.9), transparent)',
  },
  cardHeader: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 8,
  },
  priceBadge: {
    backgroundColor: '#22c55e',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  priceText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  cardBody: {
    padding: 16,
  },
  metadataRow: {
    flexDirection: 'row',
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
    marginRight: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#fbbf24',
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
    fontWeight: '500',
    color: '#3b82f6',
    marginLeft: 4,
  },
  cardFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  actionButton: {
    backgroundColor: '#f472b6',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 16,
  },
});
