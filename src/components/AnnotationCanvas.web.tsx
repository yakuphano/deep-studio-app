import React, { useEffect, useState, useRef, useCallback, useImperativeHandle } from 'react';
import { View, StyleSheet } from 'react-native';
import { LABEL_COLORS } from '@/constants/annotationLabels';

export type Tool = 'pan' | 'undo' | 'bbox' | 'polygon' | 'points' | 'ellipse' | 'cuboid' | 'polyline' | 'semantic' | 'brush' | 'magic_wand';
export type BboxHandle = 'tl' | 'tr' | 'br' | 'bl' | 't' | 'r' | 'b' | 'l';

export interface BboxAnnotation {
  id: string;
  type: 'bbox';
  x: number; // Natural pixel coordinates
  y: number; // Natural pixel coordinates  
  width: number; // Natural pixel width
  height: number; // Natural pixel height
  label: string;
  z_index?: number;
}

export interface PolygonAnnotation {
  id: string;
  type: 'polygon';
  points: Array<{ x: number; y: number }>;
  label: string;
}

export interface PointAnnotation {
  id: string;
  type: 'point';
  x: number;
  y: number;
  label: string;
  z_index?: number;
}

export interface PolylineAnnotation {
  id: string;
  type: 'polyline';
  points: { x: number; y: number }[];
  label: string;
  z_index?: number;
}

export interface BrushAnnotation {
  id: string;
  type: 'brush';
  points: { x: number; y: number }[];
  label: string;
  color: string;
  z_index?: number;
}

export type Annotation = BboxAnnotation | PolygonAnnotation | PointAnnotation | PolylineAnnotation | BrushAnnotation;

interface AnnotationCanvasProps {
  imageSource?: { uri: string } | null;
  imageUrl?: string | null;
  annotations: Annotation[];
  onAnnotationsChange: (annotations: Annotation[]) => void;
  activeTool: Tool;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  selectedLabel?: string | null;
  onToolChange?: (tool: Tool) => void;
  onUndo?: () => void;
}

const MIN_BOX_SIZE = 10;
const HANDLE_SIZE = 6; // Smaller, more professional
const HANDLE_HIT_AREA = 20;

// Get color for label with fallback
const getLabelColor = (label: string | any): string => {
  const labelStr = typeof label === 'object'
    ? (label as any).name || (label as any).label || ''
    : String(label ?? '');
  return LABEL_COLORS[labelStr] ?? '#94a3b8';
};

