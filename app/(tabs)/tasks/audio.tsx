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

  // KRITIK: VERI CEKME TAMAMEN DONDURULDU - BROWSER CRASH'INI ENGELLE
// useFocusEffect(
//   useCallback(() => {
//     let isMounted = true;

//     const fetchTasks = async () => {
//       try {
//         setLoading(true);

//         // 1. Session'ý AuthContext'ten deðil, DOÐRUDAN Supabase'den al
//         const { data: { session } } = await supabase.auth.getSession();
//         const uid = session?.user?.id;

//         if (!uid) {
//           if (isMounted) setLoading(false);
//           return;
//         }

//         // 2. Kullanýcýnýn dillerini doðrudan Supabase'den al (Çünkü useAuth sildik)
//         const { data: profile } = await supabase
//           .from('profiles')
//           .select('languages')
//           .eq('id', uid)
//           .single();
            
//         const userLangs = profile?.languages || [];

//         // 3. Tabloyu sorgula (audio kategorisine göre)
//         const cols = 'id, title, status, price, language, category, type, audio_url, is_pool_task, assigned_to';
          
//         const { data: assignedData } = await supabase
//           .from('tasks')
//           .select(cols)
//           .eq('assigned_to', uid)
//           .eq('status', 'pending')
//           .or('category.eq.audio,type.eq.audio')
//           .order('created_at', { ascending: false });
            
//         const { data: poolData } = await supabase
//           .from('tasks')
//           .select(cols)
//           .is('assigned_to', null)
//           .eq('status', 'pending')
//           .or('category.eq.audio,type.eq.audio')
//           .order('created_at', { ascending: false });

//         if (isMounted) {
//           const allTasks = [...(poolData || []), ...(assignedData || [])];
//           const filteredTasks = allTasks.filter(task => userLangs.includes(task.language));
//           setAudioTasks(filteredTasks);
//           setLoading(false);
//         }
//       } catch (error) {
//         console.error(error);
//         if (isMounted) setLoading(false);
//       }
//     };

//     fetchTasks();

//     return () => {
//       isMounted = false;
//     };
//   }, []) // <--- EN KRÝTÝK NOKTA: BURASI KESÝNLÝKLE BOÞ DÝZÝ OLACAK. ÝÇÝNE HÝÇBÝR DEÐÝÞKEN YAZMA.
// );

// GEÇICI: Loading'i false yap ki statik tasarim görünsün
useEffect(() => {
  setLoading(false);
}, []);

  const handleClaim = async (taskId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return;
      
      const { data, error } = await supabase
        .from('tasks')
        .update({ assigned_to: session.user.id })
        .eq('id', taskId)
        .is('assigned_to', null)
        .select();

      if (!error && data && data.length > 0) {
         router.push(`/task/${taskId}`);
      } else {
         Alert.alert('Uyarý', 'Bu görev alýnamadý veya baþkasý tarafýndan alýndý.');
      }
    } catch (error) {
      console.error('Claim error:', error);
      Alert.alert('Hata', 'Görev alýnýrken bir hata oluþtu.');
    }
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
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#22c55e" style={{ flex: 1 }} />
      ) : audioTasks.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="mic-outline" size={80} color="#475569" style={styles.emptyIcon} />
          <Text style={styles.emptyTitle}>No Audio Tasks</Text>
          <Text style={styles.emptyDescription}>Kendi dilinizde ses görevi bulunamadı.</Text>
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
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyIcon: { marginBottom: 20 },
  emptyTitle: { fontSize: 22, fontWeight: 'bold', color: '#f8fafc', marginTop: 20, textAlign: 'center' },
  emptyDescription: { fontSize: 16, color: '#94a3b8', marginTop: 8, textAlign: 'center' }
});