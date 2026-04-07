import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  useWindowDimensions,
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
  duration?: number | null;
};

function AudioTaskCard({
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

  const formatDuration = (duration: number | null) => {
    if (!duration) return '—';
    const secs = Math.round(duration / 1000);
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
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
        {item.duration && (
          <View style={styles.durationContainer}>
            <Ionicons name="musical-notes" size={14} color="#64748b" />
            <Text style={styles.durationText}>{formatDuration(item.duration)}</Text>
          </View>
        )}
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

export default function AudioTasksScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const { user, session } = useAuth();
  const [audioTasks, setAudioTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const { width } = useWindowDimensions();
  const numColumns = width >= 1200 ? 4 : width >= 900 ? 3 : width >= 600 ? 2 : 1;

  const userId = user?.id ?? session?.user?.id ?? null;
  const navigatorReady = rootNavigationState?.key != null;

  // Render protection
  if (!user || !session) return <View><Text>Yükleniyor...</Text></View>;

  const fetchAudioTasks = useCallback(async (showLoading = true) => {
    if (!userId) return;
    if (showLoading) setLoading(true);
    
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .in('type', ['audio', 'transcription']) // Sadece audio ve transcription olanlar
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('[audio-tasks] Fetch error:', error);
        return;
      }
      
      console.log('[audio-tasks] Fetched audio tasks:', data?.length);
      setAudioTasks(data || []);
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
    fetchAudioTasks(true);
  }, [navigatorReady, userId, session]);

  useFocusEffect(
    useCallback(() => {
      if (userId && navigatorReady) fetchAudioTasks(false);
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
      {/* Header Row */}
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backToSelection} onPress={handleBack}>
          <Ionicons name="arrow-back" size={20} color="#3b82f6" />
          <Text style={styles.backToSelectionText}>Geri Dön</Text>
        </TouchableOpacity>
        <Text style={styles.pageTitle}>Ses Görevleri</Text>
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>{t('common.loading')}</Text>
        </View>
      ) : audioTasks.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="mic-outline" size={64} color="#64748b" />
          <Text style={styles.emptyText}>Henüz bu kategoride görev bulunmamaktadır</Text>
        </View>
      ) : (
        <View style={styles.gridContainer}>
          {audioTasks.map((item) => (
            <AudioTaskCard key={item.id} item={item} onPress={(id) => router.push(`/tasks/audio/${id}`)} t={t} />
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
    paddingTop: 60, // ✅ Butonların ekranın en tepesine yapışmaması için
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginBottom: 16,
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    flex: 1,
    textAlign: 'center',
  },
  backToSelection: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#1e293b',
    marginRight: 16,
  },
  backToSelectionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3b82f6', // ✅ Mavi ikon ve yazı
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
    backgroundColor: '#22c55e',
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
  durationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(100, 116, 139, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  durationText: {
    fontSize: 12,
    color: '#64748b',
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
