import React, { useMemo, useState, useEffect } from 'react';
import { useRouter, useRootNavigationState } from 'expo-router';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import { canAccessReviewQueue } from '@/lib/userRoles';
import { TASK_LANGUAGES, type TaskLanguageCode } from '@/constants/taskLanguages';
import type { AppColors } from '@/theme/palettes';
import { useAppTheme, useThemeColors } from '@/contexts/ThemeContext';

export default function ProfileScreen() {
  const themeColors = useThemeColors();
  const { theme, setTheme } = useAppTheme();
  const styles = useMemo(() => createStyles(themeColors), [themeColors]);

  const { t } = useTranslation();
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const { user, signOut, isAdmin } = useAuth();
  const { appRole } = useProfile();

  const navigatorReady = rootNavigationState?.key != null;

  useEffect(() => {
    if (!navigatorReady || user) return;
    router.replace('/');
  }, [navigatorReady, user]);
  const [languages, setLanguages] = useState<TaskLanguageCode[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    console.log('Loading user profile for:', user.id);
    supabase
      .from('profiles')
      .select('languages_expertise, languages') // Check both columns
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        console.log('Profile data:', data);
        // Use languages column first, fallback to languages_expertise
        const languagesData = data?.languages || data?.languages_expertise;
        if (languagesData) {
          setLanguages(Array.isArray(languagesData) ? languagesData : []);
        }
      });
  }, [user?.id]);

  const toggleLang = (code: TaskLanguageCode) => {
    setLanguages((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const save = async () => {
    if (!user?.id) {
      console.log('No user ID found, cannot save');
      return;
    }
    console.log('Saving profile for user:', user.id, 'with languages:', languages);
    console.log('Languages array length:', languages.length);
    console.log('Languages content:', JSON.stringify(languages));
    
    setSaving(true);
    
    try {
      // First check if profile exists
      console.log('Checking if profile exists...');
      const { data: existingProfile, error: checkError } = await supabase
        .from('profiles')
        .select('id, languages, languages_expertise')
        .eq('id', user.id)
        .single();
      
      console.log('Existing profile check:', { existingProfile, checkError });
      
      if (checkError && checkError.code !== 'PGRST116') {
        console.error('Error checking profile:', checkError);
        throw checkError;
      }
      
      // Update both languages column and languages_expertise for compatibility
      console.log('Updating profile...');
      const { data, error } = await supabase
        .from('profiles')
        .update({ 
          languages: languages,
          languages_expertise: languages // Keep both for compatibility
        })
        .eq('id', user.id)
        .select()
        .single();
      
      console.log('Save result:', { data, error });
      
      if (error) {
        console.error('Save failed:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
        throw error;
      }
      
      console.log('Profile saved successfully!');
      console.log('Updated profile data:', data);
      
      if (typeof window !== 'undefined') {
        window.alert('Profile Updated Successfully!');
      } else {
        Alert.alert('Success', 'Profile Updated Successfully!');
      }
    } catch (err: any) {
      console.error('Save error:', err);
      console.error('Error details:', JSON.stringify(err, null, 2));
      if (typeof window !== 'undefined') {
        window.alert(`Save failed: ${err?.message || 'Unknown error'}`);
      } else {
        Alert.alert('Error', `Save failed: ${err?.message || 'Unknown error'}`);
      }
    } finally {
      // CRITICAL: Always clear loading state
      console.log('Clearing saving state');
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.label}>{t('profile.email')}</Text>
      <Text style={styles.email}>{user?.email ?? '-'}</Text>
      <Text style={[styles.label, { marginTop: 16 }]}>{t('profile.role')}</Text>
      <View style={styles.rolePill}>
        <Text style={styles.rolePillText}>{t(`roles.${appRole}`)}</Text>
      </View>
      <Text style={[styles.label, { marginTop: 24 }]}>{t('profile.themeAppearance')}</Text>
      <View style={styles.themeRow}>
        <TouchableOpacity
          style={[styles.themeChip, theme === 'light' && styles.themeChipActive]}
          onPress={() => setTheme('light')}
        >
          <Text style={[styles.themeChipText, theme === 'light' && styles.themeChipTextActive]}>
            {t('profile.themeLight')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.themeChip, theme === 'dark' && styles.themeChipActive]}
          onPress={() => setTheme('dark')}
        >
          <Text style={[styles.themeChipText, theme === 'dark' && styles.themeChipTextActive]}>
            {t('profile.themeDark')}
          </Text>
        </TouchableOpacity>
      </View>
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
      {canAccessReviewQueue(appRole) && (
        <TouchableOpacity style={styles.secondaryLink} onPress={() => router.push('/review')}>
          <Text style={styles.secondaryLinkText}>{t('nav.qaReview')}</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity style={styles.secondaryLink} onPress={() => router.push('/revisions')}>
        <Text style={styles.secondaryLinkText}>{t('nav.revisions')}</Text>
      </TouchableOpacity>
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

function createStyles(themeColors: AppColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: themeColors.background },
  content: { padding: 20, paddingBottom: 40 },
  label: { fontSize: 14, fontWeight: '600', color: themeColors.textMuted, marginBottom: 8 },
  email: { fontSize: 16, color: themeColors.text, marginBottom: 8 },
  rolePill: {
    alignSelf: 'flex-start',
    backgroundColor: themeColors.accentMuted,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 8,
  },
  rolePillText: { color: themeColors.accent, fontWeight: '700', fontSize: 14 },
  themeRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  themeChip: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: themeColors.surface,
    borderWidth: 1,
    borderColor: themeColors.border,
  },
  themeChipActive: {
    backgroundColor: themeColors.accent,
    borderColor: themeColors.accent,
  },
  themeChipText: { fontSize: 14, fontWeight: '600', color: themeColors.text },
  themeChipTextActive: { color: themeColors.onAccent },
  secondaryLink: { paddingVertical: 10, marginBottom: 4 },
  secondaryLinkText: { color: themeColors.accent, fontSize: 15, fontWeight: '600' },
  hint: { fontSize: 13, color: themeColors.textMuted, marginBottom: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: themeColors.surface,
    borderWidth: 1,
    borderColor: themeColors.border,
  },
  chipActive: { backgroundColor: themeColors.accent, borderColor: themeColors.accent },
  chipText: { color: themeColors.textMuted, fontSize: 14 },
  chipTextActive: { color: themeColors.onAccent, fontWeight: '600' },
  saveBtn: { backgroundColor: themeColors.accent, paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginBottom: 16 },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: themeColors.onAccent, fontSize: 16, fontWeight: '600' },
  adminLink: { paddingVertical: 12, alignItems: 'center', marginBottom: 8 },
  adminLinkText: { fontSize: 15, color: themeColors.accent, fontWeight: '600' },
  logoutBtn: { paddingVertical: 16, borderTopWidth: 1, borderTopColor: themeColors.border, alignItems: 'center' },
  logoutText: { fontSize: 16, color: themeColors.error, fontWeight: '600' },
});
}
