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
import { splitRemoteMediaUrlsFromInput } from '@/lib/mediaUrl';
import {
  importRemoteMediaViaEdge,
  logImportFailures,
  isZipDatasetUrl,
  isZipDatasetResponse,
} from '@/lib/importRemoteMedia';

/** Web file dialog + DocumentPicker: zip ve video */
const WEB_FILE_ACCEPT =
  '.zip,application/zip,application/x-zip-compressed,video/*,.mp4,.mov,.webm,.avi,.mkv';

const DOCUMENT_PICKER_TYPES = [
  'video/*',
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-msvideo',
  'video/x-matroska',
  'application/zip',
  'application/x-zip-compressed',
] as const;

/**
 * Uygulama üst sınırı (bellek / tarayıcı). Bunun üstü seçilemez.
 */
const MAX_FILE_BYTES = 500 * 1024 * 1024;

/**
 * Supabase Storage dosya limiti (Dashboard → Project Settings → Storage veya bucket).
 * Ücretsiz planda sık görülen değer ~50MB; 94MB yüklemek için hem Dashboard limitini hem bu env değerini artırın.
 * Örnek: EXPO_PUBLIC_MAX_STORAGE_UPLOAD_MB=100
 */
const PARSED_STORAGE_MB = Number(process.env.EXPO_PUBLIC_MAX_STORAGE_UPLOAD_MB);
const MAX_STORAGE_UPLOAD_MB =
  Number.isFinite(PARSED_STORAGE_MB) && PARSED_STORAGE_MB > 0 ? PARSED_STORAGE_MB : 50;
const MAX_STORAGE_UPLOAD_BYTES = MAX_STORAGE_UPLOAD_MB * 1024 * 1024;

const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.webm', '.avi', '.mkv', '.m4v'];

type SelectedFileInfo = {
  name: string;
  size: number;
  uri: string;
  mimeType?: string | null;
  /** Web <input type="file"> — doğrudan upload için */
  webFile?: File | null;
};

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function getLowerName(name: string): string {
  return name.trim().toLowerCase();
}

function isZipFile(name: string, mime?: string | null): boolean {
  const lower = getLowerName(name);
  if (lower.endsWith('.zip')) return true;
  const m = (mime || '').toLowerCase();
  return m === 'application/zip' || m === 'application/x-zip-compressed';
}

function isVideoFile(name: string, mime?: string | null): boolean {
  const lower = getLowerName(name);
  if (VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext))) return true;
  const m = (mime || '').toLowerCase();
  return m.startsWith('video/');
}

function isValidVideoOrZip(name: string, mime?: string | null): boolean {
  return isZipFile(name, mime) || isVideoFile(name, mime);
}

function resolveUploadContentType(name: string, mime?: string | null): string {
  if (mime && mime !== 'application/octet-stream') return mime;
  const lower = getLowerName(name);
  if (lower.endsWith('.zip')) return 'application/zip';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.mov')) return 'video/quicktime';
  if (lower.endsWith('.avi')) return 'video/x-msvideo';
  if (lower.endsWith('.mkv')) return 'video/x-matroska';
  if (lower.endsWith('.m4v')) return 'video/x-m4v';
  return 'application/octet-stream';
}

function notifyUser(title: string, message: string) {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
}

/** Konsolda tam hata ayrıntısı (Storage: message, statusCode, error) */
function logUploadError(phase: string, err: unknown) {
  console.error(`[CreateVideoTask / ${phase}] raw error:`, err);

  if (err instanceof Error) {
    console.error(`[CreateVideoTask / ${phase}] error.message:`, err.message);
    console.error(`[CreateVideoTask / ${phase}] error.stack:`, err.stack);
  }

  if (err && typeof err === 'object') {
    const o = err as Record<string, unknown>;
    const keys = ['message', 'name', 'statusCode', 'status', 'error', 'error_description', 'hint', 'code'];
    for (const k of keys) {
      if (k in o && o[k] != null) {
        console.error(`[CreateVideoTask / ${phase}] ${k}:`, o[k]);
      }
    }
    try {
      console.error(
        `[CreateVideoTask / ${phase}] JSON:`,
        JSON.stringify(err, [...new Set([...Object.keys(o), ...keys])])
      );
    } catch {
      console.error(`[CreateVideoTask / ${phase}] (JSON.stringify failed for error object)`);
    }
  }
}

