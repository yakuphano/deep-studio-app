import React, { useState, useCallback } from 'react';
import { Point } from '@/hooks/useCanvasLogic';

interface Annotation {
  id: string;
  type: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  cx?: number;
  cy?: number;
  rx?: number;
  ry?: number;
  points?: Point[];
  color?: string;
  label?: string;
}

interface DrawingState {
  x: number;
  y: number;
  width: number;
  height: number;
  step?: number;
}

export const AnnotationTools = () => {
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawPreview, setDrawPreview] = useState<DrawingState | null>(null);
  const [activeDrawing, setActiveDrawing] = useState<DrawingState | null>(null);
  const [brushPoints, setBrushPoints] = useState<Point[]>([]);
  const [polygonPoints, setPolygonPoints] = useState<Point[]>([]);
  const [isDrawingPolygon, setIsDrawingPolygon] = useState(false);
  const [polylinePoints, setPolylinePoints] = useState<Point[]>([]);
  const [isDrawingPolyline, setIsDrawingPolyline] = useState(false);
  const [savedBrushes, setSavedBrushes] = useState<Annotation[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [brushColor, setBrushColor] = useState('#ff0000');

  const MIN_BOX_SIZE = 10;

  // Handle bbox drawing
  const handleBboxDrawing = useCallback((startPoint: Point, currentPoint: Point, imageSize: { w: number; h: number } | null, onAnnotationsChange: (ann: Annotation[]) => void, onSelect?: (id: string) => void) => {
    const width = currentPoint.x - startPoint.x;
    const height = currentPoint.y - startPoint.y;
    const x = width < 0 ? currentPoint.x : startPoint.x;
    const y = height < 0 ? currentPoint.y : startPoint.y;
    
    setDrawPreview({ x, y, width: Math.abs(width), height: Math.abs(height) });
  }, []);

  // Handle ellipse drawing
  const handleEllipseDrawing = useCallback((startPoint: Point, currentPoint: Point, imageSize: { w: number; h: number } | null, onAnnotationsChange: (ann: Annotation[]) => void, onSelect?: (id: string) => void) => {
    const width = currentPoint.x - startPoint.x;
    const height = currentPoint.y - startPoint.y;
    const x = width < 0 ? currentPoint.x : startPoint.x;
    const y = height < 0 ? currentPoint.y : startPoint.y;
    
    setDrawPreview({ x, y, width: Math.abs(width), height: Math.abs(height) });
  }, []);

  // Handle cuboid drawing (2-step)
  const handleCuboidDrawing = useCallback((startPoint: Point, currentPoint: Point, imageSize: { w: number; h: number } | null, onAnnotationsChange: (ann: Annotation[]) => void, onSelect?: (id: string) => void) => {
    if (!activeDrawing) {
      // First step - set initial rectangle
      const width = currentPoint.x - startPoint.x;
      const height = currentPoint.y - startPoint.y;
      const x = width < 0 ? currentPoint.x : startPoint.x;
      const y = height < 0 ? currentPoint.y : startPoint.y;
      
      setActiveDrawing({ x, y, width: Math.abs(width), height: Math.abs(height), step: 1 });
    } else if (activeDrawing.step === 1) {
      // Second step - update preview
      const width = currentPoint.x - activeDrawing.x;
      const height = currentPoint.y - activeDrawing.y;
      
      setDrawPreview({ 
        x: activeDrawing.x, 
        y: activeDrawing.y, 
        width: Math.abs(width), 
        height: Math.abs(height) 
      });
    }
  }, [activeDrawing]);

  // Handle brush drawing
  const handleBrushDrawing = useCallback((point: Point) => {
    setBrushPoints(prev => [...prev, point]);
  }, []);

  // Handle polygon drawing
  const handlePolygonDrawing = useCallback((point: Point, imageSize: { w: number; h: number } | null, onAnnotationsChange: (ann: Annotation[]) => void, onSelect?: (id: string) => void) => {
    setPolygonPoints(prev => [...prev, point]);
  }, []);

  // Handle polyline drawing
  const handlePolylineDrawing = useCallback((point: Point, imageSize: { w: number; h: number } | null, onAnnotationsChange: (ann: Annotation[]) => void, onSelect?: (id: string) => void) => {
    setPolylinePoints(prev => [...prev, point]);
  }, []);

  // Handle points drawing
  const handlePointsDrawing = useCallback((point: Point, imageSize: { w: number; h: number } | null, onAnnotationsChange: (ann: Annotation[]) => void, onSelect?: (id: string) => void) => {
    if (imageSize) {
      const withinBounds = point.x >= 0 && point.y >= 0 && point.x <= imageSize.w && point.y <= imageSize.h;
      
      if (withinBounds) {
        const newPoint = { 
          id: `point-${Date.now()}`, 
          type: 'point', 
          x: point.x, 
          y: point.y, 
          label: '' 
        };
        onAnnotationsChange(prev => [...prev, newPoint]);
        setHistory(prev => [...prev, { type: 'annotation', data: newPoint }]);
      }
    }
  }, []);

  // Save annotation based on tool
  const saveAnnotation = useCallback((activeTool: string, onAnnotationsChange: (ann: Annotation[]) => void, onSelect?: (id: string) => void, imageSize?: { w: number; h: number } | null) => {
    switch (activeTool) {
      case 'brush':
        if (brushPoints.length > 1) {
          const newBrush = { 
            id: `brush-${Date.now()}`, 
            type: 'brush', 
            points: brushPoints, 
            color: brushColor, 
            label: '' 
          };
          setSavedBrushes(prev => [...prev, newBrush]);
          setHistory(prev => [...prev, { type: 'brush', data: newBrush }]);
          setBrushPoints([]);
          setIsDrawing(false);
        }
        break;

      case 'bbox':
        if (drawPreview && drawPreview.width > MIN_BOX_SIZE) {
          const withinBounds = imageSize && 
            drawPreview.x >= 0 && 
            drawPreview.y >= 0 && 
            drawPreview.x + drawPreview.width <= imageSize.w && 
            drawPreview.y + drawPreview.height <= imageSize.h;
          
          if (withinBounds) {
            const newBbox = { 
              id: `bbox-${Date.now()}`, 
              type: 'bbox', 
              ...drawPreview, 
              label: '' 
            };
            onAnnotationsChange((prev: Annotation[]) => [...prev, newBbox]);
            setHistory(prev => [...prev, { type: 'annotation', data: newBbox }]);
            onSelect?.(newBbox.id);
          }
        }
        break;

      case 'ellipse':
        if (drawPreview && drawPreview.width > MIN_BOX_SIZE) {
          const withinBounds = imageSize && 
            drawPreview.x >= 0 && 
            drawPreview.y >= 0 && 
            drawPreview.x + drawPreview.width <= imageSize.w && 
            drawPreview.y + drawPreview.height <= imageSize.h;
          
          if (withinBounds) {
            const newEllipse = { 
              id: `ellipse-${Date.now()}`, 
              type: 'ellipse',
              cx: drawPreview.x + drawPreview.width / 2,
              cy: drawPreview.y + drawPreview.height / 2,
              rx: drawPreview.width / 2,
              ry: drawPreview.height / 2,
              label: ''
            };
            onAnnotationsChange((prev: Annotation[]) => [...prev, newEllipse]);
            setHistory(prev => [...prev, { type: 'annotation', data: newEllipse }]);
            onSelect?.(newEllipse.id);
          }
        }
        break;

      case 'cuboid':
        if (activeDrawing?.step === 1) {
          setActiveDrawing(prev => ({ ...prev!, step: 2 }));
          setDrawPreview(null);
          return;
        } else if (activeDrawing?.step === 2) {
          const withinBounds = imageSize && 
            activeDrawing.x >= 0 && 
            activeDrawing.y >= 0 && 
            activeDrawing.x + activeDrawing.width <= imageSize.w && 
            activeDrawing.y + activeDrawing.height <= imageSize.h;
          
          if (withinBounds) {
            const newCuboid = { 
              ...activeDrawing, 
              id: `cuboid-${Date.now()}`, 
              type: 'cuboid', 
              label: '' 
            };
            onAnnotationsChange((prev: Annotation[]) => [...prev, newCuboid]);
            setHistory(prev => [...prev, { type: 'annotation', data: newCuboid }]);
            onSelect?.(newCuboid.id);
          }
        }
        break;

      case 'polygon':
        if (polygonPoints.length >= 3) {
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
            onAnnotationsChange((prev: Annotation[]) => [...prev, newPolygon]);
            setHistory(prev => [...prev, { type: 'annotation', data: newPolygon }]);
            onSelect?.(newPolygon.id);
          }
        }
        break;

      case 'polyline':
        if (polylinePoints.length >= 2) {
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
            onAnnotationsChange((prev: Annotation[]) => [...prev, newPolyline]);
            setHistory(prev => [...prev, { type: 'annotation', data: newPolyline }]);
            onSelect?.(newPolyline.id);
          }
        }
        break;
    }

    // Reset drawing states
    setIsDrawing(false);
    setDrawPreview(null);
    setActiveDrawing(null);
    setPolygonPoints([]);
    setIsDrawingPolygon(false);
    setPolylinePoints([]);
    setIsDrawingPolyline(false);
  }, [brushPoints, drawPreview, activeDrawing, polygonPoints, polylinePoints, brushColor, history, MIN_BOX_SIZE]);

  // Start drawing
  const startDrawing = useCallback((activeTool: string, startPoint: Point) => {
    setIsDrawing(true);
    setDrawPreview(null);
    setActiveDrawing(null);
    
    switch (activeTool) {
      case 'polygon':
        setPolygonPoints([startPoint]);
        setIsDrawingPolygon(true);
        break;
      case 'polyline':
        setPolylinePoints([startPoint]);
        setIsDrawingPolyline(true);
        break;
      case 'brush':
        setBrushPoints([startPoint]);
        break;
      case 'cuboid':
        setActiveDrawing({ x: startPoint.x, y: startPoint.y, width: 0, height: 0, step: 1 });
        break;
      default:
        setDrawPreview({ x: startPoint.x, y: startPoint.y, width: 0, height: 0 });
    }
  }, []);

  // Update drawing preview
  const updateDrawing = useCallback((activeTool: string, currentPoint: Point, imageSize: { w: number; h: number } | null, onAnnotationsChange: (ann: Annotation[]) => void, onSelect?: (id: string) => void) => {
    if (!isDrawing) return;

    switch (activeTool) {
      case 'bbox':
        if (drawPreview) {
          handleBboxDrawing(
            { x: drawPreview.x, y: drawPreview.y },
            currentPoint,
            imageSize,
            onAnnotationsChange,
            onSelect
          );
        }
        break;
      case 'ellipse':
        if (drawPreview) {
          handleEllipseDrawing(
            { x: drawPreview.x, y: drawPreview.y },
            currentPoint,
            imageSize,
            onAnnotationsChange,
            onSelect
          );
        }
        break;
      case 'cuboid':
        handleCuboidDrawing(currentPoint, currentPoint, imageSize, onAnnotationsChange, onSelect);
        break;
      case 'brush':
        handleBrushDrawing(currentPoint);
        break;
      case 'polygon':
        // Polygon points are added on click, not drag
        break;
      case 'polyline':
        // Polyline points are added on click, not drag
        break;
      case 'points':
        handlePointsDrawing(currentPoint, imageSize, onAnnotationsChange, onSelect);
        break;
    }
  }, [isDrawing, drawPreview, handleBboxDrawing, handleEllipseDrawing, handleCuboidDrawing, handleBrushDrawing, handlePolygonDrawing, handlePolylineDrawing, handlePointsDrawing]);

  // Add point to polygon/polyline
  const addPointToPolygon = useCallback((point: Point) => {
    setPolygonPoints(prev => [...prev, point]);
  }, []);

  const addPointToPolyline = useCallback((point: Point) => {
    setPolylinePoints(prev => [...prev, point]);
  }, []);

  // Undo last point for polygon/polyline
  const undoLastPolygonPoint = useCallback(() => {
    setPolygonPoints(prev => {
      if (prev.length === 1) {
        setIsDrawingPolygon(false);
        return [];
      }
      return prev.slice(0, -1);
    });
  }, []);

  const undoLastPolylinePoint = useCallback(() => {
    setPolylinePoints(prev => {
      if (prev.length === 1) {
        setIsDrawingPolyline(false);
        return [];
      }
      return prev.slice(0, -1);
    });
  }, []);

  return {
    // State
    isDrawing,
    drawPreview,
    activeDrawing,
    brushPoints,
    polygonPoints,
    isDrawingPolygon,
    polylinePoints,
    isDrawingPolyline,
    savedBrushes,
    history,
    brushColor,
    
    // Actions
    startDrawing,
    updateDrawing,
    saveAnnotation,
    addPointToPolygon,
    addPointToPolyline,
    undoLastPolygonPoint,
    undoLastPolylinePoint,
    
    // Setters
    setBrushColor,
    setIsDrawing,
    setDrawPreview,
    setActiveDrawing,
    setBrushPoints,
    setPolygonPoints,
    setIsDrawingPolygon,
    setPolylinePoints,
    setIsDrawingPolyline,
    setSavedBrushes,
    setHistory,
  };
};
