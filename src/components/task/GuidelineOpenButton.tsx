import React, { useMemo } from 'react';
import { TouchableOpacity, Text, StyleSheet, View, ViewStyle, StyleProp } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useGuidelineDrawerOptional } from '@/contexts/GuidelineDrawerContext';
import type { AppColors } from '@/theme/palettes';
import { useThemeColors } from '@/contexts/ThemeContext';
type Variant = 'card' | 'header' | 'chip';

type Props = {
  guidelineUrl?: string | null;
  guidelineFileName?: string | null;
  variant?: Variant;
  style?: StyleProp<ViewStyle>;
  stopPropagation?: boolean;
};

export default function GuidelineOpenButton({
  guidelineUrl,
  guidelineFileName,
  variant = 'chip',
  style,
  stopPropagation = false,
}: Props) {
  const themeColors = useThemeColors();
  const styles = useMemo(() => createStyles(themeColors), [themeColors]);

  const { t } = useTranslation();
  const drawer = useGuidelineDrawerOptional();
  if (!drawer) return null;

  const label = t('tasks.guidelineButton', { defaultValue: 'Guideline' });
  const onPress = (e?: { stopPropagation?: () => void }) => {
    if (stopPropagation) e?.stopPropagation?.();
    drawer.openGuideline(guidelineUrl, guidelineFileName);
  };

  if (variant === 'card') {
    return (
      <TouchableOpacity
        style={[styles.cardBtn, style]}
        onPress={onPress}
        activeOpacity={0.85}
        accessibilityRole="button"
      >
        <Ionicons name="book-outline" size={16} color={themeColors.accent} />
        <Text style={styles.cardBtnText}>{label}</Text>
      </TouchableOpacity>
    );
  }

  if (variant === 'header') {
    return (
      <TouchableOpacity
        style={[styles.headerBtn, style]}
        onPress={onPress}
        activeOpacity={0.85}
      >
        <Ionicons name="book-outline" size={18} color={themeColors.accent} />
        <Text style={styles.headerBtnText}>{label}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={style}>
      <TouchableOpacity style={styles.chip} onPress={onPress} activeOpacity={0.85}>
        <Ionicons name="document-text-outline" size={14} color={themeColors.accent} />
        <Text style={styles.chipText}>{label}</Text>
      </TouchableOpacity>
    </View>
  );
}

function createStyles(themeColors: AppColors) {
  return StyleSheet.create({
  cardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: themeColors.surface,
    borderWidth: 1.5,
    borderColor: themeColors.accent,
  },
  cardBtnText: {
    color: themeColors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  headerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: themeColors.surface,
    borderWidth: 1.5,
    borderColor: themeColors.accent,
  },
  headerBtnText: {
    color: themeColors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: themeColors.surface,
    borderWidth: 1.5,
    borderColor: themeColors.accent,
  },
  chipText: {
    color: themeColors.text,
    fontSize: 13,
    fontWeight: '600',
  },
});
}
