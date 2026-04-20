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
    return price ? `₺${price}` : 'Free';
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
      {/* Image Header with Icon */}
      <View style={styles.imageHeader}>
        <View style={styles.imageIconContainer}>
          <Ionicons name="image" size={44} color="#ec4899" />
        </View>
      </View>
      
      {/* Title */}
      <View style={styles.titleContainer}>
        <Text style={styles.titleText}>Image Task - {item.title}</Text>
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
    router.push('/tasks'); // HER ZAMAN ÇALIŞIR
  }, []);

  return (
    <View style={styles.container}>
      {/* Header with Back Button Only */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={{flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', padding: 8, borderRadius: 8}}
          onPress={handleBack}
        >
          <Ionicons name="arrow-back" size={20} color="#3b82f6" />
          <Text style={{color: '#3b82f6', marginLeft: 5, fontWeight: 'bold'}}>Back</Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#f472b6" />
          <Text style={styles.loadingText}>{t('common.loading')}</Text>
        </View>
      ) : imageTasks.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconContainer}>
            <Ionicons name="image-outline" size={80} color="#ec4899" />
          </View>
          <Text style={styles.emptyTitle}>No Image Tasks Available</Text>
          <Text style={styles.emptyDescription}>There are currently no image tasks waiting in the pool.</Text>
          <TouchableOpacity style={styles.refreshButton} onPress={() => fetchImageTasks(true)}>
            <Ionicons name="refresh" size={16} color="#ffffff" />
            <Text style={styles.refreshButtonText}>Refresh</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.gridContainer}>
          <FlatList
            data={imageTasks}
            renderItem={({ item }) => (
              <ImageTaskCard key={item.id} item={item} onPress={(id) => router.push(`/tasks/image/${id}`)} t={t} />
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginBottom: 4,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1a1d1e', // ✅ Koyu gri arka plan
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
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
    borderColor: '#f472b6',
    transform: [{ scale: 1.02 }],
  },
  imageHeader: {
    backgroundColor: '#1a1d1e', // ✅ Koyu gri arka plan
    height: 120, // ✅ Header yüksekliği
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageIconContainer: {
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
    backgroundColor: '#ec4899', // ✅ Pembe tema
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  taskImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'contain', // ✅ Kesilmemesi için
  },
  imageOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
  },
  cardHeader: {
    padding: 8, // ✅ Azaltıldı: 10 -> 8
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 2, // ✅ Azaltıldı: 4 -> 2
  },
  priceBadge: {
    backgroundColor: '#22c55e',
    paddingHorizontal: 10, // ✅ Azaltıldı: 12 -> 10
    paddingVertical: 4, // ✅ Azaltıldı: 6 -> 4
    borderRadius: 10, // ✅ Azaltıldı: 12 -> 10
    alignSelf: 'flex-start',
  },
  priceText: {
    fontSize: 12, // ✅ Küçültüldü: 14 -> 12
    fontWeight: '700',
    color: '#ffffff',
  },
  cardBody: {
    padding: 6, // ✅ Azaltıldı: 8 -> 6
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  priceBadgeInline: {
    backgroundColor: '#ec4899', // ✅ Pembe tema
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  inlineActionButton: {
    backgroundColor: '#ec4899', // ✅ Pembe tema
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
    backgroundColor: 'rgba(236, 72, 153, 0.1)',
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
    backgroundColor: '#ec4899',
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
  emptyText: {
    fontSize: 18,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 16,
  },
});