function validateFileSizeForStorage(sizeBytes: number): string | null {
  if (sizeBytes > MAX_FILE_BYTES) {
    return `Dosya boyutu çok büyük. En fazla ${(MAX_FILE_BYTES / 1024 / 1024).toFixed(0)} MB yükleyebilirsiniz.`;
  }
  if (sizeBytes > MAX_STORAGE_UPLOAD_BYTES) {
    return (
      `Dosya boyutu Supabase Storage limitinizi aşıyor (yapılandırılan üst sınır: ${MAX_STORAGE_UPLOAD_MB} MB, ` +
      `dosya: ${(sizeBytes / 1024 / 1024).toFixed(1)} MB). ` +
      `Supabase Dashboard'dan dosya boyutu limitini artırın veya .env içinde EXPO_PUBLIC_MAX_STORAGE_UPLOAD_MB değerini güncelleyin.`
    );
  }
  return null;
}

export default function CreateVideoTaskScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [taskData, setTaskData] = useState({
    company_name: '',
    title: '',
    description: '',
    videoUrl: '',
    annotationType: 'bbox',
    price: 0,
  });

  const [selectedFile, setSelectedFile] = useState<SelectedFileInfo | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isCreating, setIsCreating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [focusedInput, setFocusedInput] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState<'local' | 'remote'>('local');
  const [remoteUrl, setRemoteUrl] = useState('');
  const [uploadedPublicUrl, setUploadedPublicUrl] = useState<string | null>(null);
  const [fileStatusMessage, setFileStatusMessage] = useState<string | null>(null);

  const webInputRef = useRef<HTMLInputElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const revokePreviewUrl = useCallback(() => {
    if (objectUrlRef.current) {
      try {
        URL.revokeObjectURL(objectUrlRef.current);
      } catch {
        /* ignore */
      }
      objectUrlRef.current = null;
    }
  }, []);

  type UploadTrigger = 'auto' | 'manual';

  const uploadToStorage = useCallback(
    async (file: SelectedFileInfo, opts?: { trigger?: UploadTrigger }): Promise<string | null> => {
      const trigger = opts?.trigger ?? 'manual';

      if (!user?.id) {
        const msg = 'Yükleme için giriş yapmanız gerekir.';
        logUploadError('auth', new Error(msg));
        notifyUser('Oturum', msg);
        return null;
      }

      const sizeErr = validateFileSizeForStorage(file.size);
      if (sizeErr) {
        logUploadError('validate-size', new Error(sizeErr));
        notifyUser('Dosya boyutu çok büyük', sizeErr);
        return null;
      }

      setIsUploading(true);
      setUploadProgress(5);
      setFileStatusMessage(trigger === 'auto' ? 'Dosya seçildi — yükleniyor…' : 'Yükleniyor…');

      let progressTimer: ReturnType<typeof setInterval> | null = null;

      try {
        progressTimer = setInterval(() => {
          setUploadProgress((p) => (p < 88 ? Math.min(88, p + 3) : p));
        }, 350);

        const safe = sanitizeFileName(file.name);
        const path = `videos/${user.id}/${Date.now()}_${safe}`;
        const contentType = resolveUploadContentType(file.name, file.mimeType);

        console.log('[CreateVideoTask / upload] start', {
          path,
          contentType,
          sizeBytes: file.size,
          sizeMB: (file.size / 1024 / 1024).toFixed(2),
          maxConfiguredMB: MAX_STORAGE_UPLOAD_MB,
        });

        let body: Blob | File | ArrayBuffer;

        try {
          if (Platform.OS === 'web' && file.webFile) {
            body = file.webFile;
          } else {
            console.log('[CreateVideoTask / upload] fetching file body from uri…');
            const response = await fetch(file.uri);
            if (!response.ok) {
              throw new Error(
                `Dosya okunamadı (HTTP ${response.status}). Ağ veya önbellek sorunu olabilir.`
              );
            }
            body = await response.blob();
          }
        } catch (readErr) {
          logUploadError('read-body', readErr);
          throw readErr instanceof Error
            ? readErr
            : new Error('Dosya okunurken hata oluştu.');
        }

        setUploadProgress(40);

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('task-assets')
          .upload(path, body, {
            contentType,
            upsert: false,
          });

        if (uploadError) {
          logUploadError('supabase-storage', uploadError);
          const msg =
            uploadError.message ||
            (typeof uploadError === 'object' && uploadError !== null && 'error' in uploadError
              ? String((uploadError as { error?: string }).error)
              : 'Storage yükleme hatası');
          throw new Error(msg);
        }

        console.log('[CreateVideoTask / upload] success', { path: uploadData?.path });

        setUploadProgress(100);

        const { data } = supabase.storage.from('task-assets').getPublicUrl(path);
        const publicUrl = data.publicUrl;
        setUploadedPublicUrl(publicUrl);
        setFileStatusMessage('Yükleme tamamlandı — gönderime hazır.');

        if (trigger === 'manual') {
          notifyUser('Başarılı', 'Dosya Supabase Storage’a yüklendi.');
        }

        return publicUrl;
      } catch (err) {
        logUploadError('uploadToStorage-catch', err);

        const rawMsg = err instanceof Error ? err.message : String(err);
        const friendly =
          /payload too large|413|maximum|too large|size/i.test(rawMsg)
            ? `Dosya boyutu sunucu veya Supabase limitini aşıyor olabilir. (${rawMsg})`
            : rawMsg;

        setFileStatusMessage('Yükleme başarısız — ayrıntı tarayıcı konsolunda (F12).');
        notifyUser('Yükleme hatası', friendly);
        return null;
      } finally {
        if (progressTimer) clearInterval(progressTimer);
        setIsUploading(false);
      }
    },
    [user?.id]
  );

  const applySelectedFile = useCallback(
    (info: SelectedFileInfo) => {
      const sizeErr = validateFileSizeForStorage(info.size);
      if (sizeErr) {
        notifyUser('Dosya boyutu çok büyük', sizeErr);
        return;
      }
      if (!isValidVideoOrZip(info.name, info.mimeType)) {
        notifyUser(
          'Geçersiz format',
          'Lütfen geçerli bir video (.mp4, .mov, .webm, .avi, .mkv, .m4v) veya .zip dosyası seçin.'
        );
        return;
      }

      if (info.uri.startsWith('blob:')) {
        objectUrlRef.current = info.uri;
      } else {
        revokePreviewUrl();
      }

      setUploadedPublicUrl(null);
      setSelectedFile(info);
      setUploadProgress(0);
      setFileStatusMessage(`Dosya seçildi: ${info.name}`);

      queueMicrotask(() => {
        void uploadToStorage(info, { trigger: 'auto' });
      });
    },
    [revokePreviewUrl, uploadToStorage]
  );

  const handleWebFileInputChange = useCallback(
    (e: Event) => {
      const target = e.target as HTMLInputElement;
      const file = target.files?.[0];
      target.value = '';
      if (!file) return;

      revokePreviewUrl();
      const uri = URL.createObjectURL(file);
      objectUrlRef.current = uri;

      applySelectedFile({
        name: file.name,
        size: file.size,
        uri,
        mimeType: file.type || null,
        webFile: file,
      });
    },
    [applySelectedFile, revokePreviewUrl]
  );

  const handleFileSelect = async () => {
    try {
      if (Platform.OS === 'web') {
        const input = webInputRef.current;
        if (input) {
          input.value = '';
          input.click();
        } else {
          notifyUser('Hata', 'Dosya seçici hazır değil. Sayfayı yenileyip tekrar deneyin.');
        }
        return;
      }

      const result = await DocumentPicker.getDocumentAsync({
        type: [...DOCUMENT_PICKER_TYPES],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      const name = asset.name || 'video';
      const size = asset.size ?? 0;
      const mimeType = asset.mimeType ?? null;

      applySelectedFile({
        name,
        size,
        uri: asset.uri,
        mimeType,
        webFile: null,
      });
    } catch (error) {
      console.error('File selection error:', error);
      notifyUser('Dosya seçimi', 'Dosya seçilirken bir hata oluştu. Lütfen tekrar deneyin.');
    }
  };

  const uploadSelectedFile = async (): Promise<string | null> => {
    if (!selectedFile) {
      notifyUser('Eksik dosya', 'Önce bir dosya seçin.');
      return null;
    }
    return uploadToStorage(selectedFile, { trigger: 'manual' });
  };

  const handleCreateTask = async () => {
    setIsCreating(true);
    let remoteImportSkipped = 0;
    try {
      if (!taskData.title) {
        notifyUser('Eksik Bilgi', 'Lütfen Başlığı doldurun!');
        return;
      }

      if (!taskData.price || taskData.price <= 0) {
        notifyUser('Eksik Bilgi', 'Lütfen geçerli bir fiyat girin!');
        return;
      }

      const rowsToInsert: Record<string, unknown>[] = [];

      if (sourceType === 'local') {
        if (!selectedFile) {
          notifyUser('Eksik Bilgi', 'Lütfen bir video veya .zip dosyası seçin ve yükleyin.');
          return;
        }
        if (isUploading) {
          notifyUser('Bekleyin', 'Dosya hâlâ yükleniyor; tamamlanana kadar bekleyin.');
          return;
        }
        let url = uploadedPublicUrl;
        if (!url) {
          url = await uploadToStorage(selectedFile, { trigger: 'auto' });
          if (!url) return;
        }

        if (isZipFile(selectedFile.name, selectedFile.mimeType)) {
          const companyName = (taskData.company_name || taskData.title || 'import').trim();
          if (!companyName) {
            notifyUser('Eksik Bilgi', 'ZIP içe aktarma için Şirket Adı veya Başlık gerekir.');
            return;
          }
          if (!taskData.title?.trim()) {
            notifyUser('Eksik Bilgi', 'ZIP görev başlığı şablonu (title) gerekir.');
            return;
          }
          setFileStatusMessage('ZIP veri seti sunucuda işleniyor (içindeki her video ayrı görev olur)…');
          setUploadProgress(30);
          const zipPayload = await importRemoteMediaViaEdge(url, 'video', {
            zipTaskTemplate: {
              company_name: companyName,
              title_prefix: taskData.title.trim(),
              description: taskData.description || '',
              price: Number(taskData.price),
            },
          });
          setFileStatusMessage(null);
          if (!isZipDatasetResponse(zipPayload)) {
            notifyUser('ZIP', 'Beklenmeyen yanıt. import-remote-media Edge sürümünü kontrol edin.');
            return;
          }
          if (zipPayload.created === 0) {
            notifyUser(
              'ZIP',
              'ZIP içinden video görevi oluşturulamadı. İçerikte .mp4/.webm/.mov/.m4v dosyaları olduğundan ve Edge loglarından emin olun.'
            );
            return;
          }
          setUploadProgress(100);
          zipPayload.errors?.forEach((e) => console.warn('[ZIP import]', e));
          const skipPart = zipPayload.skipped > 0 ? ` Atlanan: ${zipPayload.skipped}.` : '';
          notifyUser(
            'ZIP veri seti',
            `ZIP içe aktarma tamamlandı.\nOluşturulan görev: ${zipPayload.created}.${skipPart}`
          );
          router.push('/admin');
          return;
        }

        rowsToInsert.push({
          title: taskData.title,
          description: taskData.description || '',
          type: 'video',
          video_url: url,
          price: Number(taskData.price),
        });
      } else if (remoteUrl.trim()) {
        const urls = splitRemoteMediaUrlsFromInput(remoteUrl);
        if (urls.length === 0) {
          notifyUser(
            'Eksik Bilgi',
            'Geçerli en az bir http(s) adresi girin. Birden fazla URL: boşluk, virgül, ;, | veya yeni satır ile ayırın.'
          );
          return;
        }
        if (urls.length > 1 && urls.some((u) => isZipDatasetUrl(u))) {
          notifyUser('Eksik Bilgi', '.zip adresi yalnızca tek başına yapıştırılabilir.');
          return;
        }
        setUploadProgress(15);

        if (urls.length === 1 && isZipDatasetUrl(urls[0])) {
          setFileStatusMessage('ZIP veri seti indiriliyor ve işleniyor (birkaç dakika sürebilir)…');
          setUploadProgress(25);
          const zipPayload = await importRemoteMediaViaEdge(remoteUrl, 'video', {
            zipTaskTemplate: {
              company_name: (taskData.company_name || taskData.title || 'import').trim(),
              title_prefix: taskData.title,
              description: taskData.description || '',
              price: Number(taskData.price),
            },
          });
          setFileStatusMessage(null);
          if (!isZipDatasetResponse(zipPayload)) {
            notifyUser('ZIP', 'Beklenmeyen yanıt.');
            return;
          }
          if (zipPayload.created === 0) {
            notifyUser('ZIP', 'Görev oluşturulamadı. ZIP içeriği ve Edge loglarını kontrol edin.');
            return;
          }
          setUploadProgress(100);
          zipPayload.errors?.forEach((e) => console.warn('[ZIP import]', e));
          const skipPart = zipPayload.skipped > 0 ? ` Atlanan: ${zipPayload.skipped}.` : '';
          notifyUser(
            'ZIP veri seti',
            `ZIP dataset imported successfully.\nCreated ${zipPayload.created} tasks.${skipPart}`
          );
          router.push('/admin');
          return;
        }

        setFileStatusMessage('Uzak medya sunucuda indiriliyor (Edge Function)…');
        const payload = await importRemoteMediaViaEdge(remoteUrl, 'video');
        if (!('results' in payload) || !Array.isArray(payload.results)) {
          notifyUser('Hata', 'Sunucu yanıtı geçersiz.');
          setFileStatusMessage(null);
          return;
        }
        logImportFailures(payload.results, 'CreateVideoTask');
        const ok = payload.results.filter((r) => r.publicUrl);
        if (ok.length === 0) {
          notifyUser(
            'İçe aktarma başarısız',
            'Hiçbir video yüklenemedi. import-remote-media Edge Function ve SUPABASE_SERVICE_ROLE_KEY secret’ını kontrol edin; ayrıntılar konsolda.'
          );
          setFileStatusMessage(null);
          return;
        }
        const modeNote =
          payload.manifestMode && payload.manifestMode !== 'single'
            ? `\n\nManifest: ${payload.manifestMode} (${payload.expandedCount ?? ok.length} adres)`
            : '';
        for (let i = 0; i < ok.length; i++) {
          const r = ok[i];
          rowsToInsert.push({
            title: ok.length > 1 ? `${taskData.title} - ${i + 1}` : taskData.title,
            description: `${taskData.description || ''}${modeNote}\n\nKaynak: ${r.sourceUrl}`.trim(),
            type: 'video',
            video_url: r.publicUrl,
            price: Number(taskData.price),
          });
        }
        remoteImportSkipped = payload.results.length - ok.length;
        setUploadProgress(100);
        setFileStatusMessage(null);
      } else {
        notifyUser('Eksik Bilgi', 'Lütfen uzak URL girin veya yerel dosya seçin.');
        return;
      }

      const { data, error } = await supabase.from('tasks').insert(rowsToInsert).select();

      if (error) {
        console.error('DB Hatası:', error);
        notifyUser('Hata', error.message || 'Görev oluşturulurken bir sorun oluştu.');
        return;
      }

      console.log('Başarılı:', data);
      const n = data?.length ?? rowsToInsert.length;
      const skipNote = remoteImportSkipped > 0 ? ` (${remoteImportSkipped} URL atlandı — konsol)` : '';
      if (Platform.OS === 'web') {
        window.alert(`Tamam: ${n} görev oluşturuldu${skipNote}.`);
      } else {
        Alert.alert('Success', `${n} task(s) created!${skipNote}`);
      }

      router.push('/admin');
    } catch (err) {
      console.error('Hata:', err);
      notifyUser('Hata', (err as Error).message || 'Something went wrong while creating the task');
    } finally {
      setFileStatusMessage(null);
      setIsCreating(false);
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

      <View style={styles.backButtonContainer}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={16} color="#3b82f6" />
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Create Video Annotation Task</Text>

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
                placeholder="Enter task title"
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
                onChangeText={(text) =>
                  setTaskData((prev) => ({ ...prev, price: parseFloat(text) || 0 }))
                }
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
                style={[styles.input, focusedInput === 'annotationType' && styles.inputFocused]}
                value={taskData.annotationType}
                onChangeText={(text) => setTaskData((prev) => ({ ...prev, annotationType: text }))}
                placeholder="Enter annotation type (e.g., bbox, polygon, point)"
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
                placeholder="Enter detailed task description"
                placeholderTextColor="#9ca3af"
                multiline
                numberOfLines={6}
                onFocus={() => setFocusedInput('description')}
                onBlur={() => setFocusedInput(null)}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Video Kaynağı (Video / .zip veya URL)</Text>
              <Text style={styles.hintText}>
                Yerel yükleme üst sınırı (yapılandırma): {MAX_STORAGE_UPLOAD_MB} MB — 94 MB gibi dosyalar için
                Supabase Dashboard’daki Storage limitini ve .env içinde EXPO_PUBLIC_MAX_STORAGE_UPLOAD_MB değerini
                artırın.
              </Text>

              <View style={styles.sourceSelector}>
                <TouchableOpacity
                  style={[styles.sourceButton, sourceType === 'local' && styles.sourceButtonActive]}
                  onPress={() => {
                    setSourceType('local');
                    setRemoteUrl('');
                  }}
                >
                  <Ionicons
                    name="cloud-upload"
                    size={16}
                    color={sourceType === 'local' ? '#fff' : '#9ca3af'}
                  />
                  <Text
                    style={[styles.sourceButtonText, sourceType === 'local' && styles.sourceButtonTextActive]}
                  >
                    Local File
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.sourceButton, sourceType === 'remote' && styles.sourceButtonActive]}
                  onPress={() => {
                    setSourceType('remote');
                    revokePreviewUrl();
                    setSelectedFile(null);
                    setUploadedPublicUrl(null);
                    setFileStatusMessage(null);
                    setUploadProgress(0);
                  }}
                >
                  <Ionicons name="link" size={16} color={sourceType === 'remote' ? '#fff' : '#9ca3af'} />
                  <Text
                    style={[styles.sourceButtonText, sourceType === 'remote' && styles.sourceButtonTextActive]}
                  >
                    Remote URL
                  </Text>
                </TouchableOpacity>
              </View>

              {sourceType === 'local' ? (
                <TouchableOpacity
                  style={[styles.uploadButton, focusedInput === 'upload' && styles.uploadButtonFocused]}
                  onPress={handleFileSelect}
                  disabled={isUploading}
                  onFocus={() => setFocusedInput('upload')}
                  onBlur={() => setFocusedInput(null)}
                >
                  <Ionicons name="folder" size={24} color="#facc15" />
                  <Text style={styles.uploadButtonText}>
                    {selectedFile ? selectedFile.name : 'Video veya .zip dosyası seçin'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.urlInputContainer}>
                  <Ionicons name="link" size={16} color="#9ca3af" style={styles.urlInputIcon} />
                  <TextInput
                    style={[styles.input, styles.urlInput, focusedInput === 'url' && styles.inputFocused]}
                    value={remoteUrl}
                    onChangeText={setRemoteUrl}
                    placeholder=".mp4 / .webm / .mov | .txt | .json | .zip veri seti"
                    placeholderTextColor="#9ca3af"
                    onFocus={() => setFocusedInput('url')}
                    onBlur={() => setFocusedInput(null)}
                  />
                </View>
              )}

              {fileStatusMessage ? (
                <Text style={styles.statusText}>{fileStatusMessage}</Text>
              ) : null}

              {selectedFile && sourceType === 'local' ? (
                <View style={styles.fileInfo}>
                  <Text style={styles.fileName}>{selectedFile.name}</Text>
                  <Text style={styles.fileSize}>
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                  </Text>
                  {uploadedPublicUrl ? (
                    <Text style={styles.uploadedHint}>Storage’a yüklendi.</Text>
                  ) : null}
                </View>
              ) : null}

              {isUploading ? (
                <View style={styles.progressContainer}>
                  <ActivityIndicator color="#3b82f6" />
                  <View style={styles.progressColumn}>
                    <View style={styles.progressBar}>
                      <View style={[styles.progressFill, { width: `${uploadProgress}%` }]} />
                    </View>
                    <Text style={styles.progressLabel}>
                      Yükleniyor… %{Math.min(100, Math.round(uploadProgress))}
                    </Text>
                  </View>
                </View>
              ) : null}

              {selectedFile && sourceType === 'local' && !isUploading ? (
                <TouchableOpacity
                  style={[
                    styles.uploadActionButton,
                    uploadedPublicUrl && styles.uploadActionButtonSuccess,
                  ]}
                  onPress={() => void uploadSelectedFile()}
                  disabled={!!uploadedPublicUrl}
                >
                  <Text
                    style={[
                      styles.uploadActionText,
                      uploadedPublicUrl && styles.uploadActionTextSuccess,
                    ]}
                  >
                    {uploadedPublicUrl ? 'Yüklendi' : 'Storage’a yükle'}
                  </Text>
                </TouchableOpacity>
              ) : null}

              {selectedFile && sourceType === 'local' && uploadedPublicUrl && !isUploading ? (
                <TouchableOpacity
                  style={styles.uploadRetryButton}
                  onPress={() => void uploadSelectedFile()}
                >
                  <Text style={styles.uploadRetryText}>Yeniden yükle</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </View>

        <TouchableOpacity style={styles.saveButton} onPress={() => void handleCreateTask()} disabled={isCreating}>
          {isCreating ? (
            <ActivityIndicator color="#fff" />
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
  hintText: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 10,
    lineHeight: 18,
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
  statusText: {
    marginTop: 10,
    fontSize: 14,
    color: '#86efac',
    fontWeight: '600',
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
  uploadedHint: {
    marginTop: 6,
    fontSize: 12,
    color: '#34d399',
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
  uploadActionButtonSuccess: {
    backgroundColor: '#059669',
    opacity: 1,
  },
  uploadActionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
  },
  uploadActionTextSuccess: {
    color: '#ecfdf5',
  },
  uploadRetryButton: {
    marginTop: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  uploadRetryText: {
    fontSize: 14,
    color: '#60a5fa',
    fontWeight: '600',
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
    backgroundColor: '#3b82f6',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 32,
    minHeight: 52,
    justifyContent: 'center',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
});
