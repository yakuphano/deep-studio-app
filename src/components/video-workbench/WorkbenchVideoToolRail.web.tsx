import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Tool } from '@/types/annotations';

const CELL = 48;
const GAP = 4;
const INNER = CELL * 2 + GAP;

type VideoRailTool = 'pan' | 'select' | 'bbox' | 'polygon' | 'points';

const VIDEO_TOOL_META: Record<
  VideoRailTool,
  { icon: keyof typeof Ionicons.glyphMap; label: string; hint?: string }
> = {
  pan: { icon: 'hand-right-outline', label: 'Pan', hint: 'Z' },
  select: { icon: 'hand-left-outline', label: 'Select', hint: 'V' },
  bbox: { icon: 'square-outline', label: 'Bounding Box', hint: 'B' },
  polygon: { icon: 'git-merge-outline', label: 'Polygon', hint: 'P' },
  points: { icon: 'body-outline', label: 'Keypoints', hint: 'K' },
};

export type WorkbenchVideoToolRailProps = {
  activeTool: Tool;
  trackMode: boolean;
  onToolChange: (tool: VideoRailTool) => void;
  onToggleTrack: () => void;
  onUndo: () => void;
  onResetView?: () => void;
  selectedAnnotationId: string | null;
  onDeleteSelected: () => void;
};

function ToolCell({
  tool,
  active,
  onPress,
}: {
  tool: VideoRailTool;
  active: boolean;
  onPress: () => void;
}) {
  const meta = VIDEO_TOOL_META[tool];
  return (
    <TouchableOpacity
      style={[styles.toolBtn, active && styles.toolBtnActive]}
      onPress={onPress}
      activeOpacity={0.85}
      {...(Platform.OS === 'web'
        ? ({
            accessibilityLabel: meta.hint ? `${meta.label}. Shortcut ${meta.hint}` : meta.label,
            title: meta.hint ? `${meta.label} (${meta.hint})` : meta.label,
          } as object)
        : {})}
    >
      <Ionicons name={meta.icon} size={20} color="#f1f5f9" />
      <Text style={styles.toolBtnText} numberOfLines={2}>
        {meta.label}
      </Text>
    </TouchableOpacity>
  );
}

export default function WorkbenchVideoToolRail({
  activeTool,
  trackMode,
  onToolChange,
  onToggleTrack,
  onUndo,
  onResetView,
  selectedAnnotationId,
  onDeleteSelected,
}: WorkbenchVideoToolRailProps) {
  const drawingActive = (t: VideoRailTool) => activeTool === t && !trackMode;

  return (
    <View style={styles.rail}>
      <View style={styles.toolRowsWrap}>
        <View style={styles.toolRow}>
          <ToolCell tool="pan" active={drawingActive('pan')} onPress={() => onToolChange('pan')} />
          {onResetView ? (
            <TouchableOpacity
              style={[styles.toolBtn, styles.resetViewBtn]}
              onPress={onResetView}
              activeOpacity={0.85}
              {...(Platform.OS === 'web'
                ? ({
                    accessibilityLabel: 'Center view',
                    title: 'Reset zoom and pan',
                  } as object)
                : {})}
            >
              <Ionicons name="scan-outline" size={18} color="#a7f3d0" />
              <Text style={[styles.toolBtnText, styles.resetViewBtnText]} numberOfLines={2}>
                Center
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.toolSpacer} />
          )}
        </View>

        <View style={[styles.toolRow, styles.toolRowSingle]}>
          <TouchableOpacity
            style={[styles.toolBtnFullWidth, styles.undoBtn]}
            onPress={onUndo}
            activeOpacity={0.85}
            {...(Platform.OS === 'web' ? ({ accessibilityLabel: 'Undo', title: 'Undo (Ctrl+Z)' } as object) : {})}
          >
            <Ionicons name="arrow-undo-outline" size={18} color="#93c5fd" />
            <Text style={styles.toolBtnText}>Undo</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.toolRow}>
          <ToolCell tool="select" active={drawingActive('select')} onPress={() => onToolChange('select')} />
          <ToolCell tool="bbox" active={drawingActive('bbox')} onPress={() => onToolChange('bbox')} />
        </View>

        <View style={styles.toolRow}>
          <ToolCell tool="polygon" active={drawingActive('polygon')} onPress={() => onToolChange('polygon')} />
          <ToolCell tool="points" active={drawingActive('points')} onPress={() => onToolChange('points')} />
        </View>

        <View style={[styles.toolRow, styles.toolRowSingle]}>
          <TouchableOpacity
            style={[styles.toolBtnFullWidth, trackMode && styles.toolBtnActive]}
            onPress={onToggleTrack}
            activeOpacity={0.85}
            {...(Platform.OS === 'web'
              ? ({
                  accessibilityLabel: 'Track mode',
                  title: 'Track (T) — wand on object',
                } as object)
              : {})}
          >
            <Ionicons name="color-wand-outline" size={18} color="#f1f5f9" />
            <Text style={styles.toolBtnText} numberOfLines={2}>
              Track
            </Text>
            <Text style={styles.trackHint}>T</Text>
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.toolBtnFullWidth, styles.deleteBtn, styles.deleteBtnFull]}
        onPress={onDeleteSelected}
        disabled={!selectedAnnotationId}
        activeOpacity={0.85}
        {...(Platform.OS === 'web' ? ({ accessibilityLabel: 'Delete selected', title: 'Delete selected' } as object) : {})}
      >
        <Ionicons name="trash-outline" size={18} color="#fca5a5" />
        <Text style={[styles.toolBtnText, styles.deleteBtnText]} numberOfLines={2}>
          Delete
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    width: INNER + 8,
    paddingHorizontal: 4,
    paddingVertical: 4,
    alignItems: 'center',
  },
  toolRowsWrap: {
    width: INNER,
    flexDirection: 'column',
    gap: GAP,
  },
  toolRow: {
    width: INNER,
    flexDirection: 'row',
    flexWrap: 'nowrap',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    gap: GAP,
  },
  toolRowSingle: {
    justifyContent: 'center',
  },
  toolSpacer: {
    width: CELL,
    minHeight: 52,
    maxWidth: CELL,
  },
  toolBtn: {
    width: CELL,
    maxWidth: CELL,
    minHeight: 52,
    borderRadius: 6,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
    paddingHorizontal: 2,
    gap: 1,
  },
  toolBtnFullWidth: {
    width: INNER,
    minWidth: INNER,
    maxWidth: INNER,
    minHeight: 52,
    borderRadius: 6,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    flexDirection: 'column',
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
    paddingHorizontal: 2,
    gap: 1,
    position: 'relative',
  },
  deleteBtnFull: {
    marginTop: GAP,
    alignSelf: 'center',
    minHeight: CELL,
  },
  toolBtnActive: {
    backgroundColor: '#7c3aed',
    borderColor: '#7c3aed',
  },
  toolBtnText: {
    fontSize: 8,
    fontWeight: '600',
    color: '#e2e8f0',
    textAlign: 'center',
  },
  trackHint: {
    position: 'absolute',
    bottom: 3,
    right: 5,
    fontSize: 8,
    fontWeight: '700',
    color: '#94a3b8',
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
});
