import { useState, useCallback, useRef } from 'react';
import {
  calculateInitialFit,
  getResizeHandleAt,
  pointsQuadToBoxBounds,
  type ResizeHandleType,
} from '@/utils/canvasHelpers';

export interface ImageSize {
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface BboxHandle {
  x: number;
  y: number;
  width: number;
  height: number;
  cursor: string;
  type: 'tl' | 'tr' | 'br' | 'bl' | 't' | 'r' | 'b' | 'l';
}

export interface UseCanvasLogicProps {
  selectedId?: string | null;
}

export const useCanvasLogic = (props?: UseCanvasLogicProps) => {
  const selectedId = props?.selectedId || null;
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [imageSize, setImageSize] = useState<ImageSize | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<Point | null>(null);
  const [panStartOffset, setPanStartOffset] = useState<Point | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState<Point | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<ResizeHandleType | null>(null);
  const [resizeStartBox, setResizeStartBox] = useState<any>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // Precise coordinate system calculations
  const screenToImage = useCallback(
    (clientX: number, clientY: number) => {
      if (!imageSize || !containerRef.current) return { x: 0, y: 0 };

      const el = containerRef.current;
      const rect = el.getBoundingClientRect();
      const mx = clientX - rect.left + el.scrollLeft;
      const my = clientY - rect.top + el.scrollTop;
      const imageX = (mx - offset.x) / scale;
      const imageY = (my - offset.y) / scale;

      return { x: imageX, y: imageY };
    },
    [imageSize, scale, offset]
  );

  const imageToScreen = useCallback(
    (imageX: number, imageY: number) => {
      if (!imageSize) return { x: 0, y: 0 };
      
      return {
        x: imageX * scale + offset.x,
        y: imageY * scale + offset.y,
      };
    },
    [imageSize, scale, offset]
  );

  // Handle wheel for zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    
    if (!containerRef.current) return;
    
    const el = containerRef.current;
    const rect = el.getBoundingClientRect();
    const mouseX = e.clientX - rect.left + el.scrollLeft;
    const mouseY = e.clientY - rect.top + el.scrollTop;
    
    const imagePoint = screenToImage(e.clientX, e.clientY);
    
    const scaleFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.1, Math.min(5, scale * scaleFactor));
    
    const newOffsetX = mouseX - imagePoint.x * newScale;
    const newOffsetY = mouseY - imagePoint.y * newScale;
    
