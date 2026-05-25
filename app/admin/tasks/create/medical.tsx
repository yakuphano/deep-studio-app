import React, { useMemo, useState, useRef, useCallback, createElement } from 'react';
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
import { splitRemoteMediaUrlsFromInput } from '@/lib/mediaUrl';
import {
  importRemoteMediaViaEdge,
  logImportFailures,
  isZipDatasetUrl,
} from '@/lib/importRemoteMedia';
import JSZip from 'jszip';
import GuidelineUploadField from '@/components/admin/GuidelineUploadField';
import {
  applyGuidelineToTaskRows,
  type GuidelineFileSelection,
} from '@/lib/uploadTaskGuideline';
import type { AppColors } from '@/theme/palettes';
import { useThemeColors } from '@/contexts/ThemeContext';
import { getAdminCreateTaskFormStyles } from '@/theme/adminCreateTaskForm';

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

export default function CreateMedicalTaskScreen() {
  const themeColors = useThemeColors();
  const styles = useMemo(() => createStyles(themeColors), [themeColors]);
  const acf = useMemo(() => getAdminCreateTaskFormStyles(themeColors), [themeColors]);

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
  const [guidelineFile, setGuidelineFile] = useState<GuidelineFileSelection | null>(null);

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
    const path = `medical/${user.id}/${Date.now()}_${safe}`;
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
      let remoteImportSkipped = 0;

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
              type: 'medical',
              category: 'medical',
              annotation_type: taskData.annotationType,
              status: 'pending',
              assigned_to: null,
              image_url: publicUrl,
              description: `${taskData.description || ''}\n\nImage file: ${innerName}`,
              is_pool_task: true,
              price: Number(taskData.price) || 0,
              language: 'tr',
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
              type: 'medical',
              category: 'medical',
              annotation_type: taskData.annotationType,
              status: 'pending',
              assigned_to: null,
              image_url: publicUrl,
              description: taskData.description || '',
              is_pool_task: true,
              price: Number(taskData.price) || 0,
              language: 'tr',
            },
          ];
        }
      } else if (sourceType === 'remote') {
        const urls = splitRemoteMediaUrlsFromInput(remoteUrl);
        if (urls.length === 0) {
          notify(
            'Geçerli en az bir http(s) adresi girin. Birden fazla URL: boşluk, virgül, ;, | veya yeni satır ile ayırın.'
          );
          setIsCreating(false);
          return;
        }
        if (urls.length > 1 && urls.some((u) => isZipDatasetUrl(u))) {
          notify('.zip adresi yalnızca tek başına yapıştırılabilir; diğer URL’leri kaldırın.');
          setIsCreating(false);
          return;
        }
        setUploadProgress(15);

        if (urls.length === 1 && isZipDatasetUrl(urls[0])) {
          notify(
            'Uzak ZIP içe aktarma tıbbi görev tipinde henüz desteklenmiyor. Yerel .zip yükleyin veya tek tek görüntü URL’leri kullanın.'
          );
          setIsCreating(false);
          return;
        }

        const payload = await importRemoteMediaViaEdge(remoteUrl, 'image');
        if (!('results' in payload) || !Array.isArray(payload.results)) {
          notify('Sunucu yanıtı geçersiz.');
          setIsCreating(false);
          return;
        }
        logImportFailures(payload.results, 'CreateMedicalTask');
        const ok = payload.results.filter((r) => r.publicUrl);
        if (ok.length === 0) {
          notify(
            'Hiçbir görüntü içe aktarılamadı. Supabase’de import-remote-media Edge Function ve SUPABASE_SERVICE_ROLE_KEY secret’ını kontrol edin; ayrıntılar konsolda.'
          );
          setIsCreating(false);
          return;
        }
        const modeNote =
          payload.manifestMode && payload.manifestMode !== 'single'
            ? `\n\nManifest: ${payload.manifestMode} (${payload.expandedCount ?? ok.length} adres)`
            : '';
        tasksToCreate = ok.map((r, index) => ({
          title: ok.length > 1 ? `${taskData.title} - ${index + 1}` : taskData.title,
          company_name: taskData.company_name,
          type: 'medical',
          category: 'medical',
          annotation_type: taskData.annotationType,
          status: 'pending',
          assigned_to: null,
          image_url: r.publicUrl!,
          description: `${taskData.description || ''}${modeNote}\n\nKaynak: ${r.sourceUrl}`.trim(),
          is_pool_task: true,
          price: Number(taskData.price) || 0,
          language: 'tr',
        }));
        remoteImportSkipped = payload.results.length - ok.length;
        setUploadProgress(100);
      }

      const rowsWithGuideline = await applyGuidelineToTaskRows(
        tasksToCreate,
        guidelineFile,
        user.id
      );
      const { data, error } = await supabase.from('tasks').insert(rowsWithGuideline).select();

      if (error) {
        console.error('DB HATASI', error);
        notify('Veritabanı: ' + error.message);
        return;
      }

      const n = data?.length ?? tasksToCreate.length;
      const failExtra =
        sourceType === 'remote' && remoteImportSkipped > 0
          ? ` (${remoteImportSkipped} URL atlandı — konsola bakın)`
          : '';
      if (Platform.OS === 'web') window.alert(`Tamam: ${n} görev oluşturuldu${failExtra}.`);
      else Alert.alert('Success', `${n} task(s) created!${failExtra}`);
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
        <Text style={styles.title}>Create Medical Data Annotation Task</Text>
        <Text style={styles.hint}>
          Tıbbi görüntü görevleri (DICOM benzeri 2D) yerel dosya veya uzak URL ile oluşturulur; dosyalar
          task-assets/medical/… altına yüklenir.
        </Text>

        <View style={acf.formPageMax}>
          <View style={acf.formPanel}>
            <Text style={acf.formEyebrow}>Task setup</Text>
            <View style={acf.form}>
          <View style={acf.leftColumn}>
            <View style={acf.formGroup}>
              <Text style={acf.label}>Company Name *</Text>
              <TextInput
                style={[styles.input, focusedInput === 'company_name' && styles.inputFocused]}
                value={taskData.company_name}
                onChangeText={(text) => setTaskData((prev) => ({ ...prev, company_name: text }))}
                placeholder="Company or client name"
                placeholderTextColor={themeColors.textMuted}
                onFocus={() => setFocusedInput('company_name')}
                onBlur={() => setFocusedInput(null)}
              />
            </View>

            <View style={acf.formGroup}>
              <Text style={acf.label}>Task Title *</Text>
              <TextInput
                style={[styles.input, focusedInput === 'title' && styles.inputFocused]}
                value={taskData.title}
                onChangeText={(text) => setTaskData((prev) => ({ ...prev, title: text }))}
                placeholder="Task title"
                placeholderTextColor={themeColors.textMuted}
                onFocus={() => setFocusedInput('title')}
                onBlur={() => setFocusedInput(null)}
              />
            </View>

            <View style={acf.formGroup}>
              <Text style={acf.label}>Price ($)</Text>
              <TextInput
                style={[styles.input, focusedInput === 'price' && styles.inputFocused]}
                value={taskData.price.toString()}
                onChangeText={(text) => setTaskData((prev) => ({ ...prev, price: parseFloat(text) || 0 }))}
                placeholder="0"
                placeholderTextColor={themeColors.textMuted}
                keyboardType="numeric"
                onFocus={() => setFocusedInput('price')}
                onBlur={() => setFocusedInput(null)}
              />
            </View>

            <View style={acf.formGroup}>
              <Text style={acf.label}>Annotation Type</Text>
              <TextInput
                style={[styles.input, focusedInput === 'annotationType' && styles.inputFocused]}
                value={taskData.annotationType}
                onChangeText={(text) => setTaskData((prev) => ({ ...prev, annotationType: text }))}
                placeholder="bbox, polygon, …"
                placeholderTextColor={themeColors.textMuted}
                onFocus={() => setFocusedInput('annotationType')}
                onBlur={() => setFocusedInput(null)}
              />
            </View>
          </View>

          <View style={[acf.rightColumn, { flex: 1.5 }]}>
            <View style={acf.formGroup}>
              <Text style={acf.label}>Description *</Text>
              <TextInput
                style={[styles.input, styles.textArea, focusedInput === 'description' && styles.inputFocused]}
                value={taskData.description}
                onChangeText={(text) => setTaskData((prev) => ({ ...prev, description: text }))}
                placeholder="Description"
                placeholderTextColor={themeColors.textMuted}
                multiline
                numberOfLines={4}
                onFocus={() => setFocusedInput('description')}
                onBlur={() => setFocusedInput(null)}
              />
            </View>

            <GuidelineUploadField
              value={guidelineFile}
              onChange={setGuidelineFile}
              disabled={isCreating}
            />

            <View style={acf.formGroup}>
              <Text style={acf.label}>Image Source</Text>

              <View style={styles.sourceSelector}>
                <TouchableOpacity
                  style={[styles.sourceButton, sourceType === 'local' && styles.sourceButtonActive]}
                  onPress={() => setSourceType('local')}
                >
                  <Ionicons name="cloud-upload" size={16} color={sourceType === 'local' ? '#fff' : themeColors.textMuted} />
                  <Text style={[styles.sourceButtonText, sourceType === 'local' && styles.sourceButtonTextActive]}>
                    Local File
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.sourceButton, sourceType === 'remote' && styles.sourceButtonActive]}
                  onPress={() => setSourceType('remote')}
                >
                  <Ionicons name="link" size={16} color={sourceType === 'remote' ? '#fff' : themeColors.textMuted} />
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
                  <Ionicons name="link" size={16} color={themeColors.textMuted} style={styles.urlInputIcon} />
                  <TextInput
                    style={[styles.input, styles.urlInput, focusedInput === 'url' && styles.inputFocused]}
                    value={remoteUrl}
                    onChangeText={setRemoteUrl}
                    placeholder=".jpg / .txt / .json / .zip (ZIP’te görüntü+ses+video karışık olabilir)"
                    placeholderTextColor={themeColors.textMuted}
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

              {isCreating && (sourceType === 'local' || sourceType === 'remote') ? (
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
          style={[styles.saveButton, acf.saveInPanel, isCreating && styles.saveButtonDisabled]}
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
          </View>
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
    padding: 14,
    paddingTop: 52,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: themeColors.text,
    marginBottom: 4,
    textAlign: 'center',
  },
  hint: {
    fontSize: 12,
    color: themeColors.textMuted,
    textAlign: 'center',
    marginBottom: 10,
    lineHeight: 17,
    paddingHorizontal: 8,
  },
  input: {
    backgroundColor: themeColors.surface,
    borderWidth: 1.5,
    borderColor: themeColors.border,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    color: themeColors.text,
  },
  inputFocused: {
    borderColor: '#14b8a6',
    borderWidth: 2,
  },
  textArea: {
    minHeight: 64,
    maxHeight: 88,
    textAlignVertical: 'top',
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: themeColors.surface,
    borderWidth: 2,
    borderColor: themeColors.border,
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 8,
  },
  uploadButtonFocused: {
    borderColor: '#14b8a6',
    borderWidth: 2,
  },
  uploadButtonText: {
    fontSize: 16,
    color: themeColors.text,
    fontWeight: '500',
    flex: 1,
    textAlign: 'center',
    backgroundColor: 'transparent',
  },
  fileInfo: {
    marginTop: 12,
    padding: 12,
    backgroundColor: themeColors.surface,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: themeColors.border,
  },
  fileName: {
    fontSize: 14,
    color: themeColors.text,
    fontWeight: '600',
    marginBottom: 4,
    backgroundColor: 'transparent',
  },
  fileSize: {
    fontSize: 12,
    color: themeColors.textMuted,
    backgroundColor: 'transparent',
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
    backgroundColor: themeColors.borderLight,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#14b8a6',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 12,
    color: '#14b8a6',
    fontWeight: '600',
    minWidth: 40,
  },
  sourceSelector: {
    flexDirection: 'row',
    backgroundColor: themeColors.surfaceElevated,
    borderRadius: 8,
    padding: 4,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: themeColors.borderLight,
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
    color: themeColors.textMuted,
    fontWeight: '600',
    backgroundColor: 'transparent',
  },
  sourceButtonTextActive: {
    color: '#fff',
  },
  urlInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: themeColors.surface,
    borderWidth: 1.5,
    borderColor: themeColors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  urlInputIcon: {
    marginRight: 8,
  },
  urlInput: {
    flex: 1,
    color: themeColors.text,
    fontSize: 14,
  },
  saveButton: {
    backgroundColor: '#14b8a6',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    alignItems: 'center',
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
}
