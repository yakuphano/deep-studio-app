import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
  KeyboardAvoidingView,
  Animated,
} from 'react-native';
import { useRouter, useRootNavigationState } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as DocumentPicker from 'expo-document-picker';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../src/lib/supabase';
import { transcribeWithGroq } from '../../src/lib/groq';
import { useAuth } from '../../src/contexts/AuthContext';
import { TASK_LANGUAGES, DEFAULT_LANGUAGE, type TaskLanguageCode } from '../../src/constants/taskLanguages';

type User = { id: string; email?: string; full_name?: string; role?: string; is_active?: boolean; languages_expertise?: string[] };

const ADMIN_EMAIL = 'yakup.hano@deepannotation.ai';

async function getBlobDuration(blob: Blob): Promise<number | null> {
  if (typeof window === 'undefined') return null;
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const audio = new (window as any).Audio(url);
    const cleanup = () => {
      URL.revokeObjectURL(url);
      audio.src = '';
    };
    audio.onloadedmetadata = () => {
      const d = audio.duration;
      cleanup();
      resolve(Number.isFinite(d) ? Math.round(d * 10) / 10 : null);
    };
    audio.onerror = () => {
      cleanup();
      resolve(null);
    };
    audio.load();
  });
}

const CARD_STYLE = {
  backgroundColor: 'rgba(255,255,255,0.08)',
  borderRadius: 12,
  padding: 12,
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.12)',
};

function ActionCard({
  icon,
  iconColor,
  label,
  onPress,
}: { icon: keyof typeof Ionicons.glyphMap; iconColor: string; label: string; onPress: () => void }) {
  const [hovered, setHovered] = useState(false);
  const isWeb = Platform.OS === 'web';
  const card = (
    <View style={[styles.actionCard, CARD_STYLE, hovered && isWeb && styles.actionCardHover]}>
      <Ionicons name={icon} size={24} color={iconColor} style={styles.actionCardIcon} />
      <Text style={styles.actionCardLabel}>{label}</Text>
    </View>
  );
  return (
    <TouchableOpacity
      style={styles.actionCardTouch}
      onPress={onPress}
      activeOpacity={1}
      onMouseEnter={isWeb ? () => setHovered(true) : undefined}
      onMouseLeave={isWeb ? () => setHovered(false) : undefined}
    >
      {card}
    </TouchableOpacity>
  );
}

