import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  SafeAreaView,
  Dimensions,
} from 'react-native';
import { useRouter, useRootNavigationState } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

const { width } = Dimensions.get('window');
// Kartlar enini daraltmak için bosluk payn artrdk (64'ten 100'e çkardk)
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
};

const VideoTaskCard = ({ item, onPress }: { item: Task, onPress: (id: string) => void }) => (
  <TouchableOpacity 
    onPress={() => onPress(item.id)}
    style={styles.card}
    activeOpacity={0.8}
  >
    <View style={styles.cardTopImage}>
      <View style={styles.iconPill}>
        <Ionicons name="videocam" size={24} color="#8b5cf6" />
      </View>
    </View>
    
    <View style={styles.cardContent}>
      <Text style={styles.cardTitle} numberOfLines={2}>
        {item.title}
      </Text>
      
      <View style={styles.badgeRow}>
        <View style={styles.pendingBadge}>
          <Ionicons name="time" size={10} color="#fbbf24" />
          <Text style={styles.pendingText}>Pending</Text>
        </View>
        <View style={styles.priceBadge}>
          <Text style={styles.priceText}>${item.price ?? 0}</Text>
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
  const { t } = useTranslation();
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const { user, session } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const userId = user?.id ?? session?.user?.id ?? null;
  const navigatorReady = rootNavigationState?.key != null;

  const fetchVideoTasks = useCallback(async (showLoading = true) => {
    if (!userId) return;
    if (showLoading) setLoading(true);
    
    try {
      const cols = 'id, title, status, price, language, category, type, video_url';
      const { data: poolData } = await supabase.from('tasks').select(cols).is('assigned_to', null).eq('status', 'pending').or('category.eq.video,type.eq.video').order('created_at', { ascending: false });
      const { data: assignedData } = await supabase.from('tasks').select(cols).eq('assigned_to', userId).eq('status', 'pending').or('category.eq.video,type.eq.video').order('created_at', { ascending: false });
      setTasks([...(poolData || []), ...(assignedData || [])]);
    } catch (error) {
      console.error('Fetch error:', error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useFocusEffect(useCallback(() => { 
    if (userId && navigatorReady) fetchVideoTasks(false); 
  }, [userId, navigatorReady]));

  const handleTaskPress = async (taskId: string) => {
    if (!userId) return;
    const { error } = await supabase.from('tasks').update({ assigned_to: userId }).eq('id', taskId);
    if (!error) router.push(`/task/${taskId}`);
  };

  if (!user || !session) return null;

  return (
    <SafeAreaView style={styles.container}>
      {/* Çift Navbar (kinci Deep Studio yazs) buradan tamamen kaldrlld */}

      {/* Breadcrumb Alan */}
      <View style={styles.breadcrumbRow}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={16} color="#94a3b8" />
          <Text style={styles.backText}>Back</Text> {/* Tasks yazs Back olarak deitirildi */}
        </TouchableOpacity>
        <Text style={styles.breadcrumbText}>Tasks {'>'} Video</Text>
      </View>

      {/* Sayfa Basl - Ekran Ortalama */}
      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>Video Annotation Tasks</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#8b5cf6" style={{ flex: 1 }} />
      ) : (
        <FlatList
          data={tasks}
          keyExtractor={(item) => item.id}
          numColumns={4}
          columnWrapperStyle={styles.columnWrapper}
          contentContainerStyle={styles.listContainer}
          renderItem={({ item }) => <VideoTaskCard item={item} onPress={handleTaskPress} />}
          ListEmptyComponent={<Text style={styles.emptyText}>No video tasks found.</Text>}
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
  pageHeader: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 5,
  },
  pageTitle: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
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
  emptyText: { color: '#94a3b8', textAlign: 'center', marginTop: 50 }
});
