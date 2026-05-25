import React, { useMemo, useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  useWindowDimensions,
  Pressable,
  Alert,
} from 'react-native';
import { useRouter, useRootNavigationState, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import GuidelineOpenButton from '@/components/task/GuidelineOpenButton';
import type { AppColors } from '@/theme/palettes';
import { useThemeColors } from '@/contexts/ThemeContext';
type TaskType = 'transcription' | 'image';

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
  guideline_url?: string | null;
  guideline_file_name?: string | null;
};

function ImageTaskCard({
  item,
  onPress,
  t,
  styles,
}: {
  item: Task;
  onPress: (id: string) => void;
  t: (k: string) => string;
  styles: ReturnType<typeof createStyles>;
}) {
  const themeColors = useThemeColors();
  const isCompleted = item.status === 'completed' || item.status === 'submitted';

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
        <View style={styles.cardMeta}>
          <Text style={styles.cardPrice}>
            {item.price ? `₺${item.price}` : t('tasks.free')}
          </Text>
          <Text style={styles.cardLang}>{getLanguageLabel(item.language, t)}</Text>
        </View>
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardDescription} numberOfLines={3}>
          {item.title}
        </Text>
      </View>
      <GuidelineOpenButton
        variant="card"
        guidelineUrl={item.guideline_url}
        guidelineFileName={item.guideline_file_name}
      />
      <TouchableOpacity style={styles.detailBtn} onPress={() => onPress(item.id)}>
        <Ionicons name="arrow-forward" size={14} color={themeColors.accent} />
        <Text style={styles.detailBtnText}>{t('tasks.viewDetails')}</Text>
      </TouchableOpacity>
    </View>
  );
}

function getLanguageLabel(code: string, t: (k: string) => string) {
  const key = `languages.${code}`;
  const label = t(key);
  return label !== key ? label : code;
}

