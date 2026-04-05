import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
  Alert,
  ActivityIndicator,
  SafeAreaView,
  Dimensions,
  FlatList,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { triggerEarningsRefresh } from '@/lib/earningsRefresh';
import { useAuth } from '@/contexts/AuthContext';

// expo-av import
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';

interface TaskData {
  id: string;
  title: string;
  status?: string;
  price?: number | null;
  type?: 'audio' | 'image' | 'video' | string | null;
  category?: string | null;
  audio_url?: string;
  image_url?: string | null;
  video_url?: string | null;
  file_url?: string;
  transcription?: string;
  annotation_data?: unknown;
  language?: string | null;
}

interface VideoAnnotation {
  id: string;
  timestamp: number;
  label: string;
  frameData?: string;
  description?: string;
}

// Etiket seçenekleri (English - Image Annotation ile uyumlu)
const ANNOTATION_LABELS = [
  'Car',
  'Pedestrian', 
  'Traffic Light',
  'Tree',
  'Building',
  'Bicycle',
  'Truck',
  'Motorcycle',
  'Bus',
  'Traffic Sign',
  'Street Light',
  'Sidewalk',
  'Van',
  'Cat',
  'Dog'
];

// Renk paleti - Her etiket için benzersiz renk (Image Annotation ile uyumlu)
const LABEL_COLORS: Record<string, string> = {
  'Car': '#3b82f6',           // Mavi
  'Pedestrian': '#ef4444',    // Kırmızı
  'Traffic Light': '#f59e0b', // Sarı
  'Tree': '#22c55e',          // Yeşil
  'Building': '#8b5cf6',      // Mor
  'Bicycle': '#06b6d4',       // Cyan
  'Truck': '#f97316',         // Turuncu
  'Motorcycle': '#84cc16',    // Lime
  'Bus': '#a855f7',          // Pembe
  'Traffic Sign': '#64748b',  // Gri
  'Street Light': '#fbbf24',  // Sarı 2
  'Sidewalk': '#94a3b8',      // Gri 2
  'Van': '#0ea5e9',           // Sky Blue
  'Cat': '#f97316',           // Turuncu (canlı)
  'Dog': '#a855f7',           // Pembe (canlı)
};

// Etiket için renk getiren fonksiyon
const getLabelColor = (label: string): string => {
  return LABEL_COLORS[label] || '#64748b'; // Varsayılan gri
};

const { width: screenWidth } = Dimensions.get('window');

// Zaman formatı yardımcı fonksiyonu
const formatTime = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

// Kısa zaman formatı (Dakika:Saniye)
const formatShortTime = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

// Video URL'sini bulan yardımcı fonksiyon
const getVideoUrl = (task: TaskData): string | null => {
  console.log('🔍 Video URL aranıyor...');
  console.log('🎬 video_url:', task.video_url);
  console.log('🎬 file_url:', task.file_url);
  console.log('🎬 audio_url:', task.audio_url);
  
  // Önce video_url'yi kontrol et
  if (task.video_url && task.video_url.trim() !== '') {
    console.log('✅ video_url bulundu:', task.video_url);
    return task.video_url;
  }
  
  // Sonra file_url'yi kontrol et
  if (task.file_url && task.file_url.trim() !== '') {
    console.log('✅ file_url bulundu:', task.file_url);
    return task.file_url;
  }
  
  // Son olarak audio_url'yi kontrol et (bazı durumlarda video audio_url'de olabilir)
  if (task.audio_url && task.audio_url.trim() !== '') {
    console.log('✅ audio_url bulundu:', task.audio_url);
    return task.audio_url;
  }
  
  console.log('❌ Hiçbir video URL bulunamadı');
  return null;
};

