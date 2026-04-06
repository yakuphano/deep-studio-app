import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import * as DocumentPicker from 'expo-document-picker';

export default function CreateVideoTaskScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();

  const [taskData, setTaskData] = useState({
    title: '',
    description: '',
    videoUrl: '',
    annotationType: 'bbox',
    price: 0,
  });

  const [selectedFile, setSelectedFile] = useState<any>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [focusedInput, setFocusedInput] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState<'local' | 'remote'>('local');
  const [remoteUrl, setRemoteUrl] = useState('');

  const handleBack = () => {
    router.back();
  };

  const handleFileSelect = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'video/*',
          'video/mp4',
          'video/mov',
          'video/avi',
          'video/webm',
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setSelectedFile(result.assets[0]);
        setUploadProgress(0);
      }
    } catch (error) {
      console.error('File selection error:', error);
      Alert.alert('Error', 'Failed to select file');
    }
  };

  const simulateUpload = () => {
    if (!selectedFile) return;
    
    setIsUploading(true);
    let progress = 0;
    const interval = setInterval(() => {
      progress += 10;
      setUploadProgress(progress);
      
      if (progress >= 100) {
        clearInterval(interval);
        setIsUploading(false);
        Alert.alert('Success', 'File uploaded successfully');
      }
    }, 200);
  };

  const handleSave = () => {
    if (!taskData.title || !taskData.description) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }
    
    if (sourceType === 'local' && !selectedFile) {
      Alert.alert('Error', 'Please select a video file');
      return;
    }
    
    if (sourceType === 'remote' && !remoteUrl) {
      Alert.alert('Error', 'Please enter a video URL');
      return;
    }
    
    // Save task logic here
    const taskPayload = { 
      ...taskData, 
      sourceType,
      ...(sourceType === 'local' ? { selectedFile } : { remoteUrl })
    };
    
    console.log('Video task data:', taskPayload);
    Alert.alert('Success', 'Video task created successfully');
    router.push('/admin');
  };

  return (
    <View style={styles.container}>
      {/* Small Back Button */}
      <View style={styles.backButtonContainer}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Ionicons name="arrow-back" size={16} color="#9ca3af" />
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
      </View>

      {/* Main Content */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Create Video Annotation Task</Text>
        
        <View style={styles.form}>
          {/* Left Column */}
          <View style={styles.leftColumn}>
            <View style={styles.formGroup}>
              <Text style={styles.label}>Task Title *</Text>
              <TextInput
                style={[
                  styles.input,
                  focusedInput === 'title' && styles.inputFocused
                ]}
                value={taskData.title}
                onChangeText={(text) => setTaskData(prev => ({ ...prev, title: text }))}
                placeholder="Enter task title"
                placeholderTextColor="#9ca3af"
                onFocus={() => setFocusedInput('title')}
                onBlur={() => setFocusedInput(null)}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Price ($)</Text>
              <TextInput
                style={[
                  styles.input,
                  focusedInput === 'price' && styles.inputFocused
                ]}
                value={taskData.price.toString()}
                onChangeText={(text) => setTaskData(prev => ({ ...prev, price: parseFloat(text) || 0 }))}
                placeholder="Enter task price"
                placeholderTextColor="#9ca3af"
                keyboardType="numeric"
                onFocus={() => setFocusedInput('price')}
                onBlur={() => setFocusedInput(null)}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Annotation Type</Text>
              <TextInput
                style={[
                  styles.input,
                  focusedInput === 'annotationType' && styles.inputFocused
                ]}
                value={taskData.annotationType}
                onChangeText={(text) => setTaskData(prev => ({ ...prev, annotationType: text }))}
                placeholder="Enter annotation type (e.g., bbox, polygon, point)"
                placeholderTextColor="#9ca3af"
                onFocus={() => setFocusedInput('annotationType')}
                onBlur={() => setFocusedInput(null)}
              />
            </View>
          </View>

          {/* Right Column */}
          <View style={styles.rightColumn}>
            <View style={styles.formGroup}>
              <Text style={styles.label}>Description *</Text>
              <TextInput
                style={[
                  styles.input, 
                  styles.textArea,
                  focusedInput === 'description' && styles.inputFocused
                ]}
                value={taskData.description}
                onChangeText={(text) => setTaskData(prev => ({ ...prev, description: text }))}
                placeholder="Enter detailed task description"
                placeholderTextColor="#9ca3af"
                multiline
                numberOfLines={6}
                onFocus={() => setFocusedInput('description')}
                onBlur={() => setFocusedInput(null)}
              />
            </View>

            {/* File Upload Section */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Video Source</Text>
              
              {/* Source Type Selector */}
              <View style={styles.sourceSelector}>
                <TouchableOpacity
                  style={[styles.sourceButton, sourceType === 'local' && styles.sourceButtonActive]}
                  onPress={() => setSourceType('local')}
                >
                  <Ionicons name="cloud-upload" size={16} color={sourceType === 'local' ? '#fff' : '#9ca3af'} />
                  <Text style={[styles.sourceButtonText, sourceType === 'local' && styles.sourceButtonTextActive]}>
                    Local File
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.sourceButton, sourceType === 'remote' && styles.sourceButtonActive]}
                  onPress={() => setSourceType('remote')}
                >
                  <Ionicons name="link" size={16} color={sourceType === 'remote' ? '#fff' : '#9ca3af'} />
                  <Text style={[styles.sourceButtonText, sourceType === 'remote' && styles.sourceButtonTextActive]}>
                    Remote URL
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Dynamic Content Based on Source Type */}
              {sourceType === 'local' ? (
                <TouchableOpacity 
                  style={[
                    styles.uploadButton,
                    focusedInput === 'upload' && styles.uploadButtonFocused
                  ]} 
                  onPress={handleFileSelect}
                  disabled={isUploading}
                  onFocus={() => setFocusedInput('upload')}
                  onBlur={() => setFocusedInput(null)}
                >
                  <Ionicons name="folder" size={24} color="#facc15" />
                  <Text style={styles.uploadButtonText}>
                    {selectedFile ? selectedFile.name : 'Click to Upload Video File'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.urlInputContainer}>
                  <Ionicons name="link" size={16} color="#9ca3af" style={styles.urlInputIcon} />
                  <TextInput
                    style={[
                      styles.input,
                      styles.urlInput,
                      focusedInput === 'url' && styles.inputFocused
                    ]}
                    value={remoteUrl}
                    onChangeText={setRemoteUrl}
                    placeholder="Paste Video URL"
                    placeholderTextColor="#9ca3af"
                    onFocus={() => setFocusedInput('url')}
                    onBlur={() => setFocusedInput(null)}
                  />
                </View>
              )}

              {selectedFile && sourceType === 'local' && (
                <View style={styles.fileInfo}>
                  <Text style={styles.fileName}>{selectedFile.name}</Text>
                  <Text style={styles.fileSize}>
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                  </Text>
                </View>
              )}

              {isUploading && (
                <View style={styles.progressContainer}>
                  <View style={styles.progressBar}>
                    <View 
                      style={[
                        styles.progressFill, 
                        { width: `${uploadProgress}%` }
                      ]} 
                    />
                  </View>
                  <Text style={styles.progressText}>{uploadProgress}%</Text>
                </View>
              )}

              {selectedFile && !isUploading && (
                <TouchableOpacity 
                  style={styles.uploadActionButton} 
                  onPress={simulateUpload}
                >
                  <Text style={styles.uploadActionText}>Start Upload</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

        <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
          <Text style={styles.saveButtonText}>Create Task</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  
  // Small Back Button
  backButtonContainer: {
    position: 'absolute',
    top: 20,
    left: 20,
    zIndex: 100,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: 'transparent',
    gap: 6,
  },
  backButtonText: {
    fontSize: 14,
    color: '#9ca3af',
    fontWeight: '500',
  },
  
  // Content
  content: {
    flex: 1,
    padding: 20,
    paddingTop: 60, // Space for the floating back button
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 32,
    textAlign: 'center',
  },
  form: {
    flexDirection: 'row',
    gap: 24,
    marginBottom: 24,
  },
  leftColumn: {
    flex: 1,
  },
  rightColumn: {
    flex: 1.5,
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#1f2937',
    borderWidth: 1,
    borderColor: '#30363d',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#ffffff',
  },
  inputFocused: {
    borderColor: '#3b82f6',
    borderWidth: 2,
  },
  textArea: {
    height: 120,
    textAlignVertical: 'top',
  },
  
  // File Upload
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1f2937',
    borderWidth: 2,
    borderColor: '#30363d',
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 20,
    gap: 12,
  },
  uploadButtonFocused: {
    borderColor: '#facc15',
    borderWidth: 2,
  },
  uploadButtonText: {
    fontSize: 16,
    color: '#ffffff',
    fontWeight: '500',
    flex: 1,
    textAlign: 'center',
  },
  fileInfo: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#1f2937',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#30363d',
  },
  fileName: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: '600',
    marginBottom: 4,
  },
  fileSize: {
    fontSize: 12,
    color: '#64748b',
  },
  progressContainer: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressBar: {
    flex: 1,
    height: 8,
    backgroundColor: '#30363d',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#3b82f6',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 12,
    color: '#3b82f6',
    fontWeight: '600',
    minWidth: 40,
  },
  uploadActionButton: {
    backgroundColor: '#facc15',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  uploadActionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
  },
  
  // Source Selector Styles
  sourceSelector: {
    flexDirection: 'row',
    backgroundColor: '#1f2937',
    borderRadius: 8,
    padding: 4,
    marginBottom: 12,
  },
  sourceButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    gap: 6,
  },
  sourceButtonActive: {
    backgroundColor: '#3b82f6',
  },
  sourceButtonText: {
    fontSize: 12,
    color: '#9ca3af',
    fontWeight: '600',
  },
  sourceButtonTextActive: {
    color: '#fff',
  },
  
  // URL Input Styles
  urlInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1f2937',
    borderWidth: 1,
    borderColor: '#30363d',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  urlInputIcon: {
    marginRight: 8,
  },
  urlInput: {
    flex: 1,
    color: '#f8fafc',
    fontSize: 14,
  },
  
  // Save Button
  saveButton: {
    backgroundColor: '#3b82f6',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 32,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
});
