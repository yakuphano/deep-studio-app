import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  SafeAreaView,
  Dimensions,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useTranslation } from 'react-i18next';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 100) / 4;

type Task = {
  id: string;
  title: string;
  status: string;
  price: number | null;
  language: string;
  category?: string | null;
  type?: string | null;
  video_url?: string | null;
  is_pool_task?: boolean;
  assigned_to?: string | null;
};

const VideoTaskCard = ({ item, onPress }: { item: Task; onPress: (id: string) => void }) => (
  <TouchableOpacity onPress={() => onPress(item.id)} style={styles.card} activeOpacity={0.8}>
    <View style={styles.cardTopImage}>
      <View style={styles.iconPill}>
        <Ionicons name="videocam" size={24} color="#8b5cf6" />
      </View>
    </View>
    <View style={styles.cardContent}>
      <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
      <View style={styles.badgeRow}>
        <View style={styles.pendingBadge}>
          <Ionicons name="time" size={10} color="#fbbf24" />
          <Text style={styles.pendingText}>Pending</Text>
        </View>
        <View style={styles.priceBadge}>
          <Text style={styles.priceText}>₺{item.price ?? 0}</Text>
        </View>
      </View>
      <TouchableOpacity style={styles.startButton} onPress={() => onPress(item.id)}>
        <Text style={styles.startButtonText}>Start Task</Text>
        <Ionicons name="arrow-forward" size={14} color="#fff" />
      </TouchableOpacity>
    </View>
  </TouchableOpacity>
);

export default function VideoTasksScreen() {
  console.log('=== NUCLEAR TEST - VIDEO-TASKS DOSYASI CALISIYOR ===');
  
  const { t } = useTranslation();
  const router = useRouter();

  const [videoTasks, setVideoTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    let isMounted = true;

    try {
      setLoading(true);

      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id;

      console.log('=== VIDEO-TASKS SESSION ===', { session: !!session, uid });

      if (!uid) {
        if (isMounted) setLoading(false);
        return;
      }

      // TABLO ADI DÜZELTÝLDÝ: profiles
      const { data: profile } = await supabase
        .from('profiles')
        .select('languages')
        .eq('id', uid)
        .single();

      const userLangs = profile?.languages || [];
      console.log('=== VIDEO-TASKS USER LANGS ===', userLangs);
      
      const cols = 'id, title, status, price, language, category, type, video_url, is_pool_task, assigned_to';

      const { data: assignedData } = await supabase
        .from('tasks')
        .select(cols)
        .eq('assigned_to', uid)
        .eq('status', 'pending')
        .or('category.eq.video,type.eq.video');

      const { data: poolData } = await supabase
        .from('tasks')
        .select(cols)
        .is('assigned_to', null)
        .eq('status', 'pending')
        .or('category.eq.video,type.eq.video');

      console.log('=== VIDEO-TASKS ASSIGNED DATA ===', assignedData);
      console.log('=== VIDEO-TASKS POOL DATA ===', poolData);

      if (isMounted) {
        const allTasks = [...(poolData || []), ...(assignedData || [])];
        // DEBUG: Dil filtresini geçici olarak kaldýr
        console.log('=== VIDEO-TASKS ALL TASKS (NO FILTER) ===', allTasks);
        console.log('=== VIDEO-TASKS TASK LANGUAGES ===', allTasks.map(t => ({ id: t.id, language: t.language })));
        console.log('=== VIDEO-TASKS USER LANGS ===', userLangs);
        // Geçici olarak tüm görevleri göster
        const filteredTasks = allTasks; // Dil filtresi kaldýrýldý

        console.log('=== VIDEO-TASKS FILTERED TASKS ===', filteredTasks);

        setVideoTasks(filteredTasks);
        setLoading(false);
      }
    } catch (error) {
      console.error('=== VIDEO-TASKS ERROR ===', error);
      if (isMounted) setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleClaim = async (taskId: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) return;

    const { data, error } = await supabase
      .from('tasks')
      .update({ assigned_to: uid })
      .eq('id', taskId)
      .is('assigned_to', null)
      .select();

    if (!error && data && data.length > 0) {
       router.push(`/task/${taskId}`);
    } else {
       Alert.alert('Uyarı', 'Bu görev alınamadı veya başkası tarafından alındı.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.breadcrumbRow}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={16} color="#94a3b8" />
            <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.breadcrumbText}>Tasks {'>'} Video</Text>
      </View>

      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>{t('tasks.pageTitleVideo') || 'Video Annotation Tasks'}</Text>
        {/* Artık burada buton yok, sadece başlık var */}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#8b5cf6" style={{ flex: 1 }} />
      ) : videoTasks.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="videocam-outline" size={80} color="#475569" style={styles.emptyIcon} />
          <Text style={styles.emptyTitle}>No Video Tasks</Text>
          <Text style={styles.emptyDescription}>No video tasks found in your language.</Text>

          {/* RENKLİ VE MERKEZLENMİŞ BUTON */}
          <TouchableOpacity 
            style={styles.coloredRefreshButton} 
            onPress={() => loadData()}
            activeOpacity={0.8}
          >
            <Ionicons name="refresh" size={20} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.buttonText}>Refresh Tasks</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={videoTasks}
          keyExtractor={(item) => item.id}
          numColumns={4}
          columnWrapperStyle={styles.columnWrapper}
          contentContainerStyle={styles.listContainer}
          renderItem={({ item }) => <VideoTaskCard item={item} onPress={handleClaim} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  breadcrumbRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12, alignItems: 'center' },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  backText: { color: '#94a3b8', fontSize: 14, fontWeight: '600' },
  breadcrumbText: { color: '#4b5563', fontSize: 12 },
  pageHeader: { alignItems: 'center', marginTop: 10, marginBottom: 15 },
  pageTitle: { color: '#ffffff', fontSize: 24, fontWeight: 'bold', letterSpacing: 0.5 },
  listContainer: { paddingHorizontal: 20, paddingBottom: 20 },
  columnWrapper: { justifyContent: 'flex-start', gap: 15, marginBottom: 15 },
  card: { width: CARD_WIDTH, backgroundColor: '#161b22', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#30363d' },
  cardTopImage: { height: 80, backgroundColor: '#1e293b', justifyContent: 'center', alignItems: 'center' },
  iconPill: { width: 50, height: 35, borderRadius: 20, backgroundColor: '#161b22', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#30363d' },
  cardContent: { padding: 10 },
  cardTitle: { color: '#e6edf3', fontSize: 12, fontWeight: '700', marginBottom: 8, height: 34 },
  badgeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  pendingBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#422006', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, gap: 4 },
  pendingText: { color: '#fbbf24', fontSize: 10, fontWeight: 'bold' },
  priceBadge: { backgroundColor: '#064e3b', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  priceText: { color: '#10b981', fontSize: 10, fontWeight: 'bold' },
  startButton: { backgroundColor: '#8b5cf6', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 8, borderRadius: 8, gap: 6 },
  startButtonText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  emptyContainer: {
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center', 
    paddingHorizontal: 20,
    marginTop: -50, 
  },
  emptyIcon: { marginBottom: 20 },
  emptyTitle: { fontSize: 22, fontWeight: 'bold', color: '#f8fafc', marginTop: 20, textAlign: 'center' },
  emptyDescription: { fontSize: 16, color: '#94a3b8', marginTop: 8, textAlign: 'center' },
  coloredRefreshButton: {
    marginTop: 25,
    backgroundColor: '#8b5cf6', 
    paddingVertical: 14,
    paddingHorizontal: 30,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5, 
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  }
});