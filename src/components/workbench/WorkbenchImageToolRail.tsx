import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  WORKBENCH_IMAGE_TOOL_META,
  WORKBENCH_IMAGE_TOOL_ROWS,
  type WorkbenchDrawingToolId,
} from '@/constants/workbenchImageTools';
import BrushColorPalette from '@/components/workbench/BrushColorPalette';

const CELL = 48;
const GAP = 4;
const INNER = CELL * 2 + GAP;

export interface WorkbenchImageToolRailProps {
  activeTool: string;
  /** Dashboard’da fırça paleti vb. ile uyum */
  isBrushActive?: boolean;
  onToolChange: (tool: WorkbenchDrawingToolId) => void;
  onUndo: () => void;
  onResetImageView?: () => void;
  selectedAnnotationId: string | null;
  onDeleteSelected: () => void;
  /** Fırça rengi + palet (AnnotationCanvas ile senkron) */
  brushColor?: string;
  onBrushColorChange?: (color: string) => void;
  brushPaletteOpen?: boolean;
  onBrushPaletteOpenChange?: (open: boolean) => void;
}

function ToolCell({
  id,
  active,
  onPress,
}: {
  id: WorkbenchDrawingToolId;
  active: boolean;
  onPress: () => void;
}) {
  const meta = WORKBENCH_IMAGE_TOOL_META[id];
  const iconName = meta.icon as keyof typeof Ionicons.glyphMap;
  return (
    <TouchableOpacity
      style={[styles.toolBtn, active && styles.toolBtnActive]}
      onPress={onPress}
      activeOpacity={0.85}
      {...(Platform.OS === 'web'
        ? ({
            accessibilityLabel: meta.hint ? `${meta.label}. ${meta.hint}` : meta.label,
            title: meta.hint ? `${meta.label}: ${meta.hint}` : meta.label,
          } as object)
        : {})}
    >
      <Ionicons name={iconName} size={20} color="#f1f5f9" />
      <Text style={styles.toolBtnText} numberOfLines={2}>
        {meta.label}
      </Text>
    </TouchableOpacity>
  );
}

function BrushToolCell({
  active,
  swatchColor,
  onPress,
}: {
  active: boolean;
  swatchColor: string;
  onPress: () => void;
}) {
  const meta = WORKBENCH_IMAGE_TOOL_META.brush;
  const iconName = meta.icon as keyof typeof Ionicons.glyphMap;
  return (
    <TouchableOpacity
      style={[styles.toolBtn, active && styles.toolBtnActive]}
      onPress={onPress}
      activeOpacity={0.85}
      {...(Platform.OS === 'web'
        ? ({
            accessibilityLabel: meta.hint ? `${meta.label}. ${meta.hint}` : meta.label,
            title: 'Fırça — renk paletini aç',
          } as object)
        : {})}
    >
      <Ionicons name={iconName} size={20} color="#f1f5f9" />
      <Text style={styles.toolBtnText} numberOfLines={1}>
        {meta.label}
      </Text>
      <View style={[styles.brushSwatch, { backgroundColor: swatchColor }]} />
    </TouchableOpacity>
  );
}

export default function WorkbenchImageToolRail({
  activeTool,
  isBrushActive = false,
  onToolChange,
  onUndo,
  onResetImageView,
  selectedAnnotationId,
  onDeleteSelected,
  brushColor,
  onBrushColorChange,
  brushPaletteOpen,
  onBrushPaletteOpenChange,
}: WorkbenchImageToolRailProps) {
  const toolActive = (id: WorkbenchDrawingToolId) => activeTool === id && !isBrushActive;
  const brushSync =
    brushColor !== undefined &&
    onBrushColorChange &&
    brushPaletteOpen !== undefined &&
    onBrushPaletteOpenChange;

  const showBrushPalette = brushSync && activeTool === 'brush' && brushPaletteOpen;

  const renderTool = (id: WorkbenchDrawingToolId) => {
    if (id === 'brush' && brushSync) {
      return (
        <BrushToolCell
          key="brush"
          active={toolActive('brush')}
          swatchColor={brushColor}
          onPress={() => {
            if (activeTool === 'brush' && brushPaletteOpen) {
              onBrushPaletteOpenChange(false);
            } else {
              onToolChange('brush');
              onBrushPaletteOpenChange(true);
            }
          }}
        />
      );
    }
    return (
      <ToolCell key={id} id={id} active={toolActive(id)} onPress={() => onToolChange(id)} />
    );
  };

  return (
    <View style={styles.rail}>
      <View style={styles.toolRowsWrap}>
        <View style={styles.toolRow}>
          <ToolCell id="pan" active={toolActive('pan')} onPress={() => onToolChange('pan')} />
          {onResetImageView ? (
            <TouchableOpacity
              style={[styles.toolBtn, styles.resetViewBtn]}
              onPress={onResetImageView}
              activeOpacity={0.85}
              {...(Platform.OS === 'web'
                ? ({
                    accessibilityLabel: 'Center view',
                    title: 'Reset zoom and pan to center the image',
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
            {...(Platform.OS === 'web' ? ({ accessibilityLabel: 'Undo', title: 'Undo' } as object) : {})}
          >
            <Ionicons name="arrow-undo-outline" size={18} color="#93c5fd" />
            <Text style={styles.toolBtnText}>Undo</Text>
          </TouchableOpacity>
        </View>

        {WORKBENCH_IMAGE_TOOL_ROWS.map((row, rowIdx) => (
          <View key={rowIdx} style={styles.toolRow}>
            {renderTool(row.left)}
            {row.right ? renderTool(row.right) : <View style={styles.toolSpacer} />}
          </View>
        ))}
      </View>

      {showBrushPalette ? (
        <BrushColorPalette
          currentColor={brushColor}
          width={INNER}
          onSelectColor={(hex) => {
            onBrushColorChange(hex);
          }}
        />
      ) : null}

      <TouchableOpacity
        style={[styles.toolBtnFullWidth, styles.deleteBtn, styles.deleteBtnFull]}
        onPress={onDeleteSelected}
        disabled={!selectedAnnotationId}
        activeOpacity={0.85}
        {...(Platform.OS === 'web' ? ({ accessibilityLabel: 'Delete Selected', title: 'Delete Selected' } as object) : {})}
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
  /** Tam satır buton (Undo, Delete); web’de toolBtn ile birleşince width=CELL kalabiliyordu */
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
  },
  brushSwatch: {
    width: 22,
    height: 5,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    marginTop: 1,
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
