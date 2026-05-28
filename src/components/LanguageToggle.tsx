import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { AppColors } from '@/theme/palettes';
import { useThemeColors } from '@/contexts/ThemeContext';

type UiLang = 'en' | 'tr';

export default function LanguageToggle({ compact = false }: { compact?: boolean }) {
  const themeColors = useThemeColors();
  const styles = useMemo(() => createStyles(themeColors, compact), [themeColors, compact]);
  const { i18n } = useTranslation();
  const current = ((i18n.language || 'en').split('-')[0] === 'tr' ? 'tr' : 'en') as UiLang;

  const setLang = (lang: UiLang) => {
    void i18n.changeLanguage(lang);
  };

  return (
    <View style={styles.wrap}>
      {(['en', 'tr'] as const).map((lang) => (
        <TouchableOpacity
          key={lang}
          style={[styles.btn, current === lang && styles.btnActive]}
          onPress={() => setLang(lang)}
          accessibilityRole="button"
          accessibilityState={{ selected: current === lang }}
        >
          <Text style={[styles.btnText, current === lang && styles.btnTextActive]}>
            {lang.toUpperCase()}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function createStyles(themeColors: AppColors, compact: boolean) {
  return StyleSheet.create({
    wrap: {
      flexDirection: 'row',
      borderRadius: 8,
      borderWidth: 1,
      borderColor: themeColors.border,
      overflow: 'hidden',
      alignSelf: compact ? 'flex-end' : 'center',
    },
    btn: {
      paddingVertical: compact ? 5 : 7,
      paddingHorizontal: compact ? 10 : 14,
      backgroundColor: themeColors.surfaceElevated,
    },
    btnActive: {
      backgroundColor: themeColors.accent,
    },
    btnText: {
      fontSize: compact ? 12 : 13,
      fontWeight: '600',
      color: themeColors.textMuted,
    },
    btnTextActive: {
      color: themeColors.onAccent,
    },
  });
}
