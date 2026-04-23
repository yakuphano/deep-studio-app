import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { triggerEarningsRefresh } from '@/lib/earningsRefresh';
import { useAuth } from '@/contexts/AuthContext';
import AudioPlayer from '@/components/AudioPlayer';

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
}

export default function AudioTaskDetailScreen() {
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
        };
        setTask(taskData);
        setTranscription(taskData.transcription ?? '');
      }
      setLoading(false);
    };
    fetchTask();
  }, [id]);

  const handleAITranscription = useCallback(async () => {
    if (!audioUrl) return;
    setTranscribing(true);
    try {
      // Mock AI transcription
      await new Promise(resolve => setTimeout(resolve, 2000));
      setTranscription('This is a sample transcription from the AI service.');
    } catch (err) {
      console.error('AI Transcription Error:', err);
    } finally {
      setTranscribing(false);
    }
  }, [audioUrl]);

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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            try {
              router.back();
            } catch (_) {}
          }}
          activeOpacity={0.8}
        >
          <Ionicons name="arrow-back" size={20} color="#f1f5f9" />
          <Text style={styles.backText}>{t('taskDetail.back')}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('common.taskDetail')}</Text>
      </View>

      <ScrollView style={styles.content}>
        {task.title ? (
          <Text style={styles.taskTitle} numberOfLines={2}>
            {task.title}
          </Text>
        ) : null}
        <View style={styles.priceBadge}>
          <Text style={styles.priceBadgeText}>{t('tasks.fee')}: {task.price ?? 0} TL</Text>
        </View>

        <View style={styles.audioSection}>
          <Text style={styles.sectionLabel}>{t('taskDetail.audioLabel')}</Text>
          <View style={styles.audioCard}>
            {audioUrl && isAudioTask ? (
              <AudioPlayer uri={audioUrl} />
            ) : (
              <Text style={styles.noAudioText}>{t('taskDetail.noAudio')}</Text>
            )}
          </View>
        </View>

        <View style={styles.transcriptionSection}>
          <View style={styles.transcriptionHeader}>
            <Text style={styles.sectionLabel}>{t('taskDetail.transcriptionLabel')}</Text>
          </View>
          
          {/* AI Transcribe Butonu */}
          <TouchableOpacity 
            style={styles.compactButton}
            onPress={handleAITranscription}
            disabled={transcribing}
          >
            {transcribing ? (
              <>
                <ActivityIndicator size="small" color="#ffffff" />
                <Text style={styles.compactButtonText}>AI Transcribing...</Text>
              </>
            ) : (
              <>
                <Ionicons name="sparkles" size={16} color="#ffffff" />
                <Text style={styles.compactButtonText}>AI Transcribe</Text>
              </>
            )}
          </TouchableOpacity>
          <View style={styles.transcriptionCard}>
            <TextInput
              style={styles.transcriptionInput}
              placeholder={t('taskDetail.transcriptionPlaceholder')}
              placeholderTextColor="#64748b"
              value={transcription}
              onChangeText={setTranscription}
              multiline
              textAlignVertical="top"
              editable={true}
            />
          </View>
          <TouchableOpacity 
            style={styles.compactButton}
            onPress={handleAIFix}
            disabled={aiFixing}
          >
            {aiFixing ? (
              <>
                <ActivityIndicator size="small" color="#ffffff" />
                <Text style={styles.compactButtonText}>AI Fixing...</Text>
              </>
            ) : (
              <>
                <Ionicons name="sparkles" size={16} color="#ffffff" />
                <Text style={styles.compactButtonText}>AI Fix</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {isSubmitted ? (
          <View style={styles.submittedBadge}>
            <Ionicons name="checkmark-circle" size={18} color="#fff" />
            <Text style={styles.submittedText}>{t('tasks.submitted')}</Text>
          </View>
        ) : (
          <View style={styles.bottomButtonBar}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity style={styles.exitButton} onPress={handleExit}>
                <Text style={styles.exitButtonText}>Exit</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.submitExitButton} onPress={() => handleSubmit(false)}>
                <Text style={styles.submitExitButtonText}>Submit & Exit</Text>
              </TouchableOpacity>
            </View>
            
            <TouchableOpacity style={styles.submitButtonGreen} onPress={() => handleSubmit(true)}>
              <Text style={styles.submitButtonGreenText}>Submit</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#0f172a',
  },
  loadingText: { 
    color: '#94a3b8', 
    fontSize: 14, 
    textAlign: 'center', 
    marginTop: 24 
  },
  
  // Header styles
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f1f5f9',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f1f5f9',
    marginLeft: 16,
    flex: 1,
    textAlign: 'center',
  },
  
  // Content styles
  content: {
    flex: 1,
    padding: 16,
  },
  taskTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#f1f5f9',
    paddingHorizontal: 16,
    marginBottom: 8,
    lineHeight: 28,
  },
  priceBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginLeft: 16,
    marginBottom: 16,
  },
  priceBadgeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#22c55e',
  },
  
  // Footer styles
  footer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: '#0f172a',
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  
  // Audio styles
  audioSection: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f1f5f9',
    marginBottom: 12,
  },
  audioCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  playerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  playButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: {
    fontSize: 20,
    color: '#fff',
    fontWeight: '600',
  },
  playerInfo: {
    flex: 1,
  },
  progressBar: {
    height: 4,
    backgroundColor: '#334155',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#3b82f6',
  },
  timeText: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 8,
  },
  speedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  speedLabel: {
    fontSize: 14,
    color: '#f1f5f9',
  },
  speedControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  speedBtn: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  speedBtnDisabled: {
    opacity: 0.5,
  },
  speedBtnText: {
    fontSize: 16,
    color: '#f1f5f9',
    fontWeight: '600',
  },
  speedValue: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 6,
  },
  speedValueText: {
    fontSize: 12,
    color: '#f1f5f9',
    fontWeight: '600',
  },
  noAudioText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    paddingVertical: 24,
  },
  
  // Transcription styles
  transcriptionSection: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  transcriptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontWeight: '600',
    color: '#fff',
  },
  transcriptionCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 12,
  },
  transcriptionInput: {
    fontSize: 14,
    color: '#f1f5f9',
    minHeight: 120,
    textAlignVertical: 'top',
  },
  
  // AI Button styles
  aiButtonWrapper: {
    marginBottom: 12,
  },
  aiTranscribeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
  },
  aiTranscribeButtonDisabled: {
    opacity: 0.6,
  },
  aiTranscribeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  
  // Compact Button styles
  compactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start', // ÖNEMLI: Butonu içeriðe göre daraltýr, sola yaslar.
    backgroundColor: '#7c3aed', // Mor tonunu koruduk
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 12,
    gap: 8, // Ýkon ve metin arasý boþluk
  },
  compactButtonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 14,
  },
  
  // Bottom buttons
  bottomButtonBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#0f172a',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  exitButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  exitButtonText: { 
    fontSize: 14, 
    color: '#ef4444', 
    fontWeight: '600' 
  },
  submitExitButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#3b82f6',
  },
  submitExitButtonText: { 
    fontSize: 14, 
    color: '#fff', 
    fontWeight: '600' 
  },
  submitButtonGreen: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#22c55e',
  },
  submitButtonGreenText: { 
    fontSize: 14, 
    color: '#fff', 
    fontWeight: '600' 
  },
  submitButtonDisabled: { 
    opacity: 0.6 
  },
  submittedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#22c55e',
    borderRadius: 8,
  },
  submittedText: { 
    fontSize: 14, 
    color: '#fff', 
    fontWeight: '600' 
  },
});