export default function VideoAnnotationScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { isAdmin } = useAuth();
  
  console.log('🎬 Video Annotation Sayfası Yüklendi, ID:', id);
  
  const [task, setTask] = useState<TaskData | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [videoAnnotations, setVideoAnnotations] = useState<VideoAnnotation[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<Video>(null);

  useEffect(() => {
    const fetchTask = async () => {
      try {
        console.log('🔍 Görev ID ile sorgu yapılıyor:', id);
        
        const { data, error } = await supabase
          .from('tasks')
          .select('*')
          .eq('id', id)
          .single();

        if (error) {
          console.error('❌ Görev yüklenemedi:', error);
          Alert.alert('Hata', `Görev yüklenemedi: ${error.message}`);
          return;
        }

        if (!data) {
          console.error('❌ Görev bulunamadı, ID:', id);
          Alert.alert('Hata', `ID: ${id} için görev bulunamadı`);
          return;
        }

        // Debug: Gelen tüm veriyi console'a yazdır
        console.log('📊 Gelen Görev Verisi:', data);
        console.log('🎬 Görev başlığı:', data.title);
        console.log('🎬 Görev tipi:', data.type);
        console.log('🎬 video_url:', data.video_url);
        console.log('🎬 file_url:', data.file_url);
        console.log('🎬 audio_url:', data.audio_url);

        setTask(data);
        console.log('✅ Görev başarıyla yüklendi:', data.title);
      } catch (error) {
        console.error('❌ Görev yüklenirken hata:', error);
        Alert.alert('Hata', `Görev yüklenirken hata oluştu: ${error}`);
      } finally {
        setLoading(false);
      }
    };

    fetchTask();
  }, [id]);

  // Video kontrol fonksiyonları
  const handleVideoStatusUpdate = (status: AVPlaybackStatus) => {
    if (status.isLoaded) {
      setDuration(status.durationMillis ? status.durationMillis / 1000 : 0);
      setCurrentTime(status.positionMillis ? status.positionMillis / 1000 : 0);
      setIsPlaying(status.isPlaying || false);
    }
  };

  const handlePlayPause = async () => {
    if (videoRef.current) {
      if (isPlaying) {
        await videoRef.current.pauseAsync();
      } else {
        await videoRef.current.playAsync();
      }
    }
  };

  const handleSeek = async (value: number) => {
    if (videoRef.current) {
      await videoRef.current.setPositionAsync(value * 1000);
      setCurrentTime(value);
    }
  };

  // Tek tıkla obje ekleme fonksiyonu
  const addAnnotation = (label: string) => {
    const newAnnotation: VideoAnnotation = {
      id: Date.now().toString(),
      timestamp: currentTime,
      label: label,
      frameData: undefined,
      description: ''
    };
    
    setVideoAnnotations([...videoAnnotations, newAnnotation]);
    console.log('🎯 Obje eklendi:', { 
      timestamp: currentTime, 
      label: label,
      color: getLabelColor(label)
    });
  };

  // Etiket güncelleme fonksiyonu
  const updateAnnotationLabel = (annotationId: string, newLabel: string) => {
    setVideoAnnotations(prev => 
      prev.map(ann => 
        ann.id === annotationId ? { ...ann, label: newLabel } : ann
      )
    );
  };

  // Obje silme fonksiyonu
  const deleteAnnotation = (annotationId: string) => {
    setVideoAnnotations(prev => prev.filter(ann => ann.id !== annotationId));
    console.log('🗑️ Obje silindi:', annotationId);
  };

  const handleSubmit = async (navigateToNext: boolean = false) => {
    if (!task) return;
    
    // Obje kontrolü
    if (videoAnnotations.length === 0) {
      Alert.alert('Hata', 'Lütfen en az bir obje ekleyin');
      return;
    }
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('tasks')
        .update({
          status: 'submitted',
          annotation_data: videoAnnotations,
          updated_at: new Date().toISOString(),
        })
        .eq('id', task.id);

      if (error) {
        console.error('Görev gönderilemedi:', error);
        Alert.alert('Hata', 'Görev gönderilemedi');
        return;
      }

      console.log('🎬 Görev gönderildi:', task.title);
      console.log('📊 Toplam annotation sayısı:', videoAnnotations.length);
      Alert.alert('Başarılı', 'Görev başarıyla gönderildi');
      triggerEarningsRefresh();

      if (navigateToNext) {
        // Ana sayfaya dön
        router.back();
      }
      // navigateToNext false ise sayfada kal
    } catch (error) {
      console.error('Görev gönderilirken hata:', error);
      Alert.alert('Hata', 'Görev gönderilirken hata oluştu');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitAndExit = () => handleSubmit(true);
  const handleSubmitOnly = () => handleSubmit(false);
  const handleExit = () => {
    router.back();
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Video görevi yükleniyor...</Text>
      </View>
    );
  }

  if (!task) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Görev bulunamadı</Text>
      </View>
    );
  }

  // Video URL'sini bul
  const videoUrl = getVideoUrl(task);
  
  if (!videoUrl) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color="#ef4444" />
          <Text style={styles.errorTitle}>Video URL Bulunamadı</Text>
          <Text style={styles.errorText}>ID: {id} için veritabanında video adresi boş</Text>
          <Text style={styles.errorDetail}>Görev başlığı: {task.title || 'Belirsiz'}</Text>
          <Text style={styles.errorDetail}>Görev tipi: {task.type || 'Belirsiz'}</Text>
          <View style={styles.debugInfo}>
            <Text style={styles.debugText}>video_url: {task.video_url || 'Boş'}</Text>
            <Text style={styles.debugText}>file_url: {task.file_url || 'Boş'}</Text>
            <Text style={styles.debugText}>audio_url: {task.audio_url || 'Boş'}</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Absolute Back Button - En üstte */}
      <TouchableOpacity 
        onPress={() => {
          console.log('Back button clicked!');
          router.canGoBack() ? router.back() : router.replace('/tasks/video');
        }}
        style={{
          position: 'absolute',
          top: 20,
          left: 20,
          zIndex: 9999, // En üstte olduğundan emin ol
          flexDirection: 'row',
          alignItems: 'center',
          padding: 10,
          backgroundColor: 'rgba(0,0,0,0.3)', // Tıklanabilir alanı görmek için hafif bir arka plan
          borderRadius: 8,
        }}
        hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }} // Tıklama alanını genişlet
      >
        <Ionicons name="arrow-back" size={24} color="white" />
        <Text style={{ color: 'white', marginLeft: 8, fontWeight: '600' }}>Back</Text>
      </TouchableOpacity>

      {/* Header */}
      <View style={styles.header}>
        <View style={{ width: 120 }} /> {/* Back button için boşluk */}
        <Text style={styles.headerTitle}>{task.title || 'Video Annotation'}</Text>
        <View style={styles.priceBadge}>
          <Text style={styles.priceText}>{task.price || 0} TL</Text>
        </View>
      </View>

      {/* Ana Konteyner - flex: 1, flexDirection: 'row' */}
      <View style={styles.mainContainer}>
        {/* Sol Taraf - Video Alanı (flex: 0.75) */}
        <View style={styles.videoArea}>
          <View style={styles.videoContainer}>
            <Video
              ref={videoRef}
              source={{ uri: videoUrl }}
              style={styles.video}
              useNativeControls={false}
              resizeMode={ResizeMode.CONTAIN}
              onPlaybackStatusUpdate={handleVideoStatusUpdate}
            />
          </View>

          {/* Video Kontrolleri */}
          <View style={styles.videoControls}>
            <TouchableOpacity
              style={styles.playPauseButton}
              onPress={handlePlayPause}
            >
              <Ionicons 
                name={isPlaying ? "pause" : "play"} 
                size={24} 
                color="#fff" 
              />
            </TouchableOpacity>

            <View style={styles.timeDisplay}>
              <Text style={styles.timeText}>
                {formatTime(currentTime)} / {formatTime(duration)}
              </Text>
            </View>
          </View>

                  </View>

        {/* Sağ Taraf - Sidebar (flex: 1) */}
        <View style={styles.sidebarArea}>
          {/* Üstte sabit başlık */}
          <View style={styles.sidebarHeader}>
            <Text style={styles.sidebarTitle}>Object List</Text>
            <Text style={styles.sidebarCount}>
              {videoAnnotations.length} objects
            </Text>
          </View>

          {/* Etiket Buton Grubu */}
          <View style={styles.labelButtonsContainer}>
            {ANNOTATION_LABELS.map((label) => (
              <TouchableOpacity
                key={label}
                style={[styles.labelButton, { backgroundColor: getLabelColor(label) }]}
                onPress={() => addAnnotation(label)}
              >
                <Text style={styles.labelButtonText}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ScrollView içinde obje listesi */}
          <ScrollView style={styles.objectList} showsVerticalScrollIndicator={true}>
            {videoAnnotations.length === 0 ? (
              <Text style={styles.emptyText}>
                Click one of the buttons above to add an object.
              </Text>
            ) : (
              videoAnnotations.map((obj) => (
                <View key={obj.id} style={styles.objectRow}>
                  {/* Sol tarafta etiketin renginde küçük kare */}
                  <View style={[styles.colorSquare, { backgroundColor: getLabelColor(obj.label) }]} />
                  
                  {/* Orta içerik */}
                  <View style={styles.rowContent}>
                    <Text style={styles.rowTime}>[{formatShortTime(obj.timestamp)}]</Text>
                    <Text style={[styles.rowLabel, { color: getLabelColor(obj.label) }]}>
                      {obj.label}
                    </Text>
                  </View>
                  
                  {/* Sağda silme ikonu */}
                  <TouchableOpacity onPress={() => deleteAnnotation(obj.id)}>
                    <Ionicons name="trash-outline" size={16} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </View>

      {/* Bottom Button Bar */}
      <View style={styles.bottomButtonBar}>
        <View style={styles.bottomLeftActions}>
          <TouchableOpacity style={styles.exitButton} onPress={handleExit}>
            <Text style={styles.exitButtonText}>Exit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.submitExitButton, saving && styles.submitButtonDisabled]}
            onPress={handleSubmitAndExit}
            disabled={saving}
          >
            <Text style={styles.submitExitButtonText}>
              {saving ? 'Gönderiliyor...' : 'Submit & Exit'}
            </Text>
          </TouchableOpacity>
        </View>
        <View style={styles.bottomRightActions}>
          <TouchableOpacity
            style={[styles.submitButtonGreen, saving && styles.submitButtonDisabled]}
            onPress={handleSubmitOnly}
            disabled={saving}
          >
            <Text style={styles.submitButtonGreenText}>
              {saving ? 'Gönderiliyor...' : 'Submit'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

          </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  loadingText: {
    color: '#f1f5f9',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 20,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 20,
  },
  
  // Hata Ekranı Stilleri
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  errorTitle: {
    color: '#ef4444',
    fontSize: 20,
    fontWeight: '600',
    marginTop: 15,
    marginBottom: 10,
  },
  errorDetail: {
    color: '#94a3b8',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 5,
  },
  debugInfo: {
    backgroundColor: '#1e293b',
    padding: 15,
    borderRadius: 8,
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  debugText: {
    color: '#64748b',
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 3,
  },
  
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#1f2937',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    zIndex: 999,
    elevation: 5,
  },
  backText: {
    color: '#f1f5f9',
    fontSize: 16,
    marginLeft: 8,
  },
  headerTitle: {
    color: '#f1f5f9',
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
  },
  priceBadge: {
    backgroundColor: '#22c55e',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  priceText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },

  // Ana Konteyner - flex: 1, flexDirection: 'row'
  mainContainer: {
    flex: 1,
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 20,
    gap: 20,
  },

  // Sol Taraf - Video Alanı (flex: 3)
  videoArea: {
    flex: 3,
    flexDirection: 'column',
    gap: 8,
  },

  // Sağ Taraf - Sidebar (flex: 1)
  sidebarArea: {
    flex: 1,
    backgroundColor: '#111827',
    borderLeftWidth: 1,
    borderLeftColor: '#334155',
    flexDirection: 'column',
  },
  videoContainer: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#334155',
    flex: 1,
    minHeight: 300,
  },
  video: {
    width: '100%',
    height: '100%',
  },
  
  // Video Kontrolleri
  videoControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1e293b',
    padding: 15,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  playPauseButton: {
    backgroundColor: '#3b82f6',
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeDisplay: {
    flex: 1,
    alignItems: 'center',
  },
  timeText: {
    color: '#f1f5f9',
    fontSize: 14,
    fontFamily: 'monospace',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#22c55e',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 8,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },

  // Progress Bar
  progressContainer: {
    backgroundColor: '#1e293b',
    padding: 15,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  progressBar: {
    width: '100%',
    height: 8,
    borderRadius: 4,
  },
  progressBackground: {
    flex: 1,
    height: '100%',
    backgroundColor: '#475569',
    borderRadius: 4,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#3b82f6',
    borderRadius: 4,
  },

  // Sidebar Header
  sidebarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  sidebarTitle: {
    color: '#f1f5f9',
    fontSize: 16,
    fontWeight: '600',
  },
  sidebarCount: {
    color: '#64748b',
    fontSize: 12,
    backgroundColor: '#334155',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  annotationList: {
    flex: 1,
  },
  annotationListContent: {
    paddingBottom: 10,
  },
  emptyText: {
    color: '#64748b',
    fontSize: 14,
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 50,
  },

  // Obje Satırı - Basit liste stilleri
  objectRow: {
    padding: 10,
    marginBottom: 5,
    backgroundColor: '#1e293b',
    flexDirection: 'row',
    alignItems: 'center',
  },
  colorSquare: {
    width: 12,
    height: 12,
    borderRadius: 2,
    marginRight: 10,
  },
  rowContent: {
    flex: 1,
  },
  rowTime: {
    color: '#94a3b8',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  objectList: {
    flex: 1,
    padding: 12,
  },

  // Etiket Buton Grubu (Wrap ile optimize)
  labelButtonsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  labelButton: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    minWidth: 65,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  labelButtonText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  annotationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  timeLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  annotationTime: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  annotationLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  deleteButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    padding: 8,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  labelSelectorLabel: {
    color: '#94a3b8',
    fontSize: 12,
  },
  labelDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#334155',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    gap: 4,
  },
  selectedLabel: {
    color: '#f1f5f9',
    fontSize: 12,
  },

  // Footer - Bottom Button Bar
  bottomButtonBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#1e293b',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  bottomLeftActions: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  bottomRightActions: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  exitButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  exitButtonText: { 
    fontSize: 14, 
    color: '#ef4444', 
    fontWeight: '600' 
  },
  submitExitButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#3b82f6',
  },
  submitExitButtonText: { 
    fontSize: 14, 
    color: '#fff', 
    fontWeight: '600' 
  },
  submitButtonGreen: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#22c55e',
  },
  submitButtonGreenText: { 
    fontSize: 14, 
    color: '#fff', 
    fontWeight: '600' 
  },
  submitButtonDisabled: { 
    opacity: 0.6 
  },

  // Modal Stilleri
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  modalContainer: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 20,
    width: '90%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: '#334155',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    color: '#f1f5f9',
    fontSize: 18,
    fontWeight: '600',
  },
  modalCloseButton: {
    padding: 4,
  },
  modalContent: {
    marginBottom: 20,
  },
  modalLabel: {
    color: '#94a3b8',
    fontSize: 14,
    marginBottom: 12,
  },
  labelList: {
    maxHeight: 200,
  },
  labelOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: '#0f172a',
    borderLeftWidth: 4,
    gap: 12,
  },
  labelOptionSelected: {
    backgroundColor: '#334155',
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  labelOptionText: {
    color: '#f1f5f9',
    fontSize: 14,
    flex: 1,
  },
  labelOptionTextSelected: {
    fontWeight: '600',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#64748b',
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#64748b',
    fontSize: 14,
    fontWeight: '600',
  },
  modalConfirmButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#22c55e',
    alignItems: 'center',
  },
  modalConfirmText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
