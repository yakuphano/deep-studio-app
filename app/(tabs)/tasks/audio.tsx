import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  SafeAreaView,
  useWindowDimensions,
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
  transcription?: string | null;
  is_pool_task?: boolean;
  assigned_to?: string | null;
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
  const formatPrice = (price: number | null) => {
    return price ? `$${price}` : 'Free';
  };

  return (
    <TouchableOpacity style={styles.card} onPress={() => onPress(item.id)}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
        <View style={styles.cardMeta}>
          <Text style={styles.cardPrice}>{formatPrice(item.price)}</Text>
          <Text style={styles.cardLang}>{item.language?.toUpperCase()}</Text>
        </View>
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardDescription} numberOfLines={3}>
          {item.title}
        </Text>
      </View>
      <TouchableOpacity style={styles.detailBtn} onPress={() => onPress(item.id)}>
        <Ionicons name="arrow-forward" size={14} color="#22c55e" />
        <Text style={styles.detailBtnText}>{t('tasks.viewDetails')}</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

export default function AudioTasksScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const { user, session, languages } = useAuth();
  const [audioTasks, setAudioTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { width } = useWindowDimensions();
  const numColumns = width >= 900 ? 3 : width >= 600 ? 2 : 1;

  const userId = user?.id ?? session?.user?.id ?? null;
  const navigatorReady = rootNavigationState?.key != null;

  // Render protection
  if (!user || !session) return <View><Text>Loading...</Text></View>;

  const fetchAudioTasks = useCallback(async (showLoading = true) => {
    if (!userId) return;
    if (showLoading) setLoading(true);
    
    try {
      const cols = 'id, title, status, price, language, category, type, audio_url, image_url, transcription, is_pool_task, assigned_to';
      
      // My Tasks - assigned to current user (audio only)
      const { data: assignedData, error: assignedErr } = await supabase
        .from('tasks')
        .select(cols)
        .eq('assigned_to', userId)
        .eq('status', 'pending')
        .or('category.eq.audio,type.eq.audio,audio_url.not.is.null')
        .order('created_at', { ascending: false });
      
      if (assignedErr) console.error('[audio-tasks] assignedData sorgu hatasi:', assignedErr);
      const assigned = assignedData ?? [];

      // Pool Tasks - available for claiming (audio only)
      const { data: poolData, error: poolErr } = await supabase
        .from('tasks')
        .select(cols)
        .is('assigned_to', null)
        .eq('status', 'pending')
        .or('category.eq.audio,type.eq.audio,audio_url.not.is.null')
        .order('created_at', { ascending: false });
      
      if (poolErr) console.error('[audio-tasks] poolData sorgu hatasi:', poolErr);
      const pool = poolData ?? [];

      const allAudioTasks = [...pool, ...assigned];
      
      // Dil filtresi - kullanıcının dillerine göre filtrele
      const filteredTasks = allAudioTasks.filter(task => 
        languages.includes(task.language)
      );
      
      setAudioTasks(filteredTasks);
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
      if (userId && navigatorReady) {
        fetchAudioTasks(false);
      }
    }, [userId, navigatorReady])
  );

  const handleBack = useCallback(() => {
    router.back();
  }, []);

  const handleTaskPress = useCallback(async (taskId: string) => {
    if (!userId) return;
    const claimed = audioTasks.find((t) => t.id === taskId);
    const { error } = await supabase
      .from('tasks')
      .update({ assigned_to: userId })
      .eq('id', taskId)
      .single();
    if (error) {
      console.error('[audio-tasks] Görev alma hatasi:', error);
      return;
    }
    await fetchAudioTasks(false);
    router.push(`/task/${taskId}`);
  }, [userId, audioTasks, fetchAudioTasks]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAudioTasks(false);
    setRefreshing(false);
  }, [fetchAudioTasks]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Geri Butonu */}
      <View style={styles.headerContainer}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Ionicons name="chevron-back" size={20} color="#3b82f6" />
        </TouchableOpacity>
      </View>

      <Text style={styles.pageTitle}>{t('tasks.pageTitleTranscription')}</Text>

      {loading ? (
        <ActivityIndicator size="large" color="#3b82f6" style={{ marginTop: 40 }} />
      ) : audioTasks.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="mic-outline" size={80} color="#475569" />
          <Text style={styles.emptySubtitle}>Audio transcription tasks will appear here when available</Text>
          <TouchableOpacity style={styles.refreshButton} onPress={() => fetchAudioTasks(true)}>
            <Text style={styles.refreshButtonText}>Refresh</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={audioTasks}
          renderItem={({ item }) => <AudioTaskCard item={item} onPress={handleTaskPress} t={t} />}
          keyExtractor={(item) => item.id}
          numColumns={numColumns}
          contentContainerStyle={styles.listContainer}
          columnWrapperStyle={numColumns > 1 ? styles.columnWrapper : undefined}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#0f172a',
  },
  headerContainer: {
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    padding: 10,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  pageTitle: { 
    fontSize: 22, 
    fontWeight: '700', 
    color: '#f8fafc', 
    marginBottom: 32,
    paddingHorizontal: 20,
    marginTop: 20,
  },
  listContainer: { 
    gap: 15, 
    paddingHorizontal: 20,
  },
  columnWrapper: { justifyContent: 'space-between' },
  card: {
    flex: 1,
    margin: 4,
    backgroundColor: 'rgba(30, 41, 59, 0.6)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 16,
    minHeight: 180,
  },
  cardHeader: { marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#f1f5f9', marginBottom: 8 },
  cardMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardPrice: { fontSize: 14, fontWeight: '700', color: '#22c55e' },
  cardLang: { fontSize: 12, color: '#94a3b8', backgroundColor: 'rgba(148, 163, 184, 0.1)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  cardBody: { flex: 1 },
  cardDescription: { fontSize: 14, color: '#cbd5e1', lineHeight: 20 },
  detailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  detailBtnText: {
    fontSize: 13,
    color: '#22c55e',
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#f8fafc',
    marginTop: 24,
    marginBottom: 12,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#94a3b8',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  refreshButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 24,
  },
  refreshButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
});
