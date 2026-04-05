import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
  KeyboardAvoidingView,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useRootNavigationState } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import JSZip from 'jszip';
import { supabase } from '@/lib/supabase';
import { transcribeWithGroq } from '@/lib/groq';
import { useAuth } from '@/contexts/AuthContext';
import { TASK_LANGUAGES, DEFAULT_LANGUAGE, type TaskLanguageCode } from '@/constants/taskLanguages';
import { ANNOTATION_LABELS } from '@/constants/annotationLabels';
import { toYOLO, toCOCO, toPascalVOC } from '@/lib/annotationExports';
import type { Annotation } from '@/components/AnnotationCanvas';

type User = { id: string; email?: string; full_name?: string; role?: string; is_active?: boolean; languages_expertise?: string[] };

const ADMIN_EMAIL = 'yakup.hano@deepannotation.ai';

async function getBlobDuration(blob: Blob): Promise<number | null> {
  if (typeof window === 'undefined') return null;
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const audio = new (window as any).Audio(url);
    const cleanup = () => {
      URL.revokeObjectURL(url);
      audio.src = '';
    };
    audio.onloadedmetadata = () => {
      const d = audio.duration;
      cleanup();
      resolve(Number.isFinite(d) ? Math.round(d * 10) / 10 : null);
    };
    audio.onerror = () => {
      cleanup();
      resolve(null);
    };
    audio.load();
  });
}

// Video dosyasını Supabase videos bucket'ına yükleyen fonksiyon
async function uploadVideoToSupabase(videoUrl: string): Promise<string | null> {
  try {
    // Video URL'den video dosyasını indir
    const response = await fetch(videoUrl);
    if (!response.ok) {
      throw new Error('Video indirilemedi');
    }
    
    const blob = await response.blob();
    const fileName = `video_${Date.now()}.mp4`;
    const filePath = `videos/${fileName}`;
    
    // Supabase storage'a yükle
    const { data, error } = await supabase.storage
      .from('videos')
      .upload(filePath, blob, {
        contentType: 'video/mp4',
        upsert: true
      });
    
    if (error) {
      throw new Error('Video yüklenemedi: ' + error.message);
    }
    
    // Public URL oluştur
    const { data: { publicUrl } } = supabase.storage
      .from('videos')
      .getPublicUrl(filePath);
    
    return publicUrl;
  } catch (error) {
    console.error('Video upload error:', error);
    return null;
  }
}

// Video dosyasını (DocumentPicker asset) Supabase videos bucket'ına yükleyen fonksiyon
async function uploadVideoFileToSupabase(file: DocumentPicker.DocumentPickerAsset): Promise<string | null> {
  try {
    if (!file.uri) {
      throw new Error('Dosya URI bulunamadı');
    }
    
    // Dosya boyutunu kontrol et (max 50MB)
    if (file.size && file.size > 50 * 1024 * 1024) {
      throw new Error('Dosya boyutu çok büyük. Maksimum 50MB olabilir.');
    }
    
    console.log('Uploading video file:', file.name, 'Size:', file.size, 'Type:', file.mimeType);
    
    // Web uyumlu veri okuma
    const response = await fetch(file.uri);
    if (!response.ok) {
      throw new Error('Dosya okunamadı: ' + response.statusText);
    }
    const arrayBuffer = await response.arrayBuffer();
    
    // Temiz dosya adı oluştur
    const fileName = `${Date.now()}.mp4`;
    
    console.log('Uploading to path:', fileName, 'ArrayBuffer size:', arrayBuffer.byteLength);
    
    // Supabase storage'a yükle (yol düzeltmesi)
    const { data, error } = await supabase.storage
      .from('videos')
      .upload(fileName, arrayBuffer, {
        contentType: file.mimeType || 'video/mp4',
        upsert: true
      });
    
    if (error) {
      console.error('Supabase upload error:', error);
      throw new Error('Video yüklenemedi: ' + error.message);
    }
    
    console.log('Upload successful:', data);
    
    // Public URL oluştur
    const { data: { publicUrl } } = supabase.storage
      .from('videos')
      .getPublicUrl(fileName);
    
    console.log('Public URL:', publicUrl);
    return publicUrl;
  } catch (error) {
    console.error('DETAYLI HATA:', (error as Error).message, error);
    return null;
  }
}

const CARD_STYLE = {
  backgroundColor: 'rgba(255,255,255,0.08)',
  borderRadius: 12,
  padding: 12,
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.12)',
};

function ActionCard({
  icon,
  iconColor,
  label,
  onPress,
}: { icon: keyof typeof Ionicons.glyphMap; iconColor: string; label: string; onPress: () => void }) {
  const [hovered, setHovered] = useState(false);
  const isWeb = Platform.OS === 'web';
  const card = (
    <View style={[styles.actionCard, CARD_STYLE, hovered && isWeb && styles.actionCardHover]}>
      <Ionicons name={icon} size={24} color={iconColor} style={styles.actionCardIcon} />
      <Text style={styles.actionCardLabel}>{label}</Text>
    </View>
  );
  return (
    <TouchableOpacity
      style={styles.actionCardTouch}
      onPress={onPress}
      activeOpacity={1}
      onMouseEnter={isWeb ? () => setHovered(true) : undefined}
      onMouseLeave={isWeb ? () => setHovered(false) : undefined}
    >
      {card}
    </TouchableOpacity>
  );
}