export default function AdminPanelScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const { user, isAdmin } = useAuth();

  const [title, setTitle] = useState('');
  const [taskPrice, setTaskPrice] = useState('10');
  const [clientName, setClientName] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState<TaskLanguageCode>(DEFAULT_LANGUAGE);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [audioStatus, setAudioStatus] = useState('');
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [pickedBlob, setPickedBlob] = useState<Blob | null>(null);
  const [pickedFileName, setPickedFileName] = useState<string | null>(null);
  const [pickedMimeType, setPickedMimeType] = useState<string | null>(null);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [userEarnings, setUserEarnings] = useState<Record<string, number>>({});
  const [annotatorSearchQuery, setAnnotatorSearchQuery] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const blinkAnim = useRef(new Animated.Value(1)).current;
  const [exportLang, setExportLang] = useState<string>('all');
  const [exportClient, setExportClient] = useState<string>('all');
  const [clientNames, setClientNames] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);

  const navigatorReady = rootNavigationState?.key != null;

  const DUMMY_STATS = {
    totalUsers: users.length || 24,
    activeTasks: 12,
    pendingPayments: 5,
    monthlyRevenue: 2840,
  };

  const CHART_DATA = [65, 80, 45, 90, 70, 85, 60];
  const completionPercent = Math.round(CHART_DATA.reduce((a, b) => a + b, 0) / CHART_DATA.length);

  useEffect(() => {
    if (!navigatorReady || user) return;
    router.replace('/');
  }, [navigatorReady, user]);

  useEffect(() => {
    if (navigatorReady && user && !isAdmin) router.replace('/tasks');
  }, [navigatorReady, user, isAdmin]);

  useEffect(() => {
    supabase.from('profiles').select('id, email, full_name, role, languages_expertise, is_active').then(async ({ data }) => {
      const raw = data ?? [];
      for (const r of raw) {
        if (r.email === ADMIN_EMAIL && r.role !== 'admin') {
          await supabase.from('profiles').update({ role: 'admin' }).eq('id', r.id).then(() => {}).catch(() => {});
        }
      }
      const list = raw.map((r) => ({
        ...r,
        role: r.email === ADMIN_EMAIL ? 'admin' : (r.role ?? 'user'),
        is_active: r.is_active ?? true,
        languages_expertise: Array.isArray(r.languages_expertise) ? r.languages_expertise : [],
      }));
      setUsers(list);
      const ids = list.map((u) => u.id).filter(Boolean);
      if (ids.length > 0) {
        supabase
          .from('tasks')
          .select('assigned_to, price')
          .in('assigned_to', ids)
          .in('status', ['submitted', 'completed'])
          .then(({ data: tasks }) => {
            const map: Record<string, number> = {};
            (tasks ?? []).forEach((t) => {
              const uid = t.assigned_to;
              if (uid) map[uid] = (map[uid] ?? 0) + Number(t.price ?? 0);
            });
            setUserEarnings(map);
          });
      }
    });
  }, []);

  const fetchClientNames = useCallback(async () => {
    const { data } = await supabase.from('tasks').select('client_name');
    const names = [...new Set((data ?? []).map((r) => (r.client_name ?? '').trim()).filter(Boolean))].sort();
    setClientNames(names);
  }, []);

  useEffect(() => {
    fetchClientNames();
  }, [fetchClientNames]);

  const handleExportJson = useCallback(async () => {
    setExporting(true);
    try {
      let query = supabase
        .from('tasks')
        .select('id, title, status, transcription, audio_url, language, client_name, assigned_to, duration')
        .in('status', ['submitted', 'completed']);
      if (exportLang !== 'all') query = query.eq('language', exportLang);
      if (exportClient !== 'all') query = query.eq('client_name', exportClient);
      const { data: tasks } = await query.order('created_at', { ascending: false });
      const ids = [...new Set((tasks ?? []).map((t) => t.assigned_to).filter(Boolean))];
      const { data: profiles } = ids.length > 0
        ? await supabase.from('profiles').select('id, email, full_name').in('id', ids)
        : { data: [] };
      const profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]));
      const exportData = (tasks ?? []).map((t) => ({
        id: t.id,
        title: t.title,
        audio_url: t.audio_url,
        transcription: t.transcription,
        duration: t.duration != null ? Number(t.duration) : null,
        language: t.language,
        client_name: t.client_name,
        annotator: t.assigned_to ? (profileMap[t.assigned_to]?.email || profileMap[t.assigned_to]?.full_name || t.assigned_to) : null,
      }));
      const firmaAdi = exportClient === 'all' ? 'Tum_Firmalar' : String(exportClient).replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '') || 'Firma';
      const dilAdi = exportLang === 'all' ? 'Tum_Diller' : exportLang;
      const tarih = new Date().toISOString().slice(0, 10);
      const fileName = `${firmaAdi}_${dilAdi}_${tarih}.json`;
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      Alert.alert(t('login.errorTitle'), (e as Error)?.message ?? 'Dışa aktarma hatası');
    } finally {
      setExporting(false);
    }
  }, [exportLang, exportClient, t]);

  const handlePickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true });
    if (result.canceled) return;
    const asset = result.assets[0];
    const res = await fetch(asset.uri);
    const blob = await res.blob();
    setPickedBlob(blob);
    setRecordedBlob(null);
    setPickedFileName(asset.name);
    setPickedMimeType(asset.mimeType ?? null);
    setAudioStatus(asset.name);
  };

  useEffect(() => {
    if (isRecording) {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(blinkAnim, { toValue: 0.3, duration: 500, useNativeDriver: true }),
          Animated.timing(blinkAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      );
      anim.start();
      return () => anim.stop();
    } else {
      blinkAnim.setValue(1);
    }
  }, [isRecording]);

  const handleRecord = async () => {
    if (isRecording && recordingRef.current) {
      try {
        await recordingRef.current.stopAndUnloadAsync();
        const uri = recordingRef.current.getURI();
        recordingRef.current = null;
        setIsRecording(false);
        if (uri) {
          const res = await fetch(uri);
          const blob = await res.blob();
          setRecordedBlob(blob);
          setPickedBlob(blob);
          setPickedFileName(`rec_${Date.now()}.webm`);
          setPickedMimeType('audio/webm');
          setAudioStatus(t('admin.recorded'));
        }
      } catch (e) {
        setIsRecording(false);
        recordingRef.current = null;
      }
      return;
    }
    const { status } = await Audio.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('adminErrors.aiAnalysisFailed'), t('admin.audioSection'));
      return;
    }
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true, staysActiveInBackground: false, shouldDuckAndroid: true, playThroughEarpieceAndroid: false });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      recordingRef.current = recording;
      setIsRecording(true);
    } catch (e) {
      Alert.alert(t('login.errorTitle'), (e as Error)?.message ?? 'Kayıt başlatılamadı');
    }
  };

  const handleAssignTask = async () => {
    if (!title.trim()) {
      Alert.alert(t('login.errorTitle'), t('adminErrors.titleRequired'));
      return;
    }
    setSubmitting(true);
    let transcriptionText = 'Metin oluşturulamadı';
    let audioUrl: string | null = null;
    try {
      let durationSec: number | null = null;
      const audioBlob = recordedBlob || pickedBlob;
      if (audioBlob) {
        setAudioStatus('...');
        durationSec = await getBlobDuration(audioBlob);
        const mimeType = recordedBlob ? (recordedBlob.type || 'audio/webm') : pickedMimeType || 'audio/mpeg';
        const ext = mimeType.includes('webm') ? 'webm' : mimeType.includes('mpeg') ? 'mp3' : 'm4a';
        const safeName = recordedBlob ? `rec_${Date.now()}.${ext}` : pickedFileName || `audio.${ext}`;
        const path = `${Date.now()}_${safeName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const { data: uploadData, error: ue } = await supabase.storage.from('audios').upload(path, audioBlob, { contentType: mimeType, upsert: true });
        if (ue) throw ue;
        const { data: urlData } = supabase.storage.from('audios').getPublicUrl(uploadData.path);
        audioUrl = urlData.publicUrl;
        try {
          const langToUse = selectedLanguage ?? DEFAULT_LANGUAGE;
          const res = await transcribeWithGroq({
            fileUrl: audioUrl,
            language: langToUse === 'unspecified' ? undefined : langToUse,
          });
          if (!res.error && res.text?.trim()) {
            transcriptionText = res.text.trim();
          } else if (res.error) {
            console.error('[Groq] Admin transcribe error (response):', res.error);
            transcriptionText = 'Metin oluşturulamadı';
          }
        } catch (e) {
          console.error('[Groq] Admin transcribe hatası (exception):', e);
          transcriptionText = 'Metin oluşturulamadı';
        }
      }
      const priceNum = Math.max(0, parseFloat(taskPrice) || 10);
      const langToSave = selectedLanguage ?? DEFAULT_LANGUAGE;
      const isPool = selectedUser?.id === '__POOL__' || !selectedUser;
      const taskData: Record<string, unknown> = {
        title: title.trim(),
        status: 'pending',
        transcription: transcriptionText,
        audio_url: audioUrl ?? '',
        price: priceNum,
        language: langToSave,
        is_pool_task: isPool,
        assigned_to: isPool ? null : selectedUser?.id ?? null,
        client_name: clientName.trim() || null,
        duration: durationSec,
      };
      const { error: insertError } = await supabase.from('tasks').insert(taskData);
      if (insertError) throw insertError;
      fetchClientNames();
      Alert.alert(t('taskDetail.successTitle'), t('adminErrors.taskCreatedSuccess', { language: t(`languages.${langToSave}`) }));
      setTitle('');
      setClientName('');
      setRecordedBlob(null);
      setPickedBlob(null);
      setAudioStatus('');
      setShowTaskForm(false);
    } catch (err: any) {
      Alert.alert(t('login.errorTitle'), err?.message ?? 'Hata');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleUserRole = (u: User) => {
    const nextRole = (u.role === 'admin' ? 'user' : 'admin') as string;
    supabase.from('profiles').update({ role: nextRole }).eq('id', u.id).then(() => {
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, role: nextRole } : x)));
    }).catch(() => setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, role: nextRole } : x))));
  };

  const toggleUserStatus = (u: User) => {
    const next = !(u.is_active ?? true);
    supabase.from('profiles').update({ is_active: next }).eq('id', u.id).then(() => {
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, is_active: next } : x)));
    }).catch(() => setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, is_active: next } : x))));
  };

  const showEditOptions = (u: User) => {
    Alert.alert(
      u.email || u.id,
      undefined,
      [
        { text: t('login.cancel'), style: 'cancel' },
        {
          text: u.role === 'admin' ? t('admin.userTable.roleUser') : t('admin.userTable.roleAdmin'),
          onPress: () => toggleUserRole(u),
        },
        {
          text: (u.is_active ?? true) ? t('admin.userTable.statusInactive') : t('admin.userTable.statusActive'),
          onPress: () => toggleUserStatus(u),
        },
      ]
    );
  };

  const POOL_USER: User = { id: '__POOL__', email: t('admin.publicPool') };
  const displayUsers = useMemo(() => {
    const lang = selectedLanguage ?? DEFAULT_LANGUAGE;
    const experts = users.filter((u) => {
      const langs = (u.languages_expertise ?? []).filter((c) => c && c !== 'unspecified');
      const hasLang = langs.length === 0 || langs.includes(lang) || langs.includes('unspecified');
      return hasLang;
    });
    return [POOL_USER, ...experts];
  }, [users, selectedLanguage]);

  useEffect(() => {
    if (showTaskForm) setSelectedUser(POOL_USER);
  }, [showTaskForm]);

  useEffect(() => {
    if (selectedUser && selectedUser.id !== '__POOL__' && !displayUsers.some((u) => u.id === selectedUser?.id)) {
      setSelectedUser(POOL_USER);
    }
  }, [displayUsers, selectedUser]);

  const filteredAnnotators = useMemo(() => {
    const q = annotatorSearchQuery.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => (u.email ?? u.full_name ?? u.id ?? '').toLowerCase().includes(q));
  }, [users, annotatorSearchQuery]);

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.replace('/tasks' as any)}
          activeOpacity={0.8}
        >
          <Ionicons name="arrow-back" size={22} color="#f8fafc" />
          <Text style={styles.backButtonText}>Görevlere Dön</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{t('admin.panelTitle')}</Text>

        {/* 5 İstatistik Kartı (4 + Tamamlama Oranı) */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, CARD_STYLE]}>
            <Ionicons name="people" size={18} color="#60a5fa" />
            <Text style={styles.statValue}>{DUMMY_STATS.totalUsers}</Text>
            <Text style={styles.statLabel}>{t('admin.stats.totalUsers')}</Text>
          </View>
          <View style={[styles.statCard, CARD_STYLE]}>
            <Ionicons name="document-text" size={18} color="#22c55e" />
            <Text style={styles.statValue}>{DUMMY_STATS.activeTasks}</Text>
            <Text style={styles.statLabel}>{t('admin.stats.activeTasks')}</Text>
          </View>
          <View style={[styles.statCard, CARD_STYLE]}>
            <Ionicons name="time" size={18} color="#f59e0b" />
            <Text style={styles.statValue}>{DUMMY_STATS.pendingPayments}</Text>
            <Text style={styles.statLabel}>{t('admin.stats.pendingPayments')}</Text>
          </View>
          <View style={[styles.statCard, CARD_STYLE]}>
            <Ionicons name="wallet" size={18} color="#8b5cf6" />
            <Text style={styles.statValue}>{DUMMY_STATS.monthlyRevenue} TL</Text>
            <Text style={styles.statLabel}>{t('admin.stats.monthlyRevenue')}</Text>
          </View>
          <View style={[styles.statCard, styles.completionStatCard, CARD_STYLE]}>
            <Text style={styles.completionTitle}>{t('admin.chartTitle')}</Text>
            <View style={styles.progressBarWrap}>
              <View style={[styles.progressBarFill, { width: `${completionPercent}%` }]} />
            </View>
            <Text style={styles.completionText}>{t('admin.completionLabel', { percent: completionPercent })}</Text>
          </View>
        </View>

        {/* Hızlı İşlemler - İstatistik kartlarıyla aynı boyut */}
        <View style={styles.actionsRow}>
          <ActionCard icon="add-circle" iconColor="#3b82f6" label={t('admin.quickActions.newTask')} onPress={() => setShowTaskForm(!showTaskForm)} />
          <ActionCard icon="person-add" iconColor="#22c55e" label={t('admin.quickActions.addStaff')} onPress={() => Alert.alert(t('admin.panelTitle'), t('admin.quickActions.addStaff'))} />
          <ActionCard icon="stats-chart" iconColor="#8b5cf6" label={t('admin.quickActions.financialReport')} onPress={() => Alert.alert(t('admin.panelTitle'), t('admin.quickActions.financialReport'))} />
          <ActionCard icon="chatbubbles" iconColor="#22c55e" label={t('nav.messages')} onPress={() => router.push('/messages' as any)} />
        </View>

        {/* Görev Atama Formu (açılır) */}
        {showTaskForm && (
          <View style={[styles.sectionCard, CARD_STYLE]}>
            <Text style={styles.sectionTitle}>{t('admin.taskAssignment')}</Text>
            <Text style={styles.label}>{t('admin.taskTitle')}</Text>
            <TextInput style={styles.input} placeholder={t('admin.taskTitlePlaceholder')} placeholderTextColor="#64748b" value={title} onChangeText={setTitle} />
            <Text style={styles.label}>{t('admin.taskPrice')}</Text>
            <TextInput style={styles.input} placeholder="10" placeholderTextColor="#64748b" value={taskPrice} onChangeText={setTaskPrice} keyboardType="numeric" />
            <Text style={styles.label}>{t('admin.clientName')}</Text>
            <TextInput style={styles.input} placeholder={t('admin.clientNamePlaceholder')} placeholderTextColor="#64748b" value={clientName} onChangeText={setClientName} />
            <Text style={styles.label}>{t('admin.language')}</Text>
            <View style={styles.langChipsWrap}>
              {TASK_LANGUAGES.map((lang) => (
                <TouchableOpacity key={lang.code} style={[styles.langChip, selectedLanguage === lang.code && styles.langChipActive]} onPress={() => setSelectedLanguage(lang.code)}>
                  <Text style={[styles.langChipText, selectedLanguage === lang.code && styles.langChipTextActive]}>{t(lang.labelKey)}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>{t('admin.selectEmployee')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.userScroll}>
              {displayUsers.map((u) => (
                <TouchableOpacity key={u.id} style={[styles.userChip, selectedUser?.id === u.id && styles.userChipActive]} onPress={() => setSelectedUser(u)}>
                  <Text style={[styles.userChipText, selectedUser?.id === u.id && styles.userChipTextActive]}>{u.email || u.full_name || u.id}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Text style={styles.label}>{t('admin.audioSection')}</Text>
            <View style={styles.row}>
              <TouchableOpacity style={styles.btn} onPress={handlePickFile} disabled={isRecording}>
                <Text style={styles.btnText}>{t('admin.selectFile')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.recordBtn, isRecording && styles.recordBtnActive]} onPress={handleRecord}>
                {isRecording && (
                  <Animated.View style={[styles.recordDot, { opacity: blinkAnim }]} />
                )}
                <Text style={styles.btnText}>{isRecording ? t('admin.recording') : t('admin.record')}</Text>
              </TouchableOpacity>
            </View>
            {audioStatus ? <Text style={styles.status}>{audioStatus}</Text> : null}
            <TouchableOpacity style={[styles.submitBtn, submitting && styles.submitBtnDisabled]} onPress={handleAssignTask} disabled={submitting}>
              <Text style={styles.submitBtnText}>
                {submitting ? t('admin.assigning') : (selectedUser?.id === '__POOL__' || !selectedUser) ? t('admin.sendToPool') : t('admin.assignToPerson')}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Veri Dışa Aktar (Export) */}
        <View style={[styles.sectionCard, CARD_STYLE]}>
          <Text style={styles.sectionTitle}>{t('admin.exportTitle')}</Text>
          <View style={styles.exportRow}>
            <View style={styles.exportField}>
              <Text style={styles.exportLabel}>{t('admin.exportLanguage')}</Text>
              <View style={styles.exportChips}>
                <TouchableOpacity style={[styles.exportChip, exportLang === 'all' && styles.exportChipActive]} onPress={() => setExportLang('all')}>
                  <Text style={[styles.exportChipText, exportLang === 'all' && styles.exportChipTextActive]}>{t('admin.exportAll')}</Text>
                </TouchableOpacity>
                {TASK_LANGUAGES.filter((l) => l.code !== 'unspecified').map((lang) => (
                  <TouchableOpacity key={lang.code} style={[styles.exportChip, exportLang === lang.code && styles.exportChipActive]} onPress={() => setExportLang(lang.code)}>
                    <Text style={[styles.exportChipText, exportLang === lang.code && styles.exportChipTextActive]}>{t(lang.labelKey)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={styles.exportField}>
              <Text style={styles.exportLabel}>{t('admin.exportClient')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.exportChips}>
                <TouchableOpacity style={[styles.exportChip, exportClient === 'all' && styles.exportChipActive]} onPress={() => setExportClient('all')}>
                  <Text style={[styles.exportChipText, exportClient === 'all' && styles.exportChipTextActive]}>{t('admin.exportAll')}</Text>
                </TouchableOpacity>
                {clientNames.map((name) => (
                  <TouchableOpacity key={name} style={[styles.exportChip, exportClient === name && styles.exportChipActive]} onPress={() => setExportClient(name)}>
                    <Text style={[styles.exportChipText, exportClient === name && styles.exportChipTextActive]} numberOfLines={1}>{name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
          <TouchableOpacity style={[styles.exportBtn, exporting && styles.exportBtnDisabled]} onPress={handleExportJson} disabled={exporting}>
            <Ionicons name="download" size={18} color="#fff" />
            <Text style={styles.exportBtnText}>{exporting ? t('admin.exporting') : t('admin.exportJson')}</Text>
          </TouchableOpacity>
        </View>

        {/* Annotators - Kullanıcı Listesi */}
        <View style={styles.annotatorsHeader}>
          <Text style={styles.sectionTitle}>{t('admin.annotators')}</Text>
          <View style={styles.searchWrap}>
            <Ionicons name="search" size={18} color="#94a3b8" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder={t('admin.searchAnnotatorPlaceholder')}
              placeholderTextColor="#64748b"
              value={annotatorSearchQuery}
              onChangeText={setAnnotatorSearchQuery}
            />
          </View>
        </View>
        <View style={[styles.tableCard, CARD_STYLE]}>
          <View style={styles.tableHeader}>
            <Text style={styles.tableHeaderText}>{t('admin.userTable.email')}</Text>
            <Text style={styles.tableHeaderText}>{t('admin.expertise')}</Text>
            <Text style={styles.tableHeaderText}>{t('admin.userTable.role')}</Text>
            <Text style={styles.tableHeaderText}>{t('admin.totalEarnings')}</Text>
          </View>
          {users.length === 0 && <Text style={styles.placeholderText}>{t('admin.userListEmpty')}</Text>}
          {users.length > 0 && annotatorSearchQuery.trim() && filteredAnnotators.length === 0 && (
            <Text style={styles.placeholderText}>{t('admin.noAnnotatorFound')}</Text>
          )}
          {users.length > 0 && !(annotatorSearchQuery.trim() && filteredAnnotators.length === 0) &&
            filteredAnnotators.map((u) => {
              const langs = (u.languages_expertise ?? []).filter((c) => c && c !== 'unspecified');
              const expertiseBadges = langs.length > 0 ? langs : ['tr'];
              const total = userEarnings[u.id] ?? 0;
              const isAdminUser = u.email === ADMIN_EMAIL || u.role === 'admin';
              const roleLabel = isAdminUser ? t('admin.userTable.roleAdmin') : t('admin.userTable.roleUser');
              return (
                <View key={u.id} style={[styles.tableRow, isAdminUser && styles.tableRowAdmin]}>
                  <View style={styles.emailCell}>
                    {isAdminUser && <Ionicons name="shield" size={14} color="#60a5fa" style={{ marginRight: 4 }} />}
                    <Text style={[styles.tableCell, styles.emailText]} numberOfLines={1}>{u.email || u.full_name || u.id}</Text>
                    <TouchableOpacity style={styles.editIconBtn} onPress={() => showEditOptions(u)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="pencil" size={14} color="#94a3b8" />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.expertiseCell}>
                    {expertiseBadges.map((code) => (
                      <View key={code} style={styles.expertiseBadge}>
                        <Text style={styles.expertiseBadgeText}>{code.toUpperCase()}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={styles.roleCell}>
                    <Text style={styles.roleBadge}>{roleLabel}</Text>
                  </View>
                  <Text style={styles.earningsCell}>{total.toLocaleString('tr-TR')} TL</Text>
                </View>
              );
            })}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  scroll: { padding: 16, paddingBottom: 40 },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
    paddingVertical: 6,
    paddingRight: 12,
    alignSelf: 'flex-start',
  },
  backButtonText: { fontSize: 14, fontWeight: '600', color: '#f8fafc' },
  title: { fontSize: 22, fontWeight: '700', color: '#f8fafc', marginBottom: 16 },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  statCard: { flex: 1, minWidth: 100, padding: 12, minHeight: 80 },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  actionCardTouch: { flex: 1, minWidth: 100 },
  actionCard: { flex: 1, padding: 12, alignItems: 'center', justifyContent: 'center', minHeight: 80 },
  actionCardHover: { backgroundColor: 'rgba(255,255,255,0.12)', transform: [{ scale: 1.02 }], borderColor: 'rgba(255,255,255,0.18)' },
  actionCardIcon: { marginBottom: 6 },
  actionCardLabel: { fontSize: 11, color: '#94a3b8', textAlign: 'center', fontWeight: '600' },
  statValue: { fontSize: 18, fontWeight: '700', color: '#f8fafc', marginTop: 4, marginBottom: 2 },
  statLabel: { fontSize: 11, color: '#94a3b8' },
  completionStatCard: { minWidth: 120 },
  completionTitle: { fontSize: 10, fontWeight: '600', color: '#94a3b8', marginBottom: 6 },
  progressBarWrap: { height: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden', marginBottom: 4 },
  progressBarFill: { height: '100%', backgroundColor: '#3b82f6', borderRadius: 3 },
  completionText: { fontSize: 11, fontWeight: '700', color: '#f8fafc' },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: '#f8fafc', marginTop: 16, marginBottom: 8 },
  annotatorsHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    backgroundColor: '#1e293b',
    borderRadius: 20,
    paddingHorizontal: 15,
    flex: 1,
    minWidth: 200,
    maxWidth: 280,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  searchIcon: { marginRight: 10 },
  searchInput: { flex: 1, paddingVertical: 0, fontSize: 14, color: '#ffffff' },
  sectionCard: { padding: 14, marginBottom: 8 },
  tableCard: { padding: 12, marginBottom: 8 },
  tableHeader: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' },
  tableHeaderText: { flex: 1, fontSize: 11, fontWeight: '600', color: '#94a3b8', minWidth: 0 },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  tableRowAdmin: { backgroundColor: 'rgba(59, 130, 246, 0.08)' },
  tableCell: { flex: 1, fontSize: 12, color: '#f1f5f9', minWidth: 0 },
  emailCell: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  emailText: { flex: 1, flexShrink: 1 },
  editIconBtn: { padding: 4 },
  expertiseCell: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 4, alignItems: 'center', minWidth: 0 },
  expertiseBadge: { backgroundColor: 'rgba(59, 130, 246, 0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  expertiseBadgeText: { fontSize: 10, fontWeight: '600', color: '#60a5fa' },
  roleCell: { flex: 1, minWidth: 0 },
  roleBadge: { fontSize: 11, color: '#60a5fa', fontWeight: '600' },
  earningsCell: { flex: 1, fontSize: 12, color: '#22c55e', fontWeight: '600', minWidth: 0 },
  label: { fontSize: 13, fontWeight: '600', color: '#94a3b8', marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: 'rgba(15,23,42,0.8)', borderRadius: 10, padding: 12, fontSize: 14, color: '#f1f5f9', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  row: { flexDirection: 'row', gap: 12, marginTop: 8 },
  btn: { flex: 1, backgroundColor: 'rgba(59, 130, 246, 0.3)', paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  recordBtn: { backgroundColor: 'rgba(100, 116, 139, 0.5)', flexDirection: 'row', alignItems: 'center', gap: 8 },
  recordBtnActive: { backgroundColor: 'rgba(239, 68, 68, 0.4)' },
  recordDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#ef4444' },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  status: { fontSize: 11, color: '#60a5fa', marginTop: 6 },
  langChipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  langChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(15,23,42,0.6)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  langChipActive: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  langChipText: { fontSize: 12, color: '#94a3b8' },
  langChipTextActive: { color: '#fff', fontWeight: '600' },
  userScroll: { marginVertical: 6, maxHeight: 44 },
  userChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: 'rgba(15,23,42,0.6)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', marginRight: 6 },
  userChipActive: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  userChipText: { color: '#94a3b8', fontSize: 13 },
  userChipTextActive: { color: '#fff', fontWeight: '600' },
  submitBtn: { backgroundColor: '#3b82f6', paddingVertical: 14, borderRadius: 10, alignItems: 'center', marginTop: 16 },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  placeholderText: { fontSize: 13, color: '#94a3b8', textAlign: 'center', paddingVertical: 16 },
  exportRow: { gap: 12, marginBottom: 12 },
  exportField: { marginBottom: 8 },
  exportLabel: { fontSize: 12, fontWeight: '600', color: '#94a3b8', marginBottom: 6 },
  exportChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  exportChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: 'rgba(15,23,42,0.6)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  exportChipActive: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  exportChipText: { fontSize: 13, color: '#94a3b8' },
  exportChipTextActive: { color: '#fff', fontWeight: '600' },
  exportBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#22c55e', paddingVertical: 12, borderRadius: 10, marginTop: 8 },
  exportBtnDisabled: { opacity: 0.6 },
  exportBtnText: { fontSize: 14, color: '#fff', fontWeight: '600' },
});
