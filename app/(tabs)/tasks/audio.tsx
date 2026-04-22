import React, { useCallback, useState, useEffect } from 'react';
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
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';

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
  audio_url?: string | null;
  is_pool_task?: boolean;
  assigned_to?: string | null;
};

// --- YEŞİL KART BİLEŞENİ ---
const AudioTaskCard = ({ item, onPress }: { item: Task; onPress: (id: string) => void }) => (
  <TouchableOpacity onPress={() => onPress(item.id)} style={styles.card} activeOpacity={0.8}>
    <View style={styles.cardTopImage}>
      <View style={styles.iconPill}>
        <Ionicons name="mic" size={24} color="#22c55e" />
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

export default function AudioTasksScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  
  const [audioTasks, setAudioTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    let isMounted = true;

    try {
      setLoading(true);

      // 1. Session'ý DOĞRUDAN Supabase'den al
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id;

      console.log('=== AUDIO-TASKS SESSION ===', { session: !!session, uid });

      if (!uid) {
        if (isMounted) setLoading(false);
        return;
      }

      // 2. Kullanıcının dillerini doğrudan Supabase'den al
      const { data: profile } = await supabase
        .from('profiles')
        .select('languages')
        .eq('id', uid)
        .single();
        
      const userLangs = profile?.languages || [];
      console.log('=== AUDIO-TASKS USER LANGS ===', userLangs);

      // 3. Tabloyu sorgula (audio kategorisine göre)
      const cols = 'id, title, status, price, language, category, type, audio_url, is_pool_task, assigned_to';
      
      const { data: assignedData } = await supabase
        .from('tasks')
        .select(cols)
        .eq('assigned_to', uid)
        .eq('status', 'pending')
        .or('category.eq.audio,type.eq.audio');

      const { data: poolData } = await supabase
        .from('tasks')
        .select(cols)
        .is('assigned_to', null)
        .eq('status', 'pending')
        .or('category.eq.audio,type.eq.audio');

      console.log('=== AUDIO-TASKS ASSIGNED DATA ===', assignedData);
      console.log('=== AUDIO-TASKS POOL DATA ===', poolData);

      if (isMounted) {
        const allTasks = [...(poolData || []), ...(assignedData || [])];
        
        // DEBUG: Dil filtresini geçici olarak kaldır
        console.log('=== AUDIO-TASKS ALL TASKS (NO FILTER) ===', allTasks);
        console.log('=== AUDIO-TASKS TASK LANGUAGES ===', allTasks.map(t => ({ id: t.id, language: t.language })));
        
        // Geçici olarak tüm görevleri göster
        const filteredTasks = allTasks; // Dil filtresi kaldırıldı

        console.log('=== AUDIO-TASKS FILTERED TASKS ===', filteredTasks);

        setAudioTasks(filteredTasks);
        setLoading(false);
      }
    } catch (error) {
      console.error('=== AUDIO-TASKS ERROR ===', error);
      if (isMounted) setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchTasks();
    }, [fetchTasks])
  );

  const handleClaim = async (taskId: string) => {
    // Direkt görev detay sayfasina yönlendir
    router.push(`/tasks/audio/${taskId}`);
  };

  
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.breadcrumbRow}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={16} color="#94a3b8" />
            <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.breadcrumbText}>Tasks {'>'} Audio</Text>
      </View>

      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>{t('tasks.pageTitleTranscription') || 'Audio Annotation Tasks'}</Text>
        {/* Artık burada buton yok, sadece başlık var */}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#22c55e" style={{ flex: 1 }} />
      ) : audioTasks.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="mic-outline" size={80} color="#475569" style={styles.emptyIcon} />
          <Text style={styles.emptyTitle}>No Audio Tasks</Text>
          <Text style={styles.emptyDescription}>No audio tasks found in your language.</Text>

          {/* RENKLİ VE MERKEZLENMİŞ BUTON */}
          <TouchableOpacity 
            style={styles.coloredRefreshButton} 
            onPress={() => fetchTasks()}
            activeOpacity={0.8}
          >
            <Ionicons name="refresh" size={20} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.buttonText}>Refresh Tasks</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={audioTasks}
          keyExtractor={(item) => item.id}
          numColumns={4}
          columnWrapperStyle={styles.columnWrapper}
          contentContainerStyle={styles.listContainer}
          renderItem={({ item }) => <AudioTaskCard item={item} onPress={handleClaim} />}
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
  startButton: { backgroundColor: '#22c55e', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 8, borderRadius: 8, gap: 6 },
  startButtonText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  emptyContainer: {
    flex: 1, // Ekranın tüm boş alanını kaplar
    justifyContent: 'center', // Dikeyde tam ortalar
    alignItems: 'center', // Yatayda tam ortalar
    paddingHorizontal: 20,
    marginTop: -50, // Header'ın açığını dengelemek için hafif yukarı kaydırabilirsin
  },
  emptyIcon: { marginBottom: 20 },
  emptyTitle: { fontSize: 22, fontWeight: 'bold', color: '#f8fafc', marginTop: 20, textAlign: 'center' },
  emptyDescription: { fontSize: 16, color: '#94a3b8', marginTop: 8, textAlign: 'center' },
  coloredRefreshButton: {
    marginTop: 25,
    backgroundColor: '#3b82f6', // Audio için Mavi
    paddingVertical: 14,
    paddingHorizontal: 30,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5, // Android için gölge
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  }
});