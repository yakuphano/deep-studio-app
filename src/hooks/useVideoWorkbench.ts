import { useState, useCallback, useEffect, useRef, useLayoutEffect } from 'react';
import { Alert } from 'react-native';
import { supabase } from '@/lib/supabase';
import { transcribeWithGroq } from '@/lib/groq';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { triggerEarningsRefresh } from '@/lib/earningsRefresh';
import { useAuth } from '@/contexts/AuthContext';
import { resolvePlayableTaskVideoUrl } from '@/lib/taskVideoUrl';
import { 
  type TaskData, 
  type VideoAnnotation, 
  type TranscriptionState,
  type AnnotationTool 
} from '@/types/video';

export const useVideoWorkbench = (taskId: string) => {
  const router = useRouter();
  const { t } = useTranslation();
  const { user, session } = useAuth();

  // Video specific states
  const [currentFrame, setCurrentFrame] = useState<string | null>(null);
  const [currentFrameNumber, setCurrentFrameNumber] = useState<number>(0);
  const [currentTimestamp, setCurrentTimestamp] = useState<number>(0);
  const [videoAnnotations, setVideoAnnotations] = useState<VideoAnnotation[]>([]);
  /** Blok snapshotUrl silinse bile sağ liste önizlemesi kalır (oturum içi; DB’ye yazılmaz) */
  const [thumbnailCache, setThumbnailCache] = useState<Record<string, string>>({});
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [task, setTask] = useState<TaskData | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [annotations, setAnnotations] = useState<any[]>([]);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);

  // Transcription state
  const [transcription, setTranscription] = useState<string>('');
  const [isTranscribing, setIsTranscribing] = useState(false);

  const videoAnnotationsRef = useRef(videoAnnotations);
  videoAnnotationsRef.current = videoAnnotations;

  const annotationsRef = useRef(annotations);
  const currentFrameNumberRef = useRef(currentFrameNumber);
  const currentTimestampRef = useRef(currentTimestamp);
  const currentFrameRef = useRef<string | null>(null);
  const pendingSelectAfterCaptureRef = useRef<string | null>(null);
  const pendingThumbWritesRef = useRef<{ key: string; snap: string }[]>([]);

  useLayoutEffect(() => {
    annotationsRef.current = annotations;
    currentFrameNumberRef.current = currentFrameNumber;
    currentTimestampRef.current = currentTimestamp;
    currentFrameRef.current = currentFrame;
  }, [annotations, currentFrameNumber, currentTimestamp, currentFrame]);

  function cloneAnnotations(ann: unknown[]): any[] {
    if (!Array.isArray(ann)) return [];
    try {
      return structuredClone(ann);
    } catch {
      try {
        return JSON.parse(JSON.stringify(ann));
      } catch {
        return ann.map((a) => (typeof a === 'object' && a !== null ? { ...(a as object) } : a));
      }
    }
  }

  /** Seek sonrası floor(time*fps) kaydığında bloğu yine de bul (tuvalin boşalmaması için) */
  const CAPTURE_TS_TOL_SEC = 0.45;

  /** data URL + base64; bundan kısaysa bozuk / ara kare yakalama sayılır, mevcut önizleme korunur */
  const MIN_SNAPSHOT_DATA_URL_LEN = 200;

  function isUsableSnapshotUrl(u: unknown): u is string {
    return typeof u === 'string' && u.length >= MIN_SNAPSHOT_DATA_URL_LEN;
  }

  function findBlockIndex(
    next: VideoAnnotation[],
    frameNumber: number,
    timeSec: number
  ): number {
    const byFn = next.findIndex((a) => a.frameNumber === frameNumber);
    if (byFn >= 0) return byFn;
    if (!Number.isFinite(timeSec) || timeSec <= 0.001) return -1;
    let bestI = -1;
    let bestD = Infinity;
    for (let k = 0; k < next.length; k++) {
      const ts = Number(next[k].timestamp ?? 0);
      const d = Math.abs(ts - timeSec);
      if (d < bestD) {
        bestD = d;
        bestI = k;
      }
    }
    return bestD <= CAPTURE_TS_TOL_SEC ? bestI : -1;
  }

  /** Supabase satır boyutu için kayıtta önizleme URL’lerini çıkar */
  function stripSnapshotUrlsForDb(blocks: VideoAnnotation[]): VideoAnnotation[] {
    return blocks.map(({ snapshotUrl: _snap, ...rest }) => ({ ...rest }));
  }

  /** Kare anotasyonlarını listeye yazar (derin kopya; kayıtta / gönderimde kullanılır) */
  function mergeCurrentFrameIntoList(
    prev: VideoAnnotation[],
    frameNumber: number,
    timestamp: number,
    anns: unknown[],
    snapshotUrl?: string | null
  ): VideoAnnotation[] {
    const next = [...prev];
    const i = findBlockIndex(next, frameNumber, timestamp);
    const block: VideoAnnotation = {
      id: `frame_${frameNumber}`,
      frameNumber,
      timestamp,
      annotations: cloneAnnotations(Array.isArray(anns) ? anns : []),
    };
    const trustMerge = isUsableSnapshotUrl(snapshotUrl);
    if (trustMerge) block.snapshotUrl = snapshotUrl;
    if (i >= 0) {
      const snap = trustMerge ? snapshotUrl : prev[i].snapshotUrl ?? snapshotUrl;
      next[i] = {
        ...prev[i],
        ...block,
        id: prev[i].id ?? block.id,
        snapshotUrl: snap ?? prev[i].snapshotUrl,
      };
    } else {
      next.push(block);
    }
    return next;
  }

  /** Oynatıcı `timeupdate` ile değişen süreyi kayıt anahtarı olarak kullanma (yarış / yanlış kare) */
  const persistTimestampRef = useRef(0);

  const requestSelectAnnotationAfterFrameCapture = useCallback((id: string | null) => {
    pendingSelectAfterCaptureRef.current = id;
  }, []);

  /** Mevcut karedeki çizimleri videoAnnotations ağacına yazar (taslak kaydı / gönderim için) */
  useEffect(() => {
    if (currentFrame == null) return;
    const fn = currentFrameNumber;
    const ts = persistTimestampRef.current;
    setVideoAnnotations((prev) => {
      const i = findBlockIndex(prev, fn, ts);
      const trustSnap = isUsableSnapshotUrl(currentFrame);
      const prevSnap = i >= 0 ? prev[i].snapshotUrl : undefined;
      const prevSnapOk = isUsableSnapshotUrl(prevSnap);
      const annSame =
        i >= 0 &&
        JSON.stringify(prev[i].annotations) === JSON.stringify(annotations);
      /** Sadece inceleme: anotasyon aynıysa listeyi bozmamak (CVAT vb. donmuş önizleme) */
      const nextSnap =
        annSame && prevSnapOk
          ? prevSnap
          : trustSnap
            ? currentFrame
            : i >= 0
              ? prev[i].snapshotUrl
              : currentFrame ?? undefined;
      const nextBlock: VideoAnnotation = {
        id: i >= 0 ? prev[i].id : `frame_${fn}`,
        frameNumber: fn,
        timestamp: ts,
        annotations: cloneAnnotations(annotations),
        snapshotUrl: nextSnap,
      };
      if (i >= 0) {
        if (
          JSON.stringify(prev[i].annotations) === JSON.stringify(annotations) &&
          prev[i].snapshotUrl === nextBlock.snapshotUrl
        ) {
          return prev;
        }
        const n = [...prev];
        n[i] = nextBlock;
        return n;
      }
      return [...prev, nextBlock];
    });
  }, [annotations, currentFrame, currentFrameNumber]);

  const silentSaveDraft = useCallback(async () => {
    if (!taskId || !user?.id) return;
    const base = videoAnnotationsRef.current;
    const mergedPayload =
      currentFrameRef.current != null
        ? mergeCurrentFrameIntoList(
            base,
            currentFrameNumberRef.current,
            persistTimestampRef.current,
            annotationsRef.current,
            currentFrameRef.current
          )
        : base;
    setVideoAnnotations(mergedPayload);
    const { error } = await supabase
      .from('tasks')
      .update({
        annotation_data: stripSnapshotUrlsForDb(mergedPayload),
        updated_at: new Date().toISOString(),
      })
      .eq('id', taskId);
    if (error) {
      console.warn('[video workbench] autosave', error.message);
      throw new Error(error.message);
    }
  }, [taskId, user?.id]);

  /** 10 sn otomatik kayıt (sessiz) */
  useEffect(() => {
    if (!taskId || !user?.id) return;
    const id = setInterval(() => {
      void silentSaveDraft().catch(() => {});
    }, 10_000);
    return () => clearInterval(id);
  }, [taskId, user?.id, silentSaveDraft]);

  const getSubmitValidationMessages = useCallback((): string[] => {
    const msgs: string[] = [];
    const va = videoAnnotationsRef.current;
    if (!va?.length) msgs.push('Henüz kayıtlı kare anotasyonu yok.');
    for (const block of va) {
      for (const ann of block.annotations || []) {
        const lab =
          typeof ann.label === 'object' && ann.label !== null
            ? String((ann.label as { name?: string }).name ?? '')
            : String(ann.label ?? '');
        if (!lab.trim()) msgs.push(`Kare ${block.frameNumber}: etiketsiz nesne`);
      }
    }
    return [...new Set(msgs)];
  }, []);

  // Load video task
  const loadVideo = useCallback(async () => {
    if (!taskId) {
      setTask(null);
      setVideoUrl(null);
      setLoading(false);
      return;
    }

    setThumbnailCache({});

    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', taskId)
      .maybeSingle();

    if (error) {
      console.log('Detay Hatası:', error);
      if (typeof window !== 'undefined') {
        window.alert('Supabase Detay Hatası: ' + error.message);
      } else {
        Alert.alert('Hata', 'Supabase Detay Hatası: ' + error.message);
      }
      setLoading(false);
      return;
    }

    if (!data) {
      const msg =
        'Görev bulunamadı. Silinmiş olabilir, ID yanlış veya bu hesabın görmeye yetkisi olmayabilir.';
      if (typeof window !== 'undefined') {
        window.alert(msg);
      } else {
        Alert.alert('Hata', msg);
      }
      setLoading(false);
      return;
    }

    const cat = (data.category ?? '').toString().toLowerCase();
    const taskData: TaskData = {
      id: String(data.id),
      title: String(data.title ?? ''),
      status: data.status ?? 'pending',
      price: data.price != null ? Number(data.price) : 0,
      type: (data.type ?? (cat === 'video' ? 'video' : 'audio')) as 'audio' | 'image' | 'video',
      category: data.category ?? null,
      audio_url: data.audio_url ?? data.audioUrl,
      image_url: data.image_url ?? data.imageUrl ?? null,
      video_url: data.video_url ?? data.videoUrl ?? null,
      transcription: data.transcription ?? '',
      annotation_data: data.annotation_data ?? null,
      language: data.language ?? null,
    };

    setTask(taskData);
    const playable = await resolvePlayableTaskVideoUrl({
      taskId: String(data.id),
      rawVideoUrl: taskData.video_url,
      session,
    });
    setVideoUrl(playable ?? (taskData.video_url ? String(taskData.video_url) : null));

    // Load existing video annotations
    if (taskData.annotation_data && Array.isArray(taskData.annotation_data)) {
      setVideoAnnotations(taskData.annotation_data as VideoAnnotation[]);
    }
    setLoading(false);
  }, [taskId, session]);

  // Handle AI transcription
  const handleAITranscription = useCallback(async () => {
    if (!currentFrame || isTranscribing) return;
    
    setIsTranscribing(true);
    try {
      const transcriptionText = await transcribeWithGroq(currentFrame);
      setTranscription(transcriptionText);
    } catch (error) {
      console.error('Transcription error:', error);
      Alert.alert('Hata', 'Transcription başarısız oldu');
    } finally {
      setIsTranscribing(false);
    }
  }, [currentFrame, isTranscribing]);

  /**
   * Kare değişmeden önce önceki karenin tuvalini videoAnnotations'a yazar (effect yarışını önler).
   */
  const handleFrameCapture = useCallback(
    (frameData: string, frameNumber: number, timestamp: number) => {
      const hadSnapshot = currentFrameRef.current != null;
      const outgoingFn = currentFrameNumberRef.current;
      const outgoingTs =
        persistTimestampRef.current || currentTimestampRef.current;
      const outgoingAnn = annotationsRef.current;

      let incomingAnnotations: any[] = [];

      pendingThumbWritesRef.current = [];

      setVideoAnnotations((prev) => {
        const next = [...prev];
        if (hadSnapshot) {
          const i = findBlockIndex(next, outgoingFn, outgoingTs);
          const rawOut = currentFrameRef.current;
          const trustOut = isUsableSnapshotUrl(rawOut);
          const snapOut = trustOut
            ? rawOut
            : i >= 0
              ? next[i].snapshotUrl
              : rawOut ?? undefined;
          const block: VideoAnnotation = {
            id: i >= 0 ? next[i].id : `frame_${outgoingFn}`,
            frameNumber: outgoingFn,
            timestamp: outgoingTs,
            annotations: cloneAnnotations(outgoingAnn),
            snapshotUrl: snapOut ?? undefined,
          };
          if (i >= 0) next[i] = block;
          else next.push(block);
          if (isUsableSnapshotUrl(block.snapshotUrl)) {
            pendingThumbWritesRef.current.push({
              key: String(block.id ?? `frame_${outgoingFn}`),
              snap: block.snapshotUrl,
            });
          }
        }
        let j = findBlockIndex(next, frameNumber, timestamp);
        if (j >= 0 && next[j].frameNumber !== frameNumber) {
          next[j] = {
            ...next[j],
            frameNumber,
            id: `frame_${frameNumber}`,
            timestamp,
          };
        }
        incomingAnnotations =
          j >= 0 && Array.isArray(next[j].annotations)
            ? cloneAnnotations(next[j].annotations)
            : [];
        if (j >= 0) {
          const crossNavigate = hadSnapshot && outgoingFn !== frameNumber;
          const trustIn = isUsableSnapshotUrl(frameData);
          const prevListSnap = next[j].snapshotUrl;
          const prevListOk = isUsableSnapshotUrl(prevListSnap);
          const keepSnap =
            crossNavigate && prevListOk
              ? prevListSnap
              : trustIn
                ? frameData
                : isUsableSnapshotUrl(prevListSnap)
                  ? prevListSnap
                  : frameData;
          next[j] = {
            ...next[j],
            snapshotUrl: keepSnap,
            frameNumber,
            timestamp,
            id: next[j].id ?? `frame_${frameNumber}`,
          };
          if (isUsableSnapshotUrl(keepSnap)) {
            pendingThumbWritesRef.current.push({
              key: String(next[j].id ?? `frame_${frameNumber}`),
              snap: keepSnap,
            });
          }
        }
        return next;
      });

      const batch = pendingThumbWritesRef.current;
      if (batch.length > 0) {
        setThumbnailCache((prev) => {
          let nextMap = prev;
          let changed = false;
          for (const { key, snap } of batch) {
            if (nextMap[key] !== snap) {
              if (!changed) {
                nextMap = { ...prev };
                changed = true;
              }
              nextMap[key] = snap;
            }
          }
          return changed ? nextMap : prev;
        });
      }

      persistTimestampRef.current = timestamp;

      setCurrentFrame(frameData);
      setCurrentFrameNumber(frameNumber);
      setCurrentTimestamp(timestamp);
      setAnnotations(incomingAnnotations);

      const switched = !hadSnapshot || outgoingFn !== frameNumber;
      const pending = pendingSelectAfterCaptureRef.current;
      pendingSelectAfterCaptureRef.current = null;
      const pendingOk =
        Boolean(pending) && incomingAnnotations.some((a: { id?: string }) => a.id === pending);
      if (pendingOk) setSelectedAnnotationId(pending);
      else if (switched) setSelectedAnnotationId(null);
    },
    []
  );

  // Handle time update
  const handleTimeUpdate = useCallback((currentTime: number, duration: number) => {
    setCurrentTimestamp(currentTime);
    setVideoDuration(duration);
  }, []);

  // Handle loaded metadata
  const handleLoadedMetadata = useCallback((duration: number) => {
    setVideoDuration(duration);
  }, []);

  // Save draft (kullanıcı bildirimi ile)
  const handleSaveDraft = useCallback(async () => {
    if (!taskId || !user?.id) return;

    setSaving(true);
    try {
      await silentSaveDraft();
      if (typeof window !== 'undefined') {
        window.alert(t('taskDetail.saveSuccess') || 'Kaydedildi');
      } else {
        Alert.alert(t('taskDetail.successTitle') || 'Başarılı', t('taskDetail.saveSuccess') || 'Kaydedildi');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (typeof window !== 'undefined') {
        window.alert(t('login.errorTitle') + ': ' + errorMessage);
      } else {
        Alert.alert(t('login.errorTitle'), errorMessage);
      }
    } finally {
      setSaving(false);
    }
  }, [taskId, user?.id, t, silentSaveDraft]);

  // Handle submit
  const handleSubmit = useCallback(async (navigateToNext: boolean = false) => {
    if (!taskId || !user?.id) return;
    
    setSaving(true);
    try {
      const base = videoAnnotationsRef.current;
      const mergedPayload =
        currentFrameRef.current != null
          ? mergeCurrentFrameIntoList(
              base,
              currentFrameNumberRef.current,
              persistTimestampRef.current,
              annotationsRef.current,
              currentFrameRef.current
            )
          : base;

      const { error } = await supabase
        .from('tasks')
        .update({
          status: 'submitted',
          annotation_data: stripSnapshotUrlsForDb(mergedPayload),
          updated_at: new Date().toISOString(),
        })
        .eq('id', taskId);
        
      if (error) throw error;

      setVideoAnnotations(mergedPayload);
      
      setTask((prev) => (prev ? { ...prev, status: 'submitted' } : null));
      triggerEarningsRefresh();

      if (navigateToNext) {
        const { data: claimedTask, error: claimError } = await supabase
          .from('tasks')
          .update({ 
            assigned_to: user.id, 
            is_pool_task: false 
          })
          .is('assigned_to', null)
          .is('is_pool_task', true)
          .neq('status', 'submitted')
          .neq('status', 'completed')
          .neq('id', taskId)
          .order('created_at', { ascending: false })
          .limit(1)
          .select('id')
          .maybeSingle();

        if (claimError) throw claimError;

        if (claimedTask) {
          router.replace(`/task/${claimedTask.id}`);
        } else {
          router.replace('/dashboard');
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (typeof window !== 'undefined') {
        window.alert(t('login.errorTitle') + ': ' + errorMessage);
      } else {
        Alert.alert(t('login.errorTitle'), errorMessage);
      }
    } finally {
      setSaving(false);
    }
  }, [taskId, user?.id, t, router]);

  // Toggle play/pause (placeholder for video player)
  const togglePlayPause = useCallback(() => {
    // This would be implemented in the video player component
    console.log('Toggle play/pause');
  }, []);

  // Delete annotation (videoAnnotations: `annotations` effect ile senkron)
  const handleDeleteAnnotation = useCallback((id: string) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
    if (selectedAnnotationId === id) setSelectedAnnotationId(null);
  }, [selectedAnnotationId]);

  const handleUpdateAnnotationLabel = useCallback((id: string, label: string) => {
    setAnnotations((prev) => prev.map((a) => (a.id === id ? { ...a, label } : a)));
  }, []);

  useEffect(() => {
    setThumbnailCache((prev) => {
      let changed = false;
      const merged = { ...prev };
      for (const b of videoAnnotations) {
        const key = String(b.id ?? `frame_${b.frameNumber}`);
        const snap = b.snapshotUrl;
        if (isUsableSnapshotUrl(snap) && merged[key] !== snap) {
          merged[key] = snap;
          changed = true;
        }
      }
      return changed ? merged : prev;
    });
  }, [videoAnnotations]);

  return {
    // States
    currentFrame,
    currentFrameNumber,
    currentTimestamp,
    videoAnnotations,
    thumbnailCache,
    videoDuration,
    videoUrl,
    task,
    saving,
    loading,
    annotations,
    selectedAnnotationId,
    transcription,
    isTranscribing,
    
    // Functions
    loadVideo,
    handleAITranscription,
    handleFrameCapture,
    handleTimeUpdate,
    handleLoadedMetadata,
    handleSaveDraft,
    silentSaveDraft,
    handleSubmit,
    togglePlayPause,
    handleDeleteAnnotation,
    handleUpdateAnnotationLabel,
    setAnnotations,
    setVideoAnnotations,
    setSelectedAnnotationId,
    requestSelectAnnotationAfterFrameCapture,
    setTranscription,
    setSaving,
    setLoading,
    getSubmitValidationMessages,
  };
};