    setScale(newScale);
    setOffset({ x: newOffsetX, y: newOffsetY });
  }, [scale, screenToImage]);

  const getHandleAt = useCallback((x: number, y: number, annotation: any): ResizeHandleType | null => {
    if (annotation?.type === 'bbox' || annotation?.type === 'cuboid') {
      return getResizeHandleAt(x, y, annotation, scale);
    }
    if (annotation?.type === 'semantic' || annotation?.type === 'magic_wand') {
      const b = pointsQuadToBoxBounds(annotation?.points);
      if (!b) return null;
      return getResizeHandleAt(x, y, { type: 'bbox', ...b, id: '', label: '' } as any, scale);
    }
    return null;
  }, [scale]);

  // Handle pointer down for pan/drag/resize
  const handlePointerDown = useCallback((e: React.PointerEvent, activeTool: string, selectedId: string | null, annotations: any[]) => {
    if (e.button === 2) return;
    
    const image = screenToImage(e.clientX, e.clientY);

    // Check for resize handles
    if (selectedId) {
      const selectedAnnotation = annotations.find(ann => ann.id === selectedId);
      if (selectedAnnotation && (selectedAnnotation.type === 'bbox' || selectedAnnotation.type === 'cuboid')) {
        const handle = getHandleAt(image.x, image.y, selectedAnnotation);
        if (handle) {
          setIsResizing(true);
          setResizeHandle(handle);
          setResizeStartBox(selectedAnnotation);
          return;
        }
      }
    }

    // Handle pan tool
    if (activeTool === 'pan') {
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY });
      setPanStartOffset({ ...offset });
      return;
    }

    // Handle dragging existing annotations
    if (selectedId && activeTool === 'select') {
      const selectedAnnotation = annotations.find(ann => ann.id === selectedId);
      if (selectedAnnotation) {
        setIsDragging(true);
        if (selectedAnnotation.type === 'bbox' || selectedAnnotation.type === 'cuboid') {
          setDragOffset({ x: image.x - selectedAnnotation.x, y: image.y - selectedAnnotation.y });
        } else if (selectedAnnotation.type === 'point') {
          setDragOffset({ x: image.x - selectedAnnotation.x, y: image.y - selectedAnnotation.y });
        } else if (selectedAnnotation.type === 'ellipse') {
          setDragOffset({ x: image.x - selectedAnnotation.cx, y: image.y - selectedAnnotation.cy });
        }
      }
    }
  }, [screenToImage, offset, getHandleAt]);

  // Handle pointer move
  const handlePointerMove = useCallback((e: React.PointerEvent, activeTool: string, selectedId: string | null, annotations: any[], onAnnotationsChange: (ann: any[]) => void) => {
    // Handle resizing
    if (isResizing && resizeHandle && resizeStartBox && selectedId) {
      const image = screenToImage(e.clientX, e.clientY);
      
      onAnnotationsChange(prev => prev.map(ann => {
        if (ann.id === selectedId && (ann.type === 'bbox' || ann.type === 'cuboid')) {
          let newX = ann.x;
          let newY = ann.y;
          let newWidth = ann.width;
          let newHeight = ann.height;

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
          
          newWidth = Math.max(20, newWidth);
          newHeight = Math.max(20, newHeight);
          
          return { ...ann, x: newX, y: newY, width: newWidth, height: newHeight };
        }
        return ann;
      }));
      return;
    }

    // Handle panning
    if (isPanning && panStart && panStartOffset && activeTool === 'pan') {
      const deltaX = e.clientX - panStart.x;
      const deltaY = e.clientY - panStart.y;
      const newOffsetX = panStartOffset.x + deltaX;
      const newOffsetY = panStartOffset.y + deltaY;
      
      setOffset({ x: newOffsetX, y: newOffsetY });
      return;
    }

    // Handle dragging
    if (isDragging && dragOffset && activeTool === 'select') {
      const image = screenToImage(e.clientX, e.clientY);
      
      onAnnotationsChange(prev => prev.map(ann => {
        if (ann.id === selectedId) {
          if (ann.type === 'bbox' || ann.type === 'cuboid') {
            const newX = image.x - dragOffset.x;
            const newY = image.y - dragOffset.y;
            return { ...ann, x: newX, y: newY };
          } else if (ann.type === 'ellipse') {
            const newX = image.x - dragOffset.x;
            const newY = image.y - dragOffset.y;
            return { ...ann, cx: newX, cy: newY };
          } else if (ann.type === 'point') {
            const newX = image.x - dragOffset.x;
            const newY = image.y - dragOffset.y;
            return { ...ann, x: newX, y: newY };
          }
        }
        return ann;
      }));
    }
  }, [isResizing, resizeHandle, resizeStartBox, selectedId, isPanning, panStart, panStartOffset, isDragging, dragOffset, screenToImage]);

  // Handle pointer up
  const handlePointerUp = useCallback(() => {
    setIsPanning(false);
    setPanStart(null);
    setPanStartOffset(null);
    setIsDragging(false);
    setDragOffset(null);
    setIsResizing(false);
    setResizeHandle(null);
    setResizeStartBox(null);
  }, []);

  /** Zoom/pan sonrası görüntüyü konteynıra sığdırıp ortala (ilk yükleme ile aynı) */
  const resetViewToFit = useCallback(() => {
    const container = containerRef.current;
    if (!container || !imageSize) return;
    const rect = container.getBoundingClientRect();
    const { scale: nextScale, offset: nextOffset } = calculateInitialFit(
      imageSize.w,
      imageSize.h,
      rect.width,
      rect.height
    );
    setScale(nextScale);
    setOffset(nextOffset);
  }, [imageSize]);

  // Initialize image with fit
  const initializeImage = useCallback((imageSource?: { uri: string } | null, imageUrl?: string | null) => {
    const img = imgRef.current;
    const container = containerRef.current;
    if (!img || !container || !imageSource?.uri && !imageUrl) return;
    
    const handleLoad = () => {
      const naturalWidth = img.naturalWidth;
      const naturalHeight = img.naturalHeight;
      
      setImageSize({ w: naturalWidth, h: naturalHeight });
      
      const containerRect = container.getBoundingClientRect();
      const { scale: initialScale, offset: nextOffset } = calculateInitialFit(
        naturalWidth,
        naturalHeight,
        containerRect.width,
        containerRect.height
      );
      setScale(initialScale);
      setOffset(nextOffset);
    };
    
    img.src = imageSource?.uri || imageUrl || '';
    img.addEventListener('load', handleLoad);
    
    return () => img.removeEventListener('load', handleLoad);
  }, []);

  return {
    // State
    scale,
    offset,
    imageSize,
    isPanning,
    isDragging,
    isResizing,
    panStart,
    panStartOffset,
    
    // Refs
    containerRef,
    imgRef,
    
    // Coordinate functions
    screenToImage,
    imageToScreen,
    getHandleAt,
    
    // Event handlers
    handleWheel,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    initializeImage,
    resetViewToFit,
    
    // Setters
    setScale,
    setOffset,
    setImageSize,
    setIsPanning,
    setPanStart,
    setPanStartOffset,
  };
};
