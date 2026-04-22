import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ObjectList from '@/components/ImageAnnotation/ObjectList';

type ToolId =
  | 'pan'
  | 'bbox'
  | 'polygon'
  | 'points'
  | 'ellipse'
  | 'cuboid'
  | 'cuboid_wire'
  | 'polyline'
  | 'semantic'
  | 'brush'
  | 'magic_wand';

export interface ImageAnnotationThreeColumnProps {
  activeTool: string;
  onToolChange: (tool: ToolId) => void;
  onUndo: () => void;
  /** Zoom/pan sonrası görüntüyü başlangıç fit’ine döndür */
  onResetImageView?: () => void;
  selectedAnnotationId: string | null;
  annotations: unknown[];
  onSelectAnnotation: (id: string | null) => void;
  onUpdateAnnotationLabel: (annotationId: string, label: string) => void;
  onDeleteAnnotation: (id: string) => void;
  children: React.ReactNode;
}

const TOOLS: { id: ToolId; icon: keyof typeof Ionicons.glyphMap; label: string; hint?: string }[] = [
  { id: 'pan', icon: 'hand-right-outline', label: 'Pan', hint: 'Shift+sürükle: tüm nesneleri taşı' },
  { id: 'bbox', icon: 'square-outline', label: 'Bounding Box' },
  { id: 'polygon', icon: 'git-merge-outline', label: 'Polygon' },
  { id: 'points', icon: 'radio-button-off-outline', label: 'Points' },
  { id: 'ellipse', icon: 'ellipse-outline', label: 'Ellipse' },
  { id: 'cuboid', icon: 'cube-outline', label: 'Cuboid' },
  {
    id: 'cuboid_wire',
    icon: 'git-network-outline',
    label: 'Cuboid (wire)',
    hint: '8 tık: ön yüz 1–4, arka yüz 5–8 (aynı sıra ile eşleşir)',
  },
  { id: 'polyline', icon: 'create-outline', label: 'Polyline' },
  {
    id: 'semantic',
    icon: 'color-filter-outline',
    label: 'Semantic',
    hint: 'Sürükleyerek dikdörtgen bölge; sol etiket sınıfı. Seçilince bbox gibi 8 tutamaçla boyutlandırma, Pan ile taşıma.',
  },
  { id: 'brush', icon: 'brush-outline', label: 'Brush' },
  { id: 'magic_wand', icon: 'sparkles', label: 'Magic Wand' },
];

export default function ImageAnnotationThreeColumn({
  activeTool,
  onToolChange,
  onUndo,
  onResetImageView,
  selectedAnnotationId,
  annotations,
  onSelectAnnotation,
  onUpdateAnnotationLabel,
  onDeleteAnnotation,
  children,
}: ImageAnnotationThreeColumnProps) {
  return (
    <View style={styles.row}>
      <ScrollView
        style={styles.leftScroll}
        contentContainerStyle={styles.leftScrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.toolGrid}>
          {TOOLS.map((t) => (
            <TouchableOpacity
              key={t.id}
              style={[styles.toolBtn, activeTool === t.id && styles.toolBtnActive]}
              onPress={() => onToolChange(t.id)}
              activeOpacity={0.85}
              {...(Platform.OS === 'web'
                ? ({
                    accessibilityLabel: t.hint ? `${t.label}. ${t.hint}` : t.label,
                    title: t.hint ? `${t.label}: ${t.hint}` : t.label,
                  } as object)
                : {})}
            >
              <Ionicons name={t.icon} size={20} color="#f1f5f9" />
              <Text style={styles.toolBtnText} numberOfLines={3}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.actionRow}>
          {onResetImageView ? (
            <TouchableOpacity
              style={[styles.toolBtn, styles.toolBtnHalf, styles.resetViewBtn]}
              onPress={onResetImageView}
              activeOpacity={0.85}
              {...(Platform.OS === 'web'
                ? ({ accessibilityLabel: 'Görünümü sıfırla', title: 'Zoom ve konumu sıfırla' } as object)
                : {})}
            >
              <Ionicons name="scan-outline" size={18} color="#a7f3d0" />
              <Text style={[styles.toolBtnText, styles.resetViewBtnText]} numberOfLines={2}>
                Ortala
              </Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={[styles.toolBtn, styles.toolBtnHalf, styles.undoBtn]}
            onPress={onUndo}
            activeOpacity={0.85}
            {...(Platform.OS === 'web' ? ({ accessibilityLabel: 'Undo', title: 'Undo' } as object) : {})}
          >
            <Ionicons name="arrow-undo-outline" size={18} color="#93c5fd" />
            <Text style={styles.toolBtnText}>Undo</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={[styles.toolBtn, styles.deleteBtn, styles.deleteBtnFull]}
          onPress={() => {
            if (selectedAnnotationId) onDeleteAnnotation(selectedAnnotationId);
          }}
          disabled={!selectedAnnotationId}
          activeOpacity={0.85}
        >
          <Ionicons name="trash-outline" size={18} color="#fca5a5" />
          <Text style={[styles.toolBtnText, styles.deleteBtnText]} numberOfLines={2}>
            Delete
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <View style={styles.center}>
        {children}
      </View>

      <View style={styles.rightCol}>
        <ObjectList
          annotations={annotations as any}
          selectedAnnotationId={selectedAnnotationId}
          onSelectAnnotation={onSelectAnnotation}
          onUpdateAnnotationLabel={onUpdateAnnotationLabel}
          onDeleteAnnotation={onDeleteAnnotation}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flex: 1,
    flexDirection: 'row',
    minHeight: 0,
    backgroundColor: '#0f172a',
  },
  leftScroll: {
    width: 200,
    maxWidth: 200,
    minWidth: 200,
    backgroundColor: '#0f172a',
    borderRightWidth: 1,
    borderRightColor: '#334155',
  },
  leftScrollContent: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    paddingBottom: 20,
    alignItems: 'stretch',
  },
  toolGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 8,
    columnGap: 8,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 10,
  },
  toolBtn: {
    width: '47%' as const,
    maxWidth: '47%' as const,
    minHeight: 52,
    borderRadius: 8,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    gap: 4,
  },
  toolBtnHalf: {
    width: '47%' as const,
    maxWidth: '47%' as const,
    flexGrow: 1,
    minWidth: 72,
  },
  deleteBtnFull: {
    width: '100%' as const,
    maxWidth: '100%' as const,
    marginTop: 8,
  },
  toolBtnActive: {
    backgroundColor: '#7c3aed',
    borderColor: '#a78bfa',
  },
  toolBtnText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#e2e8f0',
    textAlign: 'center',
  },
  resetViewBtn: {
    borderColor: '#10b981',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
  },
  resetViewBtnText: {
    color: '#a7f3d0',
  },
  undoBtn: {
    borderColor: '#3b82f6',
  },
  deleteBtn: {
    borderColor: '#ef4444',
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
  },
  deleteBtnText: {
    color: '#fca5a5',
  },
  center: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    backgroundColor: '#0f172a',
  },
  rightCol: {
    width: 280,
    minWidth: 280,
    maxWidth: 280,
    flexShrink: 0,
    backgroundColor: '#1e293b',
    borderLeftWidth: 1,
    borderLeftColor: '#334155',
  },
});
