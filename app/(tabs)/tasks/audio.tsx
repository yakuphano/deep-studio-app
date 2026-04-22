import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  SafeAreaView,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { TaskListCard } from '@/components/tasks/TaskListCard';

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

function getLanguageLabel(code: string) {
  const languages: { [key: string]: string } = {
    tr: 'Türkçe',
    en: 'İngilizce',
    de: 'Almanca',
    fr: 'Fransızca',
    es: 'İspanyolca',
    it: 'İtalyanca',
  };
  return languages[code] || code;
}

export default function AudioTasksScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const numColumns = width >= 1200 ? 4 : width >= 900 ? 3 : width >= 600 ? 2 : 1;
  
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
          numColumns={numColumns}
          key={numColumns}
          columnWrapperStyle={numColumns > 1 ? styles.columnWrapper : undefined}
          contentContainerStyle={styles.listContainer}
          renderItem={({ item }) => (
            <TaskListCard
              title={`${t('tasks.taskListHeadingAudio')} - ${item.title}`}
              status={item.status}
              price={item.price}
              accent="#22c55e"
              icon="mic"
              subtitle={getLanguageLabel(item.language)}
              ctaLabel={t('tasks.startTask')}
              style={styles.cardSlot}
              onPress={() => handleClaim(item.id)}
            />
          )}
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
  columnWrapper: { justifyContent: 'flex-start', gap: 10, marginBottom: 10 },
  cardSlot: { flex: 1, maxWidth: 220, minWidth: 0 },
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