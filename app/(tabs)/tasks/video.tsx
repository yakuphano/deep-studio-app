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
  video_url?: string | null;
  is_pool_task?: boolean;
  assigned_to?: string | null;
};

// --- MOR KART BİLEŞENİ ---
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
  console.log('=== NUCLEAR TEST - VIDEO DOSYASI CALISIYOR ===');
  
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: 'red', justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ color: 'white', fontSize: 30 }}>VIDEO DOSYASI CALISIYOR!</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' }, 
  breadcrumbRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12, alignItems: 'center' },
  backText: { color: '#94a3b8', fontSize: 14, fontWeight: '600' },
  refreshButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#8b5cf6', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, marginLeft: 10 },
  refreshButtonText: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
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
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyIcon: { marginBottom: 20 },
  emptyTitle: { fontSize: 22, fontWeight: 'bold', color: '#f8fafc', marginTop: 20, textAlign: 'center' },
  emptyDescription: { fontSize: 16, color: '#94a3b8', marginTop: 8, textAlign: 'center' }
});