import React, { useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { AppColors } from '@/theme/palettes';
import { useThemeColors } from '@/contexts/ThemeContext';

const GRID_COLUMNS = 4;
const GRID_GAP = 10;
/** content.paddingHorizontal 20 * 2 */
const CONTENT_HORIZONTAL_PAD = 40;
const GRID_MAX_WIDTH = 1040;

export default function CreateTaskScreen() {
  const themeColors = useThemeColors();
  const styles = useMemo(() => createStyles(themeColors), [themeColors]);

  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();

  const cardWidth = useMemo(() => {
    const gridW = Math.min(GRID_MAX_WIDTH, Math.max(280, windowWidth - CONTENT_HORIZONTAL_PAD));
    const raw = (gridW - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS;
    return Math.max(68, Math.floor(raw));
  }, [windowWidth]);

  const taskTypes = [
    {
      id: 'audio',
      title: 'Audio Transcription',
      description: 'Create transcription tasks for audio files with professional AI-powered tools',
      icon: 'mic',
      color: '#10b981',
      route: '/admin/tasks/create/audio',
    },
    {
      id: 'image',
      title: 'Image Annotation',
      description: 'Create annotation tasks for images with advanced labeling tools',
      icon: 'image',
      color: '#f472b6',
      route: '/admin/tasks/create/image',
    },
    {
      id: 'video',
      title: 'Video Annotation',
      description: 'Create annotation tasks for videos with frame-by-frame analysis',
      icon: 'videocam',
      color: '#3b82f6',
      route: '/admin/tasks/create/video',
    },
    {
      id: 'medical',
      title: 'Medical Data Annotation',
      description: 'Create medical imaging tasks (ROI, labels) from images or zip batches',
      icon: 'medkit',
      color: '#14b8a6',
      route: '/admin/tasks/create/medical',
    },
    {
      id: 'lidar',
      title: 'LiDAR Annotation',
      description: "Create LiDAR bird's-eye view tasks from images or zip batches",
      icon: 'scan',
      color: '#f97316',
      route: '/admin/tasks/create/lidar',
    },
  ];

  const handleTaskTypeSelect = (route: string) => {
    router.push(route);
  };

  const handleBack = () => {
    try {
      if (typeof router.canGoBack === 'function' && router.canGoBack()) {
        router.back();
      } else {
        router.replace('/admin');
      }
    } catch {
      router.replace('/admin');
    }
  };

  return (
    <View style={styles.container}>
      {/* Back Button */}
      <View style={styles.backButtonContainer}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Ionicons name="arrow-back" size={20} color="#64748b" />
        </TouchableOpacity>
      </View>

      {/* Main Content */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.subtitle}>
          Select the type of task you want to create
        </Text>
        
        <View style={[styles.taskTypesGrid, { maxWidth: GRID_MAX_WIDTH, gap: GRID_GAP }]}>
          {taskTypes.map((taskType) => (
            <TouchableOpacity
              key={taskType.id}
              style={[styles.taskTypeCard, { width: cardWidth }]}
              onPress={() => handleTaskTypeSelect(taskType.route)}
              activeOpacity={0.8}
            >
              <View style={[styles.iconContainer, { backgroundColor: taskType.color + '20' }]}>
                <Ionicons name={taskType.icon as any} size={22} color={taskType.color} />
              </View>
              <Text style={styles.taskTypeTitle} numberOfLines={2}>
                {taskType.title}
              </Text>
              <Text style={styles.taskTypeDescription} numberOfLines={3}>
                {taskType.description}
              </Text>
              <View style={styles.selectButton}>
                <Ionicons name="arrow-forward" size={14} color="#ffffff" />
                <Text style={styles.selectButtonText}>Select</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function createStyles(themeColors: AppColors) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: themeColors.background,
  },
  
  // Back Button
  backButtonContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  backButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(100, 116, 139, 0.1)',
  },
  
  // Content
  content: {
    flex: 1,
    padding: 20,
    paddingTop: 8,
  },
  subtitle: {
    fontSize: 15,
    color: themeColors.textMuted,
    textAlign: 'center',
    marginBottom: 18,
    paddingHorizontal: 8,
  },
  taskTypesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    alignContent: 'flex-start',
    alignSelf: 'center',
    width: '100%',
  },
  taskTypeCard: {
    flexGrow: 0,
    flexShrink: 0,
    flexDirection: 'column',
    backgroundColor: themeColors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: themeColors.border,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
    minHeight: 0,
    elevation: 2,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  taskTypeTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: themeColors.text,
    marginBottom: 4,
    textAlign: 'center',
    width: '100%',
  },
  taskTypeDescription: {
    fontSize: 11,
    color: themeColors.textMuted,
    textAlign: 'center',
    lineHeight: 15,
    marginBottom: 10,
    width: '100%',
    minHeight: 45,
  },
  selectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3b82f6',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 6,
    elevation: 2,
    marginTop: 6,
  },
  selectButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
});
}
