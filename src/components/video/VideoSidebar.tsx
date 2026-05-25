import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { videoWorkbenchStyles } from '@/theme/videoWorkbenchStyles';
import { Tool } from '@/types/annotations';
import { useThemeColors } from '@/contexts/ThemeContext';

interface VideoSidebarProps {
  activeTool: string;
  setActiveTool: (tool: string) => void;
  selectedAnnotationId: string | null;
  handleDeleteAnnotation: (id: string) => void;
  canvasRef: any;
}

export const VideoSidebar: React.FC<VideoSidebarProps> = ({
  activeTool,
  setActiveTool,
  selectedAnnotationId,
  handleDeleteAnnotation,
  canvasRef,
}) => {
  const themeColors = useThemeColors();
  const tools = [
    { id: 'pan', name: 'Pan', icon: 'hand-right-outline' },
    { id: 'select', name: 'Select', icon: 'locate-outline' },
    { id: 'undo', name: 'Undo', icon: 'arrow-undo-outline' },
    { id: 'bbox', name: 'BBox', icon: 'square-outline' },
    { id: 'polygon', name: 'Polygon', icon: 'git-merge-outline' },
  ];

  const handleToolPress = (toolId: string) => {
    setActiveTool(toolId);
  };

  const handleUndo = () => {
    if (canvasRef.current?.handleUndo) {
      canvasRef.current.handleUndo();
    }
  };

  return (
    <View style={videoWorkbenchStyles.leftToolbarCol}>
      {tools.map((tool) => {
        const active = activeTool === tool.id;
        return (
        <TouchableOpacity
          key={tool.id}
          style={[
            videoWorkbenchStyles.toolBtnLarge,
            active && videoWorkbenchStyles.toolBtnActivePurple
          ]}
          onPress={() => 
            tool.id === 'undo' ? handleUndo() : handleToolPress(tool.id)
          }
          activeOpacity={0.8}
        >
          <Ionicons name={tool.icon as any} size={20} color={active ? '#ffffff' : themeColors.text} />
          <Text style={[videoWorkbenchStyles.toolBtnLargeText, active && { color: '#ffffff' }]}>{tool.name}</Text>
        </TouchableOpacity>
      );})}
      
      {/* Delete Button */}
      <TouchableOpacity
        style={[videoWorkbenchStyles.toolBtnLarge, videoWorkbenchStyles.deleteToolBtn]}
        onPress={() => selectedAnnotationId && handleDeleteAnnotation(selectedAnnotationId)}
        activeOpacity={0.8}
      >
        <Ionicons name="trash-outline" size={20} color={themeColors.error} />
        <Text style={[videoWorkbenchStyles.toolBtnLargeText, videoWorkbenchStyles.deleteToolBtnText]}>
          Delete
        </Text>
      </TouchableOpacity>
    </View>
  );
};
