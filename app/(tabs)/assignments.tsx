import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { colors } from '@/theme/colors';

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
  duration?: number | null;
};

function AudioTaskCard({
  item,
  onPress,
}: {
  item: Task;
  onPress: (id: string) => void;
}) {
  const formatPrice = (price: number | null) => {
    return price ? `$${price.toFixed(2)}` : 'Free';
  };

  const handlePress = () => {
    if (!item.id) {
      console.error('Görev ID bulunamadı!');
      return;
    }
    console.log('Navigating to task:', item.id);
    onPress(item.id);
  };

  return (
    <View style={styles.card}>
      {/* Audio Icon - Top Center */}
      <View style={styles.cardIconContainer}>
        <Ionicons name="musical-notes" size={32} color={colors.accent} />
      </View>
      
      {/* Task Title - Bold */}
      <Text style={styles.cardTitle} numberOfLines={2}>
        {item.title}
      </Text>
      
      {/* Price - Green */}
      <Text style={styles.cardPrice}>
        {formatPrice(item.price)}
      </Text>
      
      {/* Start Task Button - Blue */}
      <TouchableOpacity
        style={styles.startButton}
        onPress={handlePress}
      >
        <Text style={styles.startButtonText}>Start Task</Text>
      </TouchableOpacity>
    </View>
  );
}

function CategorySection({
  title,
  icon,
  children,
  color = colors.accent,
  isExpanded = false,
  onToggle,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  children: React.ReactNode;
  color?: string;
  isExpanded?: boolean;
  onToggle?: () => void;
}) {
  return (
    <View style={styles.categorySection}>
      <TouchableOpacity 
        style={styles.categoryHeader} 
        onPress={onToggle}
        activeOpacity={0.8}
      >
        <Ionicons name={icon} size={24} color={color} />
        <Text style={[styles.categoryTitle, { color }]}>{title}</Text>
        <Ionicons 
          name={isExpanded ? "chevron-up" : "chevron-down"} 
          size={20} 
          color={color} 
          style={styles.chevronIcon}
        />
      </TouchableOpacity>
      {isExpanded && (
        <View style={styles.categoryContent}>
          {children}
        </View>
      )}
    </View>
  );
}