export default function AdminPanelScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const { user, isAdmin } = useAuth();

  const [title, setTitle] = useState('');
  const [taskPrice, setTaskPrice] = useState('10');
  const [clientName, setClientName] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState<TaskLanguageCode>(DEFAULT_LANGUAGE);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [audioStatus, setAudioStatus] = useState('');
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [pickedBlob, setPickedBlob] = useState<Blob | null>(null);
  const [pickedFileName, setPickedFileName] = useState<string | null>(null);
  const [pickedMimeType, setPickedMimeType] = useState<string | null>(null);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskType, setTaskType] = useState<'audio' | 'image' | 'video'>('audio');
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [imageUploading, setImageUploading] = useState(false);
  const uploadedUrlRef = useRef<string>('');
  const [videoFiles, setVideoFiles] = useState<DocumentPicker.DocumentPickerAsset[]>([]);
  const [recentTasks, setRecentTasks] = useState<Array<{ id: string; title: string; category?: string | null; image_url?: string | null; type?: string }>>([]);
  const [selectedTaskCategory, setSelectedTaskCategory] = useState<'all' | 'video' | 'audio' | 'image'>('all');
  const [userEarnings, setUserEarnings] = useState<Record<string, number>>({});
  const [annotatorSearchQuery, setAnnotatorSearchQuery] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const blinkAnim = useRef(new Animated.Value(1)).current;
  const [exportLang, setExportLang] = useState<string>('all');
  const [exportClient, setExportClient] = useState<string>('all');
  const [exportTaskType, setExportTaskType] = useState<'audio' | 'image' | 'video'>('audio');
  const [exportFormat, setExportFormat] = useState<'json' | 'yolo' | 'coco' | 'pascalvoc'>('json');
  const [clientNames, setClientNames] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);

  // Simplified state for admin panel
  const [multipleFiles, setMultipleFiles] = useState<DocumentPicker.DocumentPickerResult['assets']>([]);
  const [audioMultipleFiles, setAudioMultipleFiles] = useState<DocumentPicker.DocumentPickerResult['assets']>([]);
  const [queueProcessing, setQueueProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [uploadStatus, setUploadStatus] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);

  // Dashboard stats state
  const [dashboardStats, setDashboardStats] = useState({
    totalUsers: 0,
    activeTasks: 0,
    activeTasksTypeBreakdown: {} as Record<string, number>,
    pendingPayments: 0,
    monthlyRevenue: 0,
    completionRate: 0,
    completedTasks: 0,
  });
  const [statsLoading, setStatsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCompletedTasks, setShowCompletedTasks] = useState(false);
  const [completedTasksList, setCompletedTasksList] = useState<Array<{ id: string; title: string; type: string; category: string; status: string; updated_at: string }>>([]);

  const navigatorReady = rootNavigationState?.key != null;

  // Fetch dashboard stats from Supabase
  const fetchDashboardStats = useCallback(async () => {
    if (!isAdmin) return;
    
    try {
      setStatsLoading(true);
      setRefreshing(true);
      
      // 1. Total Users - count profiles
      const { count: totalUsers } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });
      
      // Debug: Check all tasks and their statuses
      const { data: allTasksDebug } = await supabase
        .from('tasks')
        .select('id, title, type, category, status, created_at, updated_at')
        .order('created_at', { ascending: false });
      
      console.log('🔍 ALL TASKS DEBUG - Total Count:', allTasksDebug?.length || 0);
      if (allTasksDebug && allTasksDebug.length > 0) {
        const statusCounts = allTasksDebug.reduce((acc, task) => {
          acc[task.status || 'unknown'] = (acc[task.status || 'unknown'] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        
        const typeCounts = allTasksDebug.reduce((acc, task) => {
          const type = task.type || task.category || 'unknown';
          acc[type] = (acc[type] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        
        console.log('🔍 Status Breakdown:', statusCounts);
        console.log('🔍 Type Breakdown:', typeCounts);
        console.log('🔍 All Tasks List:');
        allTasksDebug.forEach((task, index) => {
          console.log(`  ${index + 1}. ID: ${task.id}, Type: ${task.type || task.category || 'unknown'}, Status: ${task.status}, Title: ${task.title || 'no title'}`);
        });
      }
      
      // 2. Active Tasks - count tasks where status is exactly 'pending' (exclude deleted/archived)
      const { data: activeTasksData, count: activeTasks } = await supabase
        .from('tasks')
        .select('id, title, type, category, status, created_at, updated_at', { count: 'exact' })
        .eq('status', 'pending')
        .eq('is_pool_task', true)  // Only count pool tasks (exclude deleted/archived)
        .order('created_at', { ascending: false });
      
      // Calculate task type breakdown for active tasks
      const activeTasksTypeBreakdown = activeTasksData?.reduce((acc, task) => {
        const type = task.type || task.category || 'unknown';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>) || {};
      
      // Debug: Log the active tasks being counted
      console.log('🔍 Active Tasks Debug - Count:', activeTasks);
      console.log('🔍 Active Tasks Type Breakdown:', activeTasksTypeBreakdown);
      console.log('🔍 Active Tasks Debug - Data:', activeTasksData);
      if (activeTasksData && activeTasksData.length > 0) {
        console.log('🔍 Active Tasks List:');
        activeTasksData.forEach((task, index) => {
          console.log(`  ${index + 1}. ID: ${task.id}, Type: ${task.type || task.category || 'unknown'}, Status: ${task.status}, Title: ${task.title || 'no title'}`);
        });
      } else {
        console.log('🔍 No active tasks found');
      }
      
      // 3. Pending Payments - count pending payout requests (assuming there's a payouts table)
      let pendingPayments = 0;
      try {
        const { count: paymentsCount } = await supabase
          .from('payout_requests')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending');
        pendingPayments = paymentsCount || 0;
      } catch (e) {
        // If payouts table doesn't exist, set to 0
        pendingPayments = 0;
      }
      
      // 4. Monthly Revenue (Ciro) - sum price of tasks where status is 'submitted' or 'completed' in current month
      const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM format
      const { data: completedTasks } = await supabase
        .from('tasks')
        .select('price')
        .in('status', '["completed","submitted"]')
        .eq('is_pool_task', true)  // Only count pool tasks
        .gte('updated_at', `${currentMonth}-01`)
        .lt('updated_at', `${currentMonth}-31`);
      
      const monthlyRevenue = completedTasks?.reduce((sum, task) => sum + (task.price || 0), 0) || 0;
      
      // Debug monthly revenue
      console.log('🔍 Monthly Revenue Debug - Current Month:', currentMonth);
      console.log('🔍 Monthly Revenue Debug - Completed Tasks:', completedTasks?.length || 0);
      console.log('🔍 Monthly Revenue Debug - Revenue:', monthlyRevenue);
      if (completedTasks && completedTasks.length > 0) {
        console.log('🔍 Revenue Task List:');
        completedTasks.forEach((task, index) => {
          console.log(`  ${index + 1}. Price: ${task.price || 0} TL`);
        });
      }
      
      // 5. Completion Rate - (Completed Tasks / Total Tasks) * 100 (only pool tasks)
      const { count: totalTasks } = await supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('is_pool_task', true);  // Only count pool tasks
      
      const { count: completedTasksCount } = await supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .in('status', '["completed","submitted"]')
        .eq('is_pool_task', true);  // Only count pool tasks
      
      const completionRate = totalTasks && totalTasks > 0 
        ? Math.round((completedTasksCount / totalTasks) * 100)
        : 0;
      
      // 6. Completed Tasks - fetch count and list for the modal
      const { data: completedTasksData, count: completedTasksCountForModal } = await supabase
        .from('tasks')
        .select('id, title, type, category, status, updated_at', { count: 'exact' })
        .in('status', '["completed","submitted"]')
        .eq('is_pool_task', true)
        .order('updated_at', { ascending: false });
      
      setCompletedTasksList(completedTasksData || []);
      
      setDashboardStats({
        totalUsers: totalUsers || 0,
        activeTasks: activeTasks || 0,
        activeTasksTypeBreakdown,
        pendingPayments,
        monthlyRevenue,
        completionRate,
        completedTasks: completedTasksCountForModal || 0,
      });
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      // Keep existing stats on error
    } finally {
      setStatsLoading(false);
      setRefreshing(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (navigatorReady && isAdmin) {
      fetchDashboardStats();
    }
  }, [navigatorReady, isAdmin, fetchDashboardStats]);

  const DUMMY_STATS = {
    totalUsers: users.length || 24,
    activeTasks: 12,
    pendingPayments: 5,
    monthlyRevenue: 2840,
  };

  const CHART_DATA = [65, 80, 45, 90, 70, 85, 60];
  const completionPercent = Math.round(CHART_DATA.reduce((a, b) => a + b, 0) / CHART_DATA.length);

  useEffect(() => {
    if (!navigatorReady || user) return;
    router.replace('/');
  }, [navigatorReady, user]);

  useEffect(() => {
    if (navigatorReady && user && !isAdmin) router.replace('/tasks');
  }, [navigatorReady, user, isAdmin]);

  useEffect(() => {
    supabase.from('profiles').select('id, email, full_name, role, languages_expertise, is_active').then(async ({ data }) => {
      const raw = data ?? [];
      for (const r of raw) {
        if (r.email === ADMIN_EMAIL && r.role !== 'admin') {
          await supabase.from('profiles').update({ role: 'admin' }).eq('id', r.id).then(() => {}).catch(() => {});
        }
      }
      const list = raw.map((r) => ({
        id: r.id,
        email: r.email ?? '',
        full_name: r.full_name ?? '',
        role: r.role ?? 'user',
        is_active: r.is_active ?? true,
        languages_expertise: r.languages_expertise ?? [],
      }));
      setUsers(list);
      const ids = list.map((u) => u.id).filter(Boolean);
      if (ids.length > 0) {
        supabase
          .from('tasks')
          .select('assigned_to, price')
          .in('assigned_to', ids)
          .in('status', ['submitted', 'completed'])
          .then(({ data: tasks }) => {
            const map: Record<string, number> = {};
            (tasks ?? []).forEach((t) => {
              const uid = t.assigned_to;
              if (uid) map[uid] = (map[uid] ?? 0) + Number(t.price ?? 0);
            });
            setUserEarnings(map);
          });
      }
    });
  }, []);

  const fetchClientNames = useCallback(async () => {
    const { data } = await supabase.from('tasks').select('client_name');
    const names = [...new Set((data ?? []).map((r) => (r.client_name ?? '').trim()).filter(Boolean))].sort();
    setClientNames(names);
  }, []);

  useEffect(() => {
    fetchClientNames();
  }, [fetchClientNames]);

  const fetchRecentTasks = useCallback(async () => {
    try {
      // FİLTRESİZ SORGU - Tüm görevleri çek, hiçbir where filtresi yok
      const { data, error } = await supabase
        .from('tasks')
        .select('*') // Tüm alanları çek
        .order('created_at', { ascending: false })
        .limit(15);
      
      if (error) {
        console.error('Sorgu Hatası:', error);
        console.error('Hata detayı:', JSON.stringify(error, null, 2));
        return;
      }
      
      // HAM VERİ LOGU - Hiçbir filtreye girmeden önce
      console.log('SUPABASE GELEN HAM VERİ:', data);
      console.log('Ham veri sayısı:', data?.length || 0);
      
      // State güncelleme kontrolü
      console.log('State güncelleniyor mu?');
      setRecentTasks(data ?? []);
      console.log('State güncellendi');
      
      // Veri kontrolü
      if (!data || data.length === 0) {
        console.error('DİKKAT: Veritabanından hiç görev dönmedi!');
      } else {
        console.log('✅ Veri başarıyla geldi, ilk görev:', data[0]);
        console.log('İlk 3 görevin tipleri:', data.slice(0, 3).map(t => ({ id: t.id, title: t.title, type: t.type, status: t.status })));
      }
    } catch (err) {
      console.error('fetchRecentTasks hatası:', err);
    }
  }, []);

  // Filtreleme mantığı
  const filteredTasks = useMemo(() => {
    // Debug log
    console.log('Mevcut Görev Tipleri:', recentTasks.map(t => ({ id: t.id, title: t.title, type: t.type, status: t.status })));
    
    return recentTasks.filter(task => {
      const taskType = task.type?.toLowerCase() || '';
      
      if (selectedTaskCategory === 'all') {
        return true; // Hepsi - hiç filtreleme yok
      } else if (selectedTaskCategory === 'video') {
        return taskType.includes('video');
      } else if (selectedTaskCategory === 'audio') {
        // GARANTİLİ AUDIO FİLTRESİ
        const isAudio = taskType.includes('audio') || 
                       taskType.includes('transcription') || 
                       taskType.includes('ses');
        console.log(`🎵 Audio kontrolü - Task: ${task.title}, Type: "${taskType}", isAudio: ${isAudio}`);
        return isAudio;
      } else if (selectedTaskCategory === 'image') {
        return taskType.includes('image') || taskType.includes('görsel') || taskType.includes('foto');
      }
      return false;
    });
  }, [recentTasks, selectedTaskCategory]);

  const handleDeleteTask = useCallback(async (taskId: string) => {
    const confirmed = window.confirm('Bu görevi silmek istediğinize emin misiniz?');
    if (!confirmed) return;
    
    try {
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', taskId);
      
      if (error) {
        throw error;
      }
      
      // Anlık güncelleme: listeden görevi kaldır
      setRecentTasks(prev => prev.filter(task => task.id !== taskId));
      
      if (typeof window !== 'undefined') {
        window.alert('Görev başarıyla silindi');
      }
    } catch (error) {
      console.error('Delete task error:', error);
      if (typeof window !== 'undefined') {
        window.alert('Görev silinirken hata oluştu: ' + (error as Error).message);
      }
    }
  }, []);

  useEffect(() => {
    console.log('🔄 useEffect tetiklendi - showTaskForm:', showTaskForm);
    if (showTaskForm) {
      console.log('📞 fetchRecentTasks çağrılıyor...');
      fetchRecentTasks();
    }
  }, [showTaskForm, fetchRecentTasks]);

  // Test için component mount edildiğinde veri çek
  useEffect(() => {
    console.log('🚀 Component mount edildi, fetchRecentTasks çağrılıyor...');
    fetchRecentTasks();
  }, [fetchRecentTasks]);

  const parseAnnotations = (data: unknown): Annotation[] => {
    if (Array.isArray(data)) return data as Annotation[];
    if (data && typeof data === 'object' && (data as { annotations?: Annotation[] }).annotations) {
      return (data as { annotations: Annotation[] }).annotations;
    }
    return [];
  };

  const handleExport = useCallback(async () => {
    // Güvenlik: İki katmanlı admin doğrulama (AuthContext isAdmin + profiles.role)
    if (!isAdmin) {
      Alert.alert(t('login.errorTitle'), 'Bu işlem sadece admin yetkisi gerektirir.');
      return;
    }
    const userId = user?.id;
    if (!userId) {
      Alert.alert(t('login.errorTitle'), 'Oturum bulunamadı.');
      return;
    }
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', userId).single();
    if (profile?.role !== 'admin') {
      Alert.alert(t('login.errorTitle'), 'Bu dışa aktarma sadece role === "admin" olan kullanıcılar tarafından yapılabilir.');
      return;
    }
    setExporting(true);
    try {
      const cols = 'id, title, status, price, language, category, audio_url, image_url, transcription, annotation_data, created_at, updated_at, client_name, assigned_to, is_pool_task';
      let query = supabase.from('tasks').select(cols);
      if (exportTaskType === 'audio') {
        query = query.eq('category', 'audio').not('audio_url', 'is', null);
      } else if (exportTaskType === 'image') {
        query = query.eq('category', 'image').not('image_url', 'is', null);
      } else if (exportTaskType === 'video') {
        query = query.eq('category', 'video');
      }
      if (exportLang !== 'all') {
        query = query.eq('language', exportLang);
      }
      if (exportClient !== 'all') {
        query = query.eq('client_name', exportClient);
      }
      const { data: taskList, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;
      const fileName = `export_${exportTaskType}_${exportFormat}_${new Date().toISOString().slice(0, 10)}.json`;
      const jsonStr = JSON.stringify(taskList ?? [], null, 2);
      console.log('Export System Integrated');
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        const path = `${FileSystem.cacheDirectory}${fileName}`;
        await FileSystem.writeAsStringAsync(path, jsonStr, { encoding: FileSystem.EncodingType.UTF8 });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(path, { mimeType: 'application/json', dialogTitle: fileName });
        } else {
          Alert.alert(t('admin.exportTitle'), `JSON kaydedildi: ${path}`);
        }
      }

      const DEFAULT_W = 1920;
      const DEFAULT_H = 1080;
      const zip = new JSZip();

      // Filter image tasks for export
      const imgTasks = taskList?.filter(t => t.category === 'image' && t.image_url) || [];

      if (exportFormat === 'coco') {
        const cocoImages: Array<{ id: number; file_name: string; width: number; height: number }> = [];
        const cocoAnnotations: Array<{ id: number; image_id: number; category_id: number; bbox: number[]; area: number; iscrowd: number }> = [];
        let imgId = 1;
        let annId = 1;
        for (const t of imgTasks) {
          const fname = (t.image_url ?? '').split('/').pop() || `image_${imgId}.jpg`;
          cocoImages.push({ id: imgId, file_name: fname, width: DEFAULT_W, height: DEFAULT_H });
          const annData = (t as { annotation_data?: unknown }).annotation_data;
          const anns = parseAnnotations(annData);
          for (const a of anns) {
            if (a.type === 'bbox' && a.coordinates && a.coordinates.length >= 2) {
              const [x1, y1, x2, y2] = a.coordinates;
              const w = Math.abs(x2 - x1);
              const h = Math.abs(y2 - y1);
              cocoAnnotations.push({
                id: annId,
                image_id: imgId,
                category_id: 1,
                bbox: [Math.min(x1, x2), Math.min(y1, y2), w, h],
                area: w * h,
                iscrowd: 0,
              });
              annId++;
            }
          }
          imgId++;
        }
        const coco = {
          info: { description: 'Exported annotations', version: '1.0', year: new Date().getFullYear() },
          licenses: [{ id: 1, name: 'Unknown', url: '' }],
          images: cocoImages,
          annotations: cocoAnnotations,
          categories: ANNOTATION_LABELS.map((name, idx) => ({ id: idx + 1, name, supercategory: 'object' })),
        };
        zip.file('instances.json', JSON.stringify(coco, null, 2));
      } else {
        for (const t of imgTasks) {
          const annData = (t as { annotation_data?: unknown }).annotation_data;
          const anns = parseAnnotations(annData);
          const fname = (t.image_url ?? '').split('/').pop() || t.id;
          const baseName = fname.replace(/\.[^.]+$/, '') || t.id;
          const ctx = { annotations: anns, imageWidth: DEFAULT_W, imageHeight: DEFAULT_H, imageFileName: fname };
          if (exportFormat === 'yolo') {
            zip.file(`labels/${baseName}.txt`, toYOLO(ctx));
          } else if (exportFormat === 'pascalvoc') {
            zip.file(`annotations/${baseName}.xml`, toPascalVOC(ctx));
          }
        }
      }

      const firmaAdi = exportClient === 'all' ? 'Tum_Firmalar' : String(exportClient).replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '') || 'Firma';
      const dilAdi = exportLang === 'all' ? 'Tum_Diller' : exportLang;
      const tipAdi = exportTaskType === 'image' ? 'Gorsel' : 'Video';
      const fmtAdi = exportFormat === 'yolo' ? 'YOLO' : exportFormat === 'coco' ? 'COCO' : 'PascalVOC';
      const tarih = new Date().toISOString().slice(0, 10);
      const zipFileName = `export_${firmaAdi}_${dilAdi}_${tipAdi}_${fmtAdi}_${tarih}.zip`;

      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = zipFileName;
        a.click();
        URL.revokeObjectURL(url);
      }
      console.log('Export System Integrated');
      if (Platform.OS !== 'web' || typeof document === 'undefined') {
        const zipBase64 = await zip.generateAsync({ type: 'base64' });
        const path = `${FileSystem.cacheDirectory}${zipFileName}`;
        await FileSystem.writeAsStringAsync(path, zipBase64, { encoding: FileSystem.EncodingType.Base64 });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(path, { mimeType: 'application/zip', dialogTitle: zipFileName });
        } else {
          Alert.alert(t('admin.exportTitle'), `ZIP kaydedildi: ${path}`);
        }
      }
    } catch (e) {
      Alert.alert(t('login.errorTitle'), (e as Error)?.message ?? 'Dışa aktarma hatası');
    } finally {
      setExporting(false);
    }
  }, [exportLang, exportClient, exportTaskType, exportFormat, isAdmin, user, t]);

  const handleAudioUpload = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true });
    if (result.canceled) return;
    
    const files = result.assets || [];
    if (files.length === 0) return;
    
    setAudioMultipleFiles(files);
    setUploadProgress({ current: 0, total: files.length });
    setUploadErrors([]);
    
    // Start processing multiple files
    processMultipleFiles(files, 'audio');
  };

  const handleImageUpload = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true });
    if (result.canceled) return;
    
    const files = result.assets || [];
    if (files.length === 0) return;
    
    setMultipleFiles(files);
    setUploadProgress({ current: 0, total: files.length });
    setUploadErrors([]);
    
    // Start processing multiple files
    processMultipleFiles(files, 'image');
  };

  const handleVideoUpload = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: 'video/*', copyToCacheDirectory: true });
    if (result.canceled) return;
    
    const files = result.assets || [];
    if (files.length === 0) return;
    
    setVideoFiles(files);
    setUploadProgress({ current: 0, total: files.length });
    setUploadErrors([]);
    
    // Start processing multiple files
    processMultipleFiles(files, 'video');
  };

  // Unified multiple file processing function
  const processMultipleFiles = async (files: DocumentPicker.DocumentPickerAsset[], fileType: 'audio' | 'image' | 'video') => {
    setUploading(true);
    setUploadStatus('Dosyalar yükleniyor...');
    
    const CHUNK_SIZE = 5; // Process 5 files at a time
    let successCount = 0;
    let errorFiles: { fileName: string; error: string }[] = [];
    let processedCount = 0;
    
    for (let i = 0; i < files.length; i += CHUNK_SIZE) {
      const chunk = files.slice(i, i + CHUNK_SIZE);
      
      // Process chunk sequentially - wait for ALL files in chunk to complete
      for (let j = 0; j < chunk.length; j++) {
        const file = chunk[j];
        processedCount++;
        
        try {
          // Update detailed progress
          setUploadStatus(`Yükleniyor: ${processedCount}/${files.length}`);
          setUploadProgress({ current: processedCount, total: files.length });
          
          if (fileType === 'image') {
            // Process image file
            const res = await fetch(file.uri);
            const blob = await res.blob();
            const mimeType = file.mimeType ?? 'image/jpeg';
            const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
            const fileName = (file.name || 'image').replace(/[^a-zA-Z0-9._-]/g, '_');
            const uniquePath = `images/${Date.now()}_${fileName}.${ext}`;
            
            const { data: uploadData, error: uploadError } = await supabase.storage
              .from('task-assets')
              .upload(uniquePath, blob, { contentType: mimeType, upsert: true });
            
            if (uploadError) throw uploadError;
            
            // Get public URL
            const { data: urlData } = supabase.storage.from('task-assets').getPublicUrl(uploadData.path);
            const publicUrl = urlData?.publicUrl ?? '';
            
            if (!publicUrl) throw new Error('Public URL alınamadı');
            
            // Create task in database
            const taskData = {
              title: title || `Image Task - ${fileName}`,
              status: 'pending',
              type: 'image',
              category: 'image',
              price: parseFloat(taskPrice) || 10,
              language: selectedLanguage || 'tr',
              is_pool_task: true,
              assigned_to: null,
              client_name: clientName || 'Admin Upload',
              image_url: publicUrl,
            };
            
            const { error: taskError } = await supabase.from('tasks').insert(taskData);
            if (taskError) throw taskError;
            
          } else if (fileType === 'video') {
            // Process video file
            const res = await fetch(file.uri);
            const blob = await res.blob();
            const mimeType = file.mimeType ?? 'video/mp4';
            const ext = mimeType.includes('mov') ? 'mov' : mimeType.includes('avi') ? 'avi' : mimeType.includes('webm') ? 'webm' : 'mp4';
            const fileName = (file.name || 'video').replace(/[^a-zA-Z0-9._-]/g, '_');
            const uniquePath = `videos/${Date.now()}_${fileName}.${ext}`;
            
            const { data: uploadData, error: uploadError } = await supabase.storage
              .from('task-assets')
              .upload(uniquePath, blob, { contentType: mimeType, upsert: true });
            
            if (uploadError) throw uploadError;
            
            // Get public URL
            const { data: urlData } = supabase.storage.from('task-assets').getPublicUrl(uploadData.path);
            const publicUrl = urlData?.publicUrl ?? '';
            
            if (!publicUrl) throw new Error('Public URL alınamadı');
            
            // Create task in database
            const taskData = {
              title: title || `Video Task - ${fileName}`,
              status: 'pending',
              type: 'video',
              category: 'video',
              price: parseFloat(taskPrice) || 10,
              language: selectedLanguage || 'tr',
              is_pool_task: true,
              assigned_to: null,
              client_name: clientName || 'Admin Upload',
              image_url: publicUrl, // Video URL'si image_url alanında saklanacak
            };
            
            const { error: taskError } = await supabase.from('tasks').insert(taskData);
            if (taskError) throw taskError;
            
          } else {
            // Process audio file
            const res = await fetch(file.uri);
            const blob = await res.blob();
            const mimeType = file.mimeType ?? 'audio/mpeg';
            const ext = mimeType.includes('wav') ? 'wav' : mimeType.includes('m4a') ? 'm4a' : 'mp3';
            const fileName = (file.name || 'audio').replace(/[^a-zA-Z0-9._-]/g, '_');
            const uniquePath = `audio/${Date.now()}_${fileName}.${ext}`;
            
            const { data: uploadData, error: uploadError } = await supabase.storage
              .from('task-assets')
              .upload(uniquePath, blob, { contentType: mimeType, upsert: true });
            
            if (uploadError) throw uploadError;
            
            // Get public URL
            const { data: urlData } = supabase.storage.from('task-assets').getPublicUrl(uploadData.path);
            const publicUrl = urlData?.publicUrl ?? '';
            
            if (!publicUrl) throw new Error('Public URL alınamadı');
            
            // Create task in database
            const taskData = {
              title: title || `Audio Task - ${fileName}`,
              status: 'pending',
              type: 'audio',
              category: 'transcription',
              price: parseFloat(taskPrice) || 10,
              language: selectedLanguage || 'tr',
              is_pool_task: true,
              assigned_to: null,
              client_name: clientName || 'Admin Upload',
              audio_url: publicUrl,
            };
            
            const { error: taskError } = await supabase.from('tasks').insert(taskData);
            if (taskError) throw taskError;
          }
          
          // Memory cleanup - revoke object URL if exists
          if (file.uri.startsWith('blob:')) {
            URL.revokeObjectURL(file.uri);
          }
          
          successCount++;
          
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Bilinmeyen hata';
          errorFiles.push({ fileName: file.name, error: errorMessage });
          
          // Memory cleanup even on error
          if (file.uri.startsWith('blob:')) {
            URL.revokeObjectURL(file.uri);
          }
          
          // Continue with next file instead of stopping
          continue;
        }
      }
    }
    
    setUploading(false);
    
    // Final results
    const errorCount = errorFiles.length;
    
    if (successCount > 0) {
      setUploadStatus(`İşlem tamamlandı! ${successCount} dosya yüklendi, ${errorCount} dosya hata verdi`);
      
      // Show detailed error report if there are errors
      let alertMessage = `${successCount}/${files.length} dosya başarıyla yüklendi ve görev oluşturuldu.`;
      
      if (errorCount > 0) {
        alertMessage += `\n\nHatalı dosyalar (${errorCount}):\n`;
        errorFiles.slice(0, 5).forEach(({ fileName, error }) => {
          alertMessage += `• ${fileName}: ${error}\n`;
        });
        
        if (errorCount > 5) {
          alertMessage += `... ve ${errorCount - 5} hata daha`;
        }
      }
      
      Alert.alert('Yükleme Tamamlandı', alertMessage);
      
      // Reset form
      if (fileType === 'image') {
        setMultipleFiles([]);
      } else if (fileType === 'video') {
        setVideoFiles([]);
      } else {
        setAudioMultipleFiles([]);
      }
      setUploadProgress({ current: 0, total: 0 });
      setUploadStatus('');
      setUploadErrors(errorFiles.map(({ fileName, error }) => `Hata (${fileName}): ${error}`));
      fetchDashboardStats(); // Refresh stats
    } else {
      setUploadStatus('Yükleme başarısız oldu.');
      Alert.alert('Yükleme Başarısız', 'Hiçbir dosya yüklenemedi. Lütfen hataları kontrol edin.');
      setUploadErrors(errorFiles.map(({ fileName, error }) => `Hata (${fileName}): ${error}`));
    }
  };

  useEffect(() => {
    if (isRecording) {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(blinkAnim, { toValue: 0.3, duration: 500, useNativeDriver: true }),
          Animated.timing(blinkAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      );
      anim.start();
      return () => anim.stop();
    } else {
      blinkAnim.setValue(1);
    }
  }, [isRecording]);

  const handleRecord = async () => {
    if (isRecording && recordingRef.current) {
      try {
        await recordingRef.current.stopAndUnloadAsync();
        const uri = recordingRef.current.getURI();
        recordingRef.current = null;
        setIsRecording(false);
        if (uri) {
          const res = await fetch(uri);
          const blob = await res.blob();
          setRecordedBlob(blob);
          setPickedBlob(blob);
          setPickedFileName(`rec_${Date.now()}.webm`);
          setPickedMimeType('audio/webm');
          setAudioStatus(t('admin.recorded'));
        }
      } catch (e) {
        setIsRecording(false);
        recordingRef.current = null;
      }
      return;
    }
    const { status } = await Audio.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('adminErrors.aiAnalysisFailed'), t('admin.audioSection'));
      return;
    }
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true, staysActiveInBackground: false, shouldDuckAndroid: true, playThroughEarpieceAndroid: false });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      recordingRef.current = recording;
      setIsRecording(true);
    } catch (e) {
      Alert.alert(t('login.errorTitle'), (e as Error)?.message ?? 'Kayıt başlatılamadı');
    }
  };

  const handleAssignTask = async () => {
    if (!title.trim()) {
      Alert.alert(t('login.errorTitle'), t('adminErrors.titleRequired'));
      return;
    }
    setSubmitting(true);
    try {
      const priceNum = Math.max(0, parseFloat(taskPrice) || 10);
      const langToSave = selectedLanguage ?? DEFAULT_LANGUAGE;
      const isPool = selectedUser?.id === '__POOL__' || !selectedUser;
      if (taskType === 'image') {
        const fromRef = (uploadedUrlRef.current ?? '').trim();
        const fromState = (imageUrlInput ?? '').trim();
        const imageUrl = fromRef || fromState;

        if (!imageUrl || imageUrl.length === 0) {
          const msg = imageUploading ? 'Lütfen görsel yüklenene kadar bekleyin' : 'Görsel görevi için image URL gerekli. Lütfen bir görsel yükleyin veya URL girin.';
          if (typeof window !== 'undefined') {
            window.alert(msg);
          } else {
            Alert.alert(t('login.errorTitle'), msg);
          }
          setSubmitting(false);
          return;
        }
        if (fromRef && !fromState) {
          setImageUrlInput(fromRef);
        }
        const taskData: Record<string, unknown> = {
          title: title.trim(),
          status: 'pending',
          type: 'image',
          category: 'image',
          image_url: imageUrl,
          audio_url: '',
          transcription: '',
          price: priceNum,
          language: langToSave,
          is_pool_task: isPool,
          assigned_to: isPool ? null : selectedUser?.id ?? null,
          client_name: clientName.trim() || null,
        };
        console.log('Task Data to Send:', taskData);
        console.log('[Admin] Creating image task:', taskData);
        const { error: insertError } = await supabase.from('tasks').insert(taskData);
        if (insertError) {
          console.error('[Admin] Görsel görev insert hatası:', insertError);
          console.error('[Admin] Gönderilen veri:', taskData);
          const errMsg = insertError.message ?? 'Görev oluşturulamadı.';
          if (typeof window !== 'undefined') {
            window.alert('Hata: ' + errMsg);
          } else {
            Alert.alert(t('login.errorTitle'), errMsg);
          }
          setSubmitting(false);
          return;
        }
        fetchClientNames();
        fetchRecentTasks();
        fetchDashboardStats();
        if (typeof window !== 'undefined') {
          window.alert('Görev Başarıyla Oluşturuldu');
        } else {
          Alert.alert(t('taskDetail.successTitle'), 'Görev Başarıyla Oluşturuldu');
        }
        setTitle('');
        setTaskPrice('10');
        setClientName('');
        setImageUrlInput('');
        uploadedUrlRef.current = '';
        setShowTaskForm(false);
        return;
      }

      if (taskType === 'video') {
        const videoUrl = (imageUrlInput ?? '').trim();
        const hasVideoFile = videoFiles && videoFiles.length > 0;

        // Video kaynağı kontrolü
        const hasVideoSource = (videoUrl && videoUrl.trim() !== '') || (videoFiles && videoFiles.length > 0);

        if (!hasVideoSource) {
            const msg = 'Video görevi için video URL veya dosya seçimi gerekli. Lütfen bir video URL girin veya dosya seçin.';
            if (typeof window !== 'undefined') {
                window.alert(msg);
            } else {
                Alert.alert(t('login.errorTitle'), msg);
            }
            setSubmitting(false);
            return;
        }

        console.log('Video validation check:', { videoUrl, hasVideoFile, videoFiles: videoFiles?.length, hasVideoSource });

        let finalVideoUrl = videoUrl;

        // Eğer dosya seçilmişse, önce yükle
        if (hasVideoFile) {
            console.log('Video file detected, uploading...');
            // Loading state'i güncelle
            setSubmitting(true);
            if (typeof window !== 'undefined') {
                // Buton text'ini güncelle
                const submitButton = document.querySelector('button[type="submit"]') as HTMLButtonElement;
                if (submitButton) {
                    submitButton.textContent = 'Video yükleniyor...';
                    submitButton.disabled = true;
                }
            }

            // Dosyayı yükle
            const file = videoFiles[0]; // İlk dosyayı al
            const uploadedUrl = await uploadVideoFileToSupabase(file);
            
            if (!uploadedUrl) {
                const errMsg = 'Dosya yükleme başarısız oldu. Lütfen tekrar deneyin.';
                if (typeof window !== 'undefined') {
                    window.alert('Hata: ' + errMsg);
                    // Butonu eski haline getir
                    const submitButton = document.querySelector('button[type="submit"]') as HTMLButtonElement;
                    if (submitButton) {
                        submitButton.textContent = 'Gönder';
                        submitButton.disabled = false;
                    }
                } else {
                    Alert.alert(t('login.errorTitle'), errMsg);
                }
                setSubmitting(false);
                return;
            }

            finalVideoUrl = uploadedUrl;
            console.log('Video file uploaded successfully:', uploadedUrl);
        } else if (videoUrl) {
            console.log('Video URL detected, uploading from URL...');
            // URL varsa, onu Supabase'e yükle
            const publicUrl = await uploadVideoToSupabase(videoUrl);
            if (!publicUrl) {
                const errMsg = 'Video yüklenemedi. Lütfen tekrar deneyin.';
                if (typeof window !== 'undefined') {
                    window.alert('Hata: ' + errMsg);
                } else {
                    Alert.alert(t('login.errorTitle'), errMsg);
                }
                setSubmitting(false);
                return;
            }
            finalVideoUrl = publicUrl;
            console.log('Video URL uploaded successfully:', publicUrl);
        }

        const taskData: Record<string, unknown> = {
          title: title.trim(),
          status: 'pending',
          type: 'video',
          category: 'video',
          image_url: finalVideoUrl, // Yüklenen video URL'si
          audio_url: '',
          transcription: '',
          price: priceNum,
          language: langToSave,
          is_pool_task: isPool,
          assigned_to: isPool ? null : selectedUser?.id ?? null,
          client_name: clientName.trim() || null,
        };
        console.log('Task Data to Send:', taskData);
        console.log('[Admin] Creating video task:', taskData);
        const { error: insertError } = await supabase.from('tasks').insert(taskData);
        if (insertError) {
          console.error('[Admin] Video görev insert hatası:', insertError);
          console.error('[Admin] Gönderilen veri:', taskData);
          const errMsg = insertError.message ?? 'Görev oluşturulamadı.';
          if (typeof window !== 'undefined') {
            window.alert('Hata: ' + errMsg);
          } else {
            Alert.alert(t('login.errorTitle'), errMsg);
          }
          setSubmitting(false);
          return;
        }
        fetchClientNames();
        fetchRecentTasks();
        fetchDashboardStats();
        if (typeof window !== 'undefined') {
          window.alert('Video Görevi Başarıyla Oluşturuldu');
        } else {
          Alert.alert(t('taskDetail.successTitle'), 'Video Görevi Başarıyla Oluşturuldu');
        }
        setTitle('');
        setTaskPrice('10');
        setClientName('');
        setImageUrlInput('');
        uploadedUrlRef.current = '';
        setShowTaskForm(false);
        return;
      }

      let transcriptionText = 'Metin oluşturulamadı';
      let audioUrl: string | null = null;
      let durationSec: number | null = null;
      const audioBlob = recordedBlob || pickedBlob;
      if (audioBlob) {
        setAudioStatus('...');
        durationSec = await getBlobDuration(audioBlob);
        const mimeType = recordedBlob ? (recordedBlob.type || 'audio/webm') : pickedMimeType || 'audio/mpeg';
        const ext = mimeType.includes('webm') ? 'webm' : mimeType.includes('mpeg') ? 'mp3' : 'm4a';
        const safeName = recordedBlob ? `rec_${Date.now()}.${ext}` : pickedFileName || `audio.${ext}`;
        const path = `${Date.now()}_${safeName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const { data: uploadData, error: ue } = await supabase.storage.from('audios').upload(path, audioBlob, { contentType: mimeType, upsert: true });
        if (ue) throw ue;
        const { data: urlData } = supabase.storage.from('audios').getPublicUrl(uploadData.path);
        audioUrl = urlData.publicUrl;
        try {
          const langToUse = selectedLanguage ?? DEFAULT_LANGUAGE;
          const res = await transcribeWithGroq({
            fileUrl: audioUrl,
            language: langToUse === 'unspecified' ? undefined : langToUse,
          });
          if (!res.error && res.text?.trim()) {
            transcriptionText = res.text.trim();
          } else if (res.error) {
            console.error('[Groq] Admin transcribe error (response):', res.error);
            transcriptionText = 'Metin oluşturulamadı';
          }
        } catch (e) {
          console.error('[Groq] Admin transcribe hatası (exception):', e);
          transcriptionText = 'Metin oluşturulamadı';
        }
      }
      const taskData: Record<string, unknown> = {
        title: title.trim(),
        status: 'pending',
        type: 'audio',
        category: 'transcription',
        transcription: transcriptionText,
        audio_url: audioUrl ?? '',
        price: priceNum,
        language: langToSave,
        is_pool_task: isPool,
        assigned_to: isPool ? null : selectedUser?.id ?? null,
        client_name: clientName.trim() || null,
        duration: durationSec,
      };
      console.log('Task Data to Send:', taskData);
      console.log('[Admin] Creating audio task:', taskData);
      const { error: insertError } = await supabase.from('tasks').insert(taskData);
      if (insertError) throw insertError;
      fetchClientNames();
      fetchRecentTasks();
      fetchDashboardStats();
      Alert.alert(t('taskDetail.successTitle'), t('adminErrors.taskCreatedSuccess', { language: t(`languages.${langToSave}`) }));
      setTitle('');
      setClientName('');
      setRecordedBlob(null);
      setPickedBlob(null);
      setAudioStatus('');
      setShowTaskForm(false);
    } catch (err: any) {
      console.error('[Admin] Görev oluşturma hatası:', err);
      const errMsg = err?.message ?? 'Hata';
      if (typeof window !== 'undefined') {
        window.alert('Hata: ' + errMsg);
      } else {
        Alert.alert(t('login.errorTitle'), errMsg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const toggleUserRole = (u: User) => {
    const nextRole = (u.role === 'admin' ? 'user' : 'admin') as string;
    supabase.from('profiles').update({ role: nextRole }).eq('id', u.id).then(() => {
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, role: nextRole } : x)));
    }).catch(() => setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, role: nextRole } : x))));
  };

  const toggleUserStatus = (u: User) => {
    const next = !(u.is_active ?? true);
    supabase.from('profiles').update({ is_active: next }).eq('id', u.id).then(() => {
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, is_active: next } : x)));
    }).catch(() => setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, is_active: next } : x))));
  };

  const showEditOptions = (u: User) => {
    Alert.alert(
      u.email || u.id,
      undefined,
      [
        { text: t('login.cancel'), style: 'cancel' },
        {
          text: u.role === 'admin' ? t('admin.userTable.roleUser') : t('admin.userTable.roleAdmin'),
          onPress: () => toggleUserRole(u),
        },
        {
          text: (u.is_active ?? true) ? t('admin.userTable.statusInactive') : t('admin.userTable.statusActive'),
          onPress: () => toggleUserStatus(u),
        },
      ]
    );
  };

  const startRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('İzin Gerekli', 'Mikrofon izni gereklidir.');
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      recordingRef.current = recording;
      setIsRecording(true);
      Animated.loop(
        Animated.sequence([
          Animated.timing(blinkAnim, { toValue: 0.3, duration: 400, useNativeDriver: true }),
          Animated.timing(blinkAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
        ]),
        { iterations: -1 }
      ).start();
    } catch (e) {
      console.error('Recording start error:', e);
      Alert.alert('Hata', 'Kayıt başlatılamadı.');
    }
  };

  const stopRecording = async () => {
    try {
      if (recordingRef.current) {
        setIsRecording(false);
        blinkAnim.stopAnimation();
        await recordingRef.current.stopAndUnloadAsync();
        const uri = recordingRef.current.getURI();
        if (uri) {
          const response = await fetch(uri);
          const blob = await response.blob();
          setRecordedBlob(blob);
          setPickedBlob(null);
          setPickedFileName(`recording_${Date.now()}.webm`);
          setPickedMimeType('audio/webm');
          setAudioStatus('✅ Kaydedildi');
        }
        recordingRef.current = null;
      }
    } catch (e) {
      console.error('Recording stop error:', e);
      Alert.alert('Hata', 'Kayıt durdurulamadı.');
    }
  };

  const POOL_USER: User = { id: '__POOL__', email: t('admin.publicPool') };
  const displayUsers = useMemo(() => {
    let filtered = users;
    if (annotatorSearchQuery) {
      const q = annotatorSearchQuery.toLowerCase();
      filtered = filtered.filter((u) => (u.email || '').toLowerCase().includes(q) || (u.full_name || '').toLowerCase().includes(q));
    }
    return [POOL_USER, ...filtered];
  }, [users, annotatorSearchQuery]);

  useEffect(() => {
    if (showTaskForm) setSelectedUser(POOL_USER);
  }, [showTaskForm]);

  useEffect(() => {
    if (showTaskForm) fetchRecentTasks();
  }, [showTaskForm, fetchRecentTasks]);

  useEffect(() => {
    if (selectedUser && selectedUser.id !== '__POOL__' && !displayUsers.some((u) => u.id === selectedUser?.id)) {
      setSelectedUser(POOL_USER);
    }
  }, [displayUsers, selectedUser]);

  const filteredAnnotators = useMemo(() => {
    const q = annotatorSearchQuery.trim().toLowerCase();
  }, [users, annotatorSearchQuery]);

  useEffect(() => {
    if (isRecording) {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(blinkAnim, { toValue: 0.3, duration: 500, useNativeDriver: true }),
          Animated.timing(blinkAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      );
      anim.start();
      return () => anim.stop();
    } else {
      blinkAnim.setValue(1);
    }
  }, [isRecording]);

  return (
  <>
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => router.replace('/tasks' as any)}
        activeOpacity={0.8}
      >
        <Ionicons name="arrow-back" size={22} color="#f8fafc" />
        <Text style={styles.backButtonText}>Görevlere Dön</Text>
      </TouchableOpacity>
      
      {/* Professional Header */}
      <View style={styles.headerContainer}>
        <Text style={styles.title}>{t('admin.panelTitle')}</Text>
        <TouchableOpacity 
          style={styles.refreshButton} 
          onPress={fetchDashboardStats}
          disabled={refreshing}
        >
        <Ionicons name={refreshing ? "refresh" : "refresh-outline"} size={20} color="#f8fafc" />
        <Text style={styles.refreshButtonText}>{refreshing ? 'Refreshing...' : 'Refresh'}</Text>
      </TouchableOpacity>
      </View>

      {/* 5 İstatistik Kartı (4 + Tamamlama Oranı) */}
      <View style={styles.statsRow}>
        <View style={[styles.statCard, CARD_STYLE]}>
          <Ionicons name="people" size={18} color="#60a5fa" />
          <Text style={styles.statValue}>{statsLoading ? '...' : dashboardStats.totalUsers}</Text>
          <Text style={styles.statLabel}>{t('admin.stats.totalUsers')}</Text>
          </View>
          <View style={[styles.statCard, CARD_STYLE]}>
            <Ionicons name="document-text" size={18} color="#22c55e" />
            <Text style={styles.statValue}>{statsLoading ? '...' : dashboardStats.activeTasks}</Text>
            <Text style={styles.statLabel}>{t('admin.stats.activeTasks')}</Text>
            {!statsLoading && Object.keys(dashboardStats.activeTasksTypeBreakdown).length > 0 && (
              <Text style={styles.typeBreakdown}>
                {Object.entries(dashboardStats.activeTasksTypeBreakdown)
                  .map(([type, count]) => `${count} ${type}`)
                  .join(', ')}
              </Text>
            )}
          </View>
          <View style={[styles.statCard, CARD_STYLE]}>
            <Ionicons name="checkmark-circle" size={18} color="#10b981" />
            <Text style={styles.statValue}>{statsLoading ? '...' : dashboardStats.completedTasks}</Text>
            <Text style={styles.statLabel}>Tamamlanan Görevler</Text>
          </View>
          <View style={[styles.statCard, CARD_STYLE]}>
            <Ionicons name="wallet" size={18} color="#8b5cf6" />
            <Text style={styles.statValue}>{statsLoading ? '...' : dashboardStats.monthlyRevenue} TL</Text>
            <Text style={styles.statLabel}>{t('admin.stats.monthlyRevenue')}</Text>
          </View>
          <View style={[styles.statCard, styles.completionStatCard, CARD_STYLE]}>
            <Text style={styles.completionTitle}>{t('admin.chartTitle')}</Text>
            <View style={styles.progressBarWrap}>
              <View style={[styles.progressBarFill, { width: `${statsLoading ? 0 : dashboardStats.completionRate}%` }]} />
            </View>
            <Text style={styles.completionText}>{t('admin.completionLabel', { percent: statsLoading ? 0 : dashboardStats.completionRate })}</Text>
          </View>
        </View>

        {/* Hızlı İşlemler - İstatistik kartlarıyla aynı boyut */}
        <View style={styles.actionsRow}>
          <ActionCard icon="add-circle" iconColor="#3b82f6" label={t('admin.quickActions.newTask')} onPress={() => setShowTaskForm(!showTaskForm)} />
          <ActionCard icon="person-add" iconColor="#22c55e" label={t('admin.quickActions.addStaff')} onPress={() => Alert.alert(t('admin.panelTitle'), t('admin.quickActions.addStaff'))} />
          <ActionCard icon="stats-chart" iconColor="#8b5cf6" label={t('admin.quickActions.financialReport')} onPress={() => Alert.alert(t('admin.panelTitle'), t('admin.quickActions.financialReport'))} />
          <ActionCard icon="time" iconColor="#f59e0b" label="Onay Bekleyen Ödemeler" onPress={() => Alert.alert('Onay Bekleyen Ödemeler', `${dashboardStats.pendingPayments} bekleyen ödeme var`)} />
          <ActionCard icon="checkmark-circle" iconColor="#10b981" label="Tamamlanan Görevler" onPress={() => setShowCompletedTasks(true)} />
          <ActionCard icon="chatbubbles" iconColor="#22c55e" label={t('nav.messages')} onPress={() => router.push('/messages' as any)} />
        </View>

        {/* Recent Tasks List */}
        <View style={[styles.sectionCard, CARD_STYLE]}>
          <Text style={styles.sectionTitle}>Son Görevler</Text>
          
          {/* Debug Info */}
          <View style={{ padding: 8, backgroundColor: '#0f172a', borderRadius: 4, marginBottom: 8 }}>
            <Text style={{ color: '#fff', fontSize: 12 }}>
              Container Render Edildi - recentTasks: {recentTasks.length}, selectedCategory: {selectedTaskCategory}
            </Text>
          </View>
          
          {/* Kategori Sekmeleri */}
          <View style={styles.taskCategoryTabs}>
            <TouchableOpacity
              style={[styles.categoryTab, selectedTaskCategory === 'all' && styles.categoryTabActive]}
              onPress={() => {
                console.log('Hepsi sekmesine tıklandı');
                setSelectedTaskCategory('all');
              }}
            >
              <Ionicons name="list" size={16} color={selectedTaskCategory === 'all' ? '#fff' : '#94a3b8'} />
              <Text style={[styles.categoryTabText, selectedTaskCategory === 'all' && styles.categoryTabTextActive]}>Hepsi</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.categoryTab, selectedTaskCategory === 'video' && styles.categoryTabActive]}
              onPress={() => {
                console.log('Video sekmesine tıklandı');
                setSelectedTaskCategory('video');
              }}
            >
              <Ionicons name="videocam" size={16} color={selectedTaskCategory === 'video' ? '#fff' : '#94a3b8'} />
              <Text style={[styles.categoryTabText, selectedTaskCategory === 'video' && styles.categoryTabTextActive]}>Video Tasks</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.categoryTab, selectedTaskCategory === 'audio' && styles.categoryTabActive]}
              onPress={() => {
                console.log('Audio sekmesine tıklandı');
                setSelectedTaskCategory('audio');
              }}
            >
              <Ionicons name="mic" size={16} color={selectedTaskCategory === 'audio' ? '#fff' : '#94a3b8'} />
              <Text style={[styles.categoryTabText, selectedTaskCategory === 'audio' && styles.categoryTabTextActive]}>Audio Tasks</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.categoryTab, selectedTaskCategory === 'image' && styles.categoryTabActive]}
              onPress={() => {
                console.log('Image sekmesine tıklandı');
                setSelectedTaskCategory('image');
              }}
            >
              <Ionicons name="image" size={16} color={selectedTaskCategory === 'image' ? '#fff' : '#94a3b8'} />
              <Text style={[styles.categoryTabText, selectedTaskCategory === 'image' && styles.categoryTabTextActive]}>Image Tasks</Text>
            </TouchableOpacity>
          </View>

          {/* Görev Listesi */}
          <View>
            {(() => {
              console.log('=== DEBUG INFO ===');
              console.log('Toplam Görev Sayısı:', recentTasks.length);
              console.log('Seçili Kategori:', selectedTaskCategory);
              console.log('Filtrelenmiş Görev Sayısı:', filteredTasks.length);
              console.log('Tüm Görevler:', recentTasks.map(t => ({ id: t.id, title: t.title, type: t.type, category: t.category })));
              console.log('Filtrelenmiş Görevler:', filteredTasks.map(t => ({ id: t.id, title: t.title, type: t.type, category: t.category })));
              console.log('================');
              return null;
            })()}
            
            {/* Basit Text Listesi - Debug için */}
            <View style={{ padding: 16, backgroundColor: '#1e293b', borderRadius: 8, marginBottom: 16 }}>
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 8 }}>
                DEBUG: Filtrelenmiş Görevler ({filteredTasks.length})
              </Text>
              <Text style={{ color: '#94a3b8', fontSize: 12, marginBottom: 8 }}>
                Seçili Kategori: {selectedTaskCategory}
              </Text>
              {filteredTasks.map((task, index) => (
                <Text key={task.id} style={{ color: '#94a3b8', fontSize: 14, marginBottom: 4 }}>
                  {index + 1}. {task.title} (Type: "{task.type || 'N/A'}", Status: "{task.status || 'N/A'}", Category: "{task.category || 'N/A'}")
                </Text>
              ))}
              {filteredTasks.length === 0 && (
                <View>
                  <Text style={{ color: '#ef4444', fontSize: 14, marginBottom: 4 }}>
                    GÖREV BULUNAMADI!
                  </Text>
                  <Text style={{ color: '#f59e0b', fontSize: 12 }}>
                    Tüm görev sayısı: {recentTasks.length}
                  </Text>
                  <Text style={{ color: '#f59e0b', fontSize: 12 }}>
                    İlk 5 görevin tipleri: {recentTasks.slice(0, 5).map(t => t.type || 'N/A').join(', ')}
                  </Text>
                  <Text style={{ color: '#10b981', fontSize: 12 }}>
                    Seçili kategori: {selectedTaskCategory}
                  </Text>
                </View>
              )}
            </View>

            {/* Normal Görev Listesi */}
            {filteredTasks.length > 0 ? (
              filteredTasks.map((task) => (
                <View key={task.id} style={styles.taskItem}>
                  <View style={styles.taskItemHeader}>
                    <Text style={styles.taskItemTitle} numberOfLines={2}>{task.title || 'İsimsiz Görev'}</Text>
                    <TouchableOpacity 
                      style={styles.deleteButton} 
                      onPress={() => handleDeleteTask(task.id)}
                    >
                      <Ionicons name="trash" size={16} color="#ef4444" />
                      <Text style={styles.deleteButtonText}>Sil</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.taskItemDetails}>
                    <Text style={styles.taskItemType}>Tip: {task.type || task.category || 'Bilinmeyen'}</Text>
                    <Text style={styles.taskItemStatus}>Durum: {task.status || 'Bilinmeyen'}</Text>
                    {task.image_url && (
                      <Text style={styles.taskItemImage}>📎 Görsel var</Text>
                    )}
                  </View>
                </View>
              ))
            ) : (
              <View style={styles.emptyCategoryContainer}>
                <Text style={styles.emptyCategoryText}>Bu kategoride henüz görev yok</Text>
              </View>
            )}
          </View>
        </View>

        {/* Görev Atama Formu (açılır) */}
        {showTaskForm && (
          <View style={[styles.sectionCard, CARD_STYLE]}>
            <Text style={styles.sectionTitle}>{t('admin.taskAssignment')}</Text>
            <Text style={styles.label}>Task Type (Görev Tipi)</Text>
            <View style={styles.taskTypeRow}>
              <TouchableOpacity
                style={[styles.taskTypeChip, taskType === 'audio' && styles.taskTypeChipActive]}
                onPress={() => setTaskType('audio')}
              >
                <Ionicons name="mic" size={18} color={taskType === 'audio' ? '#fff' : '#94a3b8'} />
                <Text style={[styles.taskTypeChipText, taskType === 'audio' && styles.taskTypeChipTextActive]}>Ses</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.taskTypeChip, taskType === 'image' && styles.taskTypeChipActive]}
                onPress={() => setTaskType('image')}
              >
                <Ionicons name="image" size={18} color={taskType === 'image' ? '#fff' : '#94a3b8'} />
                <Text style={[styles.taskTypeChipText, taskType === 'image' && styles.taskTypeChipTextActive]}>Görsel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.taskTypeChip, taskType === 'video' && styles.taskTypeChipActive]}
                onPress={() => setTaskType('video')}
              >
                <Ionicons name="videocam" size={18} color={taskType === 'video' ? '#fff' : '#94a3b8'} />
                <Text style={[styles.taskTypeChipText, taskType === 'video' && styles.taskTypeChipTextActive]}>Video</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.label}>{t('admin.taskTitle')}</Text>
            <TextInput style={styles.input} placeholder={t('admin.taskTitlePlaceholder')} placeholderTextColor="#64748b" value={title} onChangeText={setTitle} />
            <Text style={styles.label}>{t('admin.taskPrice')}</Text>
            <TextInput style={styles.input} placeholder="10" placeholderTextColor="#64748b" value={taskPrice} onChangeText={setTaskPrice} keyboardType="numeric" />
            <Text style={styles.label}>{t('admin.clientName')}</Text>
            <TextInput style={styles.input} placeholder={t('admin.clientNamePlaceholder')} placeholderTextColor="#64748b" value={clientName} onChangeText={setClientName} />
            {/* Dil seçeneği sadece ses görevleri için gösterilir */}
            {taskType === 'audio' && (
              <>
                <Text style={styles.label}>{t('admin.taskLanguage')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.langChips}>
                  {TASK_LANGUAGES.filter((l) => l.code !== 'unspecified').map((lang) => (
                    <TouchableOpacity
                      key={lang.code}
                      style={[styles.langChip, selectedLanguage === lang.code && styles.langChipActive]}
                      onPress={() => setSelectedLanguage(lang.code)}
                    >
                      <Text style={[styles.langChipText, selectedLanguage === lang.code && styles.langChipTextActive]}>{t(lang.labelKey)}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}
            <Text style={styles.label}>{t('admin.selectEmployee')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.userScroll}>
              {displayUsers.map((u) => (
                <TouchableOpacity
                  key={u.id}
                  style={[styles.userChip, selectedUser?.id === u.id && styles.userChipActive]}
                  onPress={() => setSelectedUser(u)}
                >
                  <Text style={[styles.userChipText, selectedUser?.id === u.id && styles.userChipTextActive]}>{u.email || u.full_name || u.id}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {taskType === 'audio' ? (
              <>
                <Text style={styles.label}>{t('admin.audioSection')}</Text>
                <View style={styles.audioControls}>
                  <TouchableOpacity style={styles.btn} onPress={handleAudioUpload}>
                    <Ionicons name="folder" size={18} color="#fff" />
                    <Text style={styles.btnText}>Dosya Seç</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.recordBtn, isRecording && styles.recordBtnRecording]}
                    onPressIn={isRecording ? stopRecording : startRecording}
                    onPressOut={isRecording ? stopRecording : undefined}
                  >
                    <Animated.View style={[styles.recordDot, { opacity: blinkAnim }]} />
                    <Text style={styles.btnText}>{isRecording ? t('admin.recording') : 'Kaydet'}</Text>
                  </TouchableOpacity>
                  {audioStatus ? <Text style={styles.status}>{audioStatus}</Text> : null}
                  
                  {/* Progress Display for Audio Files */}
                  {audioMultipleFiles && audioMultipleFiles.length > 0 && (
                    <View style={styles.selectedFilesContainer}>
                      <Text style={styles.selectedFilesTitle}>Seçilen Ses Dosyaları ({audioMultipleFiles.length}):</Text>
                      {audioMultipleFiles.slice(0, 5).map((file, index) => (
                        <Text key={index} style={styles.fileNameText}>• {file.name}</Text>
                      ))}
                      {audioMultipleFiles.length > 5 && (
                        <Text style={styles.fileNameText}>... ve {audioMultipleFiles.length - 5} dosya daha</Text>
                      )}
                    </View>
                  )}
                  
                  {/* Upload Progress for Audio */}
                  {uploading && audioMultipleFiles && audioMultipleFiles.length > 0 && (
                    <View style={styles.queueProgressContainer}>
                      <Text style={styles.queueProgressText}>{uploadStatus}</Text>
                      <View style={styles.queueProgressBar}>
                        <View style={[styles.queueProgressBarFill, { width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }]} />
                      </View>
                      <Text style={styles.queueProgressPercent}>
                        {uploadProgress.current}/{uploadProgress.total} dosya
                      </Text>
                    </View>
                  )}
                </View>
              </>
            ) : taskType === 'video' ? (
              <>
                <Text style={styles.label}>Video Yükle veya URL Gir</Text>
                <View style={styles.imageUploadRow}>
                  <TouchableOpacity style={styles.uploadImageBtn} onPress={handleVideoUpload} disabled={uploading}>
                    <>
                      {uploading ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Ionicons name="folder-open" size={18} color="#fff" />
                      )}
                      <Text style={styles.uploadImageBtnText}>
                        {uploading ? 'İşleniyor...' : 'Video Dosya Seç'}
                      </Text>
                    </>
                  </TouchableOpacity>
                  <TextInput
                    style={styles.imageUrlInput}
                    placeholder="Veya video URL girin"
                    placeholderTextColor="#64748b"
                    value={imageUrlInput}
                    onChangeText={setImageUrlInput}
                  />
                </View>
                
                {/* Progress Display for Video Files */}
                {videoFiles && videoFiles.length > 0 && (
                  <View style={styles.selectedFilesContainer}>
                    <Text style={styles.selectedFilesTitle}>Seçilen Video Dosyaları ({videoFiles.length}):</Text>
                    {videoFiles.slice(0, 5).map((file, index) => (
                      <Text key={index} style={styles.fileNameText}>• {file.name}</Text>
                    ))}
                    {videoFiles.length > 5 && (
                      <Text style={styles.fileNameText}>... ve {videoFiles.length - 5} dosya daha</Text>
                    )}
                  </View>
                )}
                
                {/* Upload Progress for Video */}
                {uploading && videoFiles && videoFiles.length > 0 && (
                  <View style={styles.queueProgressContainer}>
                    <Text style={styles.queueProgressText}>{uploadStatus}</Text>
                    <View style={styles.queueProgressBar}>
                      <View style={[styles.queueProgressBarFill, { width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }]} />
                    </View>
                    <Text style={styles.queueProgressPercent}>
                      {uploadProgress.current}/{uploadProgress.total} dosya
                    </Text>
                  </View>
                )}
              </>
            ) : (
              <>
                <Text style={styles.label}>Görsel Yükle veya URL Gir</Text>
                <View style={styles.imageUploadRow}>
                  <TouchableOpacity style={styles.uploadImageBtn} onPress={handleImageUpload} disabled={queueProcessing}>
                    <>
                      {queueProcessing ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Ionicons name="folder-open" size={18} color="#fff" />
                      )}
                      <Text style={styles.uploadImageBtnText}>
                        {queueProcessing ? 'İşleniyor...' : 'Dosya Seç'}
                      </Text>
                    </>
                  </TouchableOpacity>
                  <TextInput
                    style={styles.imageUrlInput}
                    placeholder="Veya görsel URL girin"
                    placeholderTextColor="#64748b"
                    value={imageUrlInput}
                    onChangeText={setImageUrlInput}
                  />
                </View>
                
                {/* Queue Progress Display */}
                {queueProcessing && (
                  <View style={styles.queueProgressContainer}>
                    <Text style={styles.queueProgressText}>{uploadStatus}</Text>
                    <View style={styles.queueProgressBar}>
                      <View style={[styles.queueProgressBarFill, { width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }]} />
                    </View>
                    <Text style={styles.queueProgressPercent}>
                      {uploadProgress.current}/{uploadProgress.total} dosya
                    </Text>
                  </View>
                )}
                
                {/* Selected Files Display */}
                {multipleFiles && multipleFiles.length > 0 && !queueProcessing && (
                  <View style={styles.selectedFilesContainer}>
                    <Text style={styles.selectedFilesTitle}>Seçilen Dosyalar ({multipleFiles.length}):</Text>
                    {multipleFiles.slice(0, 5).map((file, index) => (
                      <Text key={index} style={styles.fileNameText}>• {file.name}</Text>
                    ))}
                    {multipleFiles.length > 5 && (
                      <Text style={styles.fileNameText}>... ve {multipleFiles.length - 5} dosya daha</Text>
                    )}
                  </View>
                )}
                
                {/* Upload Errors */}
                {uploadErrors.length > 0 && (
                  <View style={styles.errorContainer}>
                    <Text style={styles.errorTitle}>Hatalar:</Text>
                    {uploadErrors.slice(0, 3).map((error, index) => (
                      <Text key={index} style={styles.errorText}>{error}</Text>
                    ))}
                    {uploadErrors.length > 3 && (
                      <Text style={styles.errorText}>... ve {uploadErrors.length - 3} hata daha</Text>
                    )}
                  </View>
                )}
              </>
            )}
            <TouchableOpacity
              style={[styles.submitBtn, (submitting || uploading) && styles.submitBtnDisabled]}
              onPress={handleAssignTask}
              disabled={submitting || uploading}
            >
              <Text style={styles.submitBtnText}>
                {submitting
                  ? t('admin.assigning')
                  : uploading
                    ? `Yükleniyor: ${uploadProgress.current}/${uploadProgress.total}`
                    : (selectedUser?.id === '__POOL__' || !selectedUser)
                      ? t('admin.sendToPool')
                      : t('admin.assignToPerson')}
              </Text>
            </TouchableOpacity>
          </View>
          )}

        {/* Veri Dışa Aktar (Export) - Sadece admin */}
          <View style={[styles.sectionCard, CARD_STYLE]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={styles.sectionTitle}>{t('admin.exportTitle')}</Text>
              {!isAdmin && <Text style={{ fontSize: 11, color: '#94a3b8' }}>(Sadece admin)</Text>}
            </View>
            <Text style={styles.exportLabel}>Görev Tipi (Task Type)</Text>
            <View style={styles.exportTaskTypeRow}>
              <TouchableOpacity style={[styles.exportChip, exportTaskType === 'audio' && styles.exportChipActive]} onPress={() => { setExportTaskType('audio'); setExportFormat('json'); }}>
                <Text style={[styles.exportChipText, exportTaskType === 'audio' && styles.exportChipTextActive]}>Ses</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.exportChip, exportTaskType === 'image' && styles.exportChipActive]} onPress={() => { setExportTaskType('image'); setExportFormat('yolo'); }}>
                <Text style={[styles.exportChipText, exportTaskType === 'image' && styles.exportChipTextActive]}>Görsel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.exportChip, exportTaskType === 'video' && styles.exportChipActive]} onPress={() => { setExportTaskType('video'); setExportFormat('yolo'); }}>
                <Text style={[styles.exportChipText, exportTaskType === 'video' && styles.exportChipTextActive]}>Video</Text>
              </TouchableOpacity>
            </View>
            {exportTaskType === 'audio' && (
              <Text style={[styles.exportLabel, { marginBottom: 8 }]}>Export Format: JSON</Text>
            )}
            {exportTaskType === 'image' && (
              <>
                <Text style={styles.exportLabel}>Export Format:</Text>
                <View style={styles.exportFormatRow}>
                  <TouchableOpacity style={[styles.exportChip, exportFormat === 'yolo' && styles.exportChipActive]} onPress={() => setExportFormat('yolo')}>
                    <Text style={[styles.exportChipText, exportFormat === 'yolo' && styles.exportChipTextActive]}>YOLO (.txt)</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.exportChip, exportFormat === 'coco' && styles.exportChipActive]} onPress={() => setExportFormat('coco')}>
                    <Text style={[styles.exportChipText, exportFormat === 'coco' && styles.exportChipTextActive]}>COCO (.json)</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.exportChip, exportFormat === 'pascalvoc' && styles.exportChipActive]} onPress={() => setExportFormat('pascalvoc')}>
                    <Text style={[styles.exportChipText, exportFormat === 'pascalvoc' && styles.exportChipTextActive]}>Pascal VOC (.xml)</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
            {exportTaskType === 'video' && (
              <Text style={[styles.exportLabel, { marginBottom: 8 }]}>Export Format: YOLO (.txt)</Text>
            )}
            <View style={styles.exportField}>
              {/* Dil seçeneği sadece ses görevleri için gösterilir */}
              {exportTaskType === 'audio' && (
                <>
                  <Text style={styles.exportLabel}>{t('admin.exportLanguage')}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.exportChips}>
                    {['all', ...TASK_LANGUAGES.filter((l) => l.code !== 'unspecified').map((l) => l.code)].map((lang) => (
                      <TouchableOpacity key={lang} style={[styles.exportChip, exportLang === lang && styles.exportChipActive]} onPress={() => setExportLang(lang)}>
                        <Text style={[styles.exportChipText, exportLang === lang && styles.exportChipTextActive]} numberOfLines={1}>{lang === 'all' ? 'Tümü' : t(`languages.${lang}`)}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>
              )}
            </View>
            <View style={styles.exportField}>
              <Text style={styles.exportLabel}>{t('admin.exportClient')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.exportChips}>
                {['all', ...clientNames].map((name) => (
                  <TouchableOpacity key={name} style={[styles.exportChip, exportClient === name && styles.exportChipActive]} onPress={() => setExportClient(name)}>
                    <Text style={[styles.exportChipText, exportClient === name && styles.exportChipTextActive]} numberOfLines={1}>{name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            <TouchableOpacity style={[styles.exportBtn, (exporting || !isAdmin) && styles.exportBtnDisabled]} onPress={handleExport} disabled={exporting || !isAdmin}>
              <Ionicons name="download" size={18} color="#fff" />
              <Text style={styles.exportBtnText}>{exporting ? 'Dışa aktarılıyor...' : 'Dışa Aktar'}</Text>
            </TouchableOpacity>
          </View>

          {/* Annotators - Kullanıcı Listesi */}
          <View style={styles.annotatorsHeader}>
            <Text style={styles.sectionTitle}>{t('admin.annotators')}</Text>
            <View style={styles.searchWrap}>
              <Ionicons name="search" size={18} color="#94a3b8" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder={t('admin.searchAnnotatorPlaceholder')}
                placeholderTextColor="#64748b"
                value={annotatorSearchQuery}
                onChangeText={setAnnotatorSearchQuery}
              />
            </View>
          </View>
          <View>
          {displayUsers.map((u) => {
            const expertiseBadges = u.languages_expertise ?? [];
            const roleLabel = u.role === 'admin' ? 'Admin' : 'User';
            const earnings = userEarnings[u.id] || 0;
            const total = earnings;
            return (
              <View key={u.id} style={styles.tableCard}>
                <View style={styles.tableHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <Text style={{ fontWeight: '600', color: '#f8fafc', fontSize: 14 }}>{u.full_name || u.email || u.id}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[styles.roleBadge, { backgroundColor: u.role === 'admin' ? '#dc2626' : '#059669' }]}>{roleLabel}</Text>
                        <Text style={[styles.statusBadge, { backgroundColor: u.is_active ? '#10b981' : '#6b7280' }]}>{u.is_active ? 'Aktif' : 'Pasif'}</Text>
                      </View>
                    </View>
                    <TouchableOpacity onPress={() => showEditOptions(u)}>
                      <Ionicons name="pencil" size={14} color="#94a3b8" />
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={styles.expertiseCell}>
                  {expertiseBadges.map((code) => (
                    <View key={code} style={styles.expertiseBadge}>
                      <Text style={styles.expertiseBadgeText}>{code.toUpperCase()}</Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.roleBadge}>{roleLabel}</Text>
                <Text style={styles.earningsCell}>{total.toLocaleString('tr-TR')} TL</Text>
              </View>
            );
          })}
          </View>
      </ScrollView>
    </KeyboardAvoidingView>

    {/* Completed Tasks Modal */}
      {showCompletedTasks && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Tamamlanan Görevler</Text>
              <TouchableOpacity onPress={() => setShowCompletedTasks(false)}>
                <Ionicons name="close" size={24} color="#f8fafc" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalList}>
              {completedTasksList.length > 0 ? (
                completedTasksList.map((task) => (
                  <View key={task.id} style={styles.taskItem}>
                    <View style={styles.taskItemHeader}>
                      <Text style={styles.taskItemTitle} numberOfLines={2}>{task.title || 'İsimsiz Görev'}</Text>
                      <Text style={styles.taskItemStatus}>{task.status === 'completed' ? 'Tamamlandı' : 'Gönderildi'}</Text>
                    </View>
                    <View style={styles.taskItemDetails}>
                      <Text style={styles.taskItemType}>Tip: {task.type || task.category || 'Bilinmeyen'}</Text>
                      <Text style={styles.taskItemDate}>
                        {new Date(task.updated_at).toLocaleDateString('tr-TR')} {new Date(task.updated_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                  </View>
                ))
              ) : (
                <Text style={styles.noTasksText}>Tamamlanan görev bulunamadı.</Text>
              )}
            </ScrollView>
          </View>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  scroll: { padding: 0, paddingBottom: 40 },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
    paddingVertical: 4,
    paddingRight: 12,
    alignSelf: 'flex-start',
  },
  backButtonText: { fontSize: 14, fontWeight: '600', color: '#f8fafc' },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  title: { fontSize: 22, fontWeight: '700', color: '#f8fafc', marginBottom: 8 },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-end',
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  refreshButtonText: { fontSize: 12, fontWeight: '600', color: '#f8fafc' },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  statCard: { flex: 1, minWidth: 100, padding: 12, minHeight: 80 },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  actionCardTouch: { flex: 1, minWidth: 100 },
  actionCard: { flex: 1, padding: 12, alignItems: 'center', justifyContent: 'center', minHeight: 80 },
  actionCardHover: { backgroundColor: 'rgba(255,255,255,0.12)', transform: [{ scale: 1.02 }], borderColor: 'rgba(255,255,255,0.18)' },
  actionCardIcon: { marginBottom: 6 },
  actionCardLabel: { fontSize: 11, color: '#94a3b8', textAlign: 'center', fontWeight: '600' },
  statValue: { fontSize: 18, fontWeight: '700', color: '#f8fafc', marginTop: 4, marginBottom: 2 },
  statLabel: { fontSize: 11, color: '#94a3b8' },
  typeBreakdown: { fontSize: 10, color: '#60a5fa', marginTop: 2, fontWeight: '500' },
  completionStatCard: { minWidth: 120 },
  completionTitle: { fontSize: 10, fontWeight: '600', color: '#94a3b8', marginBottom: 6 },
  progressBarWrap: { height: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden', marginBottom: 4 },
  progressBarFill: { height: '100%', backgroundColor: '#3b82f6', borderRadius: 3 },
  completionText: { fontSize: 11, fontWeight: '700', color: '#f8fafc' },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: '#f8fafc', marginTop: 16, marginBottom: 8 },
  annotatorsHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    backgroundColor: '#1e293b',
    borderRadius: 20,
    paddingHorizontal: 15,
    flex: 1,
    minWidth: 200,
    maxWidth: 280,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  searchIcon: { marginRight: 10 },
  searchInput: { flex: 1, paddingVertical: 0, fontSize: 14, color: '#ffffff' },
  sectionCard: { padding: 14, marginBottom: 8 },
  tableCard: { padding: 12, marginBottom: 8 },
  tableHeader: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' },
  tableHeaderText: { flex: 1, fontSize: 11, fontWeight: '600', color: '#94a3b8', minWidth: 0 },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  tableRowAdmin: { backgroundColor: 'rgba(59, 130, 246, 0.08)' },
  tableCell: { flex: 1, fontSize: 12, color: '#f1f5f9', minWidth: 0 },
  emailCell: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  emailText: { flex: 1, flexShrink: 1 },
  editIconBtn: { padding: 4 },
  expertiseCell: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 4, alignItems: 'center', minWidth: 0 },
  expertiseBadge: { backgroundColor: 'rgba(59, 130, 246, 0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  expertiseBadgeText: { fontSize: 10, fontWeight: '600', color: '#60a5fa' },
  roleCell: { flex: 1, minWidth: 0 },
  roleBadge: { fontSize: 11, color: '#60a5fa', fontWeight: '600', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: 'rgba(59, 130, 246, 0.2)' },
  statusBadge: { fontSize: 10, fontWeight: '600', color: '#fff', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  earningsCell: { flex: 1, fontSize: 12, color: '#22c55e', fontWeight: '600', minWidth: 0 },
  label: { fontSize: 13, fontWeight: '600', color: '#94a3b8', marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: 'rgba(15,23,42,0.8)', borderRadius: 10, padding: 12, fontSize: 14, color: '#f1f5f9', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  row: { flexDirection: 'row', gap: 12, marginTop: 8 },
  btn: { flex: 1, backgroundColor: 'rgba(59, 130, 246, 0.3)', paddingVertical: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  recordBtn: { flex: 1, backgroundColor: 'rgba(100, 116, 139, 0.5)', flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', paddingVertical: 12, borderRadius: 10 },
  recordBtnActive: { backgroundColor: 'rgba(239, 68, 68, 0.4)' },
  recordDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#ef4444' },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  status: { fontSize: 11, color: '#60a5fa', marginTop: 6 },
  langChips: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  audioControls: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  recordBtnRecording: { backgroundColor: 'rgba(239, 68, 68, 0.4)' },
  imageUploadRow: { 
    flexDirection: 'row', 
    gap: 15, 
    alignItems: 'center',
    width: '100%',
    marginTop: 8,
  },
  taskTypeRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  taskTypeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(15,23,42,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  taskTypeChipActive: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  taskTypeChipText: { fontSize: 13, color: '#94a3b8', fontWeight: '600' },
  taskTypeChipTextActive: { color: '#fff' },
  langChipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  langChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(15,23,42,0.6)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  langChipActive: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  langChipText: { fontSize: 12, color: '#94a3b8' },
  langChipTextActive: { color: '#fff', fontWeight: '600' },
  userScroll: { marginVertical: 6, maxHeight: 44 },
  userChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: 'rgba(15,23,42,0.6)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', marginRight: 6 },
  userChipActive: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  userChipText: { color: '#94a3b8', fontSize: 13 },
  userChipTextActive: { color: '#fff', fontWeight: '600' },
  submitBtn: { backgroundColor: '#3b82f6', paddingVertical: 14, borderRadius: 10, alignItems: 'center', marginTop: 16 },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  placeholderText: { fontSize: 13, color: '#94a3b8', textAlign: 'center', paddingVertical: 16 },
  exportRow: { gap: 12, marginBottom: 12 },
  exportField: { marginBottom: 8 },
  exportLabel: { fontSize: 12, fontWeight: '600', color: '#94a3b8', marginBottom: 6 },
  exportTaskTypeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  exportFormatRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  exportChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  exportChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: 'rgba(15,23,42,0.6)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  exportChipActive: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  exportChipText: { fontSize: 12, color: '#94a3b8', fontWeight: '600' },
  exportChipTextActive: { color: '#fff' },
  exportSelect: { flex: 1, minWidth: 200 },
  exportSelectText: { color: '#f1f5f9' },
  exportBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#10b981', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 8 },
  exportBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  exportBtnDisabled: { opacity: 0.6 },

  // Bulk upload styles
  fileSelectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderWidth: 2,
    borderColor: '#f59e0b',
    borderStyle: 'dashed',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginTop: 12,
  },
  fileSelectBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f59e0b',
  },
  selectedFilesContainer: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  selectedFilesTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#10b981',
    marginBottom: 8,
  },
  fileNameText: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 4,
  },
  progressContainer: {
    marginTop: 16,
    padding: 16,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 8,
  },
  progressText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3b82f6',
    marginBottom: 8,
    textAlign: 'center',
  },
  progressBar: {
    height: 8,
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#3b82f6',
    borderRadius: 4,
  },
  progressPercent: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
  },
  errorContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 8,
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ef4444',
    marginBottom: 8,
  },
  errorText: {
    fontSize: 12,
    color: '#ef4444',
    marginBottom: 4,
  },
  // Image upload styles
  uploadImageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#f472b6',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    minWidth: 120,
  },
  uploadImageBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  uploadImageBtnDisabled: { opacity: 0.6 },
  imageUrlInput: {
    flex: 1,
    height: 48,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    paddingHorizontal: 16,
    color: '#f1f5f9',
    fontSize: 14,
  },
  // Queue progress styles
  queueProgressContainer: {
    marginTop: 16,
    padding: 16,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 8,
  },
  queueProgressText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3b82f6',
    marginBottom: 8,
    textAlign: 'center',
  },
  queueProgressBar: {
    height: 8,
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  queueProgressBarFill: {
    height: '100%',
    backgroundColor: '#3b82f6',
    borderRadius: 4,
  },
  queueProgressPercent: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
  },
  
  // Recent Tasks styles
  taskItem: {
    padding: 12,
    marginBottom: 8,
    backgroundColor: '#1e293b',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  taskItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  taskItemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f8fafc',
    flex: 1,
    marginRight: 12,
  },
  taskItemDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  taskItemType: {
    fontSize: 12,
    color: '#94a3b8',
  },
  taskItemStatus: {
    fontSize: 12,
    color: '#f59e0b',
  },
  taskItemImage: {
    fontSize: 12,
    color: '#10b981',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: '#ef4444',
    borderRadius: 6,
  },
  deleteButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  
  // Task Category Tabs styles
  taskCategoryTabs: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  categoryTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(15,23,42,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  categoryTabActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  categoryTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94a3b8',
  },
  categoryTabTextActive: {
    color: '#fff',
  },
  emptyCategoryContainer: {
    padding: 32,
    alignItems: 'center',
  },
  emptyCategoryText: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
  },
});
