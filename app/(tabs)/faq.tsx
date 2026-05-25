import React, { useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useRouter, useRootNavigationState } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import type { AppColors } from '@/theme/palettes';
import { useThemeColors } from '@/contexts/ThemeContext';
export default function FAQScreen() {
  const themeColors = useThemeColors();
  const styles = useMemo(() => createStyles(themeColors), [themeColors]);

  const { t } = useTranslation();
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const { user } = useAuth();

  const navigatorReady = rootNavigationState?.key != null;

  useEffect(() => {
    if (!navigatorReady || user) return;
    router.replace('/');
  }, [navigatorReady, user]);
  const faqItems = [
    { q: 'faq.q1', a: 'faq.a1' },
    { q: 'faq.q2', a: 'faq.a2' },
    { q: 'faq.q3', a: 'faq.a3' },
    { q: 'faq.q4', a: 'faq.a4' },
    { q: 'faq.q5', a: 'faq.a5' },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{t('nav.faq')}</Text>
      <Text style={styles.subtitle}>{t('faq.subtitle')}</Text>
      {faqItems.map((item, i) => (
        <View key={i} style={styles.faqCard}>
          <Text style={styles.faqQ}>{t(item.q)}</Text>
          <Text style={styles.faqA}>{t(item.a)}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

function createStyles(themeColors: AppColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: themeColors.background },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: '700', color: themeColors.text, marginBottom: 4 },
  subtitle: { fontSize: 14, color: themeColors.textMuted, marginBottom: 24 },
  faqCard: {
    backgroundColor: themeColors.surface,
    borderRadius: 12,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: themeColors.border,
  },
  faqQ: { fontSize: 16, fontWeight: '600', color: themeColors.text, marginBottom: 8 },
  faqA: { fontSize: 15, color: themeColors.textMuted, lineHeight: 24 },
});
}
