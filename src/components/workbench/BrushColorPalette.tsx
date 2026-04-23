import React, { createElement } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';

export const BRUSH_PRESET_COLORS: { color: string; name: string }[] = [
  { color: '#ff0000', name: 'Kırmızı' },
  { color: '#00ff00', name: 'Yeşil' },
  { color: '#0000ff', name: 'Mavi' },
  { color: '#ffff00', name: 'Sarı' },
  { color: '#ffa500', name: 'Turuncu' },
  { color: '#ff00ff', name: 'Mor' },
  { color: '#ffc0cb', name: 'Pembe' },
  { color: '#00ffff', name: 'Turkuaz' },
  { color: '#8b4513', name: 'Kahverengi' },
  { color: '#000000', name: 'Siyah' },
  { color: '#ffffff', name: 'Beyaz' },
  { color: '#808080', name: 'Gri' },
];

function normalizeHex(c: string): string {
  const s = String(c || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s;
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    const x = s.slice(1);
    return `#${x[0]}${x[0]}${x[1]}${x[1]}${x[2]}${x[2]}`;
  }
  return '#ff0000';
}

export interface BrushColorPaletteProps {
  currentColor: string;
  onSelectColor: (hex: string) => void;
  /** Palet genişliği (sol rail iç genişliği ile aynı) */
  width?: number;
}

/**
 * Ön tanımlı renk ızgarası + web’de native renk seçici (istediğiniz renk).
 */
export default function BrushColorPalette({ currentColor, onSelectColor, width = 100 }: BrushColorPaletteProps) {
  const hex = normalizeHex(currentColor);

  return (
    <View style={[styles.wrap, { width }]}>
      <Text style={styles.title}>Renk</Text>
      <View style={styles.grid}>
        {BRUSH_PRESET_COLORS.map((item) => (
          <TouchableOpacity
            key={item.color}
            style={[
              styles.swatch,
              { backgroundColor: item.color },
              normalizeHex(currentColor).toLowerCase() === item.color.toLowerCase() && styles.swatchSelected,
            ]}
            onPress={() => onSelectColor(item.color)}
            activeOpacity={0.85}
            {...(Platform.OS === 'web' ? ({ title: item.name, accessibilityLabel: item.name } as object) : {})}
          />
        ))}
      </View>
      {Platform.OS === 'web' ? (
        <View style={styles.customRow}>
          <Text style={styles.customLabel}>Özel</Text>
          {createElement('input', {
            type: 'color',
            value: hex,
            onInput: (e: { currentTarget: HTMLInputElement }) => onSelectColor(e.currentTarget.value),
            onChange: (e: { currentTarget: HTMLInputElement }) => onSelectColor(e.currentTarget.value),
            style: {
              width: 36,
              height: 28,
              padding: 0,
              border: '1px solid #cbd5e1',
              borderRadius: 4,
              cursor: 'pointer',
              backgroundColor: '#f8fafc',
            },
            title: 'İstediğiniz rengi seçin',
          } as any)}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#475569',
    padding: 8,
    marginTop: 6,
    zIndex: 20,
  },
  title: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94a3b8',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'flex-start',
  },
  swatch: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#64748b',
  },
  swatchSelected: {
    borderWidth: 2,
    borderColor: '#3b82f6',
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  customLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#e2e8f0',
  },
});
