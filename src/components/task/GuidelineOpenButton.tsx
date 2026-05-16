import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View, ViewStyle, StyleProp } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useGuidelineDrawerOptional } from '@/contexts/GuidelineDrawerContext';

type Variant = 'card' | 'header' | 'chip';

type Props = {
  guidelineUrl?: string | null;
  guidelineFileName?: string | null;
  variant?: Variant;
  style?: StyleProp<ViewStyle>;
  stopPropagation?: boolean;
};

const LIGHT_BLUE = {
  bg: 'rgba(56, 189, 248, 0.22)',
  border: '#38bdf8',
  text: '#e0f2fe',
  icon: '#7dd3fc',
};

export default function GuidelineOpenButton({
  guidelineUrl,
  guidelineFileName,
  variant = 'chip',
  style,
  stopPropagation = false,
}: Props) {
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
        <Ionicons name="book-outline" size={16} color={LIGHT_BLUE.icon} />
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
        <Ionicons name="book-outline" size={18} color={LIGHT_BLUE.icon} />
        <Text style={styles.headerBtnText}>{label}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={style}>
      <TouchableOpacity style={styles.chip} onPress={onPress} activeOpacity={0.85}>
        <Ionicons name="document-text-outline" size={14} color={LIGHT_BLUE.icon} />
        <Text style={styles.chipText}>{label}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  cardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: LIGHT_BLUE.bg,
    borderWidth: 1,
    borderColor: LIGHT_BLUE.border,
  },
  cardBtnText: {
    color: LIGHT_BLUE.text,
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
    backgroundColor: LIGHT_BLUE.bg,
    borderWidth: 1,
    borderColor: LIGHT_BLUE.border,
  },
  headerBtnText: {
    color: LIGHT_BLUE.text,
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
    backgroundColor: LIGHT_BLUE.bg,
    borderWidth: 1,
    borderColor: LIGHT_BLUE.border,
  },
  chipText: {
    color: LIGHT_BLUE.text,
    fontSize: 13,
    fontWeight: '600',
  },
});
