import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Annotation } from '@/types/annotations';
import type { ProThemeColors } from '@/theme/videoProWorkbenchTheme';
import { hexToRgba, resolveAnnotationLabelColor } from '@/constants/annotationLabels';

function labelStr(a: Annotation): string {
  const x = a as { label?: unknown };
  if (typeof x.label === 'object' && x.label !== null) {
    return String((x.label as { name?: string }).name ?? (x.label as { label?: string }).label ?? '');
  }
  return String(x.label ?? '');
}

function typeLabel(t: string): string {
  if (t === 'bbox') return 'Bounding box';
  if (t === 'polygon') return 'Polygon';
  if (t === 'points' || t === 'point') return 'Keypoints';
  if (t === 'magic_wand') return 'Magic wand';
  return t;
}

function displayLabel(raw: string): string {
  const s = raw.trim();
  if (!s) return 'Pick class';
  return s;
}

function listPrimaryTitle(_a: Annotation, raw: string, lab: string): string {
  return raw.trim() ? raw.trim() : lab;
}

function listSubtitle(a: Annotation, raw: string, _lab: string): string {
  const cls = raw.trim();
  if (cls) return `${cls} · ${typeLabel(a.type)}`;
  return typeLabel(a.type);
}

type Props = {
  colors: ProThemeColors;
  annotations: Annotation[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onUpdateLabel: (id: string, label: string) => void;
  onDelete: (id: string) => void;
  chipLabels: string[];
  labelColorOverrides: Record<string, string>;
};

export default function AnnotatorVideoRightPanel({
  colors,
  annotations,
  selectedId,
  onSelect,
  onUpdateLabel,
  onDelete,
  chipLabels,
  labelColorOverrides,
}: Props) {
  const selected = useMemo(
    () => annotations.find((a) => a.id === selectedId) ?? null,
    [annotations, selectedId]
  );

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: colors.panel }]}
      contentContainerStyle={[styles.scrollContent, styles.scrollContentGrow]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator
    >
      {annotations.length > 0
        ? annotations.map((a) => {
            const raw = labelStr(a);
            const lab = displayLabel(raw);
            const primary = listPrimaryTitle(a, raw, lab);
            const sub = listSubtitle(a, raw, lab);
            const col = resolveAnnotationLabelColor(raw.trim() || 'Other', labelColorOverrides);
            const on = selectedId === a.id;
            const pending = !raw.trim();
            return (
              <TouchableOpacity
                key={a.id}
                style={[
                  styles.colorStrip,
                  {
                    borderLeftColor: col,
                    backgroundColor: hexToRgba(col, pending ? 0.12 : 0.22),
                    borderColor: colors.border,
                  },
                  on && {
                    borderColor: colors.accent,
                    borderLeftWidth: 4,
                    backgroundColor: hexToRgba(col, pending ? 0.18 : 0.28),
                  },
                ]}
                onPress={() => onSelect(a.id)}
                activeOpacity={0.85}
              >
                <View style={[styles.colorStripDot, { backgroundColor: col }]} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={1}>
                    {primary}
                  </Text>
                  <Text style={[styles.rowSub, { color: colors.textMuted }]} numberOfLines={2}>
                    {sub}
                  </Text>
                </View>
                {on ? <Ionicons name="chevron-forward" size={18} color={colors.accent} /> : null}
              </TouchableOpacity>
            );
          })
        : null}

      {selected ? (
        <View style={[styles.form, { borderTopColor: colors.border }]}>
          <Text style={[styles.h, { color: colors.text }]}>Class</Text>
          <View style={styles.labelOptionsGrid}>
            {chipLabels.map((lb) => {
              const chipColor = resolveAnnotationLabelColor(lb, labelColorOverrides);
              const act = labelStr(selected).trim() === lb;
              return (
                <TouchableOpacity
                  key={lb}
                  style={[
                    styles.labelOptionChip,
                    {
                      borderColor: chipColor,
                      backgroundColor: act ? chipColor : 'transparent',
                    },
                  ]}
                  onPress={() => onUpdateLabel(selected.id, lb)}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[styles.labelOptionText, { color: act ? '#fff' : chipColor }]}
                    numberOfLines={1}
                  >
                    {lb}
                  </Text>
                  {act ? (
                    <Ionicons
                      name="checkmark-circle"
                      size={14}
                      color="#fff"
                      style={{ marginLeft: 4 }}
                    />
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.rowActions}>
            <TouchableOpacity
              style={[styles.btnGhost, { borderColor: colors.danger }]}
              onPress={() => onDelete(selected.id)}
              activeOpacity={0.85}
            >
              <Text style={{ color: colors.danger, fontWeight: '600' }}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, minHeight: 0, width: '100%', alignSelf: 'stretch' },
  scrollContent: { padding: 12, paddingBottom: 24 },
  scrollContentGrow: { flexGrow: 1 },
  h: { fontSize: 13, fontWeight: '700', marginBottom: 6 },
  labelOptionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  labelOptionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'transparent',
    borderWidth: 1,
    maxWidth: '100%',
  },
  labelOptionText: {
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
  },
  colorStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderLeftWidth: 4,
    marginBottom: 6,
    gap: 10,
  },
  colorStripDot: { width: 12, height: 12, borderRadius: 6 },
  colorStripTxt: { flex: 1, fontSize: 14, fontWeight: '700' },
  rowTitle: { fontSize: 14, fontWeight: '700' },
  rowSub: { fontSize: 11, marginTop: 2 },
  form: { marginTop: 14, paddingTop: 14, borderTopWidth: 1 },
  rowActions: { marginTop: 14, flexDirection: 'row', gap: 8 },
  btnGhost: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
