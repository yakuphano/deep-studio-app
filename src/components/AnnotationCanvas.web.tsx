import React, { useRef, useState, useCallback, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { LABEL_COLORS } from '@/constants/annotationLabels';

export type Tool = 'pan' | 'select' | 'bbox' | 'polygon' | 'points' | 'ellipse' | 'cuboid' | 'polyline' | 'semantic' | 'brush' | 'magic_wand';
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

export type Annotation = BboxAnnotation | PolygonAnnotation | PointAnnotation;

interface AnnotationCanvasProps {
  imageSource?: { uri: string } | null;
  imageUrl?: string | null;
  annotations: Annotation[];
  onAnnotationsChange: (annotations: Annotation[]) => void;
  activeTool: Tool;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  selectedLabel?: string | null;
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

export default function AnnotationCanvas({
  imageSource,
  imageUrl,
  annotations,
  onAnnotationsChange,
  activeTool,
  selectedId,
  onSelect,
  selectedLabel,
}: AnnotationCanvasProps) {
  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  
  // State
  const [imageSize, setImageSize] = useState<{ w: number; h: number } | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  
  // Interaction state
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number } | null>(null);
  const [panStartOffset, setPanStartOffset] = useState<{ x: number; y: number } | null>(null);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawPreview, setDrawPreview] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  
  // Polygon drawing state
  const [polygonPoints, setPolygonPoints] = useState<{ x: number; y: number }[]>([]);
  const [isDrawingPolygon, setIsDrawingPolygon] = useState(false);
  
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

  // Handle mouse down - CVAT interactions with pan priority
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Pan tool priority - disable all drawing/selection when panning
      if (activeTool === 'pan') {
        setIsPanning(true);
        setPanStart({ x: e.clientX, y: e.clientY });
        setPanStartOffset({ x: offset.x, y: offset.y });
        (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
        return;
      }
      
      const image = screenToImage(e.clientX, e.clientY);
      
      // State conflict prevention - only one interaction at a time
      if (isDrawing || isDragging || isResizing) {
        return;
      }
      
      // Handle bbox drawing
      if (activeTool === 'bbox') {
        // Check if clicking on a handle first (hitbox priority)
        if (selectedId) {
          const selectedBox = annotations.find(a => a.id === selectedId && a.type === 'bbox') as BboxAnnotation | undefined;
          if (selectedBox) {
            const handle = getHandleAt(image.x, image.y, selectedBox);
            if (handle) {
              setIsResizing(true);
              setResizeHandle(handle);
              setResizeStartBox(selectedBox);
              // Set cursor based on handle
              const cursors: Record<BboxHandle, string> = {
                'tl': 'nwse-resize', 'tr': 'nesw-resize', 'br': 'nwse-resize', 'bl': 'nesw-resize',
                't': 'ns-resize', 'r': 'ew-resize', 'b': 'ns-resize', 'l': 'ew-resize'
              };
              document.body.style.cursor = cursors[handle];
              return;
            }
          }
        }
        
        // If not clicking on handle, start drawing
        setIsDrawing(true);
        setDrawStart({ x: image.x, y: image.y });
        setDrawPreview({ x: image.x, y: image.y, width: 0, height: 0 });
        return;
      }

      // Handle polygon drawing
      if (activeTool === 'polygon') {
        const newPoint = { x: image.x, y: image.y };
        
        if (!isDrawingPolygon) {
          // Start new polygon
          setIsDrawingPolygon(true);
          setPolygonPoints([newPoint]);
        } else {
          // Check if clicking near the first point to close polygon
          if (polygonPoints.length >= 3) {
            const firstPoint = polygonPoints[0];
            const distance = Math.sqrt(
              Math.pow(newPoint.x - firstPoint.x, 2) + 
              Math.pow(newPoint.y - firstPoint.y, 2)
            );
            
            if (distance < 10) { // Close polygon if near first point
              // Create polygon annotation
              const newPolygon: PolygonAnnotation = {
                id: `polygon-${Date.now()}`,
                type: 'polygon',
                points: polygonPoints,
                label: '',
                z_index: Date.now(),
              };
              
              onAnnotationsChange([...annotations, newPolygon]);
              onSelect?.(newPolygon.id);
              
              // Reset polygon drawing state
              setIsDrawingPolygon(false);
              setPolygonPoints([]);
              return;
            }
          }
          
          // Add new point
          setPolygonPoints([...polygonPoints, newPoint]);
        }
        return;
      }

      // Handle points tool
      if (activeTool === 'points') {
        const newPoint: PointAnnotation = {
          id: `point-${Date.now()}`,
          type: 'point',
          x: image.x,
          y: image.y,
          label: '',
          z_index: Date.now(),
        };
        
        onAnnotationsChange([...annotations, newPoint]);
        onSelect?.(newPoint.id); // Auto-select the new point
        return;
      }

      // Handle selection and interactions
      if (activeTool === 'select') {
        // Check if clicking on a bbox
        const clicked = annotations.find((a) => {
          if (a.type === 'bbox') {
            return image.x >= a.x && image.x <= a.x + a.width &&
                   image.y >= a.y && image.y <= a.y + a.height;
          }
          if (a.type === 'polygon') {
            // Simple point-in-polygon test (ray casting algorithm)
            const points = a.points;
            let inside = false;
            for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
              const xi = points[i].x, yi = points[i].y;
              const xj = points[j].x, yj = points[j].y;
              const intersect = ((yi > image.y) !== (yj > image.y))
                  && (image.x < (xj - xi) * (image.y - yi) / (yj - yi) + xi);
              if (intersect) inside = !inside;
            }
            return inside;
          }
          if (a.type === 'point') {
            // Check if click is near the point (within 10px radius)
            const distance = Math.sqrt(
              Math.pow(image.x - a.x, 2) + Math.pow(image.y - a.y, 2)
            );
            return distance <= 10;
          }
          return false;
        });

        if (clicked) {
          onSelect?.(clicked.id);
          
          // Check if clicking on resize handle (only for bbox)
          if (clicked.type === 'bbox' && clicked.id === selectedId) {
            const handle = getHandleAt(image.x, image.y, clicked);
            if (handle) {
              setIsResizing(true);
              setResizeHandle(handle);
              setResizeStartBox(clicked);
              // Set cursor based on handle
              const cursors: Record<BboxHandle, string> = {
                'tl': 'nwse-resize', 'tr': 'nesw-resize', 'br': 'nwse-resize', 'bl': 'nesw-resize',
                't': 'ns-resize', 'r': 'ew-resize', 'b': 'ns-resize', 'l': 'ew-resize'
              };
              document.body.style.cursor = cursors[handle];
              return;
            }
          }
          
          // Start dragging the annotation
          setIsDragging(true);
          setDragOffset({ x: image.x - (clicked.type === 'bbox' ? clicked.x : 0), y: image.y - (clicked.type === 'bbox' ? clicked.y : 0) });
        } else {
          onSelect?.(null);
        }
      }
    },
    [activeTool, screenToImage, annotations, selectedId, onSelect, isDrawing, isDragging, isResizing, isDrawingPolygon, polygonPoints]
  );

  // Handle mouse move with interaction priority
  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      // Handle panning
      if (isPanning && panStart && panStartOffset) {
        const deltaX = e.clientX - panStart.x;
        const deltaY = e.clientY - panStart.y;
        
        setOffset({
          x: panStartOffset.x + deltaX,
          y: panStartOffset.y + deltaY,
        });
        return;
      }
      
      // If resizing, only handle resize - suspend other interactions
      if (isResizing) {
        const image = screenToImage(e.clientX, e.clientY);
        
        if (selectedId && resizeHandle && resizeStartBox) {
          const box = resizeStartBox;
          const x2 = box.x + box.width;
          const y2 = box.y + box.height;
          
          let newX: number, newY: number, newWidth: number, newHeight: number;
          
          switch (resizeHandle) {
            case 'tl':
              newX = image.x;
              newY = image.y;
              newWidth = x2 - image.x;
              newHeight = y2 - image.y;
              break;
            case 'tr':
              newX = box.x;
              newY = image.y;
              newWidth = image.x - box.x;
              newHeight = y2 - image.y;
              break;
            case 'br':
              newX = box.x;
              newY = box.y;
              newWidth = image.x - box.x;
              newHeight = image.y - box.y;
              break;
            case 'bl':
              newX = image.x;
              newY = box.y;
              newWidth = x2 - image.x;
              newHeight = image.y - box.y;
              break;
            case 't':
              newX = box.x;
              newY = image.y;
              newWidth = box.width;
              newHeight = y2 - image.y;
              break;
            case 'r':
              newX = box.x;
              newY = box.y;
              newWidth = image.x - box.x;
              newHeight = box.height;
              break;
            case 'b':
              newX = box.x;
              newY = box.y;
              newWidth = box.width;
              newHeight = image.y - box.y;
              break;
            case 'l':
              newX = image.x;
              newY = box.y;
              newWidth = x2 - image.x;
              newHeight = box.height;
              break;
            default:
              return;
          }
          
          onAnnotationsChange(annotations.map(a => {
            if (a.id === selectedId && a.type === 'bbox') {
              return { ...a, x: newX, y: newY, width: newWidth, height: newHeight };
            }
            return a;
          }));
        }
        return;
      }
      
      const image = screenToImage(e.clientX, e.clientY);
      
      // Handle drawing
      if (isDrawing && drawStart) {
        const width = image.x - drawStart.x;
        const height = image.y - drawStart.y;
        const x = width < 0 ? image.x : drawStart.x;
        const y = height < 0 ? image.y : drawStart.y;
        setDrawPreview({ x, y, width: Math.abs(width), height: Math.abs(height) });
        return;
      }

      // Handle dragging
      if (isDragging && selectedId && dragOffset) {
        const newX = Math.max(0, image.x - dragOffset.x);
        const newY = Math.max(0, image.y - dragOffset.y);
        
        onAnnotationsChange(annotations.map(a => {
          if (a.id === selectedId) {
            if (a.type === 'bbox') {
              return { ...a, x: newX, y: newY };
            }
            if (a.type === 'polygon') {
              // Move all points by the same offset
              const dx = newX - 0; // Since we used 0 as reference in dragOffset
              const dy = newY - 0;
              return { 
                ...a, 
                points: a.points.map(p => ({ x: p.x + dx, y: p.y + dy }))
              };
            }
            if (a.type === 'point') {
              return { ...a, x: newX, y: newY };
            }
          }
          return a;
        }));
      }
    },
    [screenToImage, isResizing, selectedId, resizeHandle, resizeStartBox, isDrawing, drawStart, isDragging, dragOffset, annotations, onAnnotationsChange]
  );

  // Handle mouse up - CVAT auto-select
  const handlePointerUp = useCallback(() => {
    // Handle drawing completion and auto-select
    if (isDrawing && drawStart && drawPreview) {
      const { x, y, width, height } = drawPreview;
      
      if (width >= MIN_BOX_SIZE && height >= MIN_BOX_SIZE) {
        const newBox: BboxAnnotation = {
  id: `bbox-${Date.now()}`,
  type: 'bbox',
  x,
  y,
  width,
  height,
  label: '',
  z_index: Date.now(),
};
        
        onAnnotationsChange([...annotations, newBox]);
        onSelect?.(newBox.id); // Auto-select the new box
      }
    }
    
    // Reset interaction states for bbox/drag/resize
    setIsDrawing(false);
    setIsDragging(false);
    setIsResizing(false);
    setIsPanning(false);
    setDrawStart(null);
    setDrawPreview(null);
    setDragOffset(null);
    setResizeHandle(null);
    setResizeStartBox(null);
    setPanStart(null);
    setPanStartOffset(null);
    
    // IMPORTANT: DO NOT reset polygon drawing state here.
    // Do NOT call setIsDrawingPolygon(false) or setPolygonPoints([]) in handlePointerUp.
    // Polygon drawing is started and finished entirely in handlePointerDown
    // when the click is near the first point.
    
    // Reset cursor globally when interaction ends
    document.body.style.cursor = '';
  }, [isDrawing, drawStart, drawPreview, annotations, onAnnotationsChange, onSelect]);

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
  }, [selectedId, annotations, onAnnotationsChange, onSelect]);

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
      >
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
            width: imageSize?.w || '100%', // Same as image
            height: imageSize?.h || '100%', // Same as image
            pointerEvents: activeTool === 'pan' ? 'none' : 'none', // Always disabled, especially in pan mode
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: '0 0', // Critical: top-left origin
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
                      onSelect?.(annotation.id);
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
                      onSelect?.(annotation.id);
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
                      onSelect?.(annotation.id);
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
                            pointerEvents="auto" // Handle events
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
            return null;
          })}
          
          {/* Drawing preview - always blue for focus */}
          {drawPreview && (
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
                    strokeWidth={3}
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
        </svg>
        
        {/* Interaction Layer - Top transparent layer - ALWAYS ACTIVE */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: '100%', // Full container width
            height: '100%', // Full container height
            cursor: activeTool === 'bbox' || activeTool === 'points' ? 'crosshair' : 'default',
            touchAction: 'none',
            pointerEvents: 'auto', // ALWAYS ACTIVE - manages all events
          }}
          onPointerDown={(e) => {
            e.preventDefault(); // Prevent native drag
            e.stopPropagation(); // Stop event bubbling
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
          onWheel={(e) => {
            e.preventDefault(); // Prevent page scroll
            
            // Zoom control with limits (Min: 0.1, Max: 5)
            const scaleFactor = e.deltaY < 0 ? 1.1 : 0.9;
            const newScale = Math.max(0.1, Math.min(5, scale * scaleFactor));
            
            if (newScale !== scale) {
              const rect = containerRef.current?.getBoundingClientRect();
              if (!rect) return;
              
              const mouseX = e.clientX - rect.left;
              const mouseY = e.clientY - rect.top;
              
              const mouseXInImage = (mouseX - offset.x) / scale;
              const mouseYInImage = (mouseY - offset.y) / scale;
              
              const newOffsetX = mouseX - mouseXInImage * newScale;
              const newOffsetY = mouseY - mouseYInImage * newScale;
              
              setScale(newScale);
              setOffset({
                x: newOffsetX,
                y: newOffsetY,
              });
            }
          }}
        />
      </div>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1e293b',
  },
});
