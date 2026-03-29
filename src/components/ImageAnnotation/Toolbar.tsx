import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Tool = 'pan' | 'select' | 'bbox' | 'polygon' | 'point' | 'ellipse' | 'cuboid' | 'polyline' | 'skeleton' | 'magic_wand';

interface ToolbarProps {
  activeTool: Tool;
  onToolChange: (tool: Tool) => void;
  selectedAnnotationId: string | null;
  onDeleteSelected: () => void;
  isWeb: boolean;
}

const tools: { name: string; icon: string; type: Tool }[] = [
  { name: 'Pan', icon: 'hand-right', type: 'pan' },
  { name: 'Select', icon: 'hand-left-outline', type: 'select' },
  { name: 'BBox', icon: 'square-outline', type: 'bbox' },
  { name: 'Polygon', icon: 'resize-outline', type: 'polygon' },
  { name: 'Points', icon: 'ellipse-outline', type: 'point' },
  { name: 'Ellipse', icon: 'radio-button-off', type: 'ellipse' },
  { name: 'Cuboid', icon: 'cube-outline', type: 'cuboid' },
  { name: 'Polyline', icon: 'create-outline', type: 'polyline' },
  { name: 'Skeleton', icon: 'body-outline', type: 'skeleton' },
  { name: 'Magic Wand', icon: 'sparkles', type: 'magic_wand' },
];

export default function Toolbar({ activeTool, onToolChange, selectedAnnotationId, onDeleteSelected, isWeb }: ToolbarProps) {
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
          <Ionicons name={tool.icon as any} size={16} color="#f1f5f9" />
          <Text style={styles.imageToolBtnText}>{tool.name}</Text>
        </TouchableOpacity>
      ))}
      {/* Delete Button */}
      <TouchableOpacity
        style={[styles.imageToolBtn, styles.deleteToolBtn, { opacity: selectedAnnotationId ? 1 : 0.5 }]}
        onPress={onDeleteSelected}
        activeOpacity={0.8}
        disabled={!selectedAnnotationId}
        {...(isWeb ? { accessibilityLabel: 'Delete', title: 'Delete' } as any : {})}
      >
        <Ionicons name="trash-outline" size={16} color="#ef4444" />
        <Text style={[styles.imageToolBtnText, styles.deleteToolBtnText]}>Delete</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  imageToolbar: {
    width: 60,
    backgroundColor: '#1e293b',
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
    backgroundColor: '#334155',
    minHeight: 52,
  },
  imageToolBtnActive: {
    backgroundColor: '#3b82f6',
  },
  imageToolBtnText: {
    color: '#f1f5f9',
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
});
