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
import { useRouter, useRootNavigationState, Stack } from 'expo-router';
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

function VideoTaskCard({
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
        <Ionicons name="arrow-forward" size={14} color="#10b981" />
        <Text style={styles.detailBtnText}>{t('tasks.viewDetails')}</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

export default function VideoTasksScreen() {
  console.log('=== VIDEO COMPONENT RENDER EDILDI ===');
  
  const { t } = useTranslation();
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const { user, session } = useAuth();
  const [videoTasks, setVideoTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { width } = useWindowDimensions();
  const numColumns = width >= 900 ? 3 : width >= 600 ? 2 : 1;

  const userId = user?.id ?? session?.user?.id ?? null;
  const navigatorReady = rootNavigationState?.key != null;

  console.log('=== VIDEO USER INFO ===', { user: !!user, session: !!session, userId, navigatorReady: !!navigatorReady });

  // Render protection
  if (!user || !session) return <View><Text>Loading...</Text></View>;

  const fetchVideoTasks = useCallback(async (showLoading = true) => {
    if (!userId) return;
    if (showLoading) setLoading(true);
    
    try {
      // DEBUG: Tüm video görevlerini getir - filtreleri kald\u0131r
      const { data: allData, error: allErr } = await supabase
        .from('tasks')
        .select('*')
        .eq('category', 'video')
        .order('created_at', { ascending: false });
      
      console.log('[VIDEO-DEBUG] Tüm video görevleri:', allData);
      console.log('[VIDEO-DEBUG] Hata:', allErr);
      
      // Geçici olarak tüm video görevlerini ata
      const assignedData = allData?.filter(task => task.assigned_user_id === userId) || [];
      const poolData = allData?.filter(task => !task.assigned_user_id) || [];
      
      console.log('[VIDEO-DEBUG] Filtered assigned:', assignedData);
      console.log('[VIDEO-DEBUG] Filtered pool:', poolData);
      
      console.log('[VIDEO-TASKS-DEBUG] assignedData:', assignedData);
      console.log('[VIDEO-TASKS-DEBUG] assignedErr:', assignedErr);
      console.log('[VIDEO-TASKS-DEBUG] poolData:', poolData);
      console.log('[VIDEO-TASKS-DEBUG] poolErr:', poolErr);
      console.log('[VIDEO-TASKS-DEBUG] userId:', userId);
      
      if (assignedErr || poolErr) {
        console.error('[VIDEO-TASKS-DEBUG] Sorgu hatasi:', assignedErr || poolErr);
        setVideoTasks([]);
        return;
      }
      
      const allVideoTasks = [...(poolData || []), ...(assignedData || [])];
      setVideoTasks(allVideoTasks);
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
    router.back();
  }, []);

  const handleTaskPress = useCallback(async (taskId: string) => {
    if (!userId) return;
    const claimed = videoTasks.find((t) => t.id === taskId);
    const { error } = await supabase
      .from('tasks')
      .update({ assigned_to: userId })
      .eq('id', taskId)
      .single();
    if (error) {
      console.error('[video-tasks] Görev alma hatasi:', error);
      return;
    }
    await fetchVideoTasks(false);
    router.push(`/task/${taskId}`);
  }, [userId, videoTasks, fetchVideoTasks]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchVideoTasks(false);
    setRefreshing(false);
  }, [fetchVideoTasks]);

  // return (...) sat\u0131r\u0131ndan hemen önce:
console.log("--- EKRANA BASILAN VER\u0130: ---", videoTasks);
console.log("--- Y\u00dcKLEN\u0130YOR MU? ---", loading);

return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      
      {/* Geri Butonu */}
      <View style={styles.headerContainer}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Ionicons name="chevron-back" size={20} color="#3b82f6" />
        </TouchableOpacity>
      </View>

      <Text style={styles.pageTitle}>{t('tasks.pageTitleVideo')}</Text>

      {loading ? (
        <ActivityIndicator size="large" color="#ffffff" style={{ flex: 1 }} />
      ) : videoTasks.length === 0 ? (
        /* GÜVENLİ VE GÖRÜNÜR EMPTY STATE */
        <View style={{ 
          flex: 1, 
          justifyContent: 'center', 
          alignItems: 'center', 
          padding: 20, 
          backgroundColor: '#0f172a' // Arka planıyla uyumlu
        }}>
          <Ionicons name="alert-circle-outline" size={64} color="#64748b" />
          <Text style={{ color: '#fff', fontSize: 18, marginTop: 10 }}>Görev Bulunamadı</Text>
          
          <TouchableOpacity 
            style={{
              marginTop: 20,
              backgroundColor: '#8b5cf6', // Video için mor
              paddingVertical: 12,
              paddingHorizontal: 24,
              borderRadius: 8,
            }}
            onPress={() => fetchVideoTasks(true)} // Buradaki fonksiyon ismine dikkat et!
          >
            <Text style={{ color: '#fff', fontWeight: 'bold' }}>Görevleri Yenile</Text>
          </TouchableOpacity>
        </View>
      ) : (
        // VERİ VARSA LİSTELE
        <FlatList
          data={videoTasks}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <VideoTaskCard item={item} onPress={handleTaskPress} t={t} />}
          numColumns={numColumns}
          contentContainerStyle={styles.listContainer}
          columnWrapperStyle={numColumns > 1 ? styles.columnWrapper : undefined}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3b82f6" />
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
  cardPrice: { fontSize: 14, fontWeight: '700', color: '#10b981' },
  cardLang: { fontSize: 12, color: '#94a3b8', backgroundColor: 'rgba(148, 163, 184, 0.1)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  cardBody: { flex: 1 },
  cardDescription: { fontSize: 14, color: '#cbd5e1', lineHeight: 20 },
  detailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  detailBtnText: {
    fontSize: 13,
    color: '#10b981',
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  refreshButton: {
    backgroundColor: '#8b5cf6',
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
