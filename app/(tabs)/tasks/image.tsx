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
  Platform,
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
  image_url?: string | null;
  is_pool_task?: boolean;
  assigned_to?: string | null;
};

// --- PEMBE KART BİLEŞENİ (dışarısı View: iç içe Touchable ile web'de çift tıklama sorunu olmasın) ---
const ImageTaskCard = ({ item, onPress }: { item: Task; onPress: (id: string) => void }) => (
  <View style={styles.card}>
    <View style={styles.cardTopImage}>
      <View style={styles.iconPill}>
        <Ionicons name="image" size={24} color="#ec4899" />
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
  </View>
);

export default function ImageTasksScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  
  const [imageTasks, setImageTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    let isMounted = true;

    try {
      setLoading(true);

      // 1. Session'ý DOÐRUDAN Supabase'den al
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id;

      console.log('=== IMAGE-TASKS SESSION ===', { session: !!session, uid });

      if (!uid) {
        if (isMounted) setLoading(false);
        return;
      }

      // 2. Kullanýcýnýn dillerini doðrudan Supabase'den al
      const { data: profile } = await supabase
        .from('profiles')
        .select('languages')
        .eq('id', uid)
        .single();
        
      const userLangs = profile?.languages || [];
      console.log('=== IMAGE-TASKS USER LANGS ===', userLangs);

      // 3. Tabloyu sorgula (image kategorisine göre)
      const cols = 'id, title, status, price, language, category, type, image_url, is_pool_task, assigned_to';
      
      const { data: assignedData } = await supabase
        .from('tasks')
        .select(cols)
        .eq('assigned_to', uid)
        .eq('status', 'pending')
        .or('category.eq.image,type.eq.image');

      const { data: poolData } = await supabase
        .from('tasks')
        .select(cols)
        .is('assigned_to', null)
        .eq('status', 'pending')
        .or('category.eq.image,type.eq.image');

      console.log('=== IMAGE-TASKS ASSIGNED DATA ===', assignedData);
      console.log('=== IMAGE-TASKS POOL DATA ===', poolData);

      if (isMounted) {
        const allTasks = [...(poolData || []), ...(assignedData || [])];
        
        // DEBUG: Dil filtresini geçici olarak kaldýr
        console.log('=== IMAGE-TASKS ALL TASKS (NO FILTER) ===', allTasks);
        console.log('=== IMAGE-TASKS TASK LANGUAGES ===', allTasks.map(t => ({ id: t.id, language: t.language })));
        
        // Geçici olarak tüm görevleri göster
        const filteredTasks = allTasks; // Dil filtresi kaldýrýldý

        console.log('=== IMAGE-TASKS FILTERED TASKS ===', filteredTasks);

        setImageTasks(filteredTasks);
        setLoading(false);
      }
    } catch (error) {
      console.error('=== IMAGE-TASKS ERROR ===', error);
      if (isMounted) setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchTasks();
    }, [fetchTasks])
  );

  const openTaskWorkbench = useCallback(
    (taskId: string) => {
      router.push(`/(tabs)/task/${taskId}` as const);
    },
    [router]
  );

  const handleClaim = async (taskId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id;
      if (!uid) return;

      const fromList = imageTasks.find((t) => t.id === taskId);
      if (fromList?.assigned_to === uid) {
        openTaskWorkbench(taskId);
        return;
      }

      const { data, error } = await supabase
        .from('tasks')
        .update({ assigned_to: uid })
        .eq('id', taskId)
        .is('assigned_to', null)
        .select('id');

      if (error) {
        console.error('[tasks/image] claim error', error);
        if (Platform.OS === 'web') window.alert('Görev alınamadı: ' + error.message);
        else Alert.alert('Uyarı', 'Görev alınamadı.');
        return;
      }

      if (data && data.length > 0) {
        openTaskWorkbench(taskId);
        return;
      }

      const { data: row } = await supabase
        .from('tasks')
        .select('assigned_to')
        .eq('id', taskId)
        .maybeSingle();

      if (row?.assigned_to === uid) {
        openTaskWorkbench(taskId);
        return;
      }

      const msg =
        'Bu görev havuzda değil veya başka bir annotatöre atanmış olabilir. Listeyi yenileyip tekrar deneyin.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Uyarı', msg);
    } catch (error) {
      console.error('Claim error:', error);
      if (Platform.OS === 'web') window.alert('Görev açılırken hata oluştu.');
      else Alert.alert('Hata', 'Görev alınırken bir hata oluştu.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.breadcrumbRow}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={16} color="#94a3b8" />
            <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.breadcrumbText}>Tasks {'>'} Image</Text>
      </View>

      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>{t('tasks.pageTitleImage') || 'Image Annotation Tasks'}</Text>
        {/* Artık burada buton yok, sadece başlık var */}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#ec4899" style={{ flex: 1 }} />
      ) : imageTasks.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="image-outline" size={80} color="#475569" style={styles.emptyIcon} />
          <Text style={styles.emptyTitle}>No Image Tasks</Text>
          <Text style={styles.emptyDescription}>No image tasks found in your language.</Text>

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
          data={imageTasks}
          keyExtractor={(item) => item.id}
          numColumns={4}
          columnWrapperStyle={styles.columnWrapper}
          contentContainerStyle={styles.listContainer}
          renderItem={({ item }) => <ImageTaskCard item={item} onPress={handleClaim} />}
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
  priceBadge: { backgroundColor: '#831843', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  priceText: { color: '#ec4899', fontSize: 10, fontWeight: 'bold' },
  startButton: { backgroundColor: '#ec4899', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 8, borderRadius: 8, gap: 6 },
  startButtonText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  emptyContainer: {
    flex: 1, // Ekranın tüm boş alanını kaplar
    justifyContent: 'center', // Dikeyde tam ortalar
    alignItems: 'center', // Yatayda tam ortalar
    paddingHorizontal: 20,
    marginTop: -50, // Header'ın above'ini dengelemek için hafif yukarı kaydırabilirsin
  },
  emptyIcon: { marginBottom: 20 },
  emptyTitle: { fontSize: 22, fontWeight: 'bold', color: '#f8fafc', marginTop: 20, textAlign: 'center' },
  emptyDescription: { fontSize: 16, color: '#94a3b8', marginTop: 8, textAlign: 'center' },
  coloredRefreshButton: {
    marginTop: 25,
    backgroundColor: '#ff69b4', // Image için Pembe
    paddingVertical: 14,
    paddingHorizontal: 30,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#ff69b4',
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