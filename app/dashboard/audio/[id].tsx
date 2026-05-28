import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TextInput,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import TaskHeader from '@/components/workbench/TaskHeader';
import { transcribeWithGroq } from '@/lib/groq';
import { triggerEarningsRefresh } from '@/lib/earningsRefresh';
import { useAuth } from '@/contexts/AuthContext';
import AudioPlayer from '@/components/AudioPlayer';
import type { AppColors } from '@/theme/palettes';
import { useThemeColors } from '@/contexts/ThemeContext';
interface TaskData {
  id: string;
  title: string;
  status?: string;
  price?: number | null;
  type?: 'audio' | 'image' | 'video' | string | null;
  category?: string | null;
  audio_url?: string;
  content_url?: string;
  image_url?: string | null;
  video_url?: string | null;
  file_url?: string | null;
  transcription?: string;
  annotation_data?: unknown;
  language?: string | null;
  guideline_url?: string | null;
  guideline_file_name?: string | null;
  discarded_at?: string | null;
  discarded_by?: string | null;
}

export default function AudioTaskDetailScreen() {
  const themeColors = useThemeColors();
  const styles = useMemo(() => createStyles(themeColors), [themeColors]);

  const params = useLocalSearchParams<{ id: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { user, session, signOut, isAdmin } = useAuth();
  const [task, setTask] = useState<TaskData | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [transcription, setTranscription] = useState('');
  const [transcribing, setTranscribing] = useState(false);
  const [aiFixing, setAiFixing] = useState(false);

  const audioUrl = task?.audio_url || task?.content_url || task?.file_url;
  const imageUrl = task?.image_url;
  const videoUrl = task?.video_url;
  const typeLower = (task?.type ?? '').toString().toLowerCase();
  const categoryLower = (task?.category ?? '').toString().toLowerCase();
  const isAudioTask =
    typeLower === 'audio' ||
    typeLower === 'transcription' ||
    categoryLower.includes('audio') ||
    categoryLower.includes('transcription') ||
    !!audioUrl;
  const isSubmitted = task?.status === 'submitted';

  useEffect(() => {
    if (!id) return;
    const fetchTask = async () => {
      const taskId = String(id);
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', taskId)
        .single();
      if (error) {
        console.log('Detay Hatası:', error);
        if (typeof window !== 'undefined') {
          window.alert('Supabase Detay Hatası: ' + error.message);
        } else {
          Alert.alert('Hata', 'Supabase Detay Hatası: ' + error.message);
        }
      }
      if (!error && data) {
        const cat = (data.category ?? '').toString().toLowerCase();
        const taskData: TaskData = {
          id: String(data.id),
          title: String(data.title ?? '') || 'İsimsiz Görev',
          status: data.status ?? 'pending',
          price: data.price != null ? Number(data.price) : 0,
          type: (data.type ??
            (cat === 'video' ? 'video' : cat === 'transcription' ? 'transcription' : 'audio')) as
            | 'audio'
            | 'image'
            | 'video'
            | string,
          category: data.category ?? null,
          audio_url: data.audio_url ?? data.audioUrl,
          content_url: data.content_url,
          image_url: data.image_url ?? data.imageUrl ?? null,
          file_url: data.file_url ?? null,
          transcription: data.transcription ?? '',
          annotation_data: data.annotation_data ?? null,
          language: data.language ?? null,
          guideline_url: data.guideline_url ?? null,
          guideline_file_name: data.guideline_file_name ?? null,
          discarded_at: data.discarded_at ?? null,
          discarded_by: data.discarded_by ?? null,
        };
        setTask(taskData);
        setTranscription(taskData.transcription ?? '');
      }
      setLoading(false);
    };
    fetchTask();
  }, [id]);

  const handleAITranscription = useCallback(async () => {
    if (!audioUrl) {
      const msg = t('taskDetail.noAudio') || 'Ses dosyası bulunamadı';
      if (typeof window !== 'undefined') window.alert(msg);
      else Alert.alert(t('login.errorTitle') || 'Hata', msg);
      return;
    }
    setTranscribing(true);
    try {
      const result = await transcribeWithGroq({
        fileUrl: audioUrl,
        language: task?.language ?? null,
      });
      if (result.error) {
        const errMsg = result.error;
        if (typeof window !== 'undefined') window.alert(errMsg);
        else Alert.alert(t('login.errorTitle') || 'Hata', errMsg);
        return;
      }
      setTranscription(result.text ?? '');
    } catch (err) {
      console.error('AI Transcription Error:', err);
      const errMsg = err instanceof Error ? err.message : String(err);
      if (typeof window !== 'undefined') window.alert(errMsg);
      else Alert.alert(t('login.errorTitle') || 'Hata', errMsg);
    } finally {
      setTranscribing(false);
    }
  }, [audioUrl, task?.language, t]);

  const handleAIFix = useCallback(async () => {
    if (!transcription.trim()) return;
    setAiFixing(true);
    try {
      // Mock AI fix
      await new Promise(resolve => setTimeout(resolve, 1500));
      setTranscription(prev => prev + ' (AI Fixed)');
    } catch (err) {
      console.error('AI Fix Error:', err);
    } finally {
      setAiFixing(false);
    }
  }, [transcription]);

  const handleSaveDraft = useCallback(async () => {
    if (!id || !user?.id) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('tasks')
        .update({
          transcription,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw error;
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
  }, [id, user?.id, transcription, t]);

  const handleSubmit = useCallback(async (navigateToNext: boolean = false) => {
    if (!id || !user?.id) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('tasks')
        .update({
          status: 'submitted',
          transcription,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw error;
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
          .neq('status', 'rejected')
          .neq('id', id)
          .order('created_at', { ascending: false })
          .limit(1)
          .select('id')
          .single();
        
        if (claimError) {
          if (claimError.code === 'PGRST116') {
            router.replace('/dashboard');
            return;
          } else {
            throw claimError;
          }
        }
        
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
  }, [id, user?.id, transcription, t, router]);

  const handleSubmitAndExit = () => handleSubmit(false);
  const handleSubmitNext = () => handleSubmit(true);
  const handleExit = () => {
    try {
      router.back();
    } catch (_) {}
  };

  // Loading guard
  if (loading || !task) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Görev yükleniyor...</Text>
      </View>
    );
  }

  const navigateBack = () => {
    try {
      router.back();
    } catch (_) {}
  };

  return (
    <View style={styles.container}>
      <TaskHeader
        title={task.title}
        price={task.price ?? 0}
        taskTypeLabel={t('tasks.cardAudioTranscription')}
        onBack={navigateBack}
        guidelineUrl={task.guideline_url}
        guidelineFileName={task.guideline_file_name}
        taskId={id ? String(id) : undefined}
        discarded={!!task.discarded_at}
        discardDisabled={isSubmitted}
        userId={user?.id}
      />

      <View style={styles.workArea}>
        <View style={styles.audioBlock}>
          {audioUrl && isAudioTask ? (
            <AudioPlayer uri={audioUrl} />
          ) : (
            <Text style={styles.noAudioText}>{t('taskDetail.noAudio')}</Text>
          )}
        </View>

        <View style={styles.transcriptionBlock}>
          <View style={styles.transcriptionToolbar}>
            <Text style={styles.sectionLabel}>{t('taskDetail.transcriptionLabel')}</Text>
            <View style={styles.aiBtnRow}>
              <TouchableOpacity
                style={[styles.compactButton, transcribing && styles.compactButtonDisabled]}
                onPress={handleAITranscription}
                disabled={transcribing || isSubmitted}
              >
                {transcribing ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Ionicons name="sparkles" size={14} color="#ffffff" />
                )}
                <Text style={styles.compactButtonText}>AI Transcribe</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.compactButton, aiFixing && styles.compactButtonDisabled]}
                onPress={handleAIFix}
                disabled={aiFixing || isSubmitted}
              >
                {aiFixing ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Ionicons name="construct" size={14} color="#ffffff" />
                )}
                <Text style={styles.compactButtonText}>AI Fix</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.transcriptionInputWrap}>
            <TextInput
              style={styles.transcriptionInput}
              placeholder={t('taskDetail.transcriptionPlaceholder')}
              placeholderTextColor={themeColors.textMuted}
              value={transcription}
              onChangeText={setTranscription}
              multiline
              textAlignVertical="top"
              editable={!isSubmitted}
              scrollEnabled
            />
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        {isSubmitted ? (
          <View style={styles.submittedBadge}>
            <Ionicons name="checkmark-circle" size={18} color="#fff" />
            <Text style={styles.submittedText}>{t('tasks.submitted')}</Text>
          </View>
        ) : (
          <View style={styles.bottomButtonBar}>
            <View style={styles.bottomLeftActions}>
              <TouchableOpacity style={styles.exitButton} onPress={handleExit}>
                <Text style={styles.exitButtonText}>Exit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitExitButton, saving && styles.submitButtonDisabled]}
                onPress={handleSubmitAndExit}
                disabled={saving}
              >
                <Text style={styles.submitExitButtonText}>
                  {saving ? t('taskDetail.saving') : 'Submit & Exit'}
                </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.bottomRightActions}>
              <TouchableOpacity
                style={[styles.submitButtonGreen, saving && styles.submitButtonDisabled]}
                onPress={handleSubmitNext}
                disabled={saving}
              >
                <Text style={styles.submitButtonGreenText}>
                  {saving ? t('taskDetail.saving') : 'Submit'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

function createStyles(themeColors: AppColors) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: themeColors.background,
    ...(Platform.OS === 'web' ? ({ height: '100%', maxHeight: '100vh', overflow: 'hidden' } as object) : {}),
  },
  loadingText: {
    color: themeColors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 24,
  },
  workArea: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 8,
  },
  audioBlock: {
    flexShrink: 0,
    backgroundColor: themeColors.surface,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: themeColors.border,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: themeColors.text,
  },
  noAudioText: {
    fontSize: 13,
    color: themeColors.textMuted,
    textAlign: 'center',
    paddingVertical: 8,
  },
  transcriptionBlock: {
    flex: 1,
    minHeight: 0,
    gap: 6,
  },
  transcriptionToolbar: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  aiBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  transcriptionInputWrap: {
    flex: 1,
    minHeight: 0,
    backgroundColor: themeColors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: themeColors.border,
    padding: 8,
  },
  transcriptionInput: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: themeColors.text,
    textAlignVertical: 'top',
    ...(Platform.OS === 'web' ? ({ height: '100%', outlineStyle: 'none' } as object) : { minHeight: 80 }),
  },
  compactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#7c3aed',
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 8,
    gap: 6,
  },
  compactButtonDisabled: {
    opacity: 0.6,
  },
  compactButtonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 12,
  },
  footer: {
    flexShrink: 0,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: themeColors.background,
    borderTopWidth: 1,
    borderTopColor: themeColors.border,
  },
  bottomButtonBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
  },
  bottomLeftActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bottomRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  exitButton: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  exitButtonText: { 
    fontSize: 14, 
    color: '#ef4444', 
    fontWeight: '500' 
  },
  submitExitButton: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#3b82f6',
  },
  submitExitButtonText: { 
    fontSize: 14, 
    color: '#fff', 
    fontWeight: '500' 
  },
  submitButtonGreen: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#22c55e',
  },
  submitButtonGreenText: { 
    fontSize: 14, 
    color: '#fff', 
    fontWeight: '500' 
  },
  submitButtonDisabled: { 
    opacity: 0.6 
  },
  submittedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: '#22c55e',
    borderRadius: 8,
  },
  submittedText: { 
    fontSize: 14, 
    color: '#fff', 
    fontWeight: '500' 
  },
});
}
