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
  type SemanticAnnotation,
  type MagicWandAnnotation,
  type Annotation,
  MIN_BOX_SIZE,
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
  onAnnotationsChange: (annotations: Annotation[]) => void;
  activeTool: Tool;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  selectedLabel?: string | null;
  onToolChange?: (tool: Tool) => void;
  onUndo?: () => void;
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
}: AnnotationCanvasProps, ref) {
  const { t } = useTranslation();
  const canvasRef = useRef<{
    handleUndo: () => void;
  } | null>(null);
  
  // Use canvas logic hook for scale, offset, and coordinate functions
  const {
    scale,
    offset,
    imageSize,
    isPanning,
    containerRef,
    imgRef,
    screenToImage,
    imageToScreen,
    getHandleAt,
    handleWheel,
    initializeImage,
    setScale,
    setOffset,
    setImageSize,
  } = useCanvasLogic();
  
  // Use annotation actions hook for all pointer event handling
  const {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  } = useAnnotationActions({
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
    imageSize,
    MIN_BOX_SIZE,
  });


  // Image load with initial fit
  useEffect(() => {
    const img = imgRef.current;
    const container = containerRef.current;
    if (!img || !container || !imageSource?.uri && !imageUrl) return;
    
    const handleLoad = () => {
      const naturalWidth = img.naturalWidth;
      const naturalHeight = img.naturalHeight;
      
      setImageSize({ w: naturalWidth, h: naturalHeight });
      
      // Calculate initial scale to fit image in container using helper
      const containerRect = container.getBoundingClientRect();
      const { scale: initialScale, offset } = calculateInitialFit(naturalWidth, naturalHeight, containerRect.width, containerRect.height);
      
      setScale(initialScale);
      setOffset(offset);
    };
    
    img.src = imageSource?.uri || imageUrl || '';
  }, [imageSource?.uri, imageUrl, containerRef, setImageSize, setScale, setOffset]);

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
        <CanvasToolbar
          activeTool={activeTool}
          brushColor={brushColor}
          isPaletteOpen={isPaletteOpen}
          onToolChange={onToolChange}
          onBrushColorChange={setBrushColor}
          onPaletteToggle={() => setIsPaletteOpen(!isPaletteOpen)}
        />
        
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
            cursor: (activeTool as any) === 'pan' ? (isPanning ? 'grabbing' : 'grab') : ((activeTool as any) === 'bbox' || (activeTool as any) === 'points' ? 'crosshair' : 'default'),
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: '0 0',
            pointerEvents: 'auto', // Always auto to allow resize handles
          }}
          viewBox={imageSize ? `0 0 ${imageSize.w} ${imageSize.h}` : '0 0 100 100'}
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Render annotations using layer components */}
          {annotations.map((annotation) => {
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
                    onSelect={() => onSelect?.(annotation.id)}
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
                    onSelect={() => onSelect?.(annotation.id)}
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
                    onSelect={() => onSelect?.(annotation.id)}
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
                    onSelect={() => onSelect?.(annotation.id)}
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
                    onSelect={() => onSelect?.(annotation.id)}
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
                    onSelect={() => onSelect?.(annotation.id)}
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
                    onSelect={() => onSelect?.(annotation.id)}
                    activeTool={activeTool}
                  />
                );
                
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
          
          {/* Brush Ã–nizleme */}
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
          
          {/* KaydedilmiÅŸ Brush Ã‡izimleri */}
          {savedBrushes.map((brush) => (
            <polyline
              key={brush.id}
              points={brush.points.map((p: any) => `${p.x},${p.y}`).join(' ')}
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
            cursor: (activeTool as any) === 'pan' ? (isPanning ? 'grabbing' : 'grab') : ((activeTool as any) === 'bbox' || (activeTool as any) === 'points' ? 'crosshair' : 'default'),
            touchAction: 'none',
            pointerEvents: 'auto', // ALWAYS ACTIVE - manages all events
          }}
          onPointerDown={(e) => {
            e.preventDefault(); // Prevent native drag
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
