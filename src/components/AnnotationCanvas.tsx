import React, { forwardRef, useImperativeHandle } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { Annotation, Tool } from '@/types/annotations';

export type { Annotation, Tool } from '@/types/annotations';

export type AnnotationCanvasHandle = {
  resetView?: () => void;
  undo?: () => void;
  handleUndo?: () => void;
};

interface AnnotationCanvasProps {
  imageSource?: { uri: string } | null;
  imageUrl?: string | null;
  initialAnnotations?: unknown;
  taskId?: string;
  annotations: Annotation[];
  onAnnotationsChange: (
    annotations: Annotation[] | ((prev: Annotation[]) => Annotation[])
  ) => void;
  activeTool?: Tool;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onImageDimensions?: (width: number, height: number) => void;
  isBrushActive?: boolean;
  brushSize?: number;
  selectedLabel?: string;
  onToolChange?: (tool: Tool) => void;
  onUndo?: () => void;
  hideFloatingToolbar?: boolean;
  brushColor?: string;
  onBrushColorChange?: (color: string) => void;
  brushPaletteOpen?: boolean;
  onBrushPaletteOpenChange?: (open: boolean) => void;
}

const AnnotationCanvas = forwardRef<AnnotationCanvasHandle, AnnotationCanvasProps>(
  function AnnotationCanvas(_props, ref) {
    useImperativeHandle(ref, () => ({
      resetView: () => {},
      undo: () => {},
      handleUndo: () => {},
    }));
    return (
      <View style={styles.placeholder}>
        <Text style={styles.text}>Görsel etiketleme sadece web için desteklenir.</Text>
      </View>
    );
  }
);

export default AnnotationCanvas;

const styles = StyleSheet.create({
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 200,
  },
  text: { color: '#94a3b8', fontSize: 14 },
});
