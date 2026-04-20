import { useCallback } from 'react';
import { Annotation, Tool } from '@/types/annotations';

interface UseAnnotationActionsProps {
  activeTool: Tool;
  selectedId: string | null;
  annotations: Annotation[];
  onAnnotationsChange: (annotations: Annotation[]) => void;
  onSelect: (id: string | null) => void;
  selectedLabel: string | null;
  screenToImage: (clientX: number, clientY: number) => { x: number; y: number };
  getHandleAt: (x: number, y: number, annotation: any, scale: number) => any;
  scale: number;
  handleUndo: () => void;
  // Drawing states
  drawStart: { x: number; y: number } | null;
  setDrawStart: (start: { x: number; y: number } | null) => void;
  drawPreview: { x: number; y: number; width: number; height: number } | null;
  setDrawPreview: (preview: { x: number; y: number; width: number; height: number } | null) => void;
  isDrawing: boolean;
  setIsDrawing: (drawing: boolean) => void;
  polygonPoints: { x: number; y: number }[];
  setPolygonPoints: (points: { x: number; y: number }[]) => void;
  isDrawingPolygon: boolean;
  setIsDrawingPolygon: (drawing: boolean) => void;
  polylinePoints: { x: number; y: number }[];
  setPolylinePoints: (points: { x: number; y: number }[]) => void;
  isDrawingPolyline: boolean;
  setIsDrawingPolyline: (drawing: boolean) => void;
  polylinePreviewPoint: { x: number; y: number } | null;
  setPolylinePreviewPoint: (point: { x: number; y: number } | null) => void;
  brushPoints: { x: number; y: number }[];
  setBrushPoints: (points: { x: number; y: number }[]) => void;
  brushColor: string;
  setBrushColor: (color: string) => void;
  isPaletteOpen: boolean;
  setIsPaletteOpen: (open: boolean) => void;
  savedBrushes: any[];
  setSavedBrushes: (brushes: any[]) => void;
  history: any[];
  setHistory: (history: any[]) => void;
  // Resize states
  isResizing: boolean;
  setIsResizing: (resizing: boolean) => void;
  resizeHandle: any;
  setResizeHandle: (handle: any) => void;
  resizeStartBox: any;
  setResizeStartBox: (box: any) => void;
  // Drag states
  isDragging: boolean;
  setIsDragging: (dragging: boolean) => void;
  dragOffset: { x: number; y: number } | null;
  setDragOffset: (offset: { x: number; y: number } | null) => void;
  // Pan states
  isPanning: boolean;
  setIsPanning: (panning: boolean) => void;
  panStart: { x: number; y: number } | null;
  setPanStart: (start: { x: number; y: number } | null) => void;
  panStartOffset: { x: number; y: number } | null;
  setPanStartOffset: (offset: { x: number; y: number } | null) => void;
  setOffset: (offset: { x: number; y: number }) => void;
}

