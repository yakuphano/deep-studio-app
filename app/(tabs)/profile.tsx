import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useRootNavigationState } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import { canAccessReviewQueue, type AppRole } from '@/lib/userRoles';
import { TASK_LANGUAGES, type TaskLanguageCode } from '@/constants/taskLanguages';
import type { AppColors } from '@/theme/palettes';
import { useThemeColors } from '@/contexts/ThemeContext';

function roleAccent(role: AppRole, colors: AppColors) {
  if (role === 'admin') return { bg: 'rgba(239, 68, 68, 0.14)', fg: '#ef4444', icon: 'shield' as const };
  if (role === 'reviewer') return { bg: 'rgba(168, 85, 247, 0.14)', fg: '#a855f7', icon: 'checkmark-done' as const };
  return { bg: colors.accentMuted, fg: colors.accent, icon: 'person' as const };
}

function profileInitial(email?: string | null, username?: string | null): string {
  const src = (username?.trim() || email?.trim() || '?').charAt(0);
  return src.toUpperCase();
}

export default function ProfileScreen() {
  const themeColors = useThemeColors();
  const styles = useMemo(() => createStyles(themeColors), [themeColors]);
  const { t } = useTranslation();
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const { user, signOut, isAdmin } = useAuth();
  const { appRole } = useProfile();

  const navigatorReady = rootNavigationState?.key != null;
  const roleStyle = roleAccent(appRole, themeColors);

  const [username, setUsername] = useState<string | null>(null);
  const [languages, setLanguages] = useState<TaskLanguageCode[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);

  useEffect(() => {
    if (!navigatorReady || user) return;
    router.replace('/');
  }, [navigatorReady, user, router]);

  useEffect(() => {
    if (!user?.id) {
      setLoadingProfile(false);
      return;
    }
    setLoadingProfile(true);
    void supabase
      .from('profiles')
      .select('languages_expertise, languages, username')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.username) setUsername(String(data.username));
        const languagesData = data?.languages ?? data?.languages_expertise;
        if (languagesData && Array.isArray(languagesData)) {
          setLanguages(languagesData as TaskLanguageCode[]);
        }
      })
      .finally(() => setLoadingProfile(false));
  }, [user?.id]);

  const toggleLang = (code: TaskLanguageCode) => {
    setLanguages((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  };

  const save = async () => {
    if (!user?.id) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ languages, languages_expertise: languages })
        .eq('id', user.id);

      if (error) throw error;

      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(t('profile.saveSuccess'));
      } else {
        Alert.alert(t('profile.saveSuccess'));
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('profile.saveError');
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(message);
      } else {
        Alert.alert(t('login.errorTitle'), message);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = useCallback(async () => {
    await signOut();
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.href = '/';
    } else {
      router.replace('/');
    }
  }, [signOut, router]);

  const email = user?.email ?? '—';
  const displayName = username?.trim() || email.split('@')[0] || '—';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.pageInner}>
        <Text style={styles.pageTitle}>{t('profile.pageTitle')}</Text>
        <Text style={styles.pageSubtitle}>{t('profile.pageSubtitle')}</Text>

        <View style={styles.heroCard}>
          <View style={[styles.avatar, { backgroundColor: roleStyle.bg }]}>
            <Text style={[styles.avatarText, { color: roleStyle.fg }]}>
              {profileInitial(email, username)}
            </Text>
          </View>
          <Text style={styles.displayName}>{displayName}</Text>
          <Text style={styles.email}>{email}</Text>
          <View style={[styles.roleBadge, { backgroundColor: roleStyle.bg }]}>
            <Ionicons name={roleStyle.icon} size={14} color={roleStyle.fg} />
            <Text style={[styles.roleBadgeText, { color: roleStyle.fg }]}>
              {t(`roles.${appRole}`)}
            </Text>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Ionicons name="language-outline" size={20} color={themeColors.accent} />
            <Text style={styles.sectionTitle}>{t('profile.languagesExpertise')}</Text>
          </View>
          <Text style={styles.sectionHint}>{t('profile.languagesExpertiseHint')}</Text>
          {loadingProfile ? (
            <ActivityIndicator color={themeColors.accent} style={styles.loader} />
          ) : (
            <View style={styles.chips}>
              {TASK_LANGUAGES.filter((l) => l.code !== 'unspecified').map((lang) => {
                const active = languages.includes(lang.code);
                return (
                  <TouchableOpacity
                    key={lang.code}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => toggleLang(lang.code)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {t(lang.labelKey)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={() => void save()}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color={themeColors.onAccent} size="small" />
            ) : (
              <>
                <Ionicons name="save-outline" size={18} color={themeColors.onAccent} />
                <Text style={styles.saveBtnText}>{t('profile.save')}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Ionicons name="grid-outline" size={20} color={themeColors.accent} />
            <Text style={styles.sectionTitle}>{t('profile.quickLinks')}</Text>
          </View>
          {canAccessReviewQueue(appRole) && (
            <TouchableOpacity style={styles.linkRow} onPress={() => router.push('/review')}>
              <View style={styles.linkRowLeft}>
                <Ionicons name="checkmark-done-outline" size={20} color={themeColors.textSecondary} />
                <Text style={styles.linkRowText}>{t('nav.qaReview')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={themeColors.textMuted} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.linkRow, !isAdmin && styles.linkRowLast]}
            onPress={() => router.push('/revisions')}
          >
            <View style={styles.linkRowLeft}>
              <Ionicons name="document-text-outline" size={20} color={themeColors.textSecondary} />
              <Text style={styles.linkRowText}>{t('nav.revisions')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={themeColors.textMuted} />
          </TouchableOpacity>
          {isAdmin ? (
            <TouchableOpacity style={[styles.linkRow, styles.linkRowLast]} onPress={() => router.push('/admin')}>
              <View style={styles.linkRowLeft}>
                <Ionicons name="settings-outline" size={20} color={themeColors.textSecondary} />
                <Text style={styles.linkRowText}>{t('nav.management')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={themeColors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>

        <TouchableOpacity style={styles.logoutBtn} onPress={() => void handleLogout()}>
          <Ionicons name="log-out-outline" size={20} color={themeColors.error} />
          <Text style={styles.logoutText}>{t('nav.logout')}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function createStyles(themeColors: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: themeColors.background },
    content: { paddingBottom: 48 },
    pageInner: {
      width: '100%',
      maxWidth: 520,
      alignSelf: 'center',
      paddingHorizontal: 20,
      paddingTop: 24,
    },
    pageTitle: {
      fontSize: 22,
      fontWeight: '700',
      color: themeColors.text,
      marginBottom: 4,
    },
    pageSubtitle: {
      fontSize: 14,
      color: themeColors.textMuted,
      marginBottom: 20,
    },
    heroCard: {
      backgroundColor: themeColors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: themeColors.border,
      paddingVertical: 28,
      paddingHorizontal: 20,
      alignItems: 'center',
      marginBottom: 16,
    },
    avatar: {
      width: 72,
      height: 72,
      borderRadius: 36,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },
    avatarText: { fontSize: 28, fontWeight: '700' },
    displayName: {
      fontSize: 20,
      fontWeight: '700',
      color: themeColors.text,
      marginBottom: 4,
    },
    email: {
      fontSize: 14,
      color: themeColors.textMuted,
      marginBottom: 14,
    },
    roleBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
    },
    roleBadgeText: { fontSize: 13, fontWeight: '700' },
    sectionCard: {
      backgroundColor: themeColors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: themeColors.border,
      padding: 18,
      marginBottom: 16,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 6,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: themeColors.text,
    },
    sectionHint: {
      fontSize: 13,
      color: themeColors.textMuted,
      lineHeight: 18,
      marginBottom: 14,
    },
    loader: { marginVertical: 12 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 8,
      backgroundColor: themeColors.background,
      borderWidth: 1,
      borderColor: themeColors.border,
    },
    chipActive: {
      backgroundColor: themeColors.accent,
      borderColor: themeColors.accent,
    },
    chipText: { color: themeColors.textSecondary, fontSize: 14, fontWeight: '500' },
    chipTextActive: { color: themeColors.onAccent, fontWeight: '600' },
    saveBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: themeColors.accent,
      paddingVertical: 14,
      borderRadius: 10,
    },
    saveBtnDisabled: { opacity: 0.65 },
    saveBtnText: { color: themeColors.onAccent, fontSize: 15, fontWeight: '600' },
    linkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: themeColors.borderLight,
    },
    linkRowLast: { borderBottomWidth: 0 },
    linkRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    linkRowText: { fontSize: 15, fontWeight: '500', color: themeColors.text },
    logoutBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 16,
      marginTop: 4,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: themeColors.border,
      backgroundColor: themeColors.surface,
    },
    logoutText: { fontSize: 15, fontWeight: '600', color: themeColors.error },
  });
}
