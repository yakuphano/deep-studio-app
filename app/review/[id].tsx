import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Alert,
  Platform,
  Image,
  Dimensions,
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
import type { AppColors } from '@/theme/palettes';
import { useThemeColors } from '@/contexts/ThemeContext';
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
  const themeColors = useThemeColors();
  const styles = useMemo(() => createStyles(themeColors), [themeColors]);

  const id = useTaskIdParam();
  const router = useRouter();
  const { t } = useTranslation();
  const { user, loading: authLoading, appRole } = useAuth();
  const [task, setTask] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const allowed = canAccessReviewQueue(appRole);

  /** QA görsel incelemesi: sabit 260px yerine ekranın büyük kısmı (orijinale yakın). */
  const qaImagePreviewHeight = useMemo(() => {
    const h = Dimensions.get('window').height;
    return Math.min(Math.max(h * 0.62, 420), 960);
  }, []);

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
      return (
        <Image
          source={{ uri: imagePreviewUrl! }}
          style={[styles.previewImage, { height: qaImagePreviewHeight, minHeight: qaImagePreviewHeight }]}
          resizeMode="contain"
        />
      );
    }
    return <Text style={styles.mediaHint}>{t('qaReview.openWorkbench')}</Text>;
  }, [
    hasVideoUrl,
    hasAudioUrl,
    hasImageUrl,
    kindLower,
    videoPreviewUrl,
    audioPreviewUrl,
    imagePreviewUrl,
    qaImagePreviewHeight,
    t,
  ]);

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
      setRejectReason('');
      Alert.alert(t('qaReview.rejectedTitle'), t('qaReview.rejectedBody'));
      router.replace('/review');
    } catch (e) {
      Alert.alert(t('login.errorTitle'), e instanceof Error ? e.message : String(e));
    } finally {
      setActing(false);
    }
  };

  const tryReject = () => {
    const reason = rejectReason.trim();
    if (!reason) {
      Alert.alert(t('login.errorTitle'), t('qaReview.rejectReasonRequired'));
      return;
    }
    if (reason.length < REJECT_REASON_MIN_LENGTH) {
      Alert.alert(t('login.errorTitle'), t('qaReview.rejectReasonTooShort', { min: REJECT_REASON_MIN_LENGTH }));
      return;
    }
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(t('qaReview.confirmReject'))) void reject();
    } else {
      Alert.alert(t('qaReview.confirmRejectTitle'), t('qaReview.confirmReject'), [
        { text: t('login.cancel'), style: 'cancel' },
        { text: t('qaReview.sendReject'), style: 'destructive', onPress: () => void reject() },
      ]);
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
          <Ionicons name="arrow-back" size={22} color={themeColors.text} />
        </TouchableOpacity>
        <Text style={styles.error}>{t('qaReview.loadError', { message: fetchError })}</Text>
      </View>
    );
  }

  if (!task) {
    return (
      <View style={styles.container}>
        <TouchableOpacity style={styles.back} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={themeColors.text} />
        </TouchableOpacity>
        <Text style={styles.error}>{t('qaReview.taskNotFound')}</Text>
      </View>
    );
  }

  if (!['submitted', 'completed', 'rejected'].includes(task.status)) {
    return (
      <View style={styles.container}>
        <TouchableOpacity style={styles.back} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={themeColors.text} />
        </TouchableOpacity>
        <Text style={styles.warn}>{t('qaReview.notInQueue', { status: task.status })}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={themeColors.text} />
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

        <View style={[styles.mediaBox, hasImageUrl ? { minHeight: qaImagePreviewHeight } : null]}>{mediaBlock}</View>

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

        <TouchableOpacity style={styles.secondaryBtn} onPress={openWorkbench}>
          <Ionicons name="open-outline" size={20} color="#38bdf8" />
          <Text style={styles.secondaryBtnText}>{t('qaReview.openWorkbench')}</Text>
        </TouchableOpacity>

        {canAct ? (
          <>
            <View style={styles.rejectFeedbackBlock}>
              <Text style={styles.rejectFeedbackTitle}>{t('qaReview.rejectModalTitle')}</Text>
              <Text style={styles.rejectFeedbackSubtitle}>{t('qaReview.rejectModalSubtitle')}</Text>
              <TextInput
                style={styles.rejectFeedbackInput}
                placeholder={t('qaReview.rejectPlaceholder')}
                placeholderTextColor="#64748b"
                value={rejectReason}
                onChangeText={setRejectReason}
                multiline
                maxLength={REJECT_REASON_MAX_LENGTH}
                editable={!acting}
                textAlignVertical="top"
                {...(Platform.OS === 'web' ? ({ autoComplete: 'off' } as object) : {})}
              />
              <Text style={styles.rejectFeedbackCounter}>
                {t('qaReview.rejectCharCounter', {
                  current: rejectReason.trim().length,
                  max: REJECT_REASON_MAX_LENGTH,
                  min: REJECT_REASON_MIN_LENGTH,
                })}
              </Text>
            </View>
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
                style={[
                  styles.rejectBtn,
                  acting && styles.btnDisabled,
                  rejectReason.trim().length < REJECT_REASON_MIN_LENGTH && styles.rejectBtnSoftDisabled,
                ]}
                onPress={tryReject}
                disabled={acting}
              >
                <Ionicons name="close-circle" size={22} color="#fff" />
                <Text style={styles.rejectBtnText}>{t('qaReview.reject')}</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function createStyles(themeColors: AppColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: themeColors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: themeColors.border,
    backgroundColor: themeColors.surface,
  },
  topTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: themeColors.text },
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
  infoBannerText: { flex: 1, color: '#0369a1', fontSize: 14, lineHeight: 20 },
  block: { marginBottom: 16 },
  blockTitle: { fontSize: 14, fontWeight: '700', color: themeColors.textMuted, marginBottom: 8 },
  blockBody: { color: themeColors.text, fontSize: 15, lineHeight: 22 },
  mediaBox: {
    minHeight: 120,
    marginBottom: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: themeColors.border,
    backgroundColor: themeColors.surface,
    overflow: 'hidden',
  },
  mediaInner: { width: '100%', minHeight: 200 },
  previewImage: { width: '100%', backgroundColor: themeColors.canvasMuted },
  mediaHint: { color: themeColors.textMuted, fontSize: 14, padding: 20, textAlign: 'center' },
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
  secondaryBtnText: { color: '#0284c7', fontWeight: '700', fontSize: 15 },
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
  rejectBtnSoftDisabled: { opacity: 0.65 },
  rejectFeedbackBlock: {
    marginTop: 8,
    marginBottom: 4,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.4)',
    backgroundColor: 'rgba(127, 29, 29, 0.12)',
  },
  rejectFeedbackTitle: { fontSize: 16, fontWeight: '700', color: '#b91c1c', marginBottom: 6 },
  rejectFeedbackSubtitle: { fontSize: 13, color: '#dc2626', lineHeight: 19, marginBottom: 12 },
  rejectFeedbackInput: {
    width: '100%',
    minHeight: 120,
    borderWidth: 1,
    borderColor: themeColors.border,
    borderRadius: 10,
    padding: 12,
    color: themeColors.text,
    fontSize: 15,
    lineHeight: 22,
    textAlignVertical: 'top',
    marginBottom: 8,
    backgroundColor: themeColors.surface,
  },
  rejectFeedbackCounter: { fontSize: 12, color: themeColors.textMuted },
  error: { color: '#f87171', padding: 24, fontSize: 16 },
  warn: { color: '#fbbf24', padding: 24, fontSize: 15 },
});
}