export const useAnnotationActions = ({
  activeTool,
  selectedId,
  annotations,
  onAnnotationsChange,
  onSelect,
  selectedLabel,
  screenToImage,
  getHandleAt,
  scale,
  handleUndo,
  drawStart,
  setDrawStart,
  drawPreview,
  setDrawPreview,
  isDrawing,
  setIsDrawing,
  polygonPoints,
  setPolygonPoints,
  isDrawingPolygon,
  setIsDrawingPolygon,
  polylinePoints,
  setPolylinePoints,
  isDrawingPolyline,
  setIsDrawingPolyline,
  polylinePreviewPoint,
  setPolylinePreviewPoint,
  brushPoints,
  setBrushPoints,
  brushColor,
  setBrushColor,
  isPaletteOpen,
  setIsPaletteOpen,
  savedBrushes,
  setSavedBrushes,
  history,
  setHistory,
  isResizing,
  setIsResizing,
  resizeHandle,
  setResizeHandle,
  resizeStartBox,
  setResizeStartBox,
  isDragging,
  setIsDragging,
  dragOffset,
  setDragOffset,
  isPanning,
  setIsPanning,
  panStart,
  setPanStart,
  panStartOffset,
  setPanStartOffset,
  setOffset,
}: UseAnnotationActionsProps) => {

  // Handle pointer down
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button === 2) return;
      
      // Undo butonu için özel handling
      if (activeTool === 'undo') {
        handleUndo();
        return;
      }
      
      const image = screenToImage(e.clientX, e.clientY);

      // Resize kontrolü - selectedId varsa önce resize tutamacý kontrol et
      if (selectedId) {
        const selectedAnnotation = annotations.find(ann => ann.id === selectedId);
        if (selectedAnnotation && (selectedAnnotation.type === 'bbox' || selectedAnnotation.type === 'cuboid' || selectedAnnotation.type === 'polyline' || selectedAnnotation.type === 'brush' || selectedAnnotation.type === 'point')) {
          const handle = getHandleAt(image.x, image.y, selectedAnnotation as any, scale);
          if (handle) {
            console.log('[AnnotationCanvas] Resize handle clicked via getHandleAt:', handle);
            setIsResizing(true);
            setResizeHandle(handle);
            setResizeStartBox(selectedAnnotation as any);
            return; // Resize baþladý, diðer mantýklarý çalýþtýrma
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
          // Pan modunda çizimleri seçmek ve taþýmak için annotation tespiti
          const clickedAnnotation = annotations.find(ann => {
            console.log('[AnnotationCanvas] Checking annotation:', ann.id, ann.type);
            if ((ann as any).type === 'bbox' || (ann as any).type === 'cuboid') {
              const hit = image.x >= (ann as any).x && image.x <= (ann as any).x + (ann as any).width &&
                      image.y >= (ann as any).y && image.y <= (ann as any).y + (ann as any).height;
              console.log('[AnnotationCanvas] Bbox/Cuboid hit test:', hit, 'coords:', {x: (ann as any).x, y: (ann as any).y, w: (ann as any).width, h: (ann as any).height}, 'click:', image);
              return hit;
            }
            return false;
          });
          
          if (clickedAnnotation) {
            console.log('[AnnotationCanvas] Annotation found in pan mode, selecting:', clickedAnnotation.id);
            onSelect?.(clickedAnnotation.id);
            setIsDragging(true);
            setDragOffset({ x: image.x - (clickedAnnotation as any).x, y: image.y - (clickedAnnotation as any).y });
          } else {
            console.log('[AnnotationCanvas] No annotation found, starting pan');
            setIsPanning(true);
            setPanStart({ x: e.clientX, y: e.clientY });
            setPanStartOffset({ x: 0, y: 0 });
          }
          break;

        case 'bbox':
          console.log('[AnnotationCanvas] BBOX MODE - Starting bbox draw at:', image);
          setDrawStart(image);
          setDrawPreview({ x: image.x, y: image.y, width: 0, height: 0 });
          setIsDrawing(true);
          break;

        case 'polygon':
          if (!isDrawingPolygon) {
            console.log('[AnnotationCanvas] POLYGON MODE - Starting polygon at:', image);
            setPolygonPoints([image]);
            setIsDrawingPolygon(true);
          } else {
            console.log('[AnnotationCanvas] POLYGON MODE - Adding point:', image);
            setPolygonPoints(prev => [...prev, image]);
          }
          break;

        case 'polyline':
          if (!isDrawingPolyline) {
            console.log('[AnnotationCanvas] POLYLINE MODE - Starting polyline at:', image);
            setPolylinePoints([image]);
            setIsDrawingPolyline(true);
          } else {
            console.log('[AnnotationCanvas] POLYLINE MODE - Adding point:', image);
            setPolylinePoints(prev => [...prev, image]);
          }
          break;

        case 'points':
          console.log('[AnnotationCanvas] POINTS MODE - Creating point at:', image);
          if (selectedLabel) {
            const pointAnnotation = {
              id: `point-${Date.now()}`,
              type: 'point' as const,
              x: image.x,
              y: image.y,
              label: selectedLabel,
            };
            onAnnotationsChange(prev => [...prev, pointAnnotation]);
            onSelect?.(pointAnnotation.id);
          }
          break;

        case 'brush':
          if (!isDrawing) {
            console.log('[AnnotationCanvas] BRUSH MODE - Starting brush at:', image);
            setBrushPoints([image]);
            setIsDrawing(true);
            setHistory(prev => [...prev, { type: 'brush_start' }]);
          }
          break;

        default:
          // Default behavior - check for annotation selection
          const clickedDefaultAnnotation = annotations.find(ann => {
            if ((ann as any).type === 'bbox' || (ann as any).type === 'cuboid') {
              return image.x >= (ann as any).x && image.x <= (ann as any).x + (ann as any).width &&
                     image.y >= (ann as any).y && image.y <= (ann as any).y + (ann as any).height;
            }
            return false;
          });
          
          if (clickedDefaultAnnotation) {
            onSelect?.(clickedDefaultAnnotation.id);
          } else {
            onSelect?.(null);
          }
          break;
      }
    },
    [activeTool, selectedId, annotations, onAnnotationsChange, onSelect, selectedLabel, screenToImage, getHandleAt, scale, handleUndo, drawStart, setDrawStart, drawPreview, setDrawPreview, isDrawing, setIsDrawing, polygonPoints, setPolygonPoints, isDrawingPolygon, setIsDrawingPolygon, polylinePoints, setPolylinePoints, isDrawingPolyline, setIsDrawingPolyline, brushPoints, setBrushPoints, setIsDrawing, brushColor, setBrushColor, isPaletteOpen, setIsPaletteOpen, savedBrushes, setSavedBrushes, history, setHistory, isResizing, setIsResizing, resizeHandle, setResizeHandle, resizeStartBox, setResizeStartBox, isDragging, setIsDragging, dragOffset, setDragOffset, isPanning, setIsPanning, panStart, setPanStart, panStartOffset, setPanStartOffset, setOffset]
  );

  // Handle pointer move
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
          
          // Use resize helper
          const resized = resizeBbox(resizeStartBox, resizeHandle, image.x - resizeStartBox.x, image.y - resizeStartBox.y, imageSize);
          newX = resized.x;
          newY = resized.y;
          newWidth = resized.width;
          newHeight = resized.height;
          
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
        setBrushPoints(prev => {
          const newPoints = [...prev, image];
          // History'e sadece başlangıçta ekle, her nokta değil
          if (prev.length === 0) {
            setHistory(historyPrev => [...historyPrev, { type: 'brush_start', data: image }]);
          }
          return newPoints;
        });
        break;

      case 'polyline':
        if (activeDrawing) {
          if (isDrawingPolyline && polylinePoints.length > 0) {
            setPolylinePoints(prev => {
              const newPoints = [...prev, image];
              // History'e her nokta ekle
              setHistory(historyPrev => [...historyPrev, { type: 'polyline_point', data: image }]);
              return newPoints;
            });
          }
        }
        break;

      case 'bbox':
      case 'ellipse':
        if (drawStart) {
          const width = image.x - drawStart.x;
          const height = image.y - drawStart.y;
          const newPreview = {
            x: width < 0 ? image.x : drawStart.x,
            y: height < 0 ? image.y : drawStart.y,
            width: Math.abs(width),
            height: Math.abs(height)
          };
          setDrawPreview(newPreview);
        }
        break;

      case 'polygon':
        if (isDrawingPolygon && polygonPoints.length > 0) {
          setPolylinePreviewPoint(image);
        }
        break;
    }
  }, [isDragging, activeTool, dragOffset, selectedId, isResizing, resizeHandle, resizeStartBox, screenToImage, onAnnotationsChange, isPanning, panStart, panStartOffset, setOffset, isDrawing, activeDrawing, isDrawingPolyline, polylinePoints, setPolylinePoints, setHistory, drawStart, setDrawPreview, isDrawingPolygon, polygonPoints, setPolylinePreviewPoint]);

  // Handle pointer up
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
          // Check if bbox is within image bounds
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
            onAnnotationsChange(prev => [...prev, newBbox]);
            // History'e ekle
            setHistory(prev => [...prev, { type: 'annotation', data: newBbox }]);
            // Otomatik olarak yeni çizileni seç
            onSelect?.(newBbox.id);
          } else {
            console.log('[AnnotationCanvas] Bbox outside image bounds, not saving');
          }
        }
        break;

      case 'ellipse':
        if (drawPreview && drawPreview.width > MIN_BOX_SIZE) {
          // Check if ellipse is within image bounds
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
              rx: Math.abs(drawPreview.width / 2),
              ry: Math.abs(drawPreview.height / 2),
              label: ''
            };
            onAnnotationsChange(prev => [...prev, newEllipse]);
            // History'e ekle
            setHistory(prev => [...prev, { type: 'annotation', data: newEllipse }]);
            // Otomatik olarak yeni çizileni seç
            onSelect?.(newEllipse.id);
          } else {
            console.log('[AnnotationCanvas] Ellipse outside image bounds, not saving');
          }
        }
        break;

      case 'polygon':
        if (isDrawingPolygon && polygonPoints.length >= 3) {
          // Check if all polygon points are within image bounds
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
            onAnnotationsChange(prev => [...prev, newPolygon]);
            // History'e ekle
            setHistory(prev => [...prev, { type: 'annotation', data: newPolygon }]);
            // Otomatik olarak yeni çizileni seç
            onSelect?.(newPolygon.id);
          } else {
            console.log('[AnnotationCanvas] Polygon outside image bounds, not saving');
          }
          setIsDrawingPolygon(false);
          setPolygonPoints([]);
        }
        break;

      case 'polyline':
        if (isDrawingPolyline && polylinePoints.length >= 2) {
          // Check if all polyline points are within image bounds
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
            onAnnotationsChange(prev => [...prev, newPolyline]);
            // History'e ekle
            setHistory(prev => [...prev, { type: 'annotation', data: newPolyline }]);
            // Otomatik olarak yeni çizileni seç
            onSelect?.(newPolyline.id);
          } else {
            console.log('[AnnotationCanvas] Polyline outside image bounds, not saving');
          }
          setIsDrawingPolyline(false);
          setPolylinePoints([]);
          setPolylinePreviewPoint(null);
        }
        break;

      case 'points':
        // Points are saved immediately on click, no action needed here
        break;
    }
    
    // Reset drawing state for tools that need it
    if (['bbox', 'ellipse'].includes(activeTool)) {
      setIsDrawing(false);
      setDrawStart(null);
      setDrawPreview(null);
    }
  }, [isResizing, resizeHandle, resizeStartBox, setIsResizing, setResizeHandle, setResizeStartBox, isPanning, panStart, panStartOffset, setIsPanning, setPanStart, setPanStartOffset, isDragging, dragOffset, setIsDragging, setDragOffset, activeTool, brushPoints, brushColor, setSavedBrushes, setHistory, setBrushPoints, setIsDrawing, drawPreview, MIN_BOX_SIZE, imageSize, onAnnotationsChange, onSelect, isDrawingPolygon, polygonPoints, setIsDrawingPolygon, setPolygonPoints, isDrawingPolyline, polylinePoints, setIsDrawingPolyline, setPolylinePoints, setPolylinePreviewPoint, setIsDrawing, setDrawStart, setDrawPreview]);

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  };
};
