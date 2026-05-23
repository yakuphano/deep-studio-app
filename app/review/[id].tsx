import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Modal,
  Alert,
  Platform,
  Image,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { canAccessReviewQueue } from '@/lib/userRoles';
import { getWorkbenchPathForTask, resolveTaskWorkbenchType } from '@/lib/taskWorkbenchPath';
import { resolvePlaybackAudioUrl, resolveTaskImageUrl } from '@/lib/audioUrl';
import AudioPlayer from '@/components/AudioPlayer';
import VideoPlayer from '@/components/VideoPlayer';

/** Annotator Revisions’da göreceği metin; çok kısa “red” mesajlarını engeller. */
const REJECT_REASON_MIN_LENGTH = 30;
const REJECT_REASON_MAX_LENGTH = 2000;

type Row = {
  id: string;
  title: string;
  type: string | null;
  category?: string | null;
  status: string;
  transcription: string | null;
  annotation_data: unknown;
  assigned_to: string | null;
  qa_comment?: string | null;
  image_url?: string | null;
  video_url?: string | null;
  audio_url?: string | null;
  file_url?: string | null;
};

function useTaskIdParam(): string | undefined {
  const { id: raw } = useLocalSearchParams<{ id?: string | string[] }>();
  if (raw == null) return undefined;
  return Array.isArray(raw) ? raw[0] : raw;
}

