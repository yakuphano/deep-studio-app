import React, { useEffect, useState, useRef, useCallback, useImperativeHandle } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { LABEL_COLORS } from '@/constants/annotationLabels';
import {
  resizeBbox,
  calculateInitialFit,
  distance,
  isPointInBbox,
  isPointNearLine,
  formatTime,
  screenConstantRadius,
} from '@/utils/canvasHelpers';
import {
  type Tool,
  type BboxHandle,
  type BboxAnnotation,
  type PolygonAnnotation,
  type PointAnnotation,
  type PolylineAnnotation,
  type BrushAnnotation,
  type EllipseAnnotation,
  type CuboidAnnotation,
  type CuboidWireAnnotation,
  type SemanticAnnotation,
  type MagicWandAnnotation,
  type Annotation,
  HANDLE_SIZE,
  DEFAULT_BRUSH_COLOR,
  DEFAULT_BRUSH_WIDTH
} from '@/types/annotations';
import { useCanvasLogic } from '@/hooks/useCanvasLogic';
import { BboxLayer } from '@/components/workbench/layers/BboxLayer';
import { PolygonLayer } from '@/components/workbench/layers/PolygonLayer';
import { PointLayer } from '@/components/workbench/layers/PointLayer';
import { BrushLayer } from '@/components/workbench/layers/BrushLayer';
import { CuboidLayer } from '@/components/workbench/layers/CuboidLayer';
import { CuboidWireLayer } from '@/components/workbench/layers/CuboidWireLayer';
import { EllipseLayer } from '@/components/workbench/layers/EllipseLayer';
import { PolylineLayer } from '@/components/workbench/layers/PolylineLayer';
import { CanvasToolbar } from '@/components/workbench/CanvasToolbar';
import { useAnnotationActions } from '@/hooks/useAnnotationActions';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1e293b',
  },
});

