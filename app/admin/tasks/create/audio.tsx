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
import { supabase } from '@/lib/supabase';

export default function CreateAudioTaskScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();

  const [taskData, setTaskData] = useState({
    company_name: '',
    title: '',
    description: '',
    language: 'tr',
    price: 0,
  });

  const [selectedFile, setSelectedFile] = useState<any>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [focusedInput, setFocusedInput] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState<'local' | 'remote' | 'record'>('local');
  const [remoteUrl, setRemoteUrl] = useState('');
  
  // Audio recording states
  const [isRecording, setIsRecording] = useState(false);
  const [audioURL, setAudioURL] = useState('');
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);

  const handleBack = () => {
    router.back();
  };

  const handleFileSelect = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'audio/mp3',
          'audio/wav',
          'audio/m4a',
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

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      setMediaRecorder(recorder);
      const audioChunks: Blob[] = [];
      
      recorder.ondataavailable = (event) => {
        audioChunks.push(event.data);
      };
      
      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
        const audioURL = URL.createObjectURL(audioBlob);
        setAudioURL(audioURL);
        setRecordedBlob(audioBlob);
        setIsRecording(false);
        setMediaRecorder(null);
        
        console.log('Audio recorded successfully:', audioURL);
        Alert.alert('Success', 'Audio recorded successfully!');
      };
      
      recorder.start();
      setIsRecording(true);
      
      console.log('Recording started...');
    } catch (error) {
      console.error('Error accessing microphone:', error);
      Alert.alert('Error', 'Failed to access microphone');
    }
  };
  
  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
  };

  const handleCreateTask = async () => {
    console.log("--- TASK OLUSTURMA BASLATILDI ---", taskData);
    
    // Validation
    if (!taskData.title || !taskData.company_name) {
      console.log("❌ Validation Hatası:", { title: taskData.title, company_name: taskData.company_name });
      alert("Lütfen Company Name ve Title doldurun!");
      return;
    }

    // Check if audio source is provided
    const hasAudioSource = selectedFile || remoteUrl || audioURL;
    if (!hasAudioSource) {
      console.log("❌ Audio Source Hatası:", { selectedFile, remoteUrl, audioURL });
      alert("Lütfen bir ses kayna seçin (Dosya, URL veya Kaydet)!");
      return;
    }

    console.log("✅ Validation Geçti, Creating başlıyor...");
    setIsCreating(true);

    try {
      // Audio URL'i belirle
      let audioUrlToSave = '';
      if (selectedFile) {
        audioUrlToSave = selectedFile.uri || selectedFile.name || 'local_file';
      } else if (remoteUrl) {
        audioUrlToSave = remoteUrl;
      } else if (audioURL) {
        audioUrlToSave = audioURL;
      }

      console.log("📊 Gönderilecek Veri:", {
        title: taskData.title,
        company_name: taskData.company_name,
        description: taskData.description,
        language: taskData.language,
        price: taskData.price,
        audio_url: audioUrlToSave
      });

      const { data, error } = await supabase.from('tasks').insert([{
        title: taskData.title,
        company_name: taskData.company_name,
        description: taskData.description,
        language: taskData.language,
        price: taskData.price,
        audio_url: audioUrlToSave,
        category: 'audio'
      }]).select();

      if (error) {
        console.error("--- DB HATASI ---", error);
        alert("Veritabanı Hatası: " + error.message);
        return;
      }

      console.log("--- TASK BASARIYLA OLUSTURULDU ---", data);
      Alert.alert('Success', 'Task Created');
      
      // Admin paneline yönlendir
      router.push('/admin');

    } catch (err: any) {
      console.error("--- KRITIK HATA ---", err);
      alert("Sistem Hatası: " + (err.message || 'Bilinmeyen hata'));
    } finally {
      console.log("--- CREATING ISLEMI BITTI ---");
      setIsCreating(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Ionicons name="arrow-back" size={20} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Audio Task</Text>
      </View>

      {/* Main Content */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Create Audio Transcription Task</Text>
        
        <View style={styles.form}>
          {/* Left Column */}
          <View style={styles.leftColumn}>
            <View style={styles.formGroup}>
              <Text style={styles.label}>Company Name *</Text>
              <TextInput
                style={[
                  styles.input,
                  focusedInput === 'company_name' && styles.inputFocused
                ]}
                value={taskData.company_name}
                onChangeText={(text) => setTaskData(prev => ({ ...prev, company_name: text }))}
                placeholder="Enter company or client name (e.g. TransPerfect, Google)"
                placeholderTextColor="#9ca3af"
                onFocus={() => setFocusedInput('company_name')}
                onBlur={() => setFocusedInput(null)}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Task Title *</Text>
              <TextInput
                style={[
                  styles.input,
                  focusedInput === 'title' && styles.inputFocused
                ]}
                value={taskData.title}
                onChangeText={(text) => setTaskData(prev => ({ ...prev, title: text }))}
                placeholder="Enter task title (e.g. Medical Report Transcription)"
                placeholderTextColor="#9ca3af"
                onFocus={() => setFocusedInput('title')}
                onBlur={() => setFocusedInput(null)}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Language</Text>
              <TouchableOpacity 
                style={styles.languageSelector}
                onPress={() => {
                  const languages = ['tr', 'en', 'ku', 'az'];
                  const currentIndex = languages.indexOf(taskData.language);
                  const nextIndex = (currentIndex + 1) % languages.length;
                  setTaskData(prev => ({ ...prev, language: languages[nextIndex] }));
                }}
              >
                <Text style={styles.languageText}>{taskData.language.toUpperCase()}</Text>
                <Ionicons name="chevron-down" size={16} color="#64748b" />
              </TouchableOpacity>
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
                placeholder="0.00"
                placeholderTextColor="#9ca3af"
                keyboardType="numeric"
                onFocus={() => setFocusedInput('price')}
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

            {/* Audio Source Section */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Audio Source (Dosya veya URL)</Text>
              
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
                <TouchableOpacity
                  style={[styles.sourceButton, sourceType === 'record' && styles.sourceButtonActive]}
                  onPress={() => setSourceType('record')}
                >
                  <Ionicons name="mic" size={16} color={sourceType === 'record' ? '#fff' : '#9ca3af'} />
                  <Text style={[styles.sourceButtonText, sourceType === 'record' && styles.sourceButtonTextActive]}>
                    Record Audio
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
                    {selectedFile ? selectedFile.name : 'Click to Upload Audio File'}
                  </Text>
                </TouchableOpacity>
              ) : sourceType === 'remote' ? (
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
                    placeholder="Enter audio URL (e.g. https://example.com/audio.mp3)"
                    placeholderTextColor="#9ca3af"
                    onFocus={() => setFocusedInput('url')}
                    onBlur={() => setFocusedInput(null)}
                  />
                </View>
              ) : (
                <View style={styles.recordContainer}>
                  {/* Recording Button */}
                  <TouchableOpacity 
                    style={[styles.recordButton, isRecording && styles.recordButtonRecording]} 
                    onPress={isRecording ? stopRecording : startRecording}
                  >
                    <Ionicons 
                      name={isRecording ? 'stop' : 'mic'} 
                      size={20} 
                      color={isRecording ? '#ef4444' : '#10b981'} 
                    />
                    <Text style={styles.recordButtonText}>
                      {isRecording ? 'Stop Recording' : 'Record Audio'}
                    </Text>
                  </TouchableOpacity>
                  
                  {/* Recorded Audio Preview */}
                  {audioURL && (
                    <View style={styles.audioPreview}>
                      <Text style={styles.audioPreviewText}>Recorded Audio</Text>
                      <Text style={styles.audioURL}>{audioURL}</Text>
                    </View>
                  )}
                </View>
              )}

              {/* Upload Progress */}
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

              {/* Upload Action Button */}
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

        {/* Save Button */}
        <TouchableOpacity 
          style={[styles.saveButton, isCreating && styles.saveButtonDisabled]} 
          onPress={handleCreateTask}
          disabled={isCreating}
        >
          {isCreating ? (
            <View style={styles.creatingContainer}>
              <ActivityIndicator size="small" color="#ffffff" />
              <Text style={styles.saveButtonText}>Creating...</Text>
            </View>
          ) : (
            <Text style={styles.saveButtonText}>Create Task</Text>
          )}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
    backgroundColor: '#1e293b',
  },
  backButton: {
    marginRight: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#ffffff',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 20,
  },
  form: {
    flexDirection: 'row',
    gap: 20,
  },
  leftColumn: {
    flex: 1,
  },
  rightColumn: {
    flex: 1,
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#e2e8f0',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#f1f5f9',
    backgroundColor: '#1e293b',
  },
  inputFocused: {
    borderColor: '#3b82f6',
  },
  textArea: {
    height: 120,
    textAlignVertical: 'top',
  },
  languageSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#1e293b',
  },
  languageText: {
    fontSize: 16,
    color: '#f1f5f9',
    fontWeight: '500',
  },
  sourceSelector: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  sourceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    gap: 6,
  },
  sourceButtonActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  sourceButtonText: {
    fontSize: 12,
    color: '#9ca3af',
    fontWeight: '500',
  },
  sourceButtonTextActive: {
    color: '#ffffff',
  },
  uploadButton: {
    borderWidth: 2,
    borderColor: '#334155',
    borderStyle: 'dashed',
    borderRadius: 8,
    padding: 20,
    alignItems: 'center',
    backgroundColor: '#1e293b',
  },
  uploadButtonFocused: {
    borderColor: '#3b82f6',
  },
  uploadButtonText: {
    color: '#f1f5f9',
    fontSize: 14,
    fontWeight: '500',
    marginTop: 8,
  },
  urlInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  urlInputIcon: {
    marginRight: 8,
  },
  urlInput: {
    flex: 1,
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  recordContainer: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    padding: 16,
  },
  recordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10b981',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  recordButtonRecording: {
    backgroundColor: '#ef4444',
  },
  recordButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  audioPreview: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#0f172a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  audioPreviewText: {
    fontSize: 14,
    color: '#e2e8f0',
    marginBottom: 4,
  },
  audioURL: {
    fontSize: 12,
    color: '#64748b',
  },
  progressContainer: {
    marginTop: 16,
    alignItems: 'center',
  },
  progressBar: {
    height: 4,
    backgroundColor: '#334155',
    borderRadius: 2,
    overflow: 'hidden',
    width: '100%',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#3b82f6',
  },
  progressText: {
    marginTop: 8,
    fontSize: 12,
    color: '#64748b',
  },
  uploadActionButton: {
    backgroundColor: '#3b82f6',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  uploadActionText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: '#10b981',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  saveButtonDisabled: {
    backgroundColor: '#64748b',
  },
  creatingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
