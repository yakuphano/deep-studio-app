import React, { useState, useRef, useCallback, createElement } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import * as DocumentPicker from 'expo-document-picker';
import { supabase } from '@/lib/supabase';
import JSZip from 'jszip';

const WEB_FILE_ACCEPT =
  '.jpg,.jpeg,.png,.gif,.webp,.bmp,.zip,image/*,application/zip,application/x-zip-compressed';

const DOCUMENT_PICKER_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
  'application/zip',
  'application/x-zip-compressed',
] as const;

type SelectedFileInfo = {
  name: string;
  size: number;
  uri: string;
  mimeType?: string | null;
  webFile?: File | null;
};

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function guessImageContentType(fileName: string, mime?: string | null): string {
  if (mime && mime !== 'application/octet-stream') return mime;
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.bmp')) return 'image/bmp';
  return 'application/octet-stream';
}

function notify(msg: string) {
  if (Platform.OS === 'web') window.alert(msg);
  else Alert.alert('Bilgi', msg);
}

export default function CreateImageTaskScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [taskData, setTaskData] = useState({
    company_name: '',
    title: '',
    description: '',
    imageUrl: '',
    annotationType: 'bbox',
    price: 0,
  });

  const [selectedFile, setSelectedFile] = useState<SelectedFileInfo | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isCreating, setIsCreating] = useState(false);
  const [focusedInput, setFocusedInput] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState<'local' | 'remote'>('local');
  const [remoteUrl, setRemoteUrl] = useState('');

  const webInputRef = useRef<HTMLInputElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const revokePreview = useCallback(() => {
    if (objectUrlRef.current) {
      try {
        URL.revokeObjectURL(objectUrlRef.current);
      } catch {
        /* ignore */
      }
      objectUrlRef.current = null;
    }
  }, []);

  const uploadBytesToStorage = async (
    body: Blob | File | ArrayBuffer,
    filename: string
  ): Promise<string> => {
    if (!user?.id) throw new Error('Oturum gerekli');
    const safe = sanitizeFileName(filename);
    const path = `images/${user.id}/${Date.now()}_${safe}`;
    const contentType = guessImageContentType(filename, body instanceof Blob ? body.type : null);

    const { error } = await supabase.storage.from('task-assets').upload(path, body, {
      contentType,
      upsert: false,
    });
    if (error) throw new Error(error.message || 'Storage yükleme hatası');

    const { data } = supabase.storage.from('task-assets').getPublicUrl(path);
    return data.publicUrl;
  };

  const handleFileSelect = async () => {
    try {
      if (Platform.OS === 'web') {
        revokePreview();
        webInputRef.current?.click();
        return;
      }
      const result = await DocumentPicker.getDocumentAsync({
        type: [...DOCUMENT_PICKER_TYPES],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.length) return;
      const a = result.assets[0];
      setSelectedFile({
        name: a.name || 'image',
        size: a.size ?? 0,
        uri: a.uri,
        mimeType: a.mimeType ?? null,
        webFile: null,
      });
      setUploadProgress(0);
    } catch (error) {
      console.error('File selection error:', error);
      Alert.alert('Error', 'Failed to select file');
    }
  };

  const handleWebFileInputChange = (e: Event) => {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    target.value = '';
    if (!file) return;
    const uri = URL.createObjectURL(file);
    objectUrlRef.current = uri;
    setSelectedFile({
      name: file.name,
      size: file.size,
      uri,
      mimeType: file.type || null,
      webFile: file,
    });
    setUploadProgress(0);
  };

  const processZipFile = async (file: SelectedFileInfo) => {
    const response = await fetch(file.uri);
    const blob = await response.blob();
    const zip = new JSZip();
    const zipContent = await zip.loadAsync(blob);
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
    const imageFiles: { name: string; zipEntry: JSZip.JSZipObject }[] = [];

    zipContent.forEach((relativePath, zf) => {
      if (zf.dir) return;
      const extension = relativePath.toLowerCase().substring(relativePath.lastIndexOf('.'));
      if (imageExtensions.includes(extension)) {
        imageFiles.push({ name: relativePath, zipEntry: zf });
      }
    });

    if (imageFiles.length === 0) {
      throw new Error('Zip dosyası içinde görsel dosyası bulunamadı!');
    }
    return imageFiles;
  };

  const handleCreateTask = async () => {
    if (!taskData.title || !taskData.company_name) {
      notify('Lütfen Şirket Adı ve Başlığı doldurun!');
      return;
    }

    const hasSource =
      sourceType === 'local' ? !!selectedFile : !!remoteUrl.trim();
    if (!hasSource) {
      notify('Yerel dosya seçin veya geçerli bir görüntü URL’si girin.');
      return;
    }

    if (!user?.id) {
      notify('Giriş yapmanız gerekir.');
      return;
    }

    setIsCreating(true);
    setUploadProgress(0);

    try {
      let tasksToCreate: Record<string, unknown>[] = [];

      if (sourceType === 'local' && selectedFile) {
        const isZip =
          selectedFile.name?.toLowerCase().endsWith('.zip') ||
          (selectedFile.mimeType ?? '').includes('zip');

        if (isZip) {
          const imageFiles = await processZipFile(selectedFile);
          let done = 0;
          for (let index = 0; index < imageFiles.length; index++) {
            const { name: innerName, zipEntry } = imageFiles[index];
            const buf = await zipEntry.async('arraybuffer');
            const base = innerName.split('/').pop() || innerName;
            const publicUrl = await uploadBytesToStorage(buf, base);
            tasksToCreate.push({
              title: `${taskData.title} - Part ${index + 1}`,
              company_name: taskData.company_name,
              type: 'image',
              annotation_type: taskData.annotationType,
              status: 'pending',
              assigned_to: null,
              image_url: publicUrl,
              description: `${taskData.description || ''}\n\nImage file: ${innerName}`,
              is_pool_task: true,
              price: Number(taskData.price) || 0,
            });
            done++;
            setUploadProgress(Math.round((done / imageFiles.length) * 100));
          }
        } else {
          let body: Blob | File | ArrayBuffer;
          if (Platform.OS === 'web' && selectedFile.webFile) {
            body = selectedFile.webFile;
          } else {
            const res = await fetch(selectedFile.uri);
            if (!res.ok) throw new Error('Görüntü dosyası okunamadı');
            body = await res.blob();
          }
          const publicUrl = await uploadBytesToStorage(body, selectedFile.name);
          setUploadProgress(100);
          tasksToCreate = [
            {
              title: taskData.title,
              company_name: taskData.company_name,
              type: 'image',
              annotation_type: taskData.annotationType,
              status: 'pending',
              assigned_to: null,
              image_url: publicUrl,
              description: taskData.description || '',
              is_pool_task: true,
              price: Number(taskData.price) || 0,
            },
          ];
        }
      } else if (sourceType === 'remote') {
        const url = remoteUrl.trim();
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          notify('Uzak adres https:// ile başlamalı.');
          setIsCreating(false);
          return;
        }
        tasksToCreate = [
          {
            title: taskData.title,
            company_name: taskData.company_name,
            type: 'image',
            annotation_type: taskData.annotationType,
            status: 'pending',
            assigned_to: null,
            image_url: url,
            description: taskData.description || '',
            is_pool_task: true,
            price: Number(taskData.price) || 0,
          },
        ];
      }

      const { data, error } = await supabase.from('tasks').insert(tasksToCreate).select();

      if (error) {
        console.error('DB HATASI', error);
        notify('Veritabanı: ' + error.message);
        return;
      }

      const n = data?.length ?? tasksToCreate.length;
      if (Platform.OS === 'web') window.alert(`Tamam: ${n} görev oluşturuldu.`);
      else Alert.alert('Success', `${n} task(s) created!`);
      router.push('/admin');
    } catch (err: unknown) {
      console.error(err);
      const m = err instanceof Error ? err.message : 'Bilinmeyen hata';
      notify('Hata: ' + m);
    } finally {
      setIsCreating(false);
    }
  };

  const handleBack = () => router.back();

  return (
    <View style={styles.container}>
      {Platform.OS === 'web'
        ? createElement('input', {
            ref: webInputRef,
            type: 'file',
            accept: WEB_FILE_ACCEPT,
            style: { display: 'none' },
            onChange: handleWebFileInputChange,
          })
        : null}

      <View style={styles.backButtonContainer}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Ionicons name="arrow-back" size={16} color="#3b82f6" />
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Create Image Annotation Task</Text>
        <Text style={styles.hint}>
          Yerel dosya ve zip içindeki her görüntü Supabase Storage (task-assets/images/…) üzerine
          yüklenir; görevde kalıcı https adresi saklanır.
        </Text>

        <View style={styles.form}>
          <View style={styles.leftColumn}>
            <View style={styles.formGroup}>
              <Text style={styles.label}>Company Name *</Text>
              <TextInput
                style={[styles.input, focusedInput === 'company_name' && styles.inputFocused]}
                value={taskData.company_name}
                onChangeText={(text) => setTaskData((prev) => ({ ...prev, company_name: text }))}
                placeholder="Company or client name"
                placeholderTextColor="#9ca3af"
                onFocus={() => setFocusedInput('company_name')}
                onBlur={() => setFocusedInput(null)}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Task Title *</Text>
              <TextInput
                style={[styles.input, focusedInput === 'title' && styles.inputFocused]}
                value={taskData.title}
                onChangeText={(text) => setTaskData((prev) => ({ ...prev, title: text }))}
                placeholder="Task title"
                placeholderTextColor="#9ca3af"
                onFocus={() => setFocusedInput('title')}
                onBlur={() => setFocusedInput(null)}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Price ($)</Text>
              <TextInput
                style={[styles.input, focusedInput === 'price' && styles.inputFocused]}
                value={taskData.price.toString()}
                onChangeText={(text) => setTaskData((prev) => ({ ...prev, price: parseFloat(text) || 0 }))}
                placeholder="0"
                placeholderTextColor="#9ca3af"
                keyboardType="numeric"
                onFocus={() => setFocusedInput('price')}
                onBlur={() => setFocusedInput(null)}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Annotation Type</Text>
              <TextInput
                style={[styles.input, focusedInput === 'annotationType' && styles.inputFocused]}
                value={taskData.annotationType}
                onChangeText={(text) => setTaskData((prev) => ({ ...prev, annotationType: text }))}
                placeholder="bbox, polygon, …"
                placeholderTextColor="#9ca3af"
                onFocus={() => setFocusedInput('annotationType')}
                onBlur={() => setFocusedInput(null)}
              />
            </View>
          </View>

          <View style={styles.rightColumn}>
            <View style={styles.formGroup}>
              <Text style={styles.label}>Description *</Text>
              <TextInput
                style={[styles.input, styles.textArea, focusedInput === 'description' && styles.inputFocused]}
                value={taskData.description}
                onChangeText={(text) => setTaskData((prev) => ({ ...prev, description: text }))}
                placeholder="Description"
                placeholderTextColor="#9ca3af"
                multiline
                numberOfLines={6}
                onFocus={() => setFocusedInput('description')}
                onBlur={() => setFocusedInput(null)}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Image Source</Text>

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

              {sourceType === 'local' ? (
                <TouchableOpacity
                  style={[styles.uploadButton, focusedInput === 'upload' && styles.uploadButtonFocused]}
                  onPress={handleFileSelect}
                  disabled={isCreating}
                  onFocus={() => setFocusedInput('upload')}
                  onBlur={() => setFocusedInput(null)}
                >
                  <Ionicons name="folder" size={24} color="#facc15" />
                  <Text style={styles.uploadButtonText}>
                    {selectedFile ? selectedFile.name : 'Görüntü veya zip seçin'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.urlInputContainer}>
                  <Ionicons name="link" size={16} color="#9ca3af" style={styles.urlInputIcon} />
                  <TextInput
                    style={[styles.input, styles.urlInput, focusedInput === 'url' && styles.inputFocused]}
                    value={remoteUrl}
                    onChangeText={setRemoteUrl}
                    placeholder="https://… görüntü adresi"
                    placeholderTextColor="#9ca3af"
                    onFocus={() => setFocusedInput('url')}
                    onBlur={() => setFocusedInput(null)}
                  />
                </View>
              )}

              {selectedFile && sourceType === 'local' ? (
                <View style={styles.fileInfo}>
                  <Text style={styles.fileName}>{selectedFile.name}</Text>
                  <Text style={styles.fileSize}>
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                  </Text>
                </View>
              ) : null}

              {isCreating && sourceType === 'local' ? (
                <View style={styles.progressContainer}>
                  <View style={styles.progressBar}>
                    <View style={[styles.progressFill, { width: `${uploadProgress}%` }]} />
                  </View>
                  <Text style={styles.progressText}>{uploadProgress}%</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.saveButton, isCreating && styles.saveButtonDisabled]}
          onPress={() => void handleCreateTask()}
          disabled={isCreating}
        >
          {isCreating ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ActivityIndicator color="#fff" />
              <Text style={styles.saveButtonText}>Yükleniyor…</Text>
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
    color: '#3b82f6',
    fontWeight: '500',
  },
  content: {
    flex: 1,
    padding: 20,
    paddingTop: 60,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 8,
    textAlign: 'center',
  },
  hint: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
    paddingHorizontal: 12,
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
    borderColor: '#f472b6',
    borderWidth: 2,
  },
  textArea: {
    height: 120,
    textAlignVertical: 'top',
  },
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
    backgroundColor: '#f472b6',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 12,
    color: '#f472b6',
    fontWeight: '600',
    minWidth: 40,
  },
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
  saveButton: {
    backgroundColor: '#f472b6',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 32,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
});