export default function ReviewTaskDetailScreen() {
  const id = useTaskIdParam();
  const router = useRouter();
  const { t } = useTranslation();
  const { user, loading: authLoading, appRole } = useAuth();
  const [task, setTask] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const allowed = canAccessReviewQueue(appRole);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setFetchError(null);
    try {
      const { data, error } = await supabase.from('tasks').select('*').eq('id', id).maybeSingle();
      if (error) {
        setFetchError(error.message);
        setTask(null);
        return;
      }
      setTask(data as Row);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setFetchError(msg);
      setTask(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (authLoading) return;
    if (!user?.id) return;
    if (!allowed) {
      router.replace('/dashboard');
      return;
    }
    load();
  }, [authLoading, allowed, load, router, user?.id]);

  const rowRecord = useMemo(() => (task ? (task as unknown as Record<string, unknown>) : null), [task]);
  const workbenchKind = task && rowRecord ? resolveTaskWorkbenchType(rowRecord) : '';

  const imagePreviewUrl = useMemo(() => {
    if (!task) return null;
    const raw = task.image_url ?? task.file_url ?? null;
    return resolveTaskImageUrl(raw);
  }, [task]);

  const audioPreviewUrl = useMemo(() => {
    if (!task) return null;
    return resolvePlaybackAudioUrl(task.audio_url);
  }, [task]);

  const videoPreviewUrl = useMemo(() => {
    if (!task) return null;
    return resolvePlaybackAudioUrl(task.video_url);
  }, [task]);

  const kindLower = workbenchKind.toLowerCase();
  const hasVideoUrl = Boolean(videoPreviewUrl);
  const hasAudioUrl = Boolean(audioPreviewUrl);
  const hasImageUrl = Boolean(imagePreviewUrl);

  const mediaBlock = useMemo(() => {
    if (hasVideoUrl || kindLower === 'video') {
      if (hasVideoUrl) {
        return (
          <View style={styles.mediaInner}>
            <VideoPlayer videoUrl={videoPreviewUrl!} />
          </View>
        );
      }
      return <Text style={styles.mediaHint}>{t('qaReview.openWorkbench')}</Text>;
    }
    if ((kindLower === 'audio' || kindLower === 'transcription') && hasAudioUrl) {
      return <AudioPlayer uri={audioPreviewUrl!} />;
    }
    if (hasImageUrl) {
      return <Image source={{ uri: imagePreviewUrl! }} style={styles.previewImage} resizeMode="contain" />;
    }
    return <Text style={styles.mediaHint}>{t('qaReview.openWorkbench')}</Text>;
  }, [hasVideoUrl, hasAudioUrl, hasImageUrl, kindLower, videoPreviewUrl, audioPreviewUrl, imagePreviewUrl, t]);

  const annotationPreview = () => {
    const raw = task?.annotation_data;
    if (raw == null) return t('qaReview.noAnnotations');
    try {
      const s = JSON.stringify(raw, null, 2);
      return s.length > 4000 ? `${s.slice(0, 4000)}…` : s;
    } catch {
      return String(raw);
    }
  };

  const openWorkbench = () => {
    if (!task) return;
    const path = getWorkbenchPathForTask(task as unknown as Record<string, unknown>);
    router.push(path as any);
  };

  const canAct = task?.status === 'submitted';
  const readOnlyReviewed = task?.status === 'completed' || task?.status === 'rejected';

  const approve = async () => {
    if (!task?.id || !user?.id || acting) return;
    setActing(true);
    try {
      const { error } = await supabase
        .from('tasks')
        .update({
          status: 'completed',
          qa_reviewed_by: user.id,
          qa_reviewed_at: new Date().toISOString(),
          qa_comment: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', task.id)
        .eq('status', 'submitted');
      if (error) throw error;
      Alert.alert(t('qaReview.approvedTitle'), t('qaReview.approvedBody'));
      router.replace('/review');
    } catch (e) {
      Alert.alert(t('login.errorTitle'), e instanceof Error ? e.message : String(e));
    } finally {
      setActing(false);
    }
  };

  const reject = async () => {
    const reason = rejectReason.trim();
    if (!reason) {
      Alert.alert(t('login.errorTitle'), t('qaReview.rejectReasonRequired'));
      return;
    }
    if (reason.length < REJECT_REASON_MIN_LENGTH) {
      Alert.alert(t('login.errorTitle'), t('qaReview.rejectReasonTooShort', { min: REJECT_REASON_MIN_LENGTH }));
      return;
    }
    if (!task?.id || !user?.id || acting) return;
    setActing(true);
    try {
      const { error } = await supabase
        .from('tasks')
        .update({
          status: 'rejected',
          qa_comment: reason,
          qa_reviewed_by: user.id,
          qa_reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', task.id)
        .eq('status', 'submitted');
      if (error) throw error;
      setRejectOpen(false);
      setRejectReason('');
      Alert.alert(t('qaReview.rejectedTitle'), t('qaReview.rejectedBody'));
      router.replace('/review');
    } catch (e) {
      Alert.alert(t('login.errorTitle'), e instanceof Error ? e.message : String(e));
    } finally {
      setActing(false);
    }
  };

  if (authLoading || loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#38bdf8" />
      </View>
    );
  }

  if (fetchError) {
    return (
      <View style={styles.container}>
        <TouchableOpacity style={styles.back} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#f8fafc" />
        </TouchableOpacity>
        <Text style={styles.error}>{t('qaReview.loadError', { message: fetchError })}</Text>
      </View>
    );
  }

  if (!task) {
    return (
      <View style={styles.container}>
        <TouchableOpacity style={styles.back} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#f8fafc" />
        </TouchableOpacity>
        <Text style={styles.error}>{t('qaReview.taskNotFound')}</Text>
      </View>
    );
  }

  if (!['submitted', 'completed', 'rejected'].includes(task.status)) {
    return (
      <View style={styles.container}>
        <TouchableOpacity style={styles.back} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#f8fafc" />
        </TouchableOpacity>
        <Text style={styles.warn}>{t('qaReview.notInQueue', { status: task.status })}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color="#f8fafc" />
        </TouchableOpacity>
        <Text style={styles.topTitle} numberOfLines={1}>
          {task.title}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {readOnlyReviewed ? (
          <View style={styles.infoBanner}>
            <Ionicons name="information-circle-outline" size={20} color="#7dd3fc" />
            <Text style={styles.infoBannerText}>{t('qaReview.alreadyReviewed')}</Text>
          </View>
        ) : null}

        <View style={styles.badgeRow}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{workbenchKind || task.type || '—'}</Text>
          </View>
          <Text style={styles.statusLine}>
            {t('qaReview.statusLabel')}: <Text style={styles.statusStrong}>{task.status}</Text>
          </Text>
          {(task.category || task.type) && (task.category !== workbenchKind || task.type !== workbenchKind) ? (
            <Text style={styles.metaLine}>
              {t('qaReview.dbType')}: {task.type ?? '—'} · {t('qaReview.category')}: {task.category ?? '—'}
            </Text>
          ) : null}
          <Text style={styles.idText}>ID: {task.id.slice(0, 8)}…</Text>
        </View>

        <Text style={styles.blockTitle}>{t('qaReview.mediaPreview')}</Text>
        <View style={styles.mediaBox}>{mediaBlock}</View>

        {task.transcription ? (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>{t('qaReview.transcription')}</Text>
            <Text style={styles.blockBody}>{task.transcription}</Text>
          </View>
        ) : null}

        {task.qa_comment ? (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>{t('qaReview.reviewNotes')}</Text>
            <Text style={styles.blockBody}>{task.qa_comment}</Text>
          </View>
        ) : null}

        <View style={styles.block}>
          <Text style={styles.blockTitle}>{t('qaReview.annotationPreview')}</Text>
          <Text style={styles.mono}>{annotationPreview()}</Text>
        </View>

        <TouchableOpacity style={styles.secondaryBtn} onPress={openWorkbench}>
          <Ionicons name="open-outline" size={20} color="#38bdf8" />
          <Text style={styles.secondaryBtnText}>{t('qaReview.openWorkbench')}</Text>
        </TouchableOpacity>

        {canAct ? (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.approveBtn, acting && styles.btnDisabled]}
              onPress={() => {
                if (Platform.OS === 'web') {
                  if (typeof window !== 'undefined' && window.confirm(t('qaReview.confirmApprove'))) approve();
                } else {
                  Alert.alert(t('qaReview.confirmApproveTitle'), t('qaReview.confirmApprove'), [
                    { text: t('login.cancel'), style: 'cancel' },
                    { text: t('qaReview.approve'), onPress: approve },
                  ]);
                }
              }}
              disabled={acting}
            >
              <Ionicons name="checkmark-circle" size={22} color="#fff" />
              <Text style={styles.approveBtnText}>{t('qaReview.approve')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.rejectBtn, acting && styles.btnDisabled]}
              onPress={() => setRejectOpen(true)}
              disabled={acting}
            >
              <Ionicons name="close-circle" size={22} color="#fff" />
              <Text style={styles.rejectBtnText}>{t('qaReview.reject')}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollView>

      <Modal visible={rejectOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>{t('qaReview.rejectModalTitle')}</Text>
            <Text style={styles.modalSubtitle}>{t('qaReview.rejectModalSubtitle')}</Text>
            <TextInput
              style={styles.modalInput}
              placeholder={t('qaReview.rejectPlaceholder')}
              placeholderTextColor="#64748b"
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
              maxLength={REJECT_REASON_MAX_LENGTH}
            />
            <Text style={styles.modalCounter}>
              {t('qaReview.rejectCharCounter', {
                current: rejectReason.trim().length,
                max: REJECT_REASON_MAX_LENGTH,
                min: REJECT_REASON_MIN_LENGTH,
              })}
            </Text>
            <View style={styles.modalRow}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setRejectOpen(false)}>
                <Text style={styles.modalCancelText}>{t('login.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalConfirm,
                  (acting || rejectReason.trim().length < REJECT_REASON_MIN_LENGTH) && styles.modalConfirmDisabled,
                ]}
                onPress={reject}
                disabled={acting || rejectReason.trim().length < REJECT_REASON_MIN_LENGTH}
              >
                <Text style={styles.modalConfirmText}>{t('qaReview.sendReject')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  topTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: '#f8fafc' },
  back: { padding: 16 },
  scroll: { padding: 16, paddingBottom: 40 },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.35)',
    marginBottom: 16,
  },
  infoBannerText: { flex: 1, color: '#bae6fd', fontSize: 14, lineHeight: 20 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' },
  badge: { backgroundColor: 'rgba(56, 189, 248, 0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  badgeText: { color: '#7dd3fc', fontWeight: '700', fontSize: 13 },
  statusLine: { fontSize: 13, color: '#94a3b8', width: '100%' },
  statusStrong: { color: '#e2e8f0', fontWeight: '700' },
  idText: { color: '#64748b', fontSize: 12 },
  metaLine: { fontSize: 11, color: '#94a3b8', marginTop: 6, width: '100%' },
  block: { marginBottom: 16 },
  blockTitle: { fontSize: 14, fontWeight: '700', color: '#94a3b8', marginBottom: 8 },
  blockBody: { color: '#e2e8f0', fontSize: 15, lineHeight: 22 },
  mono: { color: '#cbd5e1', fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  mediaBox: {
    minHeight: 120,
    marginBottom: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    overflow: 'hidden',
  },
  mediaInner: { width: '100%', minHeight: 200 },
  previewImage: { width: '100%', height: 260, backgroundColor: '#0f172a' },
  mediaHint: { color: '#94a3b8', fontSize: 14, padding: 20, textAlign: 'center' },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.4)',
    marginBottom: 24,
  },
  secondaryBtnText: { color: '#38bdf8', fontWeight: '700', fontSize: 15 },
  actions: { gap: 12, marginTop: 8 },
  approveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#16a34a',
    paddingVertical: 14,
    borderRadius: 12,
  },
  approveBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  rejectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#dc2626',
    paddingVertical: 14,
    borderRadius: 12,
  },
  rejectBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  btnDisabled: { opacity: 0.5 },
  error: { color: '#f87171', padding: 24, fontSize: 16 },
  warn: { color: '#fbbf24', padding: 24, fontSize: 15 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    padding: 24,
  },
  modalBox: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#f8fafc', marginBottom: 8 },
  modalSubtitle: { fontSize: 13, color: '#94a3b8', lineHeight: 19, marginBottom: 14 },
  modalInput: {
    minHeight: 100,
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    padding: 12,
    color: '#f1f5f9',
    textAlignVertical: 'top',
    marginBottom: 8,
  },
  modalCounter: { fontSize: 12, color: '#64748b', marginBottom: 16 },
  modalRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  modalCancel: { paddingVertical: 10, paddingHorizontal: 16 },
  modalCancelText: { color: '#94a3b8', fontWeight: '600' },
  modalConfirm: { backgroundColor: '#dc2626', paddingVertical: 10, paddingHorizontal: 18, borderRadius: 10 },
  modalConfirmDisabled: { opacity: 0.45 },
  modalConfirmText: { color: '#fff', fontWeight: '700' },
});