// Export with forwardRef to expose handleUndo
export default React.forwardRef(function AnnotationCanvas({
  imageSource,
  imageUrl,
  annotations,
  onAnnotationsChange,
  activeTool,
  selectedId,
  onSelect,
  selectedLabel,
  onToolChange,
  onUndo,
}: AnnotationCanvasProps, ref) {
  const canvasRef = useRef<{
    handleUndo: () => void;
  } | null>(null);
  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  
  // Viewport transform state - single source of truth
  const [imageSize, setImageSize] = useState<{ w: number; h: number } | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  
  // Pan state - screen space only
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number } | null>(null);
  const [panStartOffset, setPanStartOffset] = useState<{ x: number; y: number } | null>(null);
  
  // Annotation drawing state
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawPreview, setDrawPreview] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  
  // Polygon drawing state
  const [polygonPoints, setPolygonPoints] = useState<{ x: number; y: number }[]>([]);
  const [isDrawingPolygon, setIsDrawingPolygon] = useState(false);
  
  // Polyline drawing state
  const [polylinePoints, setPolylinePoints] = useState<{ x: number; y: number }[]>([]);
  const [isDrawingPolyline, setIsDrawingPolyline] = useState(false);
  const [polylinePreviewPoint, setPolylinePreviewPoint] = useState<{ x: number; y: number } | null>(null);
  
  // Brush drawing state
  const [brushPoints, setBrushPoints] = useState<{ x: number; y: number }[]>([]);
  const [brushColor, setBrushColor] = useState<string>('#ff0000');
  const [isPaletteOpen, setIsPaletteOpen] = useState<boolean>(false);
  const [savedBrushes, setSavedBrushes] = useState<any[]>([]); // Brush çizimlerini saklamak için
  
  // Undo state
  const [history, setHistory] = useState<any[]>([]); // Tüm çizim geçmişi
  
  // Undo fonksiyonu
  const handleUndo = useCallback(() => {
    console.log('[AnnotationCanvas] handleUndo called, history length:', history.length);
    if (history.length > 0) {
      const newHistory = [...history];
      const lastAction = newHistory.pop();
      console.log('[AnnotationCanvas] Last action type:', lastAction?.type);
      
      if (lastAction?.type === 'brush') {
        console.log('[AnnotationCanvas] Undo brush');
        setSavedBrushes(prev => prev.slice(0, -1));
      } else if (lastAction?.type === 'annotation') {
        console.log('[AnnotationCanvas] Undo annotation');
        onAnnotationsChange?.(prev => prev.slice(0, -1));
      } else if (lastAction?.type === 'polyline_point') {
        console.log('[AnnotationCanvas] Undo polyline point');
        // Polyline'den son noktayı geri al
        setPolylinePoints(prev => prev.slice(0, -1));
      } else if (lastAction?.type === 'polyline_start') {
        console.log('[AnnotationCanvas] Undo polyline start');
        // Polyline'i tamamen iptal et
        setPolylinePoints([]);
        setIsDrawingPolyline(false);
      } else if (lastAction?.type === 'polygon_point') {
        console.log('[AnnotationCanvas] Undo polygon point');
        // Polygon'dan son noktayı geri al
        setPolygonPoints(prev => prev.slice(0, -1));
      } else if (lastAction?.type === 'polygon_start') {
        console.log('[AnnotationCanvas] Undo polygon start');
        // Polygon'u tamamen iptal et
        setPolygonPoints([]);
        setIsDrawingPolygon(false);
      } else if (lastAction?.type === 'point') {
        console.log('[AnnotationCanvas] Undo point');
        // Point annotation'ı geri al
        onAnnotationsChange?.(prev => prev.slice(0, -1));
      }
      
      setHistory(newHistory);
    } else {
      console.log('[AnnotationCanvas] No history to undo');
    }
  }, [history, onAnnotationsChange]);
  
  // Expose handleUndo to parent
  useImperativeHandle(ref, () => ({
    handleUndo
  }), [handleUndo]);
  
  // Active drawing state (tek merkezli yapı)
  const [activeDrawing, setActiveDrawing] = useState<{
    tool: 'polyline' | 'cuboid' | 'brush' | null;
    x?: number; y?: number; 
    width?: number; height?: number; 
    dx?: number; dy?: number; 
    step?: 1 | 2;
    points?: {x: number; y: number}[];
  } | null>(null);
  
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<BboxHandle | null>(null);
  const [resizeStartBox, setResizeStartBox] = useState<BboxAnnotation | null>(null);

  // Precise coordinate system - The Math
  const screenToImage = useCallback(
    (clientX: number, clientY: number) => {
      if (!imageSize || !containerRef.current) return { x: 0, y: 0 };
      
      // Get container's exact position
      const rect = containerRef.current.getBoundingClientRect();
      
      // Apply the precise formula: (clientX - rect.left - offset.x) / scale
      const imageX = (clientX - rect.left - offset.x) / scale;
      const imageY = (clientY - rect.top - offset.y) / scale;
      
      return { x: imageX, y: imageY };
    },
    [imageSize, scale, offset]
  );

  const imageToScreen = useCallback(
    (imageX: number, imageY: number) => {
      if (!imageSize) return { x: 0, y: 0 };
      
      // Apply transform: translate(offset) scale(scale)
      return {
        x: imageX * scale + offset.x,
        y: imageY * scale + offset.y,
      };
    },
    [imageSize, scale, offset]
  );

  // Image load with initial fit
  useEffect(() => {
    const img = imgRef.current;
    const container = containerRef.current;
    if (!img || !container || !imageSource?.uri && !imageUrl) return;
    
    const handleLoad = () => {
      const naturalWidth = img.naturalWidth;
      const naturalHeight = img.naturalHeight;
      
      setImageSize({ w: naturalWidth, h: naturalHeight });
      
      // Calculate initial scale to fit image in container
      const containerRect = container.getBoundingClientRect();
      const scaleX = containerRect.width / naturalWidth;
      const scaleY = containerRect.height / naturalHeight;
      const initialScale = Math.min(scaleX, scaleY, 1); // Don't upscale, only downscale
      
      // Center the image
      const offsetX = (containerRect.width - naturalWidth * initialScale) / 2;
      const offsetY = (containerRect.height - naturalHeight * initialScale) / 2;
      
      setScale(initialScale);
      setOffset({ x: offsetX, y: offsetY });
    };
    
    img.src = imageSource?.uri || imageUrl || '';
    img.addEventListener('load', handleLoad);
    
    return () => img.removeEventListener('load', handleLoad);
  }, [imageSource?.uri, imageUrl]);

  // Handle mouse down - Tool-Specific Architecture
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button === 2) return;
      
      // Undo butonu için özel handling
      if (activeTool === 'undo') {
        handleUndo();
        return;
      }
      
      const image = screenToImage(e.clientX, e.clientY);

      // Resize kontrolü - selectedId varsa önce resize tutamacı kontrol et
      if (selectedId) {
        const selectedAnnotation = annotations.find(ann => ann.id === selectedId);
        if (selectedAnnotation && (selectedAnnotation.type === 'bbox' || selectedAnnotation.type === 'cuboid')) {
          const handle = getHandleAt(image.x, image.y, selectedAnnotation as any);
          if (handle) {
            console.log('[AnnotationCanvas] Resize handle clicked via getHandleAt:', handle);
            setIsResizing(true);
            setResizeHandle(handle);
            setResizeStartBox(selectedAnnotation as any);
            return; // Resize başladı, diğer mantıkları çalıştırma
          }
        }
      }

      // Tool-Specific Initialization
      switch (activeTool) {
        case 'pan':
          console.log('[AnnotationCanvas] PAN MODE ACTIVATED');
          console.log('[AnnotationCanvas] Pan mode - checking annotations at:', image);
          console.log('[AnnotationCanvas] Total annotations:', annotations.length);
          console.log('[AnnotationCanvas] SelectedId:', selectedId);
          // Pan modunda çizimleri seçmek ve taşımak için annotation tespiti
          const clickedAnnotation = annotations.find(ann => {
            console.log('[AnnotationCanvas] Checking annotation:', ann.id, ann.type);
            if ((ann as any).type === 'bbox' || (ann as any).type === 'cuboid') {
              const hit = image.x >= (ann as any).x && image.x <= (ann as any).x + (ann as any).width &&
                      image.y >= (ann as any).y && image.y <= (ann as any).y + (ann as any).height;
              console.log('[AnnotationCanvas] Bbox/Cuboid hit test:', hit, 'coords:', {x: (ann as any).x, y: (ann as any).y, w: (ann as any).width, h: (ann as any).height}, 'click:', image);
              return hit;
            } else if ((ann as any).type === 'ellipse') {
              const left = (ann as any).cx - (ann as any).rx;
              const right = (ann as any).cx + (ann as any).rx;
              const top = (ann as any).cy - (ann as any).ry;
              const bottom = (ann as any).cy + (ann as any).ry;
              const hit = image.x >= left && image.x <= right &&
                      image.y >= top && image.y <= bottom;
              console.log('[AnnotationCanvas] Ellipse hit test:', hit, 'coords:', {cx: (ann as any).cx, cy: (ann as any).cy, rx: (ann as any).rx, ry: (ann as any).ry}, 'click:', image);
              return hit;
            } else if ((ann as any).type === 'point') {
              const hit = Math.abs(image.x - (ann as any).x) < 10 && Math.abs(image.y - (ann as any).y) < 10;
              console.log('[AnnotationCanvas] Point hit test:', hit, 'coords:', {x: (ann as any).x, y: (ann as any).y}, 'click:', image);
              return hit;
            } else if ((ann as any).type === 'polygon' || (ann as any).type === 'polyline') {
              // Check if click is near any point in the polygon/polyline
              const hit = (ann as any).points.some((point: any) => 
                Math.abs(image.x - point.x) < 15 && Math.abs(image.y - point.y) < 15
              );
              console.log('[AnnotationCanvas] Polygon/Polyline hit test:', hit, 'points:', (ann as any).points.length, 'click:', image);
              return hit;
            }
            console.log('[AnnotationCanvas] Unknown annotation type:', ann.type);
            return false;
          });
          
          console.log('[AnnotationCanvas] Pan mode - clicked annotation:', clickedAnnotation?.id, clickedAnnotation?.type);
          
          if (clickedAnnotation) {
            console.log('[AnnotationCanvas] Selecting and preparing to drag annotation:', clickedAnnotation.id);
            onSelect?.(clickedAnnotation.id);
            
            // Start dragging annotation
            setIsDragging(true);
            let offsetX, offsetY;
            if (clickedAnnotation.type === 'ellipse') {
              offsetX = image.x - clickedAnnotation.cx;
              offsetY = image.y - clickedAnnotation.cy;
              console.log('[AnnotationCanvas] Starting ellipse drag - offset:', { offsetX, offsetY });
            } else if (clickedAnnotation.type === 'polygon' || clickedAnnotation.type === 'polyline') {
              // For polygon/polyline, calculate offset from first point
              const firstPoint = (clickedAnnotation as any).points[0];
              offsetX = image.x - firstPoint.x;
              offsetY = image.y - firstPoint.y;
              console.log('[AnnotationCanvas] Starting polygon/polyline drag - offset:', { offsetX, offsetY });
            } else {
              offsetX = image.x - (clickedAnnotation as any).x;
              offsetY = image.y - (clickedAnnotation as any).y;
              console.log('[AnnotationCanvas] Starting bbox/cuboid/point drag - offset:', { offsetX, offsetY });
            }
            setDragOffset({ x: offsetX, y: offsetY });
            console.log('[AnnotationCanvas] DRAGGING STARTED - isDragging:', true, 'dragOffset:', { x: offsetX, y: offsetY });
          } else {
            console.log('[AnnotationCanvas] Starting viewport pan - no annotation clicked');
            onSelect?.(null);
            
            // Start viewport panning
            setIsPanning(true);
            setPanStart({ x: e.clientX, y: e.clientY });
            setPanStartOffset({ x: offset.x, y: offset.y });
          }
          break;

        case 'brush':
          setIsDrawing(true);
          setBrushPoints([image]);
          setIsPaletteOpen(false);
          break;

        case 'cuboid':
          if (!activeDrawing) {
            setIsDrawing(true);
            setDrawStart(image);
            setActiveDrawing({ tool: 'cuboid', x: image.x, y: image.y, width: 0, height: 0, dx: 0, dy: 0, step: 1 });
          } else if (activeDrawing.step === 2) {
            // Complete cuboid with functional update
            const newCuboid = { ...activeDrawing, id: `cuboid-${Date.now()}`, type: 'cuboid', label: '' };
            onAnnotationsChange(prev => [...prev, newCuboid]);
            console.log('[AnnotationCanvas] Cuboid completed in handlePointerDown - selecting:', newCuboid.id);
            onSelect?.(newCuboid.id);
            setActiveDrawing(null);
            setIsDrawing(false);
          }
          break;

        case 'bbox':
        case 'ellipse':
          setIsDrawing(true);
          setDrawStart(image);
          setDrawPreview({ ...image, width: 0, height: 0 });
          break;

        case 'points':
          // Save point immediately with functional update
          const newPointAnnotation = { id: `point-${Date.now()}`, type: 'point', x: image.x, y: image.y, label: '' };
          onAnnotationsChange(prev => [...prev, newPointAnnotation]);
          // History'e ekle
          setHistory(prev => [...prev, { type: 'point', data: newPointAnnotation }]);
          break;

        case 'polygon':
          const newPoint = { x: image.x, y: image.y };
          
          if (!isDrawingPolygon) {
            setIsDrawingPolygon(true);
            setPolygonPoints([newPoint]);
            // History'e ekle
            setHistory(prev => [...prev, { type: 'polygon_start', data: [newPoint] }]);
          } else {
            if (polygonPoints.length >= 3) {
              const firstPoint = polygonPoints[0];
              const distance = Math.sqrt(
                Math.pow(newPoint.x - firstPoint.x, 2) + 
                Math.pow(newPoint.y - firstPoint.y, 2)
              );
              
              if (distance < 10) {
                const newPolygon = {
                  id: `polygon-${Date.now()}`,
                  type: 'polygon',
                  points: polygonPoints,
                  label: '',
                };
                onAnnotationsChange(prev => [...prev, newPolygon]);
                // History'e ekle
                setHistory(prev => [...prev, { type: 'annotation', data: newPolygon }]);
                setIsDrawingPolygon(false);
                setPolygonPoints([]);
                return;
              }
            }
            
            setPolygonPoints(prev => [...prev, newPoint]);
            // History'e ekle
            setHistory(prev => [...prev, { type: 'polygon_point', data: newPoint }]);
          }
          break;

        case 'polyline':
          const polylinePoint = { x: image.x, y: image.y };
          
          if (!isDrawingPolyline) {
            setIsDrawingPolyline(true);
            setPolylinePoints([polylinePoint]);
            // History'e ekle
            setHistory(prev => [...prev, { type: 'polyline_start', data: [polylinePoint] }]);
          } else {
            setPolylinePoints(prev => [...prev, polylinePoint]);
            // History'e ekle
            setHistory(prev => [...prev, { type: 'polyline_point', data: polylinePoint }]);
          }
          break;
      }
    },
    [activeTool, activeDrawing, screenToImage, selectedLabel, onAnnotationsChange, annotations, onSelect, selectedId, isDrawingPolygon, polygonPoints, isDrawingPolyline, brushPoints, brushColor, drawStart, drawPreview, isDrawing]
  );
          // Handle mouse move - Tool-Specific Architecture
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    console.log('[AnnotationCanvas] handlePointerMove called - isDragging:', isDragging, 'activeTool:', activeTool, 'dragOffset:', dragOffset);
    
    // Handle resizing
    if (isResizing && resizeHandle && resizeStartBox) {
      const image = screenToImage(e.clientX, e.clientY);
      console.log('[AnnotationCanvas] Resizing - handle:', resizeHandle, 'image:', image);
      
      onAnnotationsChange(prev => prev.map(ann => {
        if (ann.id === resizeStartBox.id && (ann.type === 'bbox' || ann.type === 'cuboid')) {
          let newX = resizeStartBox.x;
          let newY = resizeStartBox.y;
          let newWidth = resizeStartBox.width;
          let newHeight = resizeStartBox.height;
          
          switch (resizeHandle) {
            case 'tl':
              newWidth = resizeStartBox.x + resizeStartBox.width - image.x;
              newHeight = resizeStartBox.y + resizeStartBox.height - image.y;
              newX = image.x;
              newY = image.y;
              break;
            case 'tr':
              newWidth = image.x - resizeStartBox.x;
              newHeight = resizeStartBox.y + resizeStartBox.height - image.y;
              newY = image.y;
              break;
            case 'br':
              newWidth = image.x - resizeStartBox.x;
              newHeight = image.y - resizeStartBox.y;
              break;
            case 'bl':
              newWidth = resizeStartBox.x + resizeStartBox.width - image.x;
              newHeight = image.y - resizeStartBox.y;
              newX = image.x;
              break;
            case 't':
              newHeight = resizeStartBox.y + resizeStartBox.height - image.y;
              newY = image.y;
              break;
            case 'r':
              newWidth = image.x - resizeStartBox.x;
              break;
            case 'b':
              newHeight = image.y - resizeStartBox.y;
              break;
            case 'l':
              newWidth = resizeStartBox.x + resizeStartBox.width - image.x;
              newX = image.x;
              break;
          }
          
          // Ensure minimum size
          newWidth = Math.max(20, newWidth);
          newHeight = Math.max(20, newHeight);
          
          console.log('[AnnotationCanvas] New size:', { newX, newY, newWidth, newHeight });
          
          return { ...ann, x: newX, y: newY, width: newWidth, height: newHeight };
        }
        return ann;
      }));
      return;
    }
    
    // Handle viewport panning
    if (isPanning && panStart && panStartOffset && activeTool === 'pan') {
      const deltaX = e.clientX - panStart.x;
      const deltaY = e.clientY - panStart.y;
      const newOffsetX = panStartOffset.x + deltaX;
      const newOffsetY = panStartOffset.y + deltaY;
      
      setOffset({ x: newOffsetX, y: newOffsetY });
      return;
    }
    
    // Handle pan dragging
    if (isDragging && dragOffset && activeTool === 'pan') {
      const image = screenToImage(e.clientX, e.clientY);
      console.log('[AnnotationCanvas] DRAGGING ANNOTATION - image:', image, 'dragOffset:', dragOffset, 'selectedId:', selectedId);
      
      onAnnotationsChange(prev => prev.map(ann => {
        if (ann.id === selectedId) {
          console.log('[AnnotationCanvas] Found annotation to move:', ann.id, ann.type);
          if (ann.type === 'bbox' || ann.type === 'cuboid') {
            console.log('[AnnotationCanvas] Moving bbox/cuboid - old pos:', { x: ann.x, y: ann.y });
            const newX = image.x - dragOffset.x;
            const newY = image.y - dragOffset.y;
            console.log('[AnnotationCanvas] Moving bbox/cuboid - new pos:', { newX, newY });
            return { ...ann, x: newX, y: newY };
          } else if (ann.type === 'ellipse') {
            const newX = image.x - dragOffset.x;
            const newY = image.y - dragOffset.y;
            console.log('[AnnotationCanvas] Moving ellipse to:', { newX, newY });
            return { ...ann, cx: newX, cy: newY };
          } else if (ann.type === 'point') {
            const newX = image.x - dragOffset.x;
            const newY = image.y - dragOffset.y;
            console.log('[AnnotationCanvas] Moving point to:', { newX, newY });
            return { ...ann, x: newX, y: newY };
          } else if (ann.type === 'polygon' || ann.type === 'polyline') {
            // Move all points by the same delta
            const deltaX = image.x - dragOffset.x;
            const deltaY = image.y - dragOffset.y;
            console.log('[AnnotationCanvas] Moving polygon/polyline by:', { deltaX, deltaY });
            
            // Calculate the original first point position
            const originalFirstPoint = (ann as any).points[0];
            const moveDeltaX = deltaX - originalFirstPoint.x;
            const moveDeltaY = deltaY - originalFirstPoint.y;
            
            return { 
              ...ann, 
              points: ann.points.map((point: any) => ({
                x: point.x + moveDeltaX,
                y: point.y + moveDeltaY
              }))
            };
          }
        }
        return ann;
      }));
      return;
    }
    
    if (!isDrawing) return;
    const image = screenToImage(e.clientX, e.clientY);

    // Tool-Specific Updates
    switch (activeTool) {
      case 'brush':
        setBrushPoints(prev => [...prev, image]);
        break;

      case 'cuboid':
        if (activeDrawing) {
          if (activeDrawing.step === 1 && drawStart) {
            const width = Math.abs(image.x - drawStart.x);
            const height = Math.abs(image.y - drawStart.y);
            const x = Math.min(image.x, drawStart.x);
            const y = Math.min(image.y, drawStart.y);
            setDrawPreview({ x, y, width, height });
            setActiveDrawing(prev => ({ ...prev, x, y, width, height }));
          } else if (activeDrawing.step === 2) {
            setActiveDrawing(prev => ({ ...prev, dx: image.x - prev.x, dy: image.y - prev.y }));
          }
        }
        break;

      case 'bbox':
      case 'ellipse':
        if (drawStart) {
          const width = Math.abs(image.x - drawStart.x);
          const height = Math.abs(image.y - drawStart.y);
          const x = Math.min(image.x, drawStart.x);
          const y = Math.min(image.y, drawStart.y);
          setDrawPreview({ x, y, width, height });
        }
        break;
    }
  }, [isDrawing, activeTool, activeDrawing, drawStart, screenToImage, isResizing, resizeHandle, resizeStartBox, onAnnotationsChange, isDragging, dragOffset, selectedId]);

  // Handle mouse up - Tool-Specific Architecture
  const handlePointerUp = useCallback(() => {
    // Reset resizing state
    if (isResizing) {
      console.log('[AnnotationCanvas] Resizing completed');
      setIsResizing(false);
      setResizeHandle(null);
      setResizeStartBox(null);
    }
    
    // Reset panning state
    if (isPanning) {
      setIsPanning(false);
      setPanStart(null);
      setPanStartOffset(null);
    }
    
    // Reset dragging state
    if (isDragging) {
      setIsDragging(false);
      setDragOffset(null);
    }
    
    // Tool-Specific Saving
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
          // Brush çizimini savedBrushes'e ekle
          setSavedBrushes(prev => [...prev, newBrush]);
          // History'e ekle
          setHistory(prev => [...prev, { type: 'brush', data: newBrush }]);
          setBrushPoints([]);
          setIsDrawing(false);
        }
        break;

      case 'bbox':
        if (drawPreview && drawPreview.width > MIN_BOX_SIZE) {
          const newBbox = { 
            id: `bbox-${Date.now()}`, 
            type: 'bbox', 
            ...drawPreview, 
            label: '' 
          };
          onAnnotationsChange(prev => [...prev, newBbox]);
          // History'e ekle
          setHistory(prev => [...prev, { type: 'annotation', data: newBbox }]);
          // Otomatik olarak yeni çizileni seç
          onSelect?.(newBbox.id);
        }
        break;

      case 'ellipse':
        if (drawPreview && drawPreview.width > MIN_BOX_SIZE) {
          const newEllipse = { 
            id: `ellipse-${Date.now()}`, 
            type: 'ellipse',
            cx: drawPreview.x + drawPreview.width / 2,
            cy: drawPreview.y + drawPreview.height / 2,
            rx: drawPreview.width / 2,
            ry: drawPreview.height / 2,
            label: ''
          };
          onAnnotationsChange(prev => [...prev, newEllipse]);
          // History'e ekle
          setHistory(prev => [...prev, { type: 'annotation', data: newEllipse }]);
          // Otomatik olarak yeni çizileni seç
          onSelect?.(newEllipse.id);
        }
        break;

      case 'cuboid':
        if (activeDrawing?.step === 1) {
          setActiveDrawing(prev => ({ ...prev!, step: 2 }));
          setDrawPreview(null);
          return; // RESETLEME YAPMA, sadece step 2'ye geç, setIsDrawing false yapma
        } else if (activeDrawing?.step === 2) {
          const newCuboid = { 
            ...activeDrawing, 
            id: `cuboid-${Date.now()}`, 
            type: 'cuboid', 
            label: '' 
          };
          onAnnotationsChange(prev => [...prev, newCuboid]);
          // History'e ekle
          setHistory(prev => [...prev, { type: 'annotation', data: newCuboid }]);
          // Otomatik olarak yeni çizileni seç
          console.log('[AnnotationCanvas] Cuboid completed - selecting:', newCuboid.id);
          onSelect?.(newCuboid.id);
          setActiveDrawing(null);
          setIsDrawing(false);
        }
        break;
    }

    // Global Reset
    setIsDrawing(false);
    setDrawPreview(null);
    setDrawStart(null);
    setIsDragging(false);
    setIsPanning(false);
    setIsResizing(false);
    setDragOffset(null);
    setPanStart(null);
    setPanStartOffset(null);
    setResizeHandle(null);
    document.body.style.cursor = '';
  }, [activeTool, brushPoints, brushColor, drawPreview, selectedLabel, activeDrawing, onAnnotationsChange]);
                
  
           
  
  // Helper function to get handle at position
  const getHandleAt = (x: number, y: number, box: BboxAnnotation): BboxHandle | null => {
    const handles = [
      { h: 'tl' as BboxHandle, cx: box.x, cy: box.y },
      { h: 'tr' as BboxHandle, cx: box.x + box.width, cy: box.y },
      { h: 'br' as BboxHandle, cx: box.x + box.width, cy: box.y + box.height },
      { h: 'bl' as BboxHandle, cx: box.x, cy: box.y + box.height },
      { h: 't' as BboxHandle, cx: box.x + box.width / 2, cy: box.y },
      { h: 'r' as BboxHandle, cx: box.x + box.width, cy: box.y + box.height / 2 },
      { h: 'b' as BboxHandle, cx: box.x + box.width / 2, cy: box.y + box.height },
      { h: 'l' as BboxHandle, cx: box.x, cy: box.y + box.height / 2 },
    ];

    for (const { h, cx, cy } of handles) {
      if (Math.abs(x - cx) <= HANDLE_HIT_AREA && Math.abs(y - cy) <= HANDLE_HIT_AREA) {
        return h;
      }
    }
    return null;
  };

  // Handle keyboard delete
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' && selectedId) {
        e.preventDefault();
        onAnnotationsChange(annotations.filter(a => a.id !== selectedId));
        onSelect?.(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, annotations, onAnnotationsChange, onSelect, activeTool, brushPoints, brushColor, isPaletteOpen]);

  return (
    <View style={styles.container}>
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          overflow: 'hidden', // Critical: prevent scrolling
          backgroundColor: '#1e293b',
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* Brush Color Picker - Toolbar entegrasyonu */}
        <div
          style={{
            position: 'absolute',
            top: 10,
            left: 10, // Sol tarafta toolbar ile aynı hizada
            zIndex: 1001,
            display: 'flex',
            gap: '8px', // Butonlar arası boşluk
            alignItems: 'center',
          }}
        >
          {/* Toolbar Butonu ve Palet Kapsayıcısı */}
          <div style={{ position: 'relative' }}>
            {/* Toolbar Butonu */}
            <button
              onClick={() => {
                if (activeTool !== 'brush') {
                  onToolChange?.('brush');
                }
                setIsPaletteOpen(!isPaletteOpen);
              }}
              style={{
                width: '32px', // Küçültüldü
                height: '32px', // Küçültüldü
                backgroundColor: brushColor,
                border: activeTool === 'brush' ? '3px solid #2563eb' : '2px solid white',
                borderRadius: '6px', // Küçültüldü
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
                transform: isPaletteOpen ? 'scale(1.1)' : 'scale(1)',
              }}
              title="Fırça aracı - Renk seçimi"
            >
              <svg
                width="20" // Küçültüldü
                height="20" // Küçültüldü
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
            </button>
            
            {/* Hamburger Menü - Sadece Brush Aktifken */}
            {activeTool === 'brush' && isPaletteOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: '37px', // Küçültülmüş butonun altında
                  left: '0px',
                  backgroundColor: 'white',
                  padding: '8px', // Küçültüldü
                  zIndex: 10000,
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '6px', // Küçültüldü
                  boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                  borderRadius: '6px', // Küçültüldü
                  border: '1px solid #e5e7eb',
                  minWidth: '180px', // Küçültüldü
                  animation: 'fadeIn 0.2s ease-in-out',
                }}
              >
                {[
                  { color: '#ff0000', name: 'Kırmızı' },
                  { color: '#00ff00', name: 'Yeşil' },
                  { color: '#0000ff', name: 'Mavi' },
                  { color: '#ffff00', name: 'Sarı' },
                  { color: '#ffa500', name: 'Turuncu' },
                  { color: '#ff00ff', name: 'Mor' },
                  { color: '#ffc0cb', name: 'Pembe' },
                  { color: '#00ffff', name: 'Turkuaz' },
                  { color: '#8b4513', name: 'Kahverengi' },
                  { color: '#000000', name: 'Siyah' },
                  { color: '#ffffff', name: 'Beyaz' },
                  { color: '#808080', name: 'Gri' },
                ].map((item) => (
                  <button
                    key={item.color}
                    onClick={() => {
                      setBrushColor(item.color);
                      setIsPaletteOpen(false);
                    }}
                    style={{
                      width: '28px', // Küçültüldü
                      height: '28px', // Küçültüldü
                      backgroundColor: item.color,
                      border: brushColor === item.color ? '3px solid #2563eb' : '2px solid #e5e7eb',
                      borderRadius: '4px', // Küçültüldü
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      transform: brushColor === item.color ? 'scale(1.1)' : 'scale(1)',
                      boxShadow: brushColor === item.color ? '0 2px 8px rgba(37, 99, 235, 0.3)' : '0 1px 3px rgba(0,0,0,0.1)',
                    }}
                    title={item.name}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.15)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = brushColor === item.color ? 'scale(1.1)' : 'scale(1)';
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
        
        {/* Image Layer - Bottom layer */}
        <img
          ref={imgRef}
          src={imageSource?.uri || imageUrl || ''}
          alt="annotation"
          draggable={false}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: imageSize?.w || '100%', // Use natural image width
            height: imageSize?.h || '100%', // Use natural image height
            objectFit: 'none', // Manual scale/offset management
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: '0 0', // Critical: top-left origin
            pointerEvents: 'none',
          }}
        />
        
        {/* SVG Layer - Middle layer with same transform */}
        <svg
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: imageSize?.w || '100%',
            height: imageSize?.h || '100%',
            cursor: activeTool === 'pan' ? (isPanning ? 'grabbing' : 'grab') : (activeTool === 'bbox' || activeTool === 'points' ? 'crosshair' : 'default'),
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: '0 0',
            pointerEvents: 'auto', // Always auto to allow resize handles
          }}
          viewBox={imageSize ? `0 0 ${imageSize.w} ${imageSize.h}` : '0 0 100 100'}
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Render annotations */}
          {annotations.map((annotation) => {
            if (annotation.type === 'polygon') {
              const sel = annotation.id === selectedId;
              const color = getLabelColor(annotation.label);
              const pointsAttr = annotation.points
                .map(p => `${p.x},${p.y}`)
                .join(' ');
              
              return (
                <g key={annotation.id} style={{ pointerEvents: 'none' }}>
                  <polygon
                    points={pointsAttr}
                    stroke={color}
                    strokeWidth={3}
                    fill={color}
                    fillOpacity={0.25}
                    style={{
                      vectorEffect: 'non-scaling-stroke',
                      pointerEvents: 'auto',
                      cursor: activeTool === 'select' ? 'move' : 'default',
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (activeTool !== 'pan') {
                        onSelect?.(annotation.id);
                      }
                    }}
                  />
                  
                  {/* Label text near the first vertex */}
                  {(() => {
                    const labelText =
                      typeof annotation.label === 'object'
                        ? (annotation.label as any).name ||
                          (annotation.label as any).label ||
                          ''
                        : String(annotation.label ?? '');
                    
                    return labelText.trim() ? (
                      <text
                        x={annotation.points[0].x + 4}
                        y={annotation.points[0].y - 4}
                        fill="#FFFFFF"
                        fontSize={12 / scale}
                        fontWeight="bold"
                        style={{
                          pointerEvents: 'none',
                        }}
                      >
                        {labelText}
                      </text>
                    ) : null;
                  })()}
                  
                  {/* Permanent vertex points for saved polygon */}
                  {annotation.points.map((point, index) => (
                    <circle
                      key={`${annotation.id}-point-${index}`}
                      cx={point.x}
                      cy={point.y}
                      r={11}
                      fill={color}
                      stroke="#FFFFFF"
                      strokeWidth={2.5}
                      vectorEffect="non-scaling-stroke"
                      style={{
                        pointerEvents: 'none',
                        filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.35))',
                      }}
                    />
                  ))}
                </g>
              );
            }
            
            if (annotation.type === 'point') {
              const sel = annotation.id === selectedId;
              const color = getLabelColor(annotation.label);
              
              return (
                <g key={annotation.id} style={{ pointerEvents: 'none' }}>
                  {/* Point annotation */}
                  <circle
                    cx={annotation.x}
                    cy={annotation.y}
                    r={11}
                    fill={color}
                    stroke="#FFFFFF"
                    strokeWidth={3}
                    vectorEffect="non-scaling-stroke"
                    style={{
                      filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.35))',
                      cursor: 'pointer',
                      pointerEvents: 'auto',
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (activeTool !== 'pan') {
                        onSelect?.(annotation.id);
                      }
                    }}
                  />
                  
                  {/* Label text near the point */}
                  {(() => {
                    const labelText =
                      typeof annotation.label === 'object'
                        ? (annotation.label as any).name ||
                          (annotation.label as any).label ||
                          ''
                        : String(annotation.label ?? '');
                    
                    return labelText.trim() ? (
                      <text
                        x={annotation.x + 12}
                        y={annotation.y - 4}
                        fill="#FFFFFF"
                        fontSize={12 / scale}
                        fontWeight="bold"
                        style={{
                          pointerEvents: 'none',
                        }}
                      >
                        {labelText}
                      </text>
                    ) : null;
                  })()}
                </g>
              );
            }
            
            if (annotation.type === 'bbox') {
              const sel = annotation.id === selectedId;
              const color = getLabelColor(annotation.label);
              
              return (
                <g key={annotation.id} style={{ pointerEvents: 'none' }}>
                  {/* Bounding box with dynamic label color */}
                  <rect
                    x={annotation.x}
                    y={annotation.y}
                    width={annotation.width}
                    height={annotation.height}
                    stroke={getLabelColor(annotation.label)} // Dynamic color based on label
                    strokeWidth={3} // Increased thickness for better visibility
                    fill="none"
                    style={{
                      cursor: activeTool === 'select' ? 'move' : 'default',
                      vectorEffect: 'non-scaling-stroke', // Prevent thinning on zoom
                      filter: 'drop-shadow(0px 0px 2px rgba(0,0,0,0.5))', // Shadow for contrast
                      pointerEvents: 'auto', // Override group's pointerEvents
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (activeTool !== 'pan') {
                        onSelect?.(annotation.id);
                      }
                    }}
                  />
                  
                  {/* Label band with dynamic background - scale independent */}
                  {(() => {
                    const labelText =
                      typeof annotation.label === 'object'
                        ? (annotation.label as any).name ||
                          (annotation.label as any).label ||
                          ''
                        : String(annotation.label ?? '');
                    
                    return labelText.trim() ? (
                      <rect
                        x={annotation.x}
                        y={annotation.y - (16 / scale)} // Scale independent height
                        width={annotation.width}
                        height={16 / scale} // Scale independent height
                        fill={getLabelColor(annotation.label)} // Dynamic background color
                        style={{
                          pointerEvents: 'none', // Don't interfere with resizing
                        }}
                      />
                    ) : null;
                  })()}
                  
                  {/* Label text - scale independent */}
                  {(() => {
                    const labelText =
                      typeof annotation.label === 'object'
                        ? (annotation.label as any).name ||
                          (annotation.label as any).label ||
                          ''
                        : String(annotation.label ?? '');
                    
                    return labelText.trim() ? (
                      <text
                        x={annotation.x + (4 / scale)} // Scale independent padding
                        y={annotation.y - (4 / scale)} // Scale independent position
                        fill="#FFFFFF" // White text
                        fontSize={12 / scale} // Scale independent font size
                        fontWeight="bold"
                        style={{
                          pointerEvents: 'none', // Don't interfere with resizing
                        }}
                      >
                        {labelText}
                      </text>
                    ) : null;
                  })()}
                  
                  {/* 8 Resize handles - CVAT style with invisible but wide hitbox */}
                  {sel && (
                    <>
                      {console.log('[AnnotationCanvas] Rendering resize handles for annotation:', annotation.id, 'sel:', sel)}
                      {[
                        { handle: 'tl' as BboxHandle, x: annotation.x, y: annotation.y, cursor: 'nwse-resize' },
                        { handle: 'tr' as BboxHandle, x: annotation.x + annotation.width, y: annotation.y, cursor: 'nesw-resize' },
                        { handle: 'br' as BboxHandle, x: annotation.x + annotation.width, y: annotation.y + annotation.height, cursor: 'nwse-resize' },
                        { handle: 'bl' as BboxHandle, x: annotation.x, y: annotation.y + annotation.height, cursor: 'nesw-resize' },
                        { handle: 't' as BboxHandle, x: annotation.x + annotation.width / 2, y: annotation.y, cursor: 'ns-resize' },
                        { handle: 'r' as BboxHandle, x: annotation.x + annotation.width, y: annotation.y + annotation.height / 2, cursor: 'ew-resize' },
                        { handle: 'b' as BboxHandle, x: annotation.x + annotation.width / 2, y: annotation.y + annotation.height, cursor: 'ns-resize' },
                        { handle: 'l' as BboxHandle, x: annotation.x, y: annotation.y + annotation.height / 2, cursor: 'ew-resize' },
                      ].map(({ handle, x, y, cursor }) => (
                        <g key={handle}>
                          {/* Invisible wide hitbox for easier interaction */}
                          <rect
                            x={x - (HANDLE_HIT_AREA / (2 * scale))} // Scale independent hitbox
                            y={y - (HANDLE_HIT_AREA / (2 * scale))} // Scale independent hitbox
                            width={HANDLE_HIT_AREA / scale} // Scale independent hitbox
                            height={HANDLE_HIT_AREA / scale} // Scale independent hitbox
                            fill="transparent"
                            style={{
                              cursor,
                              userSelect: 'none',
                            }}
                            pointerEvents="none" // Sadece görsel, event yok
                          />
                          {/* Visible small handle */}
                          <rect
                            x={x - (HANDLE_SIZE / (2 * scale))} // Scale independent size
                            y={y - (HANDLE_SIZE / (2 * scale))} // Scale independent size
                            width={HANDLE_SIZE / scale} // Scale independent size
                            height={HANDLE_SIZE / scale} // Scale independent size
                            fill={getLabelColor(annotation.label)} // Same color as box
                            stroke="#FFFFFF" // Thin white border
                            strokeWidth={1 / scale} // Scale independent stroke
                            vectorEffect="non-scaling-stroke" // Prevent thinning on zoom
                            style={{
                              cursor,
                              userSelect: 'none',
                            }}
                            pointerEvents="none" // Let hitbox handle events
                          />
                        </g>
                      ))}
                    </>
                  )}
                </g>
              );
            }
            
            if ((annotation as any).type === 'ellipse') {
              const sel = (annotation as any).id === selectedId;
              const color = getLabelColor((annotation as any).label);
              
              return (
                <g key={(annotation as any).id} style={{ pointerEvents: 'none' }}>
                  <ellipse
                    cx={(annotation as any).cx || (annotation as any).x}
                    cy={(annotation as any).cy || (annotation as any).y}
                    rx={(annotation as any).rx || (annotation as any).radiusX}
                    ry={(annotation as any).ry || (annotation as any).radiusY}
                    stroke={color}
                    strokeWidth={3}
                    fill={color}
                    fillOpacity={0.25}
                    style={{
                      vectorEffect: 'non-scaling-stroke',
                      pointerEvents: 'auto',
                      cursor: activeTool === 'select' ? 'move' : 'default',
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (activeTool !== 'pan') {
                        onSelect?.((annotation as any).id);
                      }
                    }}
                  />
                  
                  {/* Label text near the top of ellipse */}
                  {(() => {
                    const labelText =
                      typeof (annotation as any).label === 'object'
                        ? ((annotation as any).label as any).name ||
                          ((annotation as any).label as any).label ||
                          ''
                        : String((annotation as any).label ?? '');
                    
                    return labelText.trim() ? (
                      <text
                        x={(annotation as any).cx || (annotation as any).x}
                        y={(annotation as any).cy || (annotation as any).y - ((annotation as any).ry || (annotation as any).radiusY) - 4}
                        fill="#FFFFFF"
                        fontSize={12 / scale}
                        fontWeight="bold"
                        textAnchor="middle"
                        style={{
                          pointerEvents: 'none',
                        }}
                      >
                        {labelText}
                      </text>
                    ) : null;
                  })()}
                </g>
              );
            }
            
            if ((annotation as any).type === 'cuboid') {
              const sel = (annotation as any).id === selectedId;
              console.log('[AnnotationCanvas] Cuboid render - annotation.id:', (annotation as any).id, 'selectedId:', selectedId, 'sel:', sel);
              const color = getLabelColor((annotation as any).label);
              const { x, y, width, height, dx, dy } = annotation as any;
              
              // Cuboid render güvenliği
              if (!x || dx === undefined) return null;
              
              return (
                <g key={(annotation as any).id} style={{ pointerEvents: 'none' }}>
                  {/* Front face */}
                  <rect
                    x={x}
                    y={y}
                    width={width}
                    height={height}
                    stroke={color}
                    strokeWidth={2}
                    fill={color}
                    fillOpacity={0.3}
                    style={{
                      vectorEffect: 'non-scaling-stroke',
                      pointerEvents: 'auto',
                    }}
                  />
                  
                  {/* Back face */}
                  <rect
                    x={x + dx}
                    y={y + dy}
                    width={width}
                    height={height}
                    stroke={color}
                    strokeWidth={2}
                    fill={color}
                    fillOpacity={0.2}
                    style={{
                      vectorEffect: 'non-scaling-stroke',
                      pointerEvents: 'auto',
                    }}
                  />
                  
                  {/* Connecting lines */}
                  {[
                    [
                      { x: x, y: y },
                      { x: x + dx, y: y + dy }
                    ],
                    [
                      { x: x + width, y: y },
                      { x: x + width + dx, y: y + dy }
                    ],
                    [
                      { x: x + width, y: y + height },
                      { x: x + width + dx, y: y + height + dy }
                    ],
                    [
                      { x: x, y: y + height },
                      { x: x + dx, y: y + height + dy }
                    ],
                  ].map((points, index) => (
                    <line
                      key={`edge-${index}`}
                      x1={points[0].x}
                      y1={points[0].y}
                      x2={points[1].x}
                      y2={points[1].y}
                      stroke={color}
                      strokeWidth={2}
                      style={{
                        vectorEffect: 'non-scaling-stroke',
                      }}
                    />
                  ))}
                  
                  {/* Label text near front face */}
                  {(() => {
                    const labelText =
                      typeof (annotation as any).label === 'object'
                        ? ((annotation as any).label as any).name ||
                          ((annotation as any).label as any).label ||
                          ''
                        : String((annotation as any).label ?? '');
                    
                    return labelText.trim() ? (
                      <text
                        x={x}
                        y={y - 4}
                        fill="#FFFFFF"
                        fontSize={12 / scale}
                        fontWeight="bold"
                        style={{
                          pointerEvents: 'none',
                        }}
                      >
                        {labelText}
                      </text>
                    ) : null;
                  })()}
                  
                  {/* 8 Resize handles for cuboid - CVAT style */}
                  {sel && (
                    <>
                      {[
                        { handle: 'tl' as BboxHandle, x: x, y: y, cursor: 'nwse-resize' },
                        { handle: 'tr' as BboxHandle, x: x + width, y: y, cursor: 'nesw-resize' },
                        { handle: 'br' as BboxHandle, x: x + width, y: y + height, cursor: 'nwse-resize' },
                        { handle: 'bl' as BboxHandle, x: x, y: y + height, cursor: 'nesw-resize' },
                        { handle: 't' as BboxHandle, x: x + width / 2, y: y, cursor: 'ns-resize' },
                        { handle: 'r' as BboxHandle, x: x + width, y: y + height / 2, cursor: 'ew-resize' },
                        { handle: 'b' as BboxHandle, x: x + width / 2, y: y + height, cursor: 'ns-resize' },
                        { handle: 'l' as BboxHandle, x: x, y: y + height / 2, cursor: 'ew-resize' },
                      ].map(({ handle, x: hx, y: hy, cursor }) => (
                        <g key={handle}>
                          {/* Invisible wide hitbox for easier interaction */}
                          <rect
                            x={hx - (HANDLE_HIT_AREA / (2 * scale))} // Scale independent hitbox
                            y={hy - (HANDLE_HIT_AREA / (2 * scale))} // Scale independent hitbox
                            width={HANDLE_HIT_AREA / scale} // Scale independent hitbox
                            height={HANDLE_HIT_AREA / scale} // Scale independent hitbox
                            fill="transparent"
                            style={{
                              cursor,
                              userSelect: 'none',
                            }}
                            pointerEvents="auto" // Cuboid için tıklanabilir olmalı
                          />
                          {/* Visible small handle */}
                          <rect
                            x={hx - (HANDLE_SIZE / (2 * scale))} // Scale independent size
                            y={hy - (HANDLE_SIZE / (2 * scale))} // Scale independent size
                            width={HANDLE_SIZE / scale} // Scale independent size
                            height={HANDLE_SIZE / scale} // Scale independent size
                            fill={color} // Same color as cuboid
                            stroke="#FFFFFF" // Thin white border
                            strokeWidth={1 / scale} // Scale independent stroke
                            vectorEffect="non-scaling-stroke" // Prevent thinning on zoom
                            style={{
                              cursor,
                              userSelect: 'none',
                            }}
                            pointerEvents="none" // Let hitbox handle events
                          />
                        </g>
                      ))}
                    </>
                  )}
                </g>
              );
            }
            
            if (annotation.type === 'brush') {
              return (
                <polyline
                  key={annotation.id}
                  points={annotation.points.map(p => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke={annotation.color || '#ff0000'}
                  strokeWidth={10 / scale} // Sabit fırça kalınlığı
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                  onClick={() => onSelect?.(annotation.id)}
                />
              );
            }
            
            if (annotation.type === 'polyline') {
              const sel = annotation.id === selectedId;
              const color = getLabelColor(annotation.label);
              const points = annotation.points;
              
              return (
                <g key={annotation.id} style={{ pointerEvents: 'none' }}>
                  {/* Çizgi: <polyline> element */}
                  <polyline
                    points={points.map(p => `${p.x},${p.y}`).join(' ')}
                    stroke={color}
                    strokeWidth={2}
                    fill="none"
                    style={{
                      vectorEffect: 'non-scaling-stroke',
                      pointerEvents: 'auto',
                      cursor: activeTool === 'select' ? 'pointer' : 'default',
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (activeTool !== 'pan') {
                        onSelect?.(annotation.id);
                      }
                    }}
                  />
                  
                  {/* Her nokta için bir <circle> */}
                  {points.map((point: any, index: number) => (
                    <circle
                      key={`vertex-${index}`}
                      cx={point.x}
                      cy={point.y}
                      r={4 / scale}
                      fill={color}
                      stroke="#ffffff"
                      strokeWidth={1 / scale}
                      style={{
                        vectorEffect: 'non-scaling-stroke',
                        pointerEvents: 'none',
                      }}
                    />
                  ))}
                  
                  {/* Label text */}
                  {(() => {
                    const labelText =
                      typeof annotation.label === 'object'
                        ? (annotation.label as any).name ||
                          (annotation.label as any).label ||
                          ''
                        : String(annotation.label ?? '');
                    
                    return labelText.trim() && points.length >= 2 ? (
                      <text
                        x={points[0].x}
                        y={points[0].y - 8}
                        fill="#FFFFFF"
                        fontSize={12 / scale}
                        fontWeight="bold"
                        style={{
                          pointerEvents: 'none',
                        }}
                      >
                        {labelText}
                      </text>
                    ) : null;
                  })()}
                </g>
              );
            }
            
            return null;
          })}
          
          {/* Drawing preview - always blue for focus */}
          {drawPreview && (
            <>
              {activeTool === 'ellipse' ? (
                // Ellipse preview - show ellipse while dragging
                <ellipse 
                  cx={drawPreview.x + drawPreview.width / 2} 
                  cy={drawPreview.y + drawPreview.height / 2} 
                  rx={drawPreview.width / 2} 
                  ry={drawPreview.height / 2} 
                  stroke="#3b82f6" 
                  strokeDasharray="5 5" 
                  fill="none" 
                  strokeWidth={2 / scale} 
                />
              ) : (
                // BBox preview for other tools
                <rect
                  x={drawPreview.x}
                  y={drawPreview.y}
                  width={drawPreview.width}
                  height={drawPreview.height}
                  stroke="#3b82f6" // Blue for drawing focus
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  fill="none"
                  style={{
                    vectorEffect: 'non-scaling-stroke', // Prevent thinning on zoom
                  }}
                />
              )}
            </>
          )}
          
          {/* Cuboid depth preview */}
          {(() => {
            // Global güvenlik (Crash-Proof)
            const { 
              x = 0, 
              y = 0, 
              width = 0, 
              height = 0, 
              dx = 0, 
              dy = 0, 
              step = 1 
            } = activeDrawing || {};
            
            return activeDrawing?.tool === 'cuboid' ? (
              <>
                {step === 2 && (
                  <>
                    {/* Front Face */}
                    <rect
                      x={x}
                      y={y}
                      width={width}
                      height={height}
                      stroke="green"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      fill="green"
                      fillOpacity={0.1}
                      style={{
                        vectorEffect: 'non-scaling-stroke',
                      }}
                    />
                    
                    {/* Back Face */}
                    <rect
                      x={x + dx}
                      y={y + dy}
                      width={width}
                      height={height}
                      stroke="green"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      fill="green"
                      fillOpacity={0.05}
                      style={{
                        vectorEffect: 'non-scaling-stroke',
                      }}
                    />
                    
                    {/* 4 Connection Lines */}
                    {/* 1. Sol Üst: (x,y)->(x+dx,y+dy) */}
                    <line
                      x1={x}
                      y1={y}
                      x2={x + dx}
                      y2={y + dy}
                      stroke="green"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      style={{
                        vectorEffect: 'non-scaling-stroke',
                      }}
                    />
                    {/* 2. Sağ Üst: (x+w,y)->(x+w+dx,y+dy) */}
                    <line
                      x1={x + width}
                      y1={y}
                      x2={x + width + dx}
                      y2={y + dy}
                      stroke="green"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      style={{
                        vectorEffect: 'non-scaling-stroke',
                      }}
                    />
                    {/* 3. Sol Alt: (x,y+h)->(x+dx,y+h+dy) */}
                    <line
                      x1={x}
                      y1={y + height}
                      x2={x + dx}
                      y2={y + height + dy}
                      stroke="green"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      style={{
                        vectorEffect: 'non-scaling-stroke',
                      }}
                    />
                    {/* 4. Sağ Alt: (x+w,y+h)->(x+w+dx,y+h+dy) */}
                    <line
                      x1={x + width}
                      y1={y + height}
                      x2={x + width + dx}
                      y2={y + height + dy}
                      stroke="green"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      style={{
                        vectorEffect: 'non-scaling-stroke',
                      }}
                    />
                  </>
                )}
              </>
            ) : null;
          })()}
          
          {/* Polyline Render */}
          {isDrawingPolyline && polylinePoints.length > 0 && (
            <g>
              <polyline points={polylinePoints.map(p => `${p.x},${p.y}`).join(' ')} stroke="yellow" strokeWidth={2} fill="none" />
              {polylinePoints.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={4} fill="yellow" stroke="white" />)}
              {polylinePreviewPoint && <line x1={polylinePoints[polylinePoints.length-1].x} y1={polylinePoints[polylinePoints.length-1].y} x2={polylinePreviewPoint.x} y2={polylinePreviewPoint.y} stroke="yellow" strokeDasharray="5,5" />}
            </g>
          )}

          {/* Cuboid Preview Render */}
          {activeDrawing?.tool === 'cuboid' && (
            <g stroke="green" strokeWidth={2} fill="rgba(0,255,0,0.1)">
              <rect x={activeDrawing.x} y={activeDrawing.y} width={activeDrawing.width} height={activeDrawing.height} />
              {activeDrawing.step === 2 && (
                <>
                  <rect x={activeDrawing.x + activeDrawing.dx} y={activeDrawing.y + activeDrawing.dy} width={activeDrawing.width} height={activeDrawing.height} />
                  <line x1={activeDrawing.x} y1={activeDrawing.y} x2={activeDrawing.x + activeDrawing.dx} y2={activeDrawing.y + activeDrawing.dy} />
                  <line x1={activeDrawing.x + activeDrawing.width} y1={activeDrawing.y} x2={activeDrawing.x + activeDrawing.width + activeDrawing.dx} y2={activeDrawing.y + activeDrawing.dy} />
                  <line x1={activeDrawing.x} y1={activeDrawing.y + activeDrawing.height} x2={activeDrawing.x + activeDrawing.dx} y2={activeDrawing.y + activeDrawing.height + activeDrawing.dy} />
                  <line x1={activeDrawing.x} y1={activeDrawing.y + activeDrawing.height} x2={activeDrawing.x + activeDrawing.width + activeDrawing.dx} y2={activeDrawing.y + activeDrawing.height + activeDrawing.dy} />
                </>
              )}
            </g>
          )}
          
          {/* Polygon drawing preview */}
          {isDrawingPolygon && polygonPoints.length > 0 && (
            <>
              {/* Draw lines between existing points */}
              {polygonPoints.map((point, index) => {
                if (index === 0) return null;
                const prevPoint = polygonPoints[index - 1];
                return (
                  <line
                    key={`line-${index}`}
                    x1={prevPoint.x}
                    y1={prevPoint.y}
                    x2={point.x}
                    y2={point.y}
                    stroke="#3b82f6"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    style={{
                      vectorEffect: 'non-scaling-stroke',
                    }}
                  />
                );
              })}
              
              {/* Draw points */}
              {polygonPoints.map((point, index) => (
                <circle
                  key={`point-${index}`}
                  cx={point.x}
                  cy={point.y}
                  r={11}
                  fill="#3b82f6"
                  stroke="#FFFFFF"
                  strokeWidth={2.5}
                />
              ))}
            </>
          )}
          
          {/* Brush Önizleme */}
          {activeTool === 'brush' && brushPoints.length > 0 && (
            <polyline
              points={brushPoints.map(p => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke={brushColor}
              strokeWidth={10 / scale}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          
          {/* Kaydedilmiş Brush Çizimleri */}
          {savedBrushes.map((brush) => (
            <polyline
              key={brush.id}
              points={brush.points.map(p => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke={brush.color}
              strokeWidth={10 / scale}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ pointerEvents: 'auto', cursor: 'pointer' }}
              onClick={() => onSelect?.(brush.id)}
            />
          ))}
          
          {/* Polyline drawing preview */}
          {isDrawingPolyline && polylinePoints.length > 0 && (
            <>
              {/* Draw lines between existing points */}
              {polylinePoints.map((point, index) => {
                if (index === 0) return null;
                const prevPoint = polylinePoints[index - 1];
                return (
                  <line
                    key={`polyline-line-${index}`}
                    x1={prevPoint.x}
                    y1={prevPoint.y}
                    x2={point.x}
                    y2={point.y}
                    stroke="#3b82f6"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    style={{
                      vectorEffect: 'non-scaling-stroke',
                    }}
                  />
                );
              })}
              
              {/* Draw rubber-band line to current mouse position */}
              {polylinePreviewPoint && (
                <line
                  key="polyline-rubber-band"
                  x1={polylinePoints[polylinePoints.length - 1].x}
                  y1={polylinePoints[polylinePoints.length - 1].y}
                  x2={polylinePreviewPoint.x}
                  y2={polylinePreviewPoint.y}
                  stroke="#3b82f6"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  style={{
                    vectorEffect: 'non-scaling-stroke',
                  }}
                />
              )}
              
              {/* Draw points */}
              {polylinePoints.map((point, index) => (
                <circle
                  key={`polyline-point-${index}`}
                  cx={point.x}
                  cy={point.y}
                  r={11}
                  fill="#3b82f6"
                  stroke="#FFFFFF"
                  strokeWidth={2.5}
                />
              ))}
              
              {/* Draw preview point at mouse position */}
              {polylinePreviewPoint && (
                <circle
                  key="polyline-preview-point"
                  cx={polylinePreviewPoint.x}
                  cy={polylinePreviewPoint.y}
                  r={11}
                  fill="#3b82f6"
                  stroke="#FFFFFF"
                  strokeWidth={2.5}
                  fillOpacity={0.5}
                />
              )}
            </>
          )}
        </svg>
        
        {/* Interaction Layer - Top transparent layer - ALWAYS ACTIVE */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: '100%', // Full container width
            height: '100%', // Full container height
            cursor: activeTool === 'pan' ? (isPanning ? 'grabbing' : 'grab') : (activeTool === 'bbox' || activeTool === 'points' ? 'crosshair' : 'default'),
            touchAction: 'none',
            pointerEvents: 'auto', // ALWAYS ACTIVE - manages all events
          }}
          onPointerDown={(e) => {
            e.preventDefault(); // Prevent native drag
            // e.stopPropagation(); // Stop event bubbling - REMOVED to allow resize handles
            handlePointerDown(e);
          }}
          onPointerMove={(e) => {
            e.preventDefault(); // Prevent native drag
            handlePointerMove(e);
          }}
          onPointerUp={(e) => {
            e.preventDefault(); // Prevent native drag
            if ((e.currentTarget as HTMLDivElement).hasPointerCapture(e.pointerId)) {
              (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
            }
            handlePointerUp();
          }}
          onPointerLeave={(e) => {
            e.preventDefault(); // Prevent native drag
            if ((e.currentTarget as HTMLDivElement).hasPointerCapture(e.pointerId)) {
              (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
            }
            handlePointerUp();
          }}
          onContextMenu={(e) => {
            e.preventDefault(); // Prevent browser context menu
            
            // Fırça aracını engelle
            if (activeTool === 'brush') return;
            
            // Handle polyline completion - finish polyline with double click
            if (activeTool === 'polyline' && isDrawingPolyline && polylinePoints.length >= 2) {
              const newPolyline: PolylineAnnotation = {
                id: `polyline-${Date.now()}`,
                type: 'polyline',
                points: polylinePoints,
                label: '',
              };
              onAnnotationsChange([...annotations, newPolyline]);
              setIsDrawingPolyline(false);
              setPolylinePoints([]);
            }
            
            // Polyline undo - son noktayı sil
            if (activeTool === 'polyline' && isDrawingPolyline && polylinePoints.length > 0) {
              setPolylinePoints(prev => prev.slice(0, -1));
              
              // Eğer hiç nokta kalmadıysa çizim modundan çık
              if (polylinePoints.length === 1) {
                setIsDrawingPolyline(false);
                setPolylinePoints([]);
              }
              return; // Tarayıcı menüsünün açılmasını engellemiş oluyoruz
            }
            
            // Handle polygon undo - remove last point
            if (activeTool === 'polygon' && isDrawingPolygon && polygonPoints.length > 0) {
              setPolygonPoints(prev => prev.slice(0, -1));
              
              // If only one point left, cancel drawing
              if (polygonPoints.length === 1) {
                setIsDrawingPolygon(false);
                setPolygonPoints([]);
              }
            }
            
            // Handle points undo - remove last point
            if (activeTool === 'points' && annotations.length > 0) {
              // Find the last point annotation
              const pointAnnotations = annotations.filter((ann: any) => ann.type === 'point');
              if (pointAnnotations.length > 0) {
                const lastPointAnnotation = pointAnnotations[pointAnnotations.length - 1];
                onAnnotationsChange?.(annotations.filter((ann: any) => ann.id !== lastPointAnnotation.id));
              }
            }
          }}
          onWheel={(e) => {
            e.preventDefault(); // Prevent page scroll
            
            // Zoom control with limits (Min: 0.1, Max: 5)
            const scaleFactor = e.deltaY < 0 ? 1.1 : 0.9;
            const newScale = Math.max(0.1, Math.min(5, scale * scaleFactor));
            
            if (newScale !== scale) {
              const rect = containerRef.current?.getBoundingClientRect();
              if (!rect) return;
              
              // Cursor position relative to container
              const mouseX = e.clientX - rect.left;
              const mouseY = e.clientY - rect.top;
              
              // Image-space point under cursor before zoom
              const imageX = (mouseX - offset.x) / scale;
              const imageY = (mouseY - offset.y) / scale;
              
              // New offset to keep same image point under cursor
              const newOffsetX = mouseX - imageX * newScale;
              const newOffsetY = mouseY - imageY * newScale;
              
              setScale(newScale);
              setOffset({ x: newOffsetX, y: newOffsetY });
            }
          }}
        />
      </div>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1e293b',
  },
});
