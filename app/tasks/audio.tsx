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
    return price ? `₺${price}` : 'Free';
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
      {/* Audio Header with Icon */}
      <View style={styles.audioHeader}>
        <View style={styles.audioIconContainer}>
          <Ionicons name="headset" size={44} color="#3b82f6" />
        </View>
      </View>
      
      {/* Title */}
      <View style={styles.titleContainer}>
        <Text style={styles.titleText}>Audio Task - {item.title}</Text>
      </View>
      
      {/* Metadata Row */}
      <View style={styles.metadataRow}>
        <View style={styles.statusChip}>
          <Ionicons name="time" size={14} color="#fbbf24" />
          <Text style={styles.statusChipText}>Pending</Text>
        </View>
        <View style={styles.priceChip}>
          <Text style={styles.priceChipText}>₺{item.price ?? 10}</Text>
        </View>
      </View>
      
      {/* Full Width Button */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.fullWidthButton} onPress={() => onPress(item.id)}>
          <Text style={styles.buttonText}>Start Task</Text>
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
      {/* Custom Back Button */}
      <TouchableOpacity style={styles.backToSelection} onPress={handleBack}>
        <Ionicons name="arrow-back" size={20} color="#3b82f6" />
        <Text style={styles.backToSelectionText}>Back</Text>
      </TouchableOpacity>

      {/* Content */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>{t('common.loading')}</Text>
        </View>
      ) : audioTasks.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconContainer}>
            <Ionicons name="mic-outline" size={80} color="#3b82f6" />
          </View>
          <Text style={styles.emptyTitle}>No Audio Tasks Available</Text>
          <Text style={styles.emptyDescription}>There are currently no audio tasks waiting in the pool.</Text>
          <TouchableOpacity style={styles.refreshButton} onPress={() => fetchAudioTasks(true)}>
            <Ionicons name="refresh" size={16} color="#ffffff" />
            <Text style={styles.refreshButtonText}>Refresh</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.gridContainer}>
          <FlatList
            data={audioTasks}
            renderItem={({ item }) => (
              <AudioTaskCard key={item.id} item={item} onPress={(id) => router.push(`/tasks/audio/${id}`)} t={t} />
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
    paddingTop: 0, // ✅ Sıfırlandı
  },
  backToSelection: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    padding: 8, // ✅ Azaltıldı: 10 -> 8
    borderRadius: 8,
    backgroundColor: '#1e293b',
    marginHorizontal: 20,
    marginBottom: 4, // ✅ Azaltıldı: 16 -> 4
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
  card: {
    flex: 1,
    maxWidth: 250,
    minHeight: 280, // ✅ Sabit yükseklik
    margin: 4,
    marginRight: 16,
    marginBottom: 16,
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 10,
    paddingBottom: 20, // ✅ Artırıldı: 15 -> 20
    borderWidth: 1,
    borderColor: '#334155',
    overflow: 'hidden',
  },
  cardHovered: {
    borderColor: '#3b82f6',
    transform: [{ scale: 1.02 }],
  },
  cardHeader: {
    padding: 10, // ✅ Azaltıldı: 12 -> 10
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 2, // ✅ Azaltıldı: 4 -> 2
  },
  cardBody: {
    padding: 8, // 
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
  },
  statusText: {
    fontSize: 10,
    fontWeight: '500',
    color: '#fbbf24',
    marginLeft: 4,
  },
  priceBadgeInline: {
    backgroundColor: '#3b82f6', // 
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  priceText: {
    fontSize: 10, // 
    fontWeight: '700',
    color: '#ffffff',
  },
  cardFooter: {
    padding: 10, // 
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  inlineActionButton: {
    backgroundColor: '#3b82f6', // 
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10, // 
    paddingVertical: 4,
    borderRadius: 4,
    height: 28, // 
  },
  inlineActionText: {
    fontSize: 11, // 
    fontWeight: '600',
    color: '#ffffff',
    marginRight: 4,
  },
  audioHeader: {
    backgroundColor: '#1a1d1e', // ✅ Koyu gri arka plan
    height: 120, // ✅ Header yüksekliği
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  audioIconContainer: {
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
    backgroundColor: '#3b82f6',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 16,
    color: '#94a3b8',
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 40,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3b82f6',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  refreshButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
});
