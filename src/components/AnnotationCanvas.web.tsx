import React, { useRef, useState, useCallback, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { ANNOTATION_LABELS, LABEL_COLORS } from '@/constants/annotationLabels';

export type Tool = 'bbox' | 'polygon' | 'select';

export type BboxHandle = 'tl' | 'tr' | 'br' | 'bl';

export interface BboxAnnotation {
  id: string;
  type: 'bbox';
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  z_index?: number;
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

const SNAP_DISTANCE = 20;
const HANDLE_HIT = 12;
const HANDLE_SIZE = 8;

function getLabelColor(label: string): string {
  return LABEL_COLORS[label] ?? LABEL_COLORS['Diğer'] ?? '#64748b';
}

export default function AnnotationCanvas({
  imageSource: imageSourceProp,
  imageUrl,
  initialAnnotations: _initialAnnotations,
  taskId: _taskId,
  annotations,
  onAnnotationsChange,
  activeTool = 'select',
  selectedId,
  onSelect,
  onImageDimensions,
  isBrushActive: isBrushActiveProp,
  brushSize: brushSizeProp = 12,
  selectedLabel = '',
}: AnnotationCanvasProps) {
  const imageSource = imageSourceProp ?? (imageUrl ? { uri: imageUrl } : null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const brushCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const resizeStartRef = useRef<{ box: BboxAnnotation; px: number; py: number } | null>(null);

  const [imageSize, setImageSize] = useState<{ w: number; h: number } | null>(null);
  const [imgElement, setImgElement] = useState<HTMLImageElement | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [bboxPreview, setBboxPreview] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [polyPoints, setPolyPoints] = useState<Array<{ x: number; y: number }>>([]);
  const [polyPreview, setPolyPreview] = useState<{ x: number; y: number } | null>(null);
  const [labelPicker, setLabelPicker] = useState<{ x: number; y: number } | null>(null);
  const [pendingAnnotation, setPendingAnnotation] = useState<Partial<BboxAnnotation | PolygonAnnotation> | null>(null);
  const [isBrushActiveState, setIsBrushActiveState] = useState(false);
  const [brushSizeState, setBrushSizeState] = useState(12);
  const [resizingHandle, setResizingHandle] = useState<BboxHandle | null>(null);

  const isBrushActive = isBrushActiveProp ?? isBrushActiveState;
  const brushSize = brushSizeProp ?? brushSizeState;

  const getHandleAt = useCallback(
    (box: BboxAnnotation, px: number, py: number): BboxHandle | null => {
      const { x, y, width, height } = box;
      const corners: { h: BboxHandle; cx: number; cy: number }[] = [
        { h: 'tl', cx: x, cy: y },
        { h: 'tr', cx: x + width, cy: y },
        { h: 'br', cx: x + width, cy: y + height },
        { h: 'bl', cx: x, cy: y + height },
      ];
      for (const { h, cx, cy } of corners) {
        if (Math.abs(px - cx) <= HANDLE_HIT && Math.abs(py - cy) <= HANDLE_HIT) return h;
      }
      return null;
    },
    []
  );

  const getNextZIndex = useCallback(() => {
    let max = 0;
    for (const a of annotations) {
      if (a.type === 'bbox' && (a.z_index ?? 0) > max) max = a.z_index ?? 0;
    }
    return max + 1;
  }, [annotations]);

  const screenToImage = useCallback(
    (clientX: number, clientY: number) => {
      const container = containerRef.current;
      if (!container) return { x: 0, y: 0 };
      const rect = container.getBoundingClientRect();
      const relX = clientX - rect.left;
      const relY = clientY - rect.top;

      const img = imgElement;
      if (img && imageSize && imageSize.w > 0 && imageSize.h > 0) {
        const imgRect = img.getBoundingClientRect();
        if (imgRect.width <= 0 || imgRect.height <= 0) {
          const scaleUsed = scale || 1;
          const ix = (relX - offset.x) / scaleUsed;
          const iy = (relY - offset.y) / scaleUsed;
          return {
            x: Math.max(0, Math.min(imageSize.w, ix)),
            y: Math.max(0, Math.min(imageSize.h, iy)),
          };
        }
        const scaleFit = Math.min(imgRect.width / imageSize.w, imgRect.height / imageSize.h);
        const contentW = imageSize.w * scaleFit;
        const contentH = imageSize.h * scaleFit;
        const contentLeft = imgRect.left + (imgRect.width - contentW) / 2;
        const contentTop = imgRect.top + (imgRect.height - contentH) / 2;
        const ix = (clientX - contentLeft) / scaleFit;
        const iy = (clientY - contentTop) / scaleFit;
        return {
          x: Math.max(0, Math.min(imageSize.w, ix)),
          y: Math.max(0, Math.min(imageSize.h, iy)),
        };
      }
      const scaleUsed = scale || 1;
      return {
        x: (relX - offset.x) / scaleUsed,
        y: (relY - offset.y) / scaleUsed,
      };
    },
    [scale, offset, imgElement, imageSize]
  );

  const imageToScreen = useCallback(
    (ix: number, iy: number) => {
      const img = imgElement;
      const container = containerRef.current;
      if (img && container && imageSize && imageSize.w > 0 && imageSize.h > 0) {
        const imgRect = img.getBoundingClientRect();
        if (imgRect.width <= 0 || imgRect.height <= 0) {
          return { x: ix * scale + offset.x, y: iy * scale + offset.y };
        }
        // Match screenToImage: object-fit contain
        const scaleFit = Math.min(imgRect.width / imageSize.w, imgRect.height / imageSize.h);
        const contentW = imageSize.w * scaleFit;
        const contentH = imageSize.h * scaleFit;
        const contentLeft = imgRect.left + (imgRect.width - contentW) / 2;
        const contentTop = imgRect.top + (imgRect.height - contentH) / 2;
        const cRect = container.getBoundingClientRect();
        return {
          x: contentLeft - cRect.left + ix * scaleFit,
          y: contentTop - cRect.top + iy * scaleFit,
        };
      }
      return { x: ix * scale + offset.x, y: iy * scale + offset.y };
    },
    [scale, offset, imgElement, imageSize]
  );

  useEffect(() => {
    const el = brushCanvasRef.current;
    const container = containerRef.current;
    if (el && container) {
      const w = container.offsetWidth;
      const h = container.offsetHeight;
      if (w > 0 && h > 0) {
        el.width = w;
        el.height = h;
      }
    }
  });

  useEffect(() => {
    if (!imgElement || !imageSource?.uri) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      setImageSize({ w, h });
      onImageDimensions?.(w, h);
    };
    img.src = imageSource.uri;
  }, [imageSource?.uri, imgElement, onImageDimensions]);

  const addAnnotation = useCallback(
    (ann: BboxAnnotation | PolygonAnnotation) => {
      const next = [...annotations, ann];
      onAnnotationsChange(next);
      setPendingAnnotation(null);
      setLabelPicker(null);
    },
    [annotations, onAnnotationsChange]
  );

  const updateAnnotation = useCallback(
    (id: string, updater: (a: Annotation) => Annotation) => {
      const next = annotations.map((a) => (a.id === id ? updater(a) : a));
      onAnnotationsChange(next);
    },
    [annotations, onAnnotationsChange]
  );

  const removeAnnotation = useCallback(
    (id: string) => {
      onAnnotationsChange(annotations.filter((a) => a.id !== id));
      onSelect?.(null);
    },
    [annotations, onAnnotationsChange, onSelect]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      if (isBrushActive) return;
      const pt = screenToImage(e.clientX, e.clientY);
      const px = pt.x;
      const py = pt.y;
      const rect = containerRef.current?.getBoundingClientRect();
      const sx = rect ? e.clientX - rect.left : px;
      const sy = rect ? e.clientY - rect.top : py;

      if (activeTool === 'bbox') {
        setDragStart({ x: px, y: py });
        setBboxPreview({ x: px, y: py, w: 0, h: 0 });
        return;
      }

      if (activeTool === 'polygon') {
        if (polyPoints.length === 0) {
          setPolyPoints([{ x: px, y: py }]);
          return;
        }
        const first = polyPoints[0];
        const dist = Math.hypot(px - first.x, py - first.y);
        if (dist <= SNAP_DISTANCE) {
          setLabelPicker({ x: sx, y: sy });
          setPendingAnnotation({
            type: 'polygon',
            id: `poly-${Date.now()}`,
            points: [...polyPoints],
            label: '',
          });
          setPolyPoints([]);
          setPolyPreview(null);
          return;
        }
        setPolyPoints((prev) => [...prev, { x: px, y: py }]);
        return;
      }

      if (activeTool === 'select') {
        const selBox = selectedId ? annotations.find((a) => a.type === 'bbox' && a.id === selectedId) as BboxAnnotation | undefined : undefined;
        if (selBox) {
          const handle = getHandleAt(selBox, px, py);
          if (handle) {
            setResizingHandle(handle);
            resizeStartRef.current = { box: selBox, px, py };
            return;
          }
        }
        const clicked = [...annotations].reverse().find((a) => {
          if (a.type === 'bbox') {
            return px >= a.x && px <= a.x + a.width && py >= a.y && py <= a.y + a.height;
          }
          const pts = a.points;
          let inside = false;
          for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
            const xi = pts[i].x, yi = pts[i].y;
            const xj = pts[j].x, yj = pts[j].y;
            if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) inside = !inside;
          }
          return inside;
        });
        onSelect?.(clicked?.id ?? null);
      }
    },
    [activeTool, polyPoints, screenToImage, annotations, onSelect, isBrushActive, selectedId, getHandleAt]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (isBrushActive) return;
      const pt = screenToImage(e.clientX, e.clientY);
      const px = pt.x;
      const py = pt.y;

      if (resizingHandle && resizeStartRef.current) {
        const { box } = resizeStartRef.current;
        const x2 = box.x + box.width;
        const y2 = box.y + box.height;
        let nx: number, ny: number, nw: number, nh: number;
        switch (resizingHandle) {
          case 'tl':
            nx = Math.min(px, x2 - 2);
            ny = Math.min(py, y2 - 2);
            nw = x2 - nx;
            nh = y2 - ny;
            break;
          case 'tr':
            nx = box.x;
            ny = Math.min(py, y2 - 2);
            nw = Math.max(px - box.x, 2);
            nh = y2 - ny;
            break;
          case 'br':
            nx = box.x;
            ny = box.y;
            nw = Math.max(px - box.x, 2);
            nh = Math.max(py - box.y, 2);
            break;
          case 'bl':
            nx = Math.min(px, x2 - 2);
            ny = box.y;
            nw = x2 - nx;
            nh = Math.max(py - box.y, 2);
            break;
          default:
            return;
        }
        if (nw < 2) { nw = 2; nx = x2 - 2; }
        if (nh < 2) { nh = 2; ny = y2 - 2; }
        updateAnnotation(box.id, (a) =>
          a.type === 'bbox' ? { ...a, x: nx, y: ny, width: nw, height: nh } : a
        );
        return;
      }

      if (activeTool === 'bbox' && dragStart) {
        const x = Math.min(dragStart.x, px);
        const y = Math.min(dragStart.y, py);
        const w = Math.abs(px - dragStart.x);
        const h = Math.abs(py - dragStart.y);
        setBboxPreview({ x, y, w, h });
        return;
      }

      if (activeTool === 'polygon' && polyPoints.length > 0) {
        setPolyPreview({ x: px, y: py });
      }
    },
    [activeTool, dragStart, polyPoints, screenToImage, isBrushActive, resizingHandle, updateAnnotation]
  );

  const handlePointerUp = useCallback(() => {
    if (isBrushActive) return;
    if (resizingHandle) {
      setResizingHandle(null);
      resizeStartRef.current = null;
      return;
    }
    if (activeTool === 'bbox' && dragStart && bboxPreview) {
      const { x, y, w, h } = bboxPreview;
      if (w > 2 && h > 2) {
        const label = selectedLabel && selectedLabel.trim() ? selectedLabel.trim() : '';
        if (label) {
          addAnnotation({
            id: `bbox-${Date.now()}`,
            type: 'bbox',
            x, y, width: w, height: h,
            label,
            z_index: getNextZIndex(),
          });
        } else {
          const center = imageToScreen(x + w / 2, y + h / 2);
          setLabelPicker({ x: center.x, y: center.y });
          setPendingAnnotation({
            type: 'bbox',
            id: `bbox-${Date.now()}`,
            x, y, width: w, height: h,
            label: '',
            z_index: getNextZIndex(),
          });
        }
      }
      setDragStart(null);
      setBboxPreview(null);
    }
  }, [activeTool, dragStart, bboxPreview, isBrushActive, resizingHandle, selectedLabel, addAnnotation, getNextZIndex, imageToScreen]);

  const handleLabelSelect = useCallback(
    (label: string) => {
      if (!pendingAnnotation) return;
      if (pendingAnnotation.type === 'bbox' && pendingAnnotation.x != null && pendingAnnotation.y != null && pendingAnnotation.width != null && pendingAnnotation.height != null) {
        addAnnotation({
          id: pendingAnnotation.id!,
          type: 'bbox',
          x: pendingAnnotation.x,
          y: pendingAnnotation.y,
          width: pendingAnnotation.width,
          height: pendingAnnotation.height,
          label,
          z_index: pendingAnnotation.z_index ?? getNextZIndex(),
        });
      } else if (pendingAnnotation.type === 'polygon' && 'points' in pendingAnnotation) {
        addAnnotation({
          id: pendingAnnotation.id!,
          type: 'polygon',
          points: pendingAnnotation.points!,
          label,
        });
      }
    },
    [pendingAnnotation, addAnnotation, getNextZIndex]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPolyPoints([]);
        setPolyPreview(null);
        setLabelPicker(null);
        setPendingAnnotation(null);
        setDragStart(null);
        setBboxPreview(null);
        setResizingHandle(null);
        resizeStartRef.current = null;
        onSelect?.(null);
      }
      if (e.key === 'Backspace' && selectedId) removeAnnotation(selectedId);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, removeAnnotation, onSelect]);

  if (!imageSource?.uri) {
    return (
      <View style={styles.placeholder}>
        <span style={{ color: '#64748b' }}>Resim yüklenmedi</span>
      </View>
    );
  }

  return (
    <View style={styles.container} pointerEvents="auto">
      <div
        ref={(el) => { containerRef.current = el; }}
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          minHeight: 300,
          overflow: 'hidden',
          background: '#1e293b',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <img
          ref={(el) => setImgElement(el as HTMLImageElement)}
          src={imageSource.uri}
          alt="annotation"
          crossOrigin="anonymous"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            objectPosition: 'center center',
            transform: `translate(${offset.x}px, ${offset.y}px)`,
            pointerEvents: 'none',
          }}
        />
        <svg
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
          }}
        >
          {annotations.map((a) => {
            if (a.type === 'bbox') {
              const c = getLabelColor(a.label);
              const sel = a.id === selectedId;
              const sc = imageToScreen(a.x, a.y);
              const scBr = imageToScreen(a.x + a.width, a.y + a.height);
              const sw = scBr.x - sc.x;
              const sh = scBr.y - sc.y;
              const hs = HANDLE_SIZE / 2;
              const corners = [
                    { x: sc.x, y: sc.y },
                    { x: sc.x + sw, y: sc.y },
                    { x: sc.x + sw, y: sc.y + sh },
                    { x: sc.x, y: sc.y + sh },
                  ];
              return (
                <g key={a.id}>
                  <rect
                    x={sc.x}
                    y={sc.y}
                    width={sw}
                    height={sh}
                    fill={c}
                    fillOpacity={0.2}
                    stroke={c}
                    strokeWidth={sel ? 3 : 1}
                  />
                  <text x={sc.x} y={sc.y - 4} fill={c} fontSize={12}>{a.label}</text>
                  {sel && corners.map((corner, i) => (
                    <rect
                      key={i}
                      x={corner.x - hs}
                      y={corner.y - hs}
                      width={HANDLE_SIZE}
                      height={HANDLE_SIZE}
                      fill="#fff"
                      stroke="#3b82f6"
                      strokeWidth={2}
                    />
                  ))}
                </g>
              );
            }
            const pts = a.points.map((p) => imageToScreen(p.x, p.y));
            const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';
            const c = getLabelColor(a.label);
            const sel = a.id === selectedId;
            return (
              <g key={a.id}>
                <path d={d} fill={c} fillOpacity={0.2} stroke={c} strokeWidth={sel ? 3 : 1} />
                <text x={pts[0]?.x ?? 0} y={(pts[0]?.y ?? 0) - 4} fill={c} fontSize={12}>{a.label}</text>
              </g>
            );
          })}
          {bboxPreview && (
            <rect
              x={imageToScreen(bboxPreview.x, bboxPreview.y).x}
              y={imageToScreen(bboxPreview.x, bboxPreview.y).y}
              width={imageToScreen(bboxPreview.x + bboxPreview.w, bboxPreview.y).x - imageToScreen(bboxPreview.x, bboxPreview.y).x}
              height={imageToScreen(bboxPreview.x, bboxPreview.y + bboxPreview.h).y - imageToScreen(bboxPreview.x, bboxPreview.y).y}
              fill="none"
              stroke="#3b82f6"
              strokeWidth={2}
              strokeDasharray="4 2"
            />
          )}
          {polyPoints.map((p, i) => {
            const sp = imageToScreen(p.x, p.y);
            return (
              <circle key={i} cx={sp.x} cy={sp.y} r={i === 0 ? 8 : 6} fill="#3b82f6" stroke="#fff" strokeWidth={2} />
            );
          })}
          {polyPreview && polyPoints.length > 0 && (
            <>
              <line
                x1={imageToScreen(polyPoints[polyPoints.length - 1].x, polyPoints[polyPoints.length - 1].y).x}
                y1={imageToScreen(polyPoints[polyPoints.length - 1].x, polyPoints[polyPoints.length - 1].y).y}
                x2={imageToScreen(polyPreview.x, polyPreview.y).x}
                y2={imageToScreen(polyPreview.x, polyPreview.y).y}
                stroke="#3b82f6"
                strokeWidth={2}
                strokeDasharray="4 2"
              />
              {polyPoints.length >= 2 && (() => {
                const snap = Math.hypot(polyPreview.x - polyPoints[0].x, polyPreview.y - polyPoints[0].y) <= SNAP_DISTANCE;
                const p0 = imageToScreen(polyPoints[0].x, polyPoints[0].y);
                const pp = imageToScreen(polyPreview.x, polyPreview.y);
                return snap ? (
                  <line x1={p0.x} y1={p0.y} x2={pp.x} y2={pp.y} stroke="#22c55e" strokeWidth={3} />
                ) : null;
              })()}
            </>
          )}
        </svg>
        <canvas
          ref={(el) => { brushCanvasRef.current = el; }}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: '100%',
            height: '100%',
            pointerEvents: isBrushActive ? 'auto' : 'none',
            zIndex: 10,
          }}
          onPointerDown={(e) => {
            if (!isBrushActive || !brushCanvasRef.current) return;
            const rect = brushCanvasRef.current.getBoundingClientRect();
            const ctx = brushCanvasRef.current.getContext('2d');
            if (!ctx) return;
            isDrawingRef.current = true;
            ctx.beginPath();
            ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
            ctx.lineWidth = brushSize;
            ctx.strokeStyle = '#3b82f6';
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!isBrushActive || !isDrawingRef.current || !brushCanvasRef.current) return;
            const rect = brushCanvasRef.current.getBoundingClientRect();
            const ctx = brushCanvasRef.current.getContext('2d');
            if (!ctx) return;
            ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
            ctx.stroke();
          }}
          onPointerUp={(e) => {
            isDrawingRef.current = false;
            e.currentTarget.releasePointerCapture(e.pointerId);
          }}
          onPointerLeave={(e) => {
            isDrawingRef.current = false;
            e.currentTarget.releasePointerCapture(e.pointerId);
          }}
        />
        {labelPicker && (
          <div
            style={{
              position: 'absolute',
              left: labelPicker.x,
              top: labelPicker.y,
              transform: 'translate(-50%, -100%)',
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: 8,
              padding: 8,
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
              zIndex: 100,
            }}
          >
            {ANNOTATION_LABELS.map((l) => (
              <button
                key={l}
                onClick={() => handleLabelSelect(l)}
                style={{
                  background: LABEL_COLORS[l],
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '6px 12px',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                {l}
              </button>
            ))}
          </div>
        )}
      </div>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 300 },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 200,
  },
});
