import React from 'react';
import { Point } from '@/hooks/useCanvasLogic';

interface Annotation {
  id: string;
  type: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  points?: Point[];
  label?: string;
}

interface CanvasContextMenuProps {
  activeTool: string;
  annotations: Annotation[];
  selectedId: string | null;
  polygonPoints: Point[];
  polylinePoints: Point[];
  isDrawingPolygon: boolean;
  isDrawingPolyline: boolean;
  onAnnotationsChange: (annotations: Annotation[]) => void;
  onSelect: (id: string | null) => void;
  onUndo: () => void;
  onPolygonPointsChange: (points: Point[]) => void;
  onIsDrawingPolygonChange: (drawing: boolean) => void;
  onPolylinePointsChange: (points: Point[]) => void;
  onIsDrawingPolylineChange: (drawing: boolean) => void;
  onHandleUndo: () => void;
  imageSize?: { w: number; h: number } | null;
}

export const CanvasContextMenu = ({
  activeTool,
  annotations,
  selectedId,
  polygonPoints,
  polylinePoints,
  isDrawingPolygon,
  isDrawingPolyline,
  onAnnotationsChange,
  onSelect,
  onUndo,
  onPolygonPointsChange,
  onIsDrawingPolygonChange,
  onPolylinePointsChange,
  onIsDrawingPolylineChange,
  onHandleUndo,
  imageSize
}: CanvasContextMenuProps) => {

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    
    // Firing toolu engelle
    if (activeTool === 'brush') return;
    
    // Handle polyline completion
    if (activeTool === 'polyline' && isDrawingPolyline && polylinePoints.length >= 2) {
      const withinBounds = imageSize && polylinePoints.every(point => 
        point.x >= 0 && 
        point.y >= 0 && 
        point.x <= imageSize.w && 
        point.y <= imageSize.h
      );
      
      if (withinBounds) {
        const newPolyline = {
          id: `polyline-${Date.now()}`,
          type: 'polyline',
          points: polylinePoints,
          label: ''
        };
        onAnnotationsChange([...annotations, newPolyline]);
        onIsDrawingPolylineChange(false);
        onPolylinePointsChange([]);
      } else {
        console.log('[CanvasContextMenu] Polyline outside image bounds, not saving');
        onIsDrawingPolylineChange(false);
        onPolylinePointsChange([]);
      }
      return;
    }
    
    // Handle polygon completion
    if (activeTool === 'polygon' && isDrawingPolygon && polygonPoints.length >= 3) {
      const withinBounds = imageSize && polygonPoints.every(point => 
        point.x >= 0 && 
        point.y >= 0 && 
        point.x <= imageSize.w && 
        point.y <= imageSize.h
      );
      
      if (withinBounds) {
        const newPolygon = {
          id: `polygon-${Date.now()}`,
          type: 'polygon',
          points: polygonPoints,
          label: ''
        };
        onAnnotationsChange([...annotations, newPolygon]);
        onIsDrawingPolygonChange(false);
        onPolygonPointsChange([]);
      } else {
        console.log('[CanvasContextMenu] Polygon outside image bounds, not saving');
        onIsDrawingPolygonChange(false);
        onPolygonPointsChange([]);
      }
    }
    
    // Handle polygon undo - remove last point
    if (activeTool === 'polygon' && isDrawingPolygon && polygonPoints.length > 0) {
      onPolygonPointsChange(prev => prev.slice(0, -1));
      
      // If only one point left, cancel drawing
      if (polygonPoints.length === 1) {
        onIsDrawingPolygonChange(false);
        onPolygonPointsChange([]);
      }
    }
    
    // Handle points undo - remove last point
    if (activeTool === 'points' && annotations.length > 0) {
      const pointAnnotations = annotations.filter(ann => ann.type === 'point');
      if (pointAnnotations.length > 0) {
        const lastPointAnnotation = pointAnnotations[pointAnnotations.length - 1];
        onAnnotationsChange(annotations.filter(ann => ann.id !== lastPointAnnotation.id));
      }
    }
  };

  return {
    handleContextMenu
  };
};
