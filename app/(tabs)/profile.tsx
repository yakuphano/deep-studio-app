import React, { useState, useEffect } from 'react';
import { useRouter, useRootNavigationState } from 'expo-router';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/contexts/AuthContext';
import { TASK_LANGUAGES, type TaskLanguageCode } from '../../src/constants/taskLanguages';

export default function ProfileScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const { user, signOut, isAdmin } = useAuth();

  const navigatorReady = rootNavigationState?.key != null;

  useEffect(() => {
    if (!navigatorReady || user) return;
    router.replace('/');
  }, [navigatorReady, user]);
  const [languages, setLanguages] = useState<TaskLanguageCode[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from('profiles')
      .select('languages_expertise')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.languages_expertise) {
          setLanguages(Array.isArray(data.languages_expertise) ? data.languages_expertise : []);
        }
      });
  }, [user?.id]);

  const toggleLang = (code: TaskLanguageCode) => {
    setLanguages((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const save = async () => {
    if (!user?.id) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ languages_expertise: languages })
        .eq('id', user.id);
      if (error) throw error;
      Alert.alert(t('taskDetail.successTitle'), t('profile.save') + ' ✓');
    } catch (err: any) {
      Alert.alert(t('login.errorTitle'), err?.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.label}>{t('profile.email')}</Text>
      <Text style={styles.email}>{user?.email ?? '-'}</Text>
      <Text style={[styles.label, { marginTop: 24 }]}>{t('profile.languagesExpertise')}</Text>
      <Text style={styles.hint}>{t('profile.languagesExpertiseHint')}</Text>
      <View style={styles.chips}>
        {TASK_LANGUAGES.filter((l) => l.code !== 'unspecified').map((lang) => (
          <TouchableOpacity
            key={lang.code}
            style={[styles.chip, languages.includes(lang.code) && styles.chipActive]}
            onPress={() => toggleLang(lang.code)}
          >
            <Text style={[styles.chipText, languages.includes(lang.code) && styles.chipTextActive]}>
              {t(lang.labelKey)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity
        style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
        onPress={save}
        disabled={saving}
      >
        <Text style={styles.saveBtnText}>{saving ? t('profile.saving') : t('profile.save')}</Text>
      </TouchableOpacity>
      {isAdmin && (
        <TouchableOpacity
          style={styles.adminLink}
          onPress={() => router.push('/admin')}
        >
          <Text style={styles.adminLinkText}>{t('nav.management')}</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity
        style={styles.logoutBtn}
        onPress={() => signOut().then(() => {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.location.href = '/';
        } else {
          router.replace('/');
        }
      })}
      >
        <Text style={styles.logoutText}>{t('nav.logout')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  content: { padding: 20, paddingBottom: 40 },
  label: { fontSize: 14, fontWeight: '600', color: '#94a3b8', marginBottom: 8 },
  email: { fontSize: 16, color: '#f1f5f9', marginBottom: 8 },
  hint: { fontSize: 13, color: '#64748b', marginBottom: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
  },
  chipActive: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  chipText: { color: '#94a3b8', fontSize: 14 },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  saveBtn: { backgroundColor: '#3b82f6', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginBottom: 16 },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  adminLink: { paddingVertical: 12, alignItems: 'center', marginBottom: 8 },
  adminLinkText: { fontSize: 15, color: '#60a5fa', fontWeight: '600' },
  logoutBtn: { paddingVertical: 16, borderTopWidth: 1, borderTopColor: '#334155', alignItems: 'center' },
  logoutText: { fontSize: 16, color: '#ef4444', fontWeight: '600' },
});
