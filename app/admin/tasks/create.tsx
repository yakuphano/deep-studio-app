import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';

export default function CreateTaskScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();

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
  ];

  const handleTaskTypeSelect = (route: string) => {
    router.push(route);
  };

  const handleBack = () => {
    router.replace('/dashboard');
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
        
        <View style={styles.taskTypesGrid}>
          {taskTypes.map((taskType) => (
            <TouchableOpacity
              key={taskType.id}
              style={styles.taskTypeCard}
              onPress={() => handleTaskTypeSelect(taskType.route)}
              activeOpacity={0.8}
            >
              <View style={[styles.iconContainer, { backgroundColor: taskType.color + '20' }]}>
                <Ionicons name={taskType.icon as any} size={32} color={taskType.color} />
              </View>
              <Text style={styles.taskTypeTitle}>{taskType.title}</Text>
              <Text style={styles.taskTypeDescription}>{taskType.description}</Text>
              <View style={styles.selectButton}>
                <Ionicons name="arrow-forward" size={16} color="#ffffff" />
                <Text style={styles.selectButtonText}>Select</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
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
    fontSize: 16,
    color: '#94a3b8',
    textAlign: 'center',
    marginBottom: 32,
  },
  taskTypesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 20,
    justifyContent: 'center',
  },
  taskTypeCard: {
    flex: 1,
    minWidth: 280,
    maxWidth: 350,
    backgroundColor: '#1e293b',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 24,
    alignItems: 'center',
    minHeight: 200,
    elevation: 4,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  taskTypeTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f1f5f9',
    marginBottom: 8,
    textAlign: 'center',
  },
  taskTypeDescription: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
    flex: 1,
  },
  selectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3b82f6',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    gap: 8,
    elevation: 2,
  },
  selectButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
});
