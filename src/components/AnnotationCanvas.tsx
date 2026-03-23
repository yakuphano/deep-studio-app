import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export type Tool = 'bbox' | 'polygon' | 'select';

export interface BboxAnnotation {
  id: string;
  type: 'bbox';
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
}

export interface PolygonAnnotation {
  id: string;
  type: 'polygon';
  points: Array<{ x: number; y: number }>;
  label: string;
}

export type Annotation = BboxAnnotation | PolygonAnnotation;

interface AnnotationCanvasProps {
  imageSource?: { uri: string } | null;
  imageUrl?: string | null;
  initialAnnotations?: unknown;
  taskId?: string;
  annotations: Annotation[];
  onAnnotationsChange: (annotations: Annotation[]) => void;
  activeTool?: Tool;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onImageDimensions?: (width: number, height: number) => void;
  isBrushActive?: boolean;
  brushSize?: number;
  selectedLabel?: string;
}

export default function AnnotationCanvas(_props: AnnotationCanvasProps) {
  return (
    <View style={styles.placeholder}>
      <Text style={styles.text}>Görsel etiketleme sadece web için desteklenir.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 200,
  },
  text: { color: '#94a3b8', fontSize: 14 },
});