interface AnnotationCanvasProps {
  imageSource?: { uri: string } | null;
  imageUrl?: string | null;
  annotations: Annotation[];
  onAnnotationsChange: (
    annotations: Annotation[] | ((prev: Annotation[]) => Annotation[])
  ) => void;
  activeTool: Tool;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  selectedLabel?: string | null;
  onToolChange?: (tool: Tool) => void;
  onUndo?: () => void;
  /** Sol sütunda tam araç çubuğu varsa üstteki mini toolbar (fırça/reset) gizlenir */
  hideFloatingToolbar?: boolean;
}

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
  hideFloatingToolbar = false,
}: AnnotationCanvasProps, ref) {
  const { t } = useTranslation();

  // Drawing states
  const [drawStart, setDrawStart] = useState<any>(null);
  const [drawPreview, setDrawPreview] = useState<any>(null);
  const [isDrawing, setIsDrawing] = useState<any>(false);
  const [polygonPoints, setPolygonPoints] = useState<any>([]);
  const [isDrawingPolygon, setIsDrawingPolygon] = useState<any>(false);
  const [polylinePoints, setPolylinePoints] = useState<any>([]);
  const [isDrawingPolyline, setIsDrawingPolyline] = useState<any>(false);
  const [polylinePreviewPoint, setPolylinePreviewPoint] = useState<any>(null);
  const [cuboidWireCorners, setCuboidWireCorners] = useState<{ x: number; y: number }[]>([]);
  const [isDrawingCuboidWire, setIsDrawingCuboidWire] = useState(false);
  const [brushPoints, setBrushPoints] = useState<any>([]);
  const [brushColor, setBrushColor] = useState<any>(DEFAULT_BRUSH_COLOR);
  const [isPaletteOpen, setIsPaletteOpen] = useState<any>(false);
  const [savedBrushes, setSavedBrushes] = useState<any>([]);
  const [history, setHistory] = useState<any>([]);
  const [isResizing, setIsResizing] = useState<any>(false);
  const [resizeHandle, setResizeHandle] = useState<any>(null);
  const [resizeStartBox, setResizeStartBox] = useState<any>(null);
  const [isDragging, setIsDragging] = useState<any>(false);
  const [dragOffset, setDragOffset] = useState<any>(null);
  const [activeDrawing, setActiveDrawing] = useState<any>(null);

  // Undo: polyline çizilirken önce son noktayı sil; yoksa geçmişdeki son anotasyonu geri al
  const handleUndo = useCallback(() => {
    try {
      if (activeTool === 'cuboid_wire' && isDrawingCuboidWire && cuboidWireCorners.length > 0) {
        const next = cuboidWireCorners.slice(0, -1);
        setCuboidWireCorners(next);
        if (next.length === 0) setIsDrawingCuboidWire(false);
        setPolylinePreviewPoint(null);
        return;
      }
      if (activeTool === 'polyline' && isDrawingPolyline && polylinePoints.length > 0) {
        const next = polylinePoints.slice(0, -1);
        setPolylinePoints(next);
        if (next.length === 0) {
          setIsDrawingPolyline(false);
          setPolylinePreviewPoint(null);
        }
        return;
      }
      if (history && history.length > 0) {
        const lastAction = history[history.length - 1];
        if (lastAction && lastAction.type === 'annotation') {
          onAnnotationsChange &&
            onAnnotationsChange((prev: any) => (prev || []).filter((ann: any) => ann.id !== lastAction.data.id));
        } else if (lastAction && lastAction.type === 'brush') {
          setSavedBrushes((prev: any) => (prev || []).filter((brush: any) => brush.id !== lastAction.data.id));
        }
        setHistory((prev: any) => (prev || []).slice(0, -1));
      }
    } catch (e) {
      console.error('Undo error:', e);
    }
  }, [
    activeTool,
    isDrawingCuboidWire,
    cuboidWireCorners,
    isDrawingPolyline,
    polylinePoints,
    history,
    onAnnotationsChange,
    setCuboidWireCorners,
    setIsDrawingCuboidWire,
    setPolylinePoints,
    setIsDrawingPolyline,
    setPolylinePreviewPoint,
  ]);

  // Use canvas logic hook for scale, offset, and coordinate functions
  const {
    scale,
    offset,
    imageSize,
    isPanning,
    panStart,
    panStartOffset,
    containerRef,
    imgRef,
    screenToImage,
    imageToScreen,
    getHandleAt,
    handleWheel,
    initializeImage,
    resetViewToFit,
    setScale,
    setOffset,
    setImageSize,
    setIsPanning,
    setPanStart,
    setPanStartOffset,
  } = useCanvasLogic({ selectedId });

  /** Yeni şekil eklendikten hemen sonra gelen click/pan yeni nesneyi seçmesin */
  const suppressObjectSelectUntilRef = useRef(0);

  /** SVG yüzey tıklaması: yalnız Pan veya Select iken üst bileşene seçim iletilir */
  const selectShapeIfPan = useCallback(
    (annotationId: string) => {
      if (Date.now() < suppressObjectSelectUntilRef.current) return;
      if (activeTool === 'pan' || activeTool === 'select') onSelect?.(annotationId);
    },
    [activeTool, onSelect]
  );
  
  // Use annotation actions hook for all pointer event handling
  const {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  } = useAnnotationActions({
    activeTool,
    selectedId: selectedId ?? null,
    annotations,
    onAnnotationsChange,
    onSelect: onSelect ?? (() => {}),
    selectedLabel: selectedLabel ?? null,
    screenToImage,
    getHandleAt,
    scale,
    handleUndo,
    imageSize,
    activeDrawing,
    setActiveDrawing,
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
    cuboidWireCorners,
    setCuboidWireCorners,
    isDrawingCuboidWire,
    setIsDrawingCuboidWire,
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
    panStartOffset,
    setPanStart,
    setPanStartOffset,
    setOffset,
    viewOffset: offset,
    suppressObjectSelectUntilRef,
  });

  useImperativeHandle(
    ref,
    () => ({
      resetView: () => resetViewToFit(),
      undo: () => handleUndo(),
      handleUndo: () => handleUndo(),
    }),
    [resetViewToFit, handleUndo]
  );

  const vertexR = screenConstantRadius(scale, 3);

  // Görüntü yüklendiğinde boyut + konteynıra sığdır (önceden load dinleyicisi bağlanmıyordu)
  useEffect(() => {
    const img = imgRef.current;
    const container = containerRef.current;
    if (!img || !container || !(imageSource?.uri || imageUrl)) return;

    const runFit = () => {
      const naturalWidth = img.naturalWidth;
      const naturalHeight = img.naturalHeight;
      if (!naturalWidth || !naturalHeight) return;

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

    img.addEventListener('load', runFit);
    if (img.complete && img.naturalWidth) runFit();

    return () => img.removeEventListener('load', runFit);
  }, [imageSource?.uri, imageUrl, setImageSize, setScale, setOffset]);

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

  useEffect(() => {
    if (activeTool !== 'cuboid_wire') {
      setCuboidWireCorners([]);
      setIsDrawingCuboidWire(false);
    }
  }, [activeTool]);

  // Canvas Ã¼zerinde wheel event listener - sadece canvas Ã¼zerinde zoom yap
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      // Zoom control with limits (Min: 0.1, Max: 5)
      const scaleFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(0.1, Math.min(5, scale * scaleFactor));
      
      if (newScale !== scale) {
        const rect = container.getBoundingClientRect();
        
        // Cursor position relative to container
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        // Image-space point under cursor before zoom
        const imageX = (mouseX - offset.x) / scale;
        const imageY = (mouseY - offset.y) / scale;
        
        // New offset to keep cursor position stable
        const newOffsetX = mouseX - imageX * newScale;
        const newOffsetY = mouseY - imageY * newScale;
        
        console.log('[AnnotationCanvas] Zoom - scale:', scale, '->', newScale);
        console.log('[AnnotationCanvas] Zoom - mouse:', { mouseX, mouseY });
        console.log('[AnnotationCanvas] Zoom - image point:', { imageX, imageY });
        console.log('[AnnotationCanvas] Zoom - old offset:', { x: offset.x, y: offset.y });
        console.log('[AnnotationCanvas] Zoom - new offset:', { x: newOffsetX, y: newOffsetY });
        
        setScale(newScale);
        setOffset({ x: newOffsetX, y: newOffsetY });
      }
    };

    // Sadece container Ã¼zerinde wheel event listener ekle
    container.addEventListener('wheel', handleWheel, { passive: false });

    // Cleanup
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [scale, offset]);

  return (
    <View style={styles.container}>
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          overflow: 'auto', // Sayfa scroll'unu serbest bÄ±rak
          touchAction: 'auto', // Touch ve wheel action'larÄ±nÄ± serbest bÄ±rak
        }}
      >
        {!hideFloatingToolbar ? (
          <CanvasToolbar
            activeTool={activeTool}
            brushColor={brushColor}
            isPaletteOpen={isPaletteOpen}
            onToolChange={(tool) => {
              try {
                onToolChange?.(tool as Tool);
              } catch (e) {
                console.error('Tool change error:', e);
              }
            }}
            onBrushColorChange={setBrushColor}
            onPaletteToggle={() => setIsPaletteOpen(!isPaletteOpen)}
            onResetView={() => resetViewToFit()}
          />
        ) : null}
        
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
            cursor:
              (activeTool as any) === 'pan'
                ? isPanning
                  ? 'grabbing'
                  : 'grab'
                : (activeTool as any) === 'bbox' ||
                    (activeTool as any) === 'points' ||
                    (activeTool as any) === 'cuboid_wire'
                  ? 'crosshair'
                  : 'default',
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: '0 0',
            // Tüm isabet üstteki şeffaf div’de; SVG onClick’leri (nokta vb.) hayalet tıklamayla seçim yapmasın
            pointerEvents: 'none',
          }}
          viewBox={imageSize ? `0 0 ${imageSize.w} ${imageSize.h}` : '0 0 100 100'}
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Render annotations using layer components */}
          {(annotations || []).map((annotation) => {
            const isSelected = annotation.id === selectedId;
            
            switch (annotation.type) {
              case 'bbox':
                return (
                  <BboxLayer
                    key={annotation.id}
                    annotation={annotation}
                    isSelected={isSelected}
                    scale={scale}
                    imageToScreen={imageToScreen}
                    onSelect={() => selectShapeIfPan(annotation.id)}
                  />
                );
              
              case 'polygon':
                return (
                  <PolygonLayer
                    key={annotation.id}
                    annotation={annotation}
                    isSelected={isSelected}
                    scale={scale}
                    imageToScreen={imageToScreen}
                    onSelect={() => selectShapeIfPan(annotation.id)}
                  />
                );
              
              case 'point':
                return (
                  <PointLayer
                    key={annotation.id}
                    annotation={annotation}
                    isSelected={isSelected}
                    scale={scale}
                    imageToScreen={imageToScreen}
                    onSelect={() => selectShapeIfPan(annotation.id)}
                    allowPointerHit={activeTool === 'pan' || activeTool === 'select'}
                  />
                );
              
              case 'brush':
                return (
                  <BrushLayer
                    key={annotation.id}
                    annotation={annotation}
                    isSelected={isSelected}
                    scale={scale}
                    imageToScreen={imageToScreen}
                    onSelect={() => selectShapeIfPan(annotation.id)}
                  />
                );
              
              case 'cuboid':
                return (
                  <CuboidLayer
                    key={annotation.id}
                    annotation={annotation}
                    isSelected={isSelected}
                    scale={scale}
                    imageToScreen={imageToScreen}
                    onSelect={() => selectShapeIfPan(annotation.id)}
                    activeTool={activeTool}
                  />
                );

              case 'cuboid_wire':
                return (
                  <CuboidWireLayer
                    key={annotation.id}
                    annotation={annotation as CuboidWireAnnotation}
                    isSelected={isSelected}
                    scale={scale}
                    imageToScreen={imageToScreen}
                    onSelect={() => selectShapeIfPan(annotation.id)}
                    activeTool={activeTool}
                  />
                );
              
              case 'ellipse':
                return (
                  <EllipseLayer
                    key={annotation.id}
                    annotation={annotation}
                    isSelected={isSelected}
                    scale={scale}
                    imageToScreen={imageToScreen}
                    onSelect={() => selectShapeIfPan(annotation.id)}
                    activeTool={activeTool}
                  />
                );
              
              case 'polyline':
                return (
                  <PolylineLayer
                    key={annotation.id}
                    annotation={annotation}
                    isSelected={isSelected}
                    scale={scale}
                    imageToScreen={imageToScreen}
                    onSelect={() => selectShapeIfPan(annotation.id)}
                    activeTool={activeTool}
                  />
                );

              case 'semantic':
              case 'magic_wand': {
                const pts = (annotation as any).points as { x: number; y: number }[] | undefined;
                if (!pts?.length) return null;
                return (
                  <PolygonLayer
                    key={annotation.id}
                    annotation={{
                      id: annotation.id,
                      type: 'polygon',
                      points: pts,
                      label: String((annotation as any).label ?? ''),
                    }}
                    isSelected={isSelected}
                    scale={scale}
                    imageToScreen={imageToScreen}
                    onSelect={() => selectShapeIfPan(annotation.id)}
                    bboxStyleResizeHandles={
                      annotation.type === 'semantic' || annotation.type === 'magic_wand'
                    }
                  />
                );
              }

              default:
                return null;
            }
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
                  strokeDasharray="4 3" 
                  fill="none" 
                  strokeWidth={1 / Math.max(scale, 0.08)} 
                />
              ) : (
                // BBox preview for other tools
                <rect
                  x={drawPreview.x}
                  y={drawPreview.y}
                  width={drawPreview.width}
                  height={drawPreview.height}
                  stroke="#3b82f6" // Blue for drawing focus
                  strokeWidth={1}
                  strokeDasharray="4 3"
                  fill="none"
                  style={{
                    vectorEffect: 'non-scaling-stroke',
                  }}
                />
              )}
            </>
          )}
          
          {/* Cuboid depth preview */}
          {(() => {
            // Global gÃ¼venlik (Crash-Proof)
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
                      x={x + (dx || 0)}
                      y={y + (dy || 0)}
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
                    {/* 1. Sol Ãœst: (x,y)->(x+dx,y+dy) */}
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
                    {/* 2. SaÄŸ Ãœst: (x+w,y)->(x+w+dx,y+dy) */}
                    <line
                      x1={(x || 0) + (width || 0)}
                      y1={y || 0}
                      x2={(x || 0) + (width || 0) + (dx || 0)}
                      y2={(y || 0) + (dy || 0)}
                      stroke="green"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      style={{
                        vectorEffect: 'non-scaling-stroke',
                      }}
                    />
                    {/* 3. Sol Alt: (x,y+h)->(x+dx,y+h+dy) */}
                    <line
                      x1={x || 0}
                      y1={(y || 0) + (height || 0)}
                      x2={(dx || 0)}
                      y2={(y || 0) + (height || 0) + (dy || 0)}
                      stroke="green"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      style={{
                        vectorEffect: 'non-scaling-stroke',
                      }}
                    />
                    {/* 4. SaÄŸ Alt: (x+w,y+h)->(x+w+dx,y+h+dy) */}
                    <line
                      x1={(x || 0) + (width || 0)}
                      y1={(y || 0) + (height || 0)}
                      x2={(x || 0) + (width || 0) + (dx || 0)}
                      y2={(y || 0) + (height || 0) + (dy || 0)}
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
              <polyline points={polylinePoints.map((p: any) => `${p.x},${p.y}`).join(' ')} stroke="yellow" strokeWidth={2} fill="none" />
              {polylinePoints.map((p: any, i: any) => <circle key={i} cx={p.x} cy={p.y} r={4} fill="yellow" stroke="white" />)}
              {polylinePreviewPoint && <line x1={polylinePoints[polylinePoints.length-1].x} y1={polylinePoints[polylinePoints.length-1].y} x2={polylinePreviewPoint.x} y2={polylinePreviewPoint.y} stroke="yellow" strokeDasharray="5,5" />}
            </g>
          )}

          {/* Cuboid Preview Render */}
          {activeDrawing?.tool === 'cuboid' && (
            <g stroke="green" strokeWidth={2} fill="rgba(0,255,0,0.1)">
              <rect x={activeDrawing.x} y={activeDrawing.y} width={activeDrawing.width} height={activeDrawing.height} />
              {activeDrawing.step === 2 && (
                <>
                  <rect x={(activeDrawing.x || 0) + (activeDrawing.dx || 0)} y={(activeDrawing.y || 0) + (activeDrawing.dy || 0)} width={activeDrawing.width || 0} height={activeDrawing.height || 0} />
                  <line x1={activeDrawing.x || 0} y1={activeDrawing.y || 0} x2={(activeDrawing.x || 0) + (activeDrawing.dx || 0)} y2={(activeDrawing.y || 0) + (activeDrawing.dy || 0)} />
                  <line x1={(activeDrawing.x || 0) + (activeDrawing.width || 0)} y1={activeDrawing.y || 0} x2={(activeDrawing.x || 0) + (activeDrawing.width || 0) + (activeDrawing.dx || 0)} y2={(activeDrawing.y || 0) + (activeDrawing.dy || 0)} />
                  <line x1={activeDrawing.x || 0} y1={(activeDrawing.y || 0) + (activeDrawing.height || 0)} x2={(activeDrawing.x || 0) + (activeDrawing.dx || 0)} y2={(activeDrawing.y || 0) + (activeDrawing.height || 0) + (activeDrawing.dy || 0)} />
                  <line x1={activeDrawing.x || 0} y1={(activeDrawing.y || 0) + (activeDrawing.height || 0)} x2={(activeDrawing.x || 0) + (activeDrawing.width || 0) + (activeDrawing.dx || 0)} y2={(activeDrawing.y || 0) + (activeDrawing.height || 0) + (activeDrawing.dy || 0)} />
                </>
              )}
            </g>
          )}
          
          {/* Polygon drawing preview */}
          {isDrawingPolygon && polygonPoints.length > 0 && (
            <>
              {/* Draw lines between existing points */}
              {(polygonPoints || []).map((point: any, index: any) => {
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
                    strokeWidth={1}
                    strokeLinecap="round"
                    style={{
                      vectorEffect: 'non-scaling-stroke',
                    }}
                  />
                );
              })}
              
              {/* Kapanış önizlemesi: son köşeden ilke; 3+ köşede ilk noktaya tıklayınca biter */}
              {polygonPoints.length >= 2 && (
                <line
                  x1={polygonPoints[polygonPoints.length - 1].x}
                  y1={polygonPoints[polygonPoints.length - 1].y}
                  x2={polygonPoints[0].x}
                  y2={polygonPoints[0].y}
                  stroke={polygonPoints.length >= 3 ? '#22c55e' : '#64748b'}
                  strokeWidth={1}
                  strokeLinecap="round"
                  opacity={polygonPoints.length >= 3 ? 0.95 : 0.7}
                  style={{ vectorEffect: 'non-scaling-stroke' }}
                />
              )}

              {polylinePreviewPoint && polygonPoints.length > 0 && (
                <line
                  x1={polygonPoints[polygonPoints.length - 1].x}
                  y1={polygonPoints[polygonPoints.length - 1].y}
                  x2={polylinePreviewPoint.x}
                  y2={polylinePreviewPoint.y}
                  stroke="#60a5fa"
                  strokeWidth={1}
                  strokeOpacity={0.7}
                  strokeLinecap="round"
                  strokeDasharray="3 3"
                  style={{ vectorEffect: 'non-scaling-stroke' }}
                />
              )}

              {/* Draw points */}
              {(polygonPoints || []).map((point: any, index: any) => (
                <circle
                  key={`point-${index}`}
                  cx={point.x}
                  cy={point.y}
                  r={index === 0 && polygonPoints.length >= 3 ? vertexR * 1.2 : vertexR * 0.92}
                  fill={index === 0 && polygonPoints.length >= 3 ? '#22c55e' : '#3b82f6'}
                  stroke="#FFFFFF"
                  strokeWidth={0.75}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </>
          )}

          {isDrawingCuboidWire && cuboidWireCorners.length > 0 && (() => {
            const c = cuboidWireCorners;
            const n = c.length;
            const sw = 1 / Math.max(scale, 0.08);
            const depthCount = Math.min(Math.max(n - 4, 0), 4);
            return (
              <g>
                {n >= 2 &&
                  c.slice(1).map((pt, i) => (
                    <line
                      key={`cw-seq-${i}`}
                      x1={c[i].x}
                      y1={c[i].y}
                      x2={pt.x}
                      y2={pt.y}
                      stroke="#a78bfa"
                      strokeWidth={sw}
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                {n >= 4 && (
                  <line
                    x1={c[3].x}
                    y1={c[3].y}
                    x2={c[0].x}
                    y2={c[0].y}
                    stroke="#a78bfa"
                    strokeWidth={sw}
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                )}
                {depthCount > 0 &&
                  Array.from({ length: depthCount }, (_, i) => (
                    <line
                      key={`cw-d-${i}`}
                      x1={c[i].x}
                      y1={c[i].y}
                      x2={c[i + 4].x}
                      y2={c[i + 4].y}
                      stroke="#94a3b8"
                      strokeWidth={sw * 0.85}
                      strokeDasharray="4 3"
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                {n < 8 && polylinePreviewPoint && n >= 1 && (
                  <line
                    x1={c[n - 1].x}
                    y1={c[n - 1].y}
                    x2={polylinePreviewPoint.x}
                    y2={polylinePreviewPoint.y}
                    stroke="#c4b5fd"
                    strokeWidth={sw}
                    strokeDasharray="3 3"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                )}
                {c.map((pt, i) => (
                  <circle
                    key={`cwv-${i}`}
                    cx={pt.x}
                    cy={pt.y}
                    r={vertexR * 0.9}
                    fill="#a78bfa"
                    stroke="#fff"
                    strokeWidth={0.75}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </g>
            );
          })()}
          
          {/* Brush Ã–nizleme */}
          {activeTool === 'brush' && brushPoints.length > 0 && (
            <polyline
              points={brushPoints.map((p: any) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke={brushColor}
              strokeWidth={Math.max(1.5, DEFAULT_BRUSH_WIDTH / Math.max(scale, 0.08))}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          )}
          
          {/* KaydedilmiÅŸ Brush Ã‡izimleri */}
          {(savedBrushes || []).map((brush: any) => (
            <polyline
              key={brush.id}
              points={brush.points.map((p: any) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke={brush.color}
              strokeWidth={Math.max(1.5, (brush.width || DEFAULT_BRUSH_WIDTH) / Math.max(scale, 0.08))}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              style={{ pointerEvents: 'auto', cursor: 'pointer' }}
              onClick={() => selectShapeIfPan(brush.id)}
            />
          ))}
          
          {/* Polyline drawing preview */}
          {isDrawingPolyline && polylinePoints.length > 0 && (
            <>
              {/* Draw lines between existing points */}
              {(polylinePoints || []).map((point: any, index: any) => {
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
                    strokeWidth={1}
                    strokeLinecap="round"
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
                  strokeWidth={1}
                  strokeLinecap="round"
                  strokeDasharray="3 3"
                  strokeOpacity={0.75}
                  style={{
                    vectorEffect: 'non-scaling-stroke',
                  }}
                />
              )}
              
              {/* Draw points */}
              {(polylinePoints || []).map((point: any, index: any) => (
                <circle
                  key={`polyline-point-${index}`}
                  cx={point.x}
                  cy={point.y}
                  r={vertexR}
                  fill="#3b82f6"
                  stroke="#FFFFFF"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              
              {/* Draw preview point at mouse position */}
              {polylinePreviewPoint && (
                <circle
                  key="polyline-preview-point"
                  cx={polylinePreviewPoint.x}
                  cy={polylinePreviewPoint.y}
                  r={vertexR}
                  fill="#3b82f6"
                  stroke="#FFFFFF"
                  strokeWidth={1}
                  fillOpacity={0.5}
                  vectorEffect="non-scaling-stroke"
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
            // Görüntü doğal boyutundan küçük kalırsa scroll alanında SVG’ye tıklama kaçmasın
            width: imageSize ? imageSize.w : '100%',
            height: imageSize ? imageSize.h : '100%',
            cursor:
              (activeTool as any) === 'pan'
                ? isPanning
                  ? 'grabbing'
                  : 'grab'
                : (activeTool as any) === 'bbox' ||
                    (activeTool as any) === 'points' ||
                    (activeTool as any) === 'cuboid_wire'
                  ? 'crosshair'
                  : 'default',
            touchAction: 'none',
            pointerEvents: 'auto',
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onPointerDown={(e) => {
            if (e.button === 2) {
              e.preventDefault();
              handlePointerDown(e);
              return;
            }
            e.preventDefault(); // Prevent native drag
            try {
              (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
            } catch {
              /* ignore */
            }
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
          }}
        />
      </div>
    </View>
  );
});