export default function ImageTasksScreen() {
  const themeColors = useThemeColors();
  const styles = useMemo(() => createStyles(themeColors), [themeColors]);

  const { t } = useTranslation();
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const params = useLocalSearchParams<{ type?: string }>();
  const taskType = (params.type === 'image' ? 'image' : params.type || null) as TaskType | null;

  const { user, session } = useAuth();
  const [imageTasks, setImageTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const { width } = useWindowDimensions();
  const numColumns = width >= 900 ? 3 : width >= 600 ? 2 : 1;

  const userId = user?.id ?? session?.user?.id ?? null;
  const navigatorReady = rootNavigationState?.key != null;

  // Debug log before return
  console.log('Rendering image tasks:', { imageTasks, loading, taskType, user, session });

  // Render protection
  if (!user || !session) return <View><Text>Yükleniyor...</Text></View>;

  const fetchImageTasks = useCallback(async (showLoading = true) => {
    if (!userId) {
      console.log('[image-tasks] fetchImageTasks atlandı: userId yok');
      return;
    }
    if (showLoading) setLoading(true);
    try {
      const cols =
        'id, title, status, price, language, category, type, audio_url, image_url, transcription, is_pool_task, assigned_to, guideline_url, guideline_file_name';
      
      // My Tasks - assigned to current user (image only)
      const { data: assignedData, error: assignedErr } = await supabase
        .from('tasks')
        .select(cols)
        .eq('assigned_to', userId)
        .eq('status', 'pending')
        .or('category.eq.image,type.eq.image,image_url.not.is.null')
        .order('created_at', { ascending: false });
      if (assignedErr) console.error('[image-tasks] assignedData sorgu hatası:', assignedErr);
      console.log('[image-tasks] DEBUG: assignedData count:', assignedData?.length);
      const assigned = assignedData ?? [];

      // Pool Tasks - available for claiming (image only)
      const { data: poolData, error: poolErr } = await supabase
        .from('tasks')
        .select(cols)
        .eq('is_pool_task', true)
        .is('assigned_to', null)
        .eq('status', 'pending')
        .or('category.eq.image,type.eq.image,image_url.not.is.null')
        .order('created_at', { ascending: false });
      if (poolErr) console.error('[image-tasks] poolData sorgu hatası:', poolErr);
      console.log('[image-tasks] DEBUG: poolData count:', poolData?.length);
      const pool = poolData ?? [];

      const allImageTasks = [...pool, ...assigned];
      console.log('[image-tasks] DEBUG: final imageTasks count:', allImageTasks.length);
      
      // DİL BAZLI FİLTRELEME
      const filteredTasks = allImageTasks.filter(task => 
        (user as any)?.languages?.includes(task.language) || false
      );
      
      setImageTasks(filteredTasks);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!navigatorReady) return;
    if (!user || !session) {
      try {
        router.replace('/');
      } catch (_) {}
      return;
    }
    fetchImageTasks(true);
  }, [navigatorReady, userId, session]);

  useFocusEffect(
    useCallback(() => {
      if (userId && navigatorReady) fetchImageTasks(false);
    }, [userId, navigatorReady])
  );

  const handleClaim = useCallback(async (taskId: string) => {
    if (!userId) return;
    const claimed = imageTasks.find((t) => t.id === taskId);
    const { error } = await supabase
      .from('tasks')
      .update({ assigned_to: userId })
      .eq('id', taskId)
      .single();
    if (error) {
      console.error('[image-tasks] Görev alma hatası:', error);
      if (typeof window !== 'undefined') {
        window.alert('Görev alınamadı: ' + error.message);
      } else {
        Alert.alert('Hata', 'Görev alınamadı');
      }
      return;
    }
    await fetchImageTasks(false);
    router.push(`/task/${taskId}`);
  }, [userId, imageTasks, fetchImageTasks]);

  const getLanguageLabel = (code: string) => {
    const key = `languages.${code}`;
    const label = t(key);
    return label !== key ? label : code;
  };

  return (
    <View style={styles.container}>
      {/* Standart Geri Butonu */}
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={themeColors.accent} />
        </TouchableOpacity>
      </View>

      <Text style={styles.pageTitle}>{t('tasks.pageTitleImage')}</Text>

      {loading ? (
        <ActivityIndicator size="large" color={themeColors.accent} style={{ marginTop: 40 }} />
      ) : imageTasks.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="image-outline" size={80} color={themeColors.textMuted} style={styles.emptyIcon} />
          <Text style={styles.emptyTitle}>No Image Tasks</Text>
          <TouchableOpacity style={styles.coloredRefreshButton} onPress={() => fetchImageTasks(true)} activeOpacity={0.8}>
            <Ionicons name="refresh" size={20} color={themeColors.onAccent} style={{ marginRight: 8 }} />
            <Text style={styles.buttonText}>Refresh Tasks</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={imageTasks}
          renderItem={({ item }) => (
            <ImageTaskCard item={item} onPress={handleClaim} t={t} styles={styles} />
          )}
          keyExtractor={(item) => item.id}
          numColumns={numColumns}
          contentContainerStyle={styles.listContainer}
          columnWrapperStyle={numColumns > 1 ? styles.columnWrapper : undefined}
        />
      )}
    </View>
  );
}

function createStyles(themeColors: AppColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: themeColors.background, padding: 20 },
  headerRow: { marginBottom: 8 },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    padding: 10,
    backgroundColor: themeColors.accentMuted,
    borderWidth: 1,
    borderColor: themeColors.border,
    borderRadius: 10,
    alignSelf: 'flex-start',
    marginLeft: 20,
  },
  pageTitle: { fontSize: 22, fontWeight: '700', color: themeColors.text, marginBottom: 32 },
  listContainer: { gap: 15 },
  columnWrapper: { justifyContent: 'space-between' },
  card: {
    flex: 1,
    margin: 4,
    backgroundColor: themeColors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: themeColors.border,
    padding: 16,
    minHeight: 180,
  },
  cardHeader: { marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: themeColors.text, marginBottom: 8 },
  cardMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardPrice: { fontSize: 14, fontWeight: '700', color: themeColors.accent },
  cardLang: { fontSize: 12, color: themeColors.textMuted, backgroundColor: themeColors.accentMuted, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  cardBody: { flex: 1 },
  cardDescription: { fontSize: 14, color: themeColors.textSecondary, lineHeight: 20 },
  detailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: themeColors.accentMuted,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  detailBtnText: {
    fontSize: 13,
    color: themeColors.accent,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: themeColors.text,
    marginTop: 20,
    textAlign: 'center',
  },
  coloredRefreshButton: {
    marginTop: 25,
    backgroundColor: themeColors.accent,
    paddingVertical: 14,
    paddingHorizontal: 30,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: themeColors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 5,
  },
  buttonText: {
    color: themeColors.onAccent,
    fontWeight: '700',
    fontSize: 16,
  },
});
}
