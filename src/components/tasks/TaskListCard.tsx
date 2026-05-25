import React, { useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import GuidelineOpenButton from '@/components/task/GuidelineOpenButton';
import type { AppColors } from '@/theme/palettes';
import { useThemeColors } from '@/contexts/ThemeContext';

function formatStatusLabel(status: string) {
  if (!status?.trim()) return 'Pending';
  const s = status.trim();
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
}

type IonName = React.ComponentProps<typeof Ionicons>['name'];

export function TaskListCard({
  title,
  status,
  price,
  accent,
  icon,
  onPress,
  subtitle,
  ctaLabel = 'Start task',
  style,
  guidelineUrl,
  guidelineFileName,
}: {
  title: string;
  status: string;
  price: number | null;
  accent: string;
  icon: IonName;
  onPress: () => void;
  subtitle?: string | null;
  ctaLabel?: string;
  style?: StyleProp<ViewStyle>;
  guidelineUrl?: string | null;
  guidelineFileName?: string | null;
}) {
  const themeColors = useThemeColors();
  const styles = useMemo(() => createTaskListCardStyles(themeColors), [themeColors]);

  const priceLabel = price != null ? `₺${price}` : '—';

  return (
    <View style={[styles.root, { borderColor: accent }, style]}>
      <Pressable
        style={({ pressed }) => [
          styles.pressMain,
          pressed && styles.pressMainActive,
        ]}
        onPress={onPress}
      >
        <View style={styles.hero}>
          <View style={[styles.iconCircle, { backgroundColor: accent }]}>
            <Ionicons name={icon} size={28} color="#ffffff" />
          </View>
        </View>
        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
          <View style={styles.metaRow}>
            <View style={styles.statusPill}>
              <Ionicons name="time-outline" size={12} color="#fbbf24" />
              <Text style={styles.statusText}>{formatStatusLabel(status)}</Text>
            </View>
            <View style={styles.pricePill}>
              <Text style={styles.priceText}>{priceLabel}</Text>
            </View>
          </View>
        </View>
      </Pressable>
      <View style={styles.footer}>
        <GuidelineOpenButton
          variant="card"
          guidelineUrl={guidelineUrl}
          guidelineFileName={guidelineFileName}
        />
        <Pressable
          style={({ pressed }) => [
            styles.cta,
            { backgroundColor: accent },
            pressed && { opacity: 0.9 },
          ]}
          onPress={onPress}
        >
          <Text style={styles.ctaText}>{ctaLabel}</Text>
          <Ionicons name="arrow-forward" size={16} color="#ffffff" />
        </Pressable>
      </View>
    </View>
  );
}

function createTaskListCardStyles(themeColors: AppColors) {
  return StyleSheet.create({
  root: {
    minWidth: 0,
    backgroundColor: themeColors.surface,
    borderRadius: 14,
    borderWidth: 2,
    overflow: 'hidden',
  },
  pressMain: {
    borderRadius: 14,
  },
  pressMainActive: {
    opacity: 0.94,
  },
  footer: {
    paddingHorizontal: 11,
    paddingBottom: 12,
    gap: 8,
  },
  hero: {
    height: 96,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: themeColors.surfaceElevated,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    paddingHorizontal: 11,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 5,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: themeColors.text,
    letterSpacing: -0.15,
    lineHeight: 19,
  },
  subtitle: {
    marginTop: -2,
    fontSize: 11,
    fontWeight: '500',
    color: themeColors.textMuted,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 0,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.28)',
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fbbf24',
  },
  pricePill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(22, 101, 52, 0.45)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.35)',
  },
  priceText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#86efac',
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 9,
  },
  ctaText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.2,
  },
});
}
