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
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import * as DocumentPicker from 'expo-document-picker';
import { supabase } from '@/lib/supabase';
import { splitRemoteMediaUrlsFromInput } from '@/lib/mediaUrl';
import {
  importRemoteMediaViaEdge,
  logImportFailures,
  isZipDatasetUrl,
  isZipDatasetResponse,
} from '@/lib/importRemoteMedia';
import JSZip from 'jszip';

const WEB_FILE_ACCEPT =
  '.mp3,.wav,.m4a,.ogg,.flac,.zip,audio/*,application/zip,application/x-zip-compressed';

const DOCUMENT_PICKER_TYPES = [
  'audio/mp3',
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/m4a',
  'audio/mp4',
  'audio/ogg',
  'audio/flac',
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

function guessAudioContentType(fileName: string, mime?: string | null): string {
  if (mime && mime !== 'application/octet-stream') return mime;
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.m4a')) return 'audio/mp4';
  if (lower.endsWith('.ogg')) return 'audio/ogg';
  if (lower.endsWith('.flac')) return 'audio/flac';
  if (lower.endsWith('.webm')) return 'audio/webm';
  return 'application/octet-stream';
}

function notify(msg: string) {
  if (Platform.OS === 'web') window.alert(msg);
  else Alert.alert('Bilgi', msg);
}

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

  const [selectedFile, setSelectedFile] = useState<SelectedFileInfo | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [focusedInput, setFocusedInput] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState<'local' | 'remote' | 'record'>('local');
  const [remoteUrl, setRemoteUrl] = useState('');

  const [isRecording, setIsRecording] = useState(false);
  const [audioURL, setAudioURL] = useState('');
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);

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
    const path = `audios/${user.id}/${Date.now()}_${safe}`;
    const contentType = guessAudioContentType(filename, body instanceof Blob ? body.type : null);

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
        name: a.name || 'audio',
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

  const startRecording = async () => {
    if (Platform.OS !== 'web') {
      Alert.alert('Kayıt', 'Ses kaydı şu an yalnızca web tarayıcıda desteklenir.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      setMediaRecorder(recorder);
      const audioChunks: Blob[] = [];

      recorder.ondataavailable = (event) => {
        audioChunks.push(event.data);
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: recorder.mimeType || 'audio/webm' });
        revokePreview();
        const url = URL.createObjectURL(audioBlob);
        objectUrlRef.current = url;
        setAudioURL(url);
        setRecordedBlob(audioBlob);
        setIsRecording(false);
        setMediaRecorder(null);
        stream.getTracks().forEach((tr) => tr.stop());
      };

      recorder.start();
      setIsRecording(true);
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

  const processZipFile = async (file: SelectedFileInfo) => {
    const response = await fetch(file.uri);
    const blob = await response.blob();
    const zip = new JSZip();
    const zipContent = await zip.loadAsync(blob);
    const audioExtensions = ['.mp3', '.wav', '.m4a', '.ogg', '.flac'];
    const audioFiles: { name: string; zipEntry: JSZip.JSZipObject }[] = [];

    zipContent.forEach((relativePath, zf) => {
      if (zf.dir) return;
      const extension = relativePath.toLowerCase().substring(relativePath.lastIndexOf('.'));
      if (audioExtensions.includes(extension)) {
        audioFiles.push({ name: relativePath, zipEntry: zf });
      }
    });

    if (audioFiles.length === 0) {
      throw new Error('Zip dosyası içinde ses dosyası bulunamadı!');
    }
    return audioFiles;
  };

  const handleCreateTask = async () => {
    if (!taskData.title || !taskData.company_name) {
      notify('Lütfen Company Name ve Title doldurun!');
      return;
    }

    const hasAudioSource =
      sourceType === 'local'
        ? !!selectedFile
        : sourceType === 'remote'
          ? !!remoteUrl.trim()
          : !!recordedBlob;
    if (!hasAudioSource) {
      notify('Lütfen bir ses kaynağı seçin (Dosya, URL veya Kayıt).');
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
          setIsUploading(true);
          const audioFiles = await processZipFile(selectedFile);
          let done = 0;
          for (let index = 0; index < audioFiles.length; index++) {
            const { name: innerName, zipEntry } = audioFiles[index];
            const buf = await zipEntry.async('arraybuffer');
            const publicUrl = await uploadBytesToStorage(buf, innerName.split('/').pop() || innerName);
            tasksToCreate.push({
              title: `${taskData.title} - Part ${index + 1}`,
              company_name: taskData.company_name,
              description: `${taskData.description}\n\nAudio file: ${innerName}`,
              language: taskData.language,
              price: taskData.price,
              audio_url: publicUrl,
              type: 'audio',
              category: 'audio',
              is_pool_task: true,
            });
            done++;
            setUploadProgress(Math.round((done / audioFiles.length) * 100));
          }
          setIsUploading(false);
        } else {
          setIsUploading(true);
          let body: Blob | File | ArrayBuffer;
          if (Platform.OS === 'web' && selectedFile.webFile) {
            body = selectedFile.webFile;
          } else {
            const res = await fetch(selectedFile.uri);
            if (!res.ok) throw new Error('Ses dosyası okunamadı');
            body = await res.blob();
          }
          const publicUrl = await uploadBytesToStorage(body, selectedFile.name);
          setIsUploading(false);
          setUploadProgress(100);
          tasksToCreate = [
            {
              title: taskData.title,
              company_name: taskData.company_name,
              description: taskData.description,
              language: taskData.language,
              price: taskData.price,
              audio_url: publicUrl,
              type: 'audio',
              category: 'audio',
              is_pool_task: true,
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
          notify('.zip adresi yalnızca tek başına yapıştırılabilir.');
          setIsCreating(false);
          return;
        }
        setIsUploading(true);
        setUploadProgress(15);

        if (urls.length === 1 && isZipDatasetUrl(urls[0])) {
          setUploadProgress(30);
          const zipPayload = await importRemoteMediaViaEdge(remoteUrl, 'audio', {
            zipTaskTemplate: {
              company_name: taskData.company_name,
              title_prefix: taskData.title,
              description: taskData.description || '',
              price: Number(taskData.price) || 0,
              language: taskData.language,
            },
          });
          setIsUploading(false);
          if (!isZipDatasetResponse(zipPayload)) {
            notify('ZIP yanıtı alınamadı.');
            setIsCreating(false);
            return;
          }
          if (zipPayload.created === 0) {
            notify('ZIP içinden görev oluşturulamadı. Konsolu kontrol edin.');
            setIsCreating(false);
            return;
          }
          setUploadProgress(100);
          zipPayload.errors?.forEach((e) => console.warn('[ZIP import]', e));
          const skipPart = zipPayload.skipped > 0 ? `\nAtlanan: ${zipPayload.skipped}` : '';
          const msg = `ZIP veri seti içe aktarıldı.\nOluşturulan görev: ${zipPayload.created}${skipPart}`;
          if (Platform.OS === 'web') window.alert(msg);
          else Alert.alert('ZIP içe aktarma', msg);
          router.push('/admin');
          return;
        }

        const payload = await importRemoteMediaViaEdge(remoteUrl, 'audio');
        if (!('results' in payload) || !Array.isArray(payload.results)) {
          notify('Sunucu yanıtı geçersiz.');
          setIsCreating(false);
          setIsUploading(false);
          return;
        }
        logImportFailures(payload.results, 'CreateAudioTask');
        const ok = payload.results.filter((r) => r.publicUrl);
        if (ok.length === 0) {
          notify(
            'Hiçbir ses içe aktarılamadı. import-remote-media Edge Function ve SUPABASE_SERVICE_ROLE_KEY secret’ını kontrol edin; ayrıntılar konsolda.'
          );
          setIsCreating(false);
          setIsUploading(false);
          return;
        }
        const modeNote =
          payload.manifestMode && payload.manifestMode !== 'single'
            ? `\n\nManifest: ${payload.manifestMode} (${payload.expandedCount ?? ok.length} adres)`
            : '';
        tasksToCreate = ok.map((r, index) => ({
          title: ok.length > 1 ? `${taskData.title} - ${index + 1}` : taskData.title,
          company_name: taskData.company_name,
          description: `${taskData.description}${modeNote}\n\nKaynak: ${r.sourceUrl}`.trim(),
          language: taskData.language,
          price: taskData.price,
          audio_url: r.publicUrl!,
          type: 'audio',
          category: 'audio',
          is_pool_task: true,
        }));
        remoteImportSkipped = payload.results.length - ok.length;
        setUploadProgress(100);
        setIsUploading(false);
      } else if (sourceType === 'record') {
        if (!recordedBlob) {
          notify('Önce kayıt yapın.');
          setIsCreating(false);
          return;
        }
        setIsUploading(true);
        const ext = recordedBlob.type.includes('webm') ? 'webm' : 'wav';
        const fname = `recording_${Date.now()}.${ext}`;
        const publicUrl = await uploadBytesToStorage(recordedBlob, fname);
        setIsUploading(false);
        setUploadProgress(100);
        tasksToCreate = [
          {
            title: taskData.title,
            company_name: taskData.company_name,
            description: taskData.description,
            language: taskData.language,
            price: taskData.price,
            audio_url: publicUrl,
            type: 'audio',
            category: 'audio',
            is_pool_task: true,
          },
        ];
      }

      const { data, error } = await supabase.from('tasks').insert(tasksToCreate).select();

      if (error) {
        console.error('DB HATASI', error);
        notify('Veritabanı Hatası: ' + error.message);
        return;
      }

      const n = data?.length ?? tasksToCreate.length;
      const skipNote =
        sourceType === 'remote' && remoteImportSkipped > 0
          ? ` (${remoteImportSkipped} URL atlandı — konsol)`
          : '';
      if (Platform.OS === 'web') window.alert(`Tamam: ${n} görev oluşturuldu${skipNote}.`);
      else Alert.alert('Success', `${n} task(s) created!${skipNote}`);
      router.push('/admin');
    } catch (err: unknown) {
      console.error('KRITIK HATA', err);
      const m = err instanceof Error ? err.message : 'Bilinmeyen hata';
      notify('Sistem Hatası: ' + m);
    } finally {
      setIsCreating(false);
      setIsUploading(false);
    }
  };

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

      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Audio Task</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Create Audio Transcription Task</Text>
        <Text style={styles.hint}>
          Yerel dosya ve zip içindeki her ses Supabase Storage&apos;a yüklenir; görevde kalıcı https adresi
          saklanır (eski file:// / blob: kayıtları çalmaz).
        </Text>

        <View style={styles.form}>
          <View style={styles.leftColumn}>
            <View style={styles.formGroup}>
              <Text style={styles.label}>Company Name *</Text>
              <TextInput
                style={[styles.input, focusedInput === 'company_name' && styles.inputFocused]}
                value={taskData.company_name}
                onChangeText={(text) => setTaskData((prev) => ({ ...prev, company_name: text }))}
                placeholder="Enter company or client name (e.g. TransPerfect, Google)"
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
                  setTaskData((prev) => ({ ...prev, language: languages[nextIndex] }));
                }}
              >
                <Text style={styles.languageText}>{taskData.language.toUpperCase()}</Text>
                <Ionicons name="chevron-down" size={16} color="#64748b" />
              </TouchableOpacity>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Price ($)</Text>
              <TextInput
                style={[styles.input, focusedInput === 'price' && styles.inputFocused]}
                value={taskData.price.toString()}
                onChangeText={(text) => setTaskData((prev) => ({ ...prev, price: parseFloat(text) || 0 }))}
                placeholder="0.00"
                placeholderTextColor="#9ca3af"
                keyboardType="numeric"
                onFocus={() => setFocusedInput('price')}
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
                placeholder="Enter detailed task description"
                placeholderTextColor="#9ca3af"
                multiline
                numberOfLines={6}
                onFocus={() => setFocusedInput('description')}
                onBlur={() => setFocusedInput(null)}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Audio Source (Dosya veya URL)</Text>

              <View style={styles.sourceSelector}>
                <TouchableOpacity
                  style={[styles.sourceButton, sourceType === 'local' && styles.sourceButtonActive]}
                  onPress={() => {
                    setSourceType('local');
                    setRecordedBlob(null);
                    setAudioURL('');
                    revokePreview();
                  }}
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

              {sourceType === 'local' ? (
                <TouchableOpacity
                  style={[styles.uploadButton, focusedInput === 'upload' && styles.uploadButtonFocused]}
                  onPress={handleFileSelect}
                  disabled={isUploading || isCreating}
                  onFocus={() => setFocusedInput('upload')}
                  onBlur={() => setFocusedInput(null)}
                >
                  <Ionicons name="folder" size={24} color="#facc15" />
                  <Text style={styles.uploadButtonText}>
                    {selectedFile ? selectedFile.name : 'Ses veya zip dosyası seçin'}
                  </Text>
                </TouchableOpacity>
              ) : sourceType === 'remote' ? (
                <View style={styles.urlInputContainer}>
                  <Ionicons name="link" size={16} color="#9ca3af" style={styles.urlInputIcon} />
                  <TextInput
                    style={[styles.input, styles.urlInput, focusedInput === 'url' && styles.inputFocused]}
                    value={remoteUrl}
                    onChangeText={setRemoteUrl}
                    placeholder=".mp3 / .wav | .txt | .json | .zip veri seti"
                    placeholderTextColor="#9ca3af"
                    onFocus={() => setFocusedInput('url')}
                    onBlur={() => setFocusedInput(null)}
                  />
                </View>
              ) : (
                <View style={styles.recordContainer}>
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
                  {audioURL && recordedBlob ? (
                    <View style={styles.audioPreview}>
                      <Text style={styles.audioPreviewText}>Kayıt hazır (gönderimde Storage&apos;a yüklenecek)</Text>
                    </View>
                  ) : null}
                </View>
              )}

              {(isUploading || (isCreating && sourceType === 'local')) && (
                <View style={styles.progressContainer}>
                  <View style={styles.progressBar}>
                    <View style={[styles.progressFill, { width: `${uploadProgress}%` }]} />
                  </View>
                  <Text style={styles.progressText}>
                    {uploadProgress >= 100 ? 'Tamamlandı' : `Yükleniyor… ${uploadProgress}%`}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.saveButton, isCreating && styles.saveButtonDisabled]}
          onPress={() => void handleCreateTask()}
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
    marginBottom: 8,
  },
  hint: {
    fontSize: 13,
    color: '#94a3b8',
    marginBottom: 16,
    lineHeight: 20,
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
