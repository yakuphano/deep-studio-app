import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

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
}) {
  const priceLabel = price != null ? `₺${price}` : '—';

  return (
    <Pressable
      style={({ pressed, hovered }) => [
        styles.root,
        (Boolean(hovered) || pressed) && { borderColor: accent },
        style,
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
        <View style={[styles.cta, { backgroundColor: accent }]}>
          <Text style={styles.ctaText}>{ctaLabel}</Text>
          <Ionicons name="arrow-forward" size={16} color="#ffffff" />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    minWidth: 0,
    backgroundColor: '#1a1f2e',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.2)',
    overflow: 'hidden',
  },
  hero: {
    height: 96,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#252d3d',
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
    paddingBottom: 12,
    gap: 5,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f8fafc',
    letterSpacing: -0.15,
    lineHeight: 19,
  },
  subtitle: {
    marginTop: -2,
    fontSize: 11,
    fontWeight: '500',
    color: '#94a3b8',
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
    marginTop: 4,
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
