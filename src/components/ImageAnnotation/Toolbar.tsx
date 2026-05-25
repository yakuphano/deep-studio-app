import React, { useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { AppColors } from '@/theme/palettes';
import { useThemeColors } from '@/contexts/ThemeContext';
type Tool = 'pan' | 'bbox' | 'polygon' | 'point' | 'ellipse' | 'cuboid' | 'polyline' | 'skeleton' | 'magic_wand';

interface ToolbarProps {
  activeTool: Tool;
  onToolChange: (tool: Tool) => void;
  selectedAnnotationId: string | null;
  onDeleteSelected: () => void;
  onUndo?: () => void;
  isWeb: boolean;
}

const tools: { name: string; icon: string; type: Tool }[] = [
  { name: 'Pan', icon: 'hand-right', type: 'pan' },
  { name: 'BBox', icon: 'square-outline', type: 'bbox' },
  { name: 'Polygon', icon: 'resize-outline', type: 'polygon' },
  { name: 'Points', icon: 'ellipse-outline', type: 'point' },
  { name: 'Ellipse', icon: 'radio-button-off', type: 'ellipse' },
  { name: 'Cuboid', icon: 'cube-outline', type: 'cuboid' },
  { name: 'Polyline', icon: 'create-outline', type: 'polyline' },
  { name: 'Skeleton', icon: 'body-outline', type: 'skeleton' },
  { name: 'Magic Wand', icon: 'sparkles', type: 'magic_wand' },
];

export default function Toolbar({ activeTool, onToolChange, selectedAnnotationId, onDeleteSelected, onUndo, isWeb }: ToolbarProps) {
  const themeColors = useThemeColors();
  const styles = useMemo(() => createStyles(themeColors), [themeColors]);

  return (
    <View style={styles.imageToolbar}>
      {tools.map((tool) => (
        <TouchableOpacity
          key={tool.type}
          style={[styles.imageToolBtn, activeTool === tool.type && styles.imageToolBtnActive]}
          onPress={() => onToolChange(tool.type)}
          activeOpacity={0.8}
          {...(isWeb ? { accessibilityLabel: tool.name, title: tool.name } as any : {})}
        >
          <Ionicons name={tool.icon as any} size={16} color={themeColors.text} />
          <Text style={styles.imageToolBtnText}>{tool.name}</Text>
        </TouchableOpacity>
      ))}
      
      {/* First Undo Button */}
      <TouchableOpacity
        style={[styles.imageToolBtn, styles.undoToolBtn]}
        onPress={onUndo}
        activeOpacity={0.8}
        {...(isWeb ? { accessibilityLabel: 'Undo', title: 'Undo' } as any : {})}
      >
        <Ionicons name="arrow-undo-outline" size={16} color={themeColors.text} />
        <Text style={styles.imageToolBtnText}>Undo</Text>
      </TouchableOpacity>
      
      {/* Second Undo Button */}
      <TouchableOpacity
        style={[styles.imageToolBtn, styles.undoToolBtn]}
        onPress={onUndo}
        activeOpacity={0.8}
        {...(isWeb ? { accessibilityLabel: 'Undo', title: 'Undo' } as any : {})}
      >
        <Ionicons name="arrow-undo-outline" size={16} color={themeColors.text} />
        <Text style={styles.imageToolBtnText}>Undo</Text>
      </TouchableOpacity>
    </View>
  );
}

function createStyles(themeColors: AppColors) {
  return StyleSheet.create({
  imageToolbar: {
    width: 60,
    backgroundColor: themeColors.surface,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
    paddingVertical: 8,
    gap: 4,
  },
  imageToolBtn: {
    flexDirection: 'column' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 6,
    backgroundColor: themeColors.surfaceElevated,
    minHeight: 52,
  },
  imageToolBtnActive: {
    backgroundColor: '#3b82f6',
  },
  imageToolBtnText: {
    color: themeColors.text,
    fontSize: 10,
    fontWeight: '500',
    marginTop: 2,
  },
  deleteToolBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  deleteToolBtnText: {
    color: '#ef4444',
  },
  undoToolBtn: {
    backgroundColor: '#059669',
  },
});
}