export default function DashboardScreen() {
  console.log('--- KRITIK FIX UYGULANDI ---');
  const router = useRouter();
  const { user, session } = useAuth();
  const [audioTasks, setAudioTasks] = useState<Task[]>([]);
  const [imageTasks, setImageTasks] = useState<Task[]>([]);
  const [videoTasks, setVideoTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAudioExpanded, setIsAudioExpanded] = useState(false);
  const [isImageExpanded, setIsImageExpanded] = useState(false);
  const [isVideoExpanded, setIsVideoExpanded] = useState(false);

  const userId = user?.id ?? session?.user?.id ?? null;

  useEffect(() => {
    fetchAllTasks();
  }, [userId]);

  
  const fetchAllTasks = async () => {
    if (!userId) return;
    
    setLoading(true);
    try {
      // Fetch audio tasks
      const { data: audioData, error: audioError } = await supabase
        .from('tasks')
        .select('*')
        .eq('type', 'audio')
        .eq('status', 'pending')
        .or(`assigned_to.eq.${userId},assigned_to.is.null`);
      
      if (audioError) {
        console.error('[Dashboard] Audio fetch error:', audioError);
      } else {
        console.log('[Dashboard] Fetched audio tasks:', audioData?.length, audioData);
        setAudioTasks(audioData || []);
      }

      // Fetch image tasks
      const { data: imageData, error: imageError } = await supabase
        .from('tasks')
        .select('*')
        .eq('type', 'image')
        .eq('status', 'pending')
        .or(`assigned_to.eq.${userId},assigned_to.is.null`);
      
      if (imageError) {
        console.error('[Dashboard] Image fetch error:', imageError);
      } else {
        console.log('[Dashboard] Fetched image tasks:', imageData?.length, imageData);
        setImageTasks(imageData || []);
      }

      // Fetch video tasks
      const { data: videoData, error: videoError } = await supabase
        .from('tasks')
        .select('*')
        .eq('type', 'video')
        .eq('status', 'pending')
        .or(`assigned_to.eq.${userId},assigned_to.is.null`);
      
      if (videoError) {
        console.error('[Dashboard] Video fetch error:', videoError);
      } else {
        console.log('[Dashboard] Fetched video tasks:', videoData?.length, videoData);
        setVideoTasks(videoData || []);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleStartTask = (taskId: string) => {
    router.push(`/task/${taskId}`);
  };

  // Remove loading guard to prevent infinite loop
  // if (loading) {
  //   return (
  //     <View style={styles.loadingContainer}>
  //       <ActivityIndicator size="large" color={colors.accent} />
  //       <Text style={styles.loadingText}>Loading dashboard...</Text>
  //     </View>
  //   );
  // }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Dashboard</Text>
        <Text style={styles.headerSubtitle}>Choose a task to get started</Text>
      </View>

      {/* AUDIO TASKS Section */}
      <CategorySection 
        title="AUDIO TASKS" 
        icon="musical-notes" 
        color={colors.accentPurple}
        isExpanded={isAudioExpanded}
        onToggle={() => setIsAudioExpanded(!isAudioExpanded)}
      >
        {audioTasks.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="musical-notes-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyText}>Henüz ses görevi atanmadý</Text>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', padding: 10 }}>
            {audioTasks.map(item => {
              let taskColor;
              let taskIcon;
              switch (item.type) {
                case 'audio':
                  taskColor = '#3b82f6'; // Audio -> Mavi
                  taskIcon = '\ud83c\udfb5';
                  break;
                case 'image':
                  taskColor = '#ec4899'; // Image -> Pembe
                  taskIcon = '\ud83d\uddbc\ufe0f';
                  break;
                case 'video':
                  taskColor = '#10b981'; // Video -> YeÞil
                  taskIcon = '\ud83c\udfac';
                  break;
                default:
                  taskColor = '#3b82f6'; // Default -> Mavi
                  taskIcon = '\ud83c\udfb5';
              }
              return (
                <View key={item.id} style={{ 
                  width: '47%', 
                  backgroundColor: '#ffffff', 
                  borderRadius: 12, 
                  borderWidth: 1, 
                  borderColor: '#e5e7eb', 
                  padding: 16, 
                  marginBottom: 12, 
                  shadowColor: '#000', 
                  shadowOffset: { width: 0, height: 2 }, 
                  shadowOpacity: 0.1, 
                  shadowRadius: 4, 
                  elevation: 3 
                }}>
                   <Text style={{ textAlign: 'center', fontSize: 28, marginBottom: 8 }}>{taskIcon}</Text>
                   <Text style={{ fontWeight: 'bold', fontSize: 16, marginBottom: 4, textAlign: 'center' }}>{item.title}</Text>
                   <Text style={{ color: '#10b981', marginBottom: 12, fontSize: 14, textAlign: 'center' }}>{item.price ? `${item.price.toFixed(2)} TL` : '0.50 TL'}</Text>
                   <TouchableOpacity 
                     onPress={() => {
                       const taskId = item.id || item._id; // Her iki ihtimali de kontrol et
                       if (!taskId) {
                         alert('HATA: Bu görevin ID bilgisi veritabanindan eksik geliyor!');
                         console.log('Hatali Item:', item);
                         return;
                       }
                       console.log('Gidilecek ID:', taskId);
                       router.push(`/(tabs)/task/${taskId}`);
                     }}
                     style={{ 
                       backgroundColor: taskColor, 
                       padding: 12, 
                       borderRadius: 8, 
                       alignItems: 'center',
                       width: '100%'
                     }}>
                     <Text style={{ color: '#ffffff', fontWeight: 'bold', fontSize: 14 }}>Start Task</Text>
                   </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}
      </CategorySection>

      {/* IMAGE TASKS Section */}
      <CategorySection 
        title="IMAGE TASKS" 
        icon="image" 
        color={colors.success}
        isExpanded={isImageExpanded}
        onToggle={() => setIsImageExpanded(!isImageExpanded)}
      >
        {imageTasks.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="image-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyText}>No image tasks available yet</Text>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', padding: 10 }}>
            {imageTasks.map(item => {
              const taskColor = '#ec4899'; // Image -> PEMBE
              return (
                <View key={item.id} style={{ 
                  width: '47%', 
                  backgroundColor: '#ffffff', 
                  borderRadius: 12, 
                  borderWidth: 1, 
                  borderColor: '#e5e7eb', 
                  padding: 16, 
                  marginBottom: 12, 
                  shadowColor: '#000', 
                  shadowOffset: { width: 0, height: 2 }, 
                  shadowOpacity: 0.1, 
                  shadowRadius: 4, 
                  elevation: 3 
                }}>
                   <Text style={{ textAlign: 'center', fontSize: 28, marginBottom: 8 }}>{"\ud83d\uddbc\ufe0f"}</Text>
                   <Text style={{ fontWeight: 'bold', fontSize: 16, marginBottom: 4, textAlign: 'center' }}>{item.title}</Text>
                   <Text style={{ color: '#10b981', marginBottom: 12, fontSize: 14, textAlign: 'center' }}>{item.price ? `${item.price.toFixed(2)} TL` : '0.50 TL'}</Text>
                   <TouchableOpacity 
                     onPress={() => item.id ? router.push(`/task/${item.id}`) : console.log('ID YOK')}
                     style={{ 
                       backgroundColor: taskColor, 
                       padding: 12, 
                       borderRadius: 8, 
                       alignItems: 'center',
                       width: '100%'
                     }}>
                     <Text style={{ color: '#ffffff', fontWeight: 'bold', fontSize: 14 }}>Start Task</Text>
                   </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}
      </CategorySection>

      {/* VIDEO TASKS Section */}
      <CategorySection 
        title="VIDEO TASKS" 
        icon="videocam" 
        color={colors.warning}
        isExpanded={isVideoExpanded}
        onToggle={() => setIsVideoExpanded(!isVideoExpanded)}
      >
        {videoTasks.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="videocam-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyText}>No video tasks available yet</Text>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', padding: 10 }}>
            {videoTasks.map(item => {
              let taskColor;
              let taskIcon;
              switch (item.type) {
                case 'audio':
                  taskColor = '#3b82f6'; // Audio -> Mavi
                  taskIcon = '\ud83c\udfb5';
                  break;
                case 'image':
                  taskColor = '#ec4899'; // Image -> Pembe
                  taskIcon = '\ud83d\uddbc\ufe0f';
                  break;
                case 'video':
                  taskColor = '#10b981'; // Video -> YeÞil
                  taskIcon = '\ud83c\udfac';
                  break;
                default:
                  taskColor = '#3b82f6'; // Default -> Mavi
                  taskIcon = '\ud83c\udfb5';
              }
              return (
                <View key={item.id} style={{ 
                  width: '47%', 
                  backgroundColor: '#ffffff', 
                  borderRadius: 12, 
                  borderWidth: 1, 
                  borderColor: '#e5e7eb', 
                  padding: 16, 
                  marginBottom: 12, 
                  shadowColor: '#000', 
                  shadowOffset: { width: 0, height: 2 }, 
                  shadowOpacity: 0.1, 
                  shadowRadius: 4, 
                  elevation: 3 
                }}>
                   <Text style={{ textAlign: 'center', fontSize: 28, marginBottom: 8 }}>{taskIcon}</Text>
                   <Text style={{ fontWeight: 'bold', fontSize: 16, marginBottom: 4, textAlign: 'center' }}>{item.title}</Text>
                   <Text style={{ color: '#10b981', marginBottom: 12, fontSize: 14, textAlign: 'center' }}>{item.price ? `${item.price.toFixed(2)} TL` : '0.50 TL'}</Text>
                   <TouchableOpacity 
                     onPress={() => {
                       const taskId = item.id || item._id; // Her iki ihtimali de kontrol et
                       if (!taskId) {
                         alert('HATA: Bu görevin ID bilgisi veritabanindan eksik geliyor!');
                         console.log('Hatali Item:', item);
                         return;
                       }
                       console.log('Gidilecek ID:', taskId);
                       router.push(`/(tabs)/task/${taskId}`);
                     }}
                     style={{ 
                       backgroundColor: taskColor, 
                       padding: 12, 
                       borderRadius: 8, 
                       alignItems: 'center',
                       width: '100%'
                     }}>
                     <Text style={{ color: '#ffffff', fontWeight: 'bold', fontSize: 14 }}>Start Task</Text>
                   </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}
      </CategorySection>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.textMuted,
  },
  header: {
    marginBottom: 32,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 16,
    color: colors.textMuted,
  },
  categorySection: {
    marginBottom: 32,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  categoryTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginLeft: 12,
    flex: 1,
  },
  chevronIcon: {
    marginLeft: 'auto',
  },
  categoryContent: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    minHeight: 120,
  },
  cardRow: {
    justifyContent: 'space-between',
  },
  taskListContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  card: {
    width: '48%', // Approximately half screen width for two-column layout
    backgroundColor: '#ffffff', // White background
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
    minHeight: 160,
    alignItems: 'center',
    marginBottom: 12,
  },
  cardIconContainer: {
    alignItems: 'center',
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700', // Bold
    color: '#1a1a1a', // Dark text for white background
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 22,
  },
  cardPrice: {
    fontSize: 18,
    fontWeight: '600',
    color: '#22c55e', // Green color
    textAlign: 'center',
    marginBottom: 12,
  },
  startButton: {
    backgroundColor: '#3b82f6', // Blue color
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    width: '100%',
    alignItems: 'center',
  },
  startButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 14,
    color: colors.textMuted,
  },
  comingSoonContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  comingSoonText: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '600',
    color: colors.textMuted,
  },
});
