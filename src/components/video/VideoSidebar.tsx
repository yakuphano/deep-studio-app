import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { videoWorkbenchStyles } from '@/theme/videoWorkbenchStyles';
import { Tool } from '@/types/annotations';

interface VideoSidebarProps {
  activeTool: string;
  setActiveTool: (tool: string) => void;
  isBrushActive: boolean;
  setIsBrushActive: (active: boolean) => void;
  selectedAnnotationId: string | null;
  handleDeleteAnnotation: (id: string) => void;
  canvasRef: any;
}

export const VideoSidebar: React.FC<VideoSidebarProps> = ({
  activeTool,
  setActiveTool,
  isBrushActive,
  setIsBrushActive,
  selectedAnnotationId,
  handleDeleteAnnotation,
  canvasRef,
}) => {
  const tools = [
    { id: 'pan', name: 'Pan', icon: 'hand-right-outline' },
    { id: 'undo', name: 'Undo', icon: 'arrow-undo-outline' },
    { id: 'bbox', name: 'BBox', icon: 'square-outline' },
    { id: 'polygon', name: 'Polygon', icon: 'git-merge-outline' },
    { id: 'polyline', name: 'Polyline', icon: 'create-outline' },
    { id: 'brush', name: 'Brush', icon: 'brush-outline' },
  ];

  const handleToolPress = (toolId: string) => {
    setActiveTool(toolId);
    setIsBrushActive(toolId === 'brush');
  };

  const handleUndo = () => {
    if (canvasRef.current?.handleUndo) {
      canvasRef.current.handleUndo();
    }
  };

  return (
    <View style={videoWorkbenchStyles.leftToolbarCol}>
      {tools.map((tool) => (
        <TouchableOpacity
          key={tool.id}
          style={[
            videoWorkbenchStyles.toolBtnLarge,
            activeTool === tool.id && !isBrushActive && videoWorkbenchStyles.toolBtnActivePurple
          ]}
          onPress={() => 
            tool.id === 'undo' ? handleUndo() : handleToolPress(tool.id)
          }
          activeOpacity={0.8}
        >
          <Ionicons name={tool.icon as any} size={20} color="#f1f5f9" />
          <Text style={videoWorkbenchStyles.toolBtnLargeText}>{tool.name}</Text>
        </TouchableOpacity>
      ))}
      
      {/* Delete Button */}
      <TouchableOpacity
        style={[videoWorkbenchStyles.toolBtnLarge, videoWorkbenchStyles.deleteToolBtn]}
        onPress={() => selectedAnnotationId && handleDeleteAnnotation(selectedAnnotationId)}
        activeOpacity={0.8}
      >
        <Ionicons name="trash-outline" size={20} color="#ef4444" />
        <Text style={[videoWorkbenchStyles.toolBtnLargeText, videoWorkbenchStyles.deleteToolBtnText]}>
          Delete
        </Text>
      </TouchableOpacity>
    </View>
  );
};
