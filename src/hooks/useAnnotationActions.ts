import {
  useCallback,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
} from 'react';
import { Annotation, Tool, MIN_BOX_SIZE } from '@/types/annotations';
import { magicWandPolygonFromImageOrUrl } from '@/lib/magicWandFill';
import {
  resizeBbox,
  computeBboxResizeDeltas,
  distance,
  isPointInPolygon,
  isPointNearLine,
  translateAnnotationByDelta,
  isCuboidBackCornerHandle,
  pointsQuadToBoxBounds,
} from '@/utils/canvasHelpers';
import type { BboxHandle } from '@/types/annotations';

/** Tel kutu çizgileri — ön 0–3, arka 4–7, derinlik i↔i+4 */
const CUBOID_WIRE_EDGES: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 4],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
];

/** Ön + arka yüzün birleşik sınırlayıcı kutusu (tıklanabilir alan) */
function pointInCuboidBounds(
  ann: { x: number; y: number; width: number; height: number; dx?: number; dy?: number },
  image: { x: number; y: number }
): boolean {
  const dx = ann.dx ?? 0;
  const dy = ann.dy ?? 0;
  const minX = Math.min(ann.x, ann.x + dx);
  const maxX = Math.max(ann.x + ann.width, ann.x + ann.width + dx);
  const minY = Math.min(ann.y, ann.y + dy);
  const maxY = Math.max(ann.y + ann.height, ann.y + ann.height + dy);
  return image.x >= minX && image.x <= maxX && image.y >= minY && image.y <= maxY;
}

/** Tuval (pan) modunda tıklanan noktada hangi anotasyon var — üstteki son eşleşme */
function findTopAnnotationAtImagePoint(
  annotations: Annotation[],
  image: { x: number; y: number },
  scale: number
): Annotation | undefined {
  const lineTol = Math.max(10 / Math.max(scale, 0.08), 6);
  const pointTol = Math.max(14 / Math.max(scale, 0.08), 8);

  const contains = (ann: Annotation): boolean => {
    switch (ann.type) {
      case 'bbox':
        return (
          image.x >= ann.x &&
          image.x <= ann.x + ann.width &&
          image.y >= ann.y &&
          image.y <= ann.y + ann.height
        );
      case 'cuboid':
        return pointInCuboidBounds(ann, image);
      case 'ellipse': {
        const dx = image.x - ann.cx;
        const dy = image.y - ann.cy;
        const rx = Math.max(ann.rx, 1);
        const ry = Math.max(ann.ry, 1);
        return (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1;
      }
      case 'polygon':
        return ann.points.length >= 3 && isPointInPolygon(image.x, image.y, ann.points);
      case 'polyline':
        if (ann.points.length < 2) return false;
        for (let i = 0; i < ann.points.length - 1; i++) {
          if (isPointNearLine(image, ann.points[i], ann.points[i + 1], lineTol)) return true;
        }
        return false;
      case 'cuboid_wire': {
        const corners = ann.corners;
        if (!corners || corners.length !== 8) return false;
        for (const [a, b] of CUBOID_WIRE_EDGES) {
          if (isPointNearLine(image, corners[a], corners[b], lineTol)) return true;
        }
        return false;
      }
      case 'point':
        return distance(image, { x: ann.x, y: ann.y }) < pointTol;
      case 'brush':
        if (ann.points.length < 2) return false;
        for (let i = 0; i < ann.points.length - 1; i++) {
          if (isPointNearLine(image, ann.points[i], ann.points[i + 1], lineTol)) return true;
        }
        return false;
      case 'semantic':
      case 'magic_wand': {
        const pts = ann.points;
        if (!pts || pts.length < 3) return false;
        return isPointInPolygon(image.x, image.y, pts);
      }
      default:
        return false;
    }
  };

  for (let i = annotations.length - 1; i >= 0; i--) {
    if (contains(annotations[i])) return annotations[i];
  }
  return undefined;
}

type Pt = { x: number; y: number };

/** Görüntü uzayında silgi “tüpü” — fırça genişliğine yakın. */
function eraserRadius(scale: number): number {
  return Math.max(18 / Math.max(scale, 0.08), 10);
}

function newBrushSplitId(): string {
  return `brush-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function ptNearPolyline(p: Pt, poly: Pt[], r: number): boolean {
  if (poly.length === 0) return false;
  if (poly.length === 1) return distance(p, poly[0]) <= r;
  for (let i = 0; i < poly.length - 1; i++) {
    if (isPointNearLine(p, poly[i], poly[i + 1], r)) return true;
  }
  return false;
}

/** Uzun segmentlerin ortası da silgiye yakın sayılsın diye nokta ekler. */
function densifyPolyline(brushPts: Pt[], maxStep: number): Pt[] {
  if (brushPts.length < 2) return [...brushPts];
  const out: Pt[] = [brushPts[0]];
  for (let i = 0; i < brushPts.length - 1; i++) {
    const a = brushPts[i];
    const b = brushPts[i + 1];
    const len = distance(a, b);
    const steps = Math.max(1, Math.ceil(len / Math.max(maxStep, 0.5)));
    for (let k = 1; k < steps; k++) {
      const t = k / steps;
      out.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
    }
    out.push(b);
  }
  return out;
}

function brushTouchesEraserPolyline(brushPts: Pt[], eraserPath: Pt[], r: number): boolean {
  for (const p of brushPts) {
    if (ptNearPolyline(p, eraserPath, r)) return true;
  }
  for (let i = 0; i < brushPts.length - 1; i++) {
    const a = brushPts[i];
    const b = brushPts[i + 1];
    const steps = Math.max(1, Math.ceil(distance(a, b) / 5));
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const q = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
      if (ptNearPolyline(q, eraserPath, r)) return true;
    }
  }
  return false;
}

/** Silgi poliline çok yakın noktaları at; kalan ardışık parçalar ayrı fırça zincirleri. */
function trimBrushVerticesNearEraserPolyline(brushPts: Pt[], eraserPath: Pt[], r: number): Pt[][] {
  if (brushPts.length < 2 || eraserPath.length < 1) return brushPts.length >= 2 ? [brushPts] : [];
  const step = Math.max(3, r * 0.4);
  const dense = densifyPolyline(brushPts, step);
  const kept = dense.map((p) => !ptNearPolyline(p, eraserPath, r));
  const out: Pt[][] = [];
  let run: Pt[] = [];
  for (let i = 0; i < dense.length; i++) {
    if (kept[i]) {
      run.push(dense[i]);
    } else {
      if (run.length >= 2) out.push(run);
      run = [];
    }
  }
  if (run.length >= 2) out.push(run);
  return out.filter((c) => c.length >= 2);
}

/**
 * Bu hareketten biriken silgi yoluna göre tüm fırça vuruşlarını günceller (fırça boyar gibi, tüm vuruşlar).
 */
function applyEraserAlongPath(
  eraserPath: Pt[],
  scale: number,
  onAnnotationsChange: (fn: (prev: Annotation[]) => Annotation[]) => void,
  setSavedBrushes: Dispatch<SetStateAction<any[]>>
): void {
  if (eraserPath.length < 1) return;
  const radius = eraserRadius(scale);

  setSavedBrushes((prev) => {
    const arr = Array.isArray(prev) ? prev : [];
    const out: any[] = [];
    for (const b of arr) {
      if (!b?.points || b.points.length < 2) {
        out.push(b);
        continue;
      }
      if (!brushTouchesEraserPolyline(b.points, eraserPath, radius)) {
        out.push(b);
        continue;
      }
      const pieces = trimBrushVerticesNearEraserPolyline(b.points, eraserPath, radius);
      if (pieces.length === 0) continue;
      for (const pts of pieces) {
        out.push({ ...b, id: newBrushSplitId(), type: 'brush', points: pts });
      }
    }
    return out;
  });

  onAnnotationsChange((prev) =>
    prev.flatMap((a) => {
      if (a.type !== 'brush' || !a.points?.length || a.points.length < 2) return [a];
      if (!brushTouchesEraserPolyline(a.points, eraserPath, radius)) return [a];
      const pieces = trimBrushVerticesNearEraserPolyline(a.points, eraserPath, radius);
      if (pieces.length === 0) return [];
      return pieces.map((pts) => ({ ...a, id: newBrushSplitId(), points: pts }));
    })
  );
}

function dragOffsetForAnnotation(ann: Annotation, image: { x: number; y: number }): { x: number; y: number } {
  if (ann.type === 'polygon' || ann.type === 'polyline') {
    const fp = ann.points[0];
    return { x: image.x - fp.x, y: image.y - fp.y };
  }
  if (ann.type === 'semantic' || ann.type === 'magic_wand') {
    const pts = ann.points;
    if (pts?.length) {
      const fp = pts[0];
      return { x: image.x - fp.x, y: image.y - fp.y };
    }
  }
  if (ann.type === 'ellipse') {
    return { x: image.x - ann.cx, y: image.y - ann.cy };
  }
  if (ann.type === 'point') {
    return { x: image.x - ann.x, y: image.y - ann.y };
  }
  if (ann.type === 'bbox' || ann.type === 'cuboid') {
    return { x: image.x - ann.x, y: image.y - ann.y };
  }
  return { x: image.x, y: image.y };
}

/** Yeni anotasyon sonrası gecikmeli click / pan isabeti seçmesin */
const SUPPRESS_OBJECT_SELECT_MS = 900;
function armSuppressObjectSelectAfterCreate(ref: MutableRefObject<number>) {
  ref.current = Date.now() + SUPPRESS_OBJECT_SELECT_MS;
}
function isObjectSelectSuppressed(ref: MutableRefObject<number>): boolean {
  return Date.now() < ref.current;
}

interface UseAnnotationActionsProps {
  activeTool: Tool;
  selectedId: string | null;
  annotations: Annotation[];
  onAnnotationsChange: (
    annotations: Annotation[] | ((prev: Annotation[]) => Annotation[])
  ) => void;
  onSelect: (id: string | null) => void;
  selectedLabel: string | null;
  screenToImage: (clientX: number, clientY: number) => { x: number; y: number };
  getHandleAt: (x: number, y: number, annotation: any, scale: number) => any;
  scale: number;
  handleUndo: () => void;
  imageSize: { w: number; h: number } | null;
  activeDrawing: any;
  setActiveDrawing: Dispatch<SetStateAction<any>>;
  // Drawing states
  drawStart: { x: number; y: number } | null;
  setDrawStart: (start: { x: number; y: number } | null) => void;
  drawPreview: { x: number; y: number; width: number; height: number } | null;
  setDrawPreview: (preview: { x: number; y: number; width: number; height: number } | null) => void;
  isDrawing: boolean;
  setIsDrawing: (drawing: boolean) => void;
  polygonPoints: { x: number; y: number }[];
  setPolygonPoints: Dispatch<SetStateAction<{ x: number; y: number }[]>>;
  isDrawingPolygon: boolean;
  setIsDrawingPolygon: (drawing: boolean) => void;
  polylinePoints: { x: number; y: number }[];
  setPolylinePoints: Dispatch<SetStateAction<{ x: number; y: number }[]>>;
  isDrawingPolyline: boolean;
  setIsDrawingPolyline: (drawing: boolean) => void;
  polylinePreviewPoint: { x: number; y: number } | null;
  setPolylinePreviewPoint: (point: { x: number; y: number } | null) => void;
  cuboidWireCorners: { x: number; y: number }[];
  setCuboidWireCorners: Dispatch<SetStateAction<{ x: number; y: number }[]>>;
  isDrawingCuboidWire: boolean;
  setIsDrawingCuboidWire: (drawing: boolean) => void;
  brushPoints: { x: number; y: number }[];
  setBrushPoints: Dispatch<SetStateAction<{ x: number; y: number }[]>>;
  brushColor: string;
  setBrushColor: (color: string) => void;
  isPaletteOpen: boolean;
  setIsPaletteOpen: (open: boolean) => void;
  savedBrushes: any[];
  setSavedBrushes: Dispatch<SetStateAction<any[]>>;
  history: any[];
  setHistory: Dispatch<SetStateAction<any[]>>;
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
  /** Boş alanda pan başlarken mevcut translate (zoom sonrası kaybolmaması için) */
  viewOffset: { x: number; y: number };
  /** Yeni şekil eklendikten sonra kısa süre tuval/SVG seçimini yoksay */
  suppressObjectSelectUntilRef: MutableRefObject<number>;
  /** Web: sihirli değnek için piksel örneklemesi (canvas CORS ile uyumlu olmalı) */
  wandImageRef?: RefObject<HTMLImageElement | null>;
  /** Tainted canvas olursa fetch+CORS ile ikinci deneme */
  wandImageSrc?: string | null;
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
  setPanStart,
  panStartOffset,
  setPanStartOffset,
  setOffset,
    viewOffset,
    suppressObjectSelectUntilRef,
    wandImageRef,
    wandImageSrc,
}: UseAnnotationActionsProps) => {
  /** Points: bbox gibi anotasyonu pointerup’ta yaz; aynı tıklamada oluşan seçim vuruşlarından kaçınılır */
  const pendingPointPlacementRef = useRef<{ x: number; y: number } | null>(null);
  /** Pan + Shift: son görüntü koordinatı (toplu taşıma için artımlı delta) */
  const groupPanLastImageRef = useRef<{ x: number; y: number } | null>(null);
  /** Silgi: tek sürüklemeye ait biriken yol (fırçanın tersi — tüm vuruşlara uygulanır). */
  const eraserPathRef = useRef<Pt[]>([]);

  /** Polyline: sağ tık ile çizimi bitir (en az 2 nokta). Sol tık + Undo ile nokta geri alınır. */
  const finalizePolylineDraft = useCallback(() => {
    if (!isDrawingPolyline || polylinePoints.length < 2) {
      setIsDrawingPolyline(false);
      setPolylinePoints([]);
      setPolylinePreviewPoint(null);
      return;
    }
    const withinBounds =
      imageSize &&
      polylinePoints.every(
        (point) =>
          point.x >= 0 &&
          point.y >= 0 &&
          point.x <= imageSize.w &&
          point.y <= imageSize.h
      );
    if (withinBounds) {
      const newPolyline = {
        id: `polyline-${Date.now()}`,
        type: 'polyline' as const,
        points: polylinePoints,
        label: '',
      };
      onAnnotationsChange((prev) => [...prev, newPolyline]);
      setHistory((prev) => [...prev, { type: 'annotation', data: newPolyline }]);
      armSuppressObjectSelectAfterCreate(suppressObjectSelectUntilRef);
      onSelect?.(null);
    }
    setIsDrawingPolyline(false);
    setPolylinePoints([]);
    setPolylinePreviewPoint(null);
  }, [
    isDrawingPolyline,
    polylinePoints,
    imageSize,
    onAnnotationsChange,
    setHistory,
    onSelect,
    setIsDrawingPolyline,
    setPolylinePoints,
    setPolylinePreviewPoint,
    suppressObjectSelectUntilRef,
  ]);

  // Handle pointer down
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      /** Sağ tık: polyline çizimini bitir; poligon çizerken son köşeyi geri al */
      if (e.button === 2) {
        e.preventDefault();
        if (activeTool === 'polyline' && isDrawingPolyline) {
          if (polylinePoints.length >= 2) {
            finalizePolylineDraft();
          } else if (polylinePoints.length === 1) {
            setPolylinePoints([]);
            setIsDrawingPolyline(false);
            setPolylinePreviewPoint(null);
          }
          return;
        }
        if (activeTool === 'polygon' && isDrawingPolygon) {
          if (polygonPoints.length > 1) {
            setPolygonPoints((prev) => prev.slice(0, -1));
          } else if (polygonPoints.length === 1) {
            setPolygonPoints([]);
            setIsDrawingPolygon(false);
            setPolylinePreviewPoint(null);
          }
        }
        if (activeTool === 'cuboid_wire' && isDrawingCuboidWire) {
          if (cuboidWireCorners.length > 1) {
            setCuboidWireCorners((prev) => prev.slice(0, -1));
          } else if (cuboidWireCorners.length === 1) {
            setCuboidWireCorners([]);
            setIsDrawingCuboidWire(false);
            setPolylinePreviewPoint(null);
          }
        }
        return;
      }

      // Undo butonu için özel handling
      if (activeTool === 'undo') {
        handleUndo();
        return;
      }
      
      const image = screenToImage(e.clientX, e.clientY);

      // Resize kontrolü — points aracıyla tıklama her zaman yeni nokta eklemeli (bbox-tutamaç mantığı noktada yanlış pozitif verebilir)
      if (selectedId && activeTool !== 'points' && activeTool !== 'eraser') {
        const selectedAnnotation = annotations.find((ann) => ann.id === selectedId);
        /** Sihirli değnek aktifken başka tür seçiliyse tutamaçları yok say (tıklama yeni seçim için) */
        const skipResizeForMagicWand =
          activeTool === 'magic_wand' &&
          selectedAnnotation &&
          selectedAnnotation.type !== 'magic_wand';
        if (
          !skipResizeForMagicWand &&
          selectedAnnotation &&
          (selectedAnnotation.type === 'bbox' ||
            selectedAnnotation.type === 'cuboid' ||
            selectedAnnotation.type === 'semantic' ||
            selectedAnnotation.type === 'magic_wand' ||
            selectedAnnotation.type === 'polyline' ||
            selectedAnnotation.type === 'brush' ||
            selectedAnnotation.type === 'point')
        ) {
          const handle = getHandleAt(image.x, image.y, selectedAnnotation as any, scale);
          if (handle) {
            if (selectedAnnotation.type === 'semantic' || selectedAnnotation.type === 'magic_wand') {
              const b = pointsQuadToBoxBounds((selectedAnnotation as any).points);
              if (b) {
                console.log('[AnnotationCanvas] Resize handle clicked via getHandleAt:', handle);
                setIsResizing(true);
                setResizeHandle(handle);
                setResizeStartBox({
                  id: selectedAnnotation.id,
                  type: selectedAnnotation.type,
                  ...b,
                });
                return;
              }
            } else {
              console.log('[AnnotationCanvas] Resize handle clicked via getHandleAt:', handle);
              setIsResizing(true);
              setResizeHandle(handle);
              setResizeStartBox(selectedAnnotation as any);
              return;
            }
          }
        }
      }

      // Tool-Specific Initialization
      switch (activeTool) {
        case 'pan': {
          /** Shift basılıyken tüm anotasyonları birlikte taşı (görüntü üzerinde boş veya dolu alan) */
          if (e.shiftKey && annotations.length > 0) {
            groupPanLastImageRef.current = { x: image.x, y: image.y };
            break;
          }
          const clickedAnnotation = findTopAnnotationAtImagePoint(annotations, image, scale);
          if (clickedAnnotation) {
            if (isObjectSelectSuppressed(suppressObjectSelectUntilRef)) {
              break;
            }
            onSelect?.(clickedAnnotation.id);
            setIsDragging(true);
            setDragOffset(dragOffsetForAnnotation(clickedAnnotation, image));
          } else {
            setIsPanning(true);
            setPanStart({ x: e.clientX, y: e.clientY });
            setPanStartOffset({ x: viewOffset.x, y: viewOffset.y });
          }
          break;
        }

        case 'bbox':
        case 'ellipse':
        case 'semantic':
          setDrawStart(image);
          setDrawPreview({ x: image.x, y: image.y, width: 0, height: 0 });
          setIsDrawing(true);
          break;

        case 'cuboid':
          if (activeDrawing?.tool === 'cuboid' && activeDrawing.step === 2) {
            break;
          }
          setActiveDrawing({
            tool: 'cuboid',
            x: image.x,
            y: image.y,
            width: 0,
            height: 0,
            dx: 0,
            dy: 0,
            step: 1,
          });
          setDrawStart(image);
          setDrawPreview({ x: image.x, y: image.y, width: 0, height: 0 });
          setIsDrawing(true);
          break;

        case 'magic_wand': {
          if (!imageSize) break;
          const ix = image.x;
          const iy = image.y;
          void (async () => {
            const pts = await magicWandPolygonFromImageOrUrl(
              wandImageRef?.current ?? null,
              wandImageSrc ?? undefined,
              imageSize.w,
              imageSize.h,
              ix,
              iy
            );
            if (!pts || pts.length < 3) return;
            const wand = {
              id: `magic_wand-${Date.now()}`,
              type: 'magic_wand' as const,
              points: pts,
              label: '',
            };
            onAnnotationsChange((prev) => [...prev, wand as Annotation]);
            armSuppressObjectSelectAfterCreate(suppressObjectSelectUntilRef);
            onSelect?.(wand.id);
          })();
          break;
        }

        case 'polygon': {
          /** İlk noktaya bu kadar yakınsa (görüntü px) poligon kapanır; en az 3 köşe gerekir */
          const closeThreshold = Math.max(14 / Math.max(scale, 0.08), 10);
          if (!isDrawingPolygon) {
            setPolygonPoints([image]);
            setIsDrawingPolygon(true);
            break;
          }
          const first = polygonPoints[0];
          const nearFirst = distance(image, first) < closeThreshold;
          if (nearFirst && polygonPoints.length >= 3) {
            const withinBounds =
              imageSize &&
              polygonPoints.every(
                (point) =>
                  point.x >= 0 &&
                  point.y >= 0 &&
                  point.x <= imageSize.w &&
                  point.y <= imageSize.h
              );
            if (withinBounds) {
              e.preventDefault();
              e.stopPropagation();
              const newPolygon = {
                id: `polygon-${Date.now()}`,
                type: 'polygon' as const,
                points: polygonPoints,
                /** Etiket sol araçtaki seçimden kopyalanmasın; kullanıcı Object List’ten seçsin */
                label: '',
              };
              onAnnotationsChange((prev) => [...prev, newPolygon]);
              setHistory((prev) => [...prev, { type: 'annotation', data: newPolygon }]);
              armSuppressObjectSelectAfterCreate(suppressObjectSelectUntilRef);
              onSelect?.(newPolygon.id);
            }
            setIsDrawingPolygon(false);
            setPolygonPoints([]);
            setPolylinePreviewPoint(null);
            break;
          }
          if (nearFirst && polygonPoints.length < 3) {
            break;
          }
          setPolygonPoints((prev) => [...prev, image]);
          break;
        }

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

        case 'cuboid_wire': {
          if (!isDrawingCuboidWire) {
            setCuboidWireCorners([image]);
            setIsDrawingCuboidWire(true);
            break;
          }
          const nextCorners = [...cuboidWireCorners, image];
          if (nextCorners.length < 8) {
            setCuboidWireCorners(nextCorners);
            break;
          }
          const withinBoundsWire =
            imageSize &&
            nextCorners.every(
              (point) =>
                point.x >= 0 &&
                point.y >= 0 &&
                point.x <= imageSize.w &&
                point.y <= imageSize.h
            );
          if (withinBoundsWire) {
            const newWire = {
              id: `cuboid_wire-${Date.now()}`,
              type: 'cuboid_wire' as const,
              corners: nextCorners,
              label: '',
            };
            onAnnotationsChange((prev) => [...prev, newWire]);
            setHistory((prev) => [...prev, { type: 'annotation', data: newWire }]);
            armSuppressObjectSelectAfterCreate(suppressObjectSelectUntilRef);
            onSelect?.(null);
          }
          setIsDrawingCuboidWire(false);
          setCuboidWireCorners([]);
          setPolylinePreviewPoint(null);
          break;
        }

        case 'points': {
          armSuppressObjectSelectAfterCreate(suppressObjectSelectUntilRef);
          onSelect?.(null);
          /** Bbox/polygon ile aynı: etiket boş; kullanıcı nesne listesinden seçer — chip vurgusu yanlış “seçim” gibi görünmesin */
          pendingPointPlacementRef.current = { x: image.x, y: image.y };
          break;
        }

        case 'brush':
          if (!isDrawing) {
            console.log('[AnnotationCanvas] BRUSH MODE - Starting brush at:', image);
            setBrushPoints([image]);
            setIsDrawing(true);
            setHistory(prev => [...prev, { type: 'brush_start' }]);
          }
          break;

        case 'eraser': {
          eraserPathRef.current = [image];
          applyEraserAlongPath(eraserPathRef.current, scale, onAnnotationsChange, setSavedBrushes);
          onSelect?.(null);
          break;
        }

        case 'select': {
          const clickedDefaultAnnotation = findTopAnnotationAtImagePoint(annotations, image, scale);
          if (clickedDefaultAnnotation) {
            if (!isObjectSelectSuppressed(suppressObjectSelectUntilRef)) {
              onSelect?.(clickedDefaultAnnotation.id);
            }
          } else {
            onSelect?.(null);
          }
          break;
        }

        default:
          break;
      }
    },
    [
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
      cuboidWireCorners,
      setCuboidWireCorners,
      isDrawingCuboidWire,
      setIsDrawingCuboidWire,
      brushPoints,
      setBrushPoints,
      setIsDrawing,
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
      viewOffset,
      imageSize,
      activeDrawing,
      setActiveDrawing,
      MIN_BOX_SIZE,
      setPolylinePreviewPoint,
      suppressObjectSelectUntilRef,
      finalizePolylineDraft,
      wandImageRef,
      wandImageSrc,
    ]
  );

  // Handle pointer move
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (activeTool === 'eraser' && (e.buttons & 1) === 1) {
      const image = screenToImage(e.clientX, e.clientY);
      const acc = eraserPathRef.current;
      const last = acc[acc.length - 1];
      if (!last || distance(last, image) >= 0.5) {
        acc.push(image);
      }
      applyEraserAlongPath(acc, scale, onAnnotationsChange, setSavedBrushes);
      return;
    }

    // Handle resizing
    if (isResizing && resizeHandle && resizeStartBox) {
      const image = screenToImage(e.clientX, e.clientY);
      console.log('[AnnotationCanvas] Resizing - handle:', resizeHandle, 'image:', image);
      
      onAnnotationsChange((prev) =>
        prev.map((ann) => {
          if (ann.id !== resizeStartBox.id) return ann;

          if (ann.type === 'cuboid' && isCuboidBackCornerHandle(resizeHandle)) {
            const sb = resizeStartBox;
            const ix = image.x;
            const iy = image.y;
            let ndx = ix - sb.x;
            let ndy = iy - sb.y;
            if (resizeHandle === 'b_tr') {
              ndx = ix - sb.x - sb.width;
              ndy = iy - sb.y;
            } else if (resizeHandle === 'b_br') {
              ndx = ix - sb.x - sb.width;
              ndy = iy - sb.y - sb.height;
            } else if (resizeHandle === 'b_bl') {
              ndx = ix - sb.x;
              ndy = iy - sb.y - sb.height;
            }
            return { ...ann, dx: ndx, dy: ndy };
          }

          if (ann.type === 'bbox' || ann.type === 'cuboid') {
            const edgeHandle = resizeHandle as BboxHandle;
            const { deltaX, deltaY } = computeBboxResizeDeltas(
              resizeStartBox,
              edgeHandle,
              image.x,
              image.y
            );
            const resized = resizeBbox(resizeStartBox, edgeHandle, deltaX, deltaY, imageSize);
            return {
              ...ann,
              x: resized.x,
              y: resized.y,
              width: resized.width,
              height: resized.height,
            };
          }
          if (
            (ann.type === 'semantic' || ann.type === 'magic_wand') &&
            ann.points?.length === 4 &&
            !isCuboidBackCornerHandle(resizeHandle)
          ) {
            const edgeHandle = resizeHandle as BboxHandle;
            const { deltaX, deltaY } = computeBboxResizeDeltas(
              resizeStartBox,
              edgeHandle,
              image.x,
              image.y
            );
            const resized = resizeBbox(resizeStartBox as any, edgeHandle, deltaX, deltaY, imageSize);
            return {
              ...ann,
              points: [
                { x: resized.x, y: resized.y },
                { x: resized.x + resized.width, y: resized.y },
                { x: resized.x + resized.width, y: resized.y + resized.height },
                { x: resized.x, y: resized.y + resized.height },
              ],
            };
          }
          return ann;
        })
      );
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

    // Pan + Shift: tüm anotasyonları görüntü uzayında birlikte kaydır
    if (activeTool === 'pan' && groupPanLastImageRef.current) {
      const image = screenToImage(e.clientX, e.clientY);
      const last = groupPanLastImageRef.current;
      const dx = image.x - last.x;
      const dy = image.y - last.y;
      groupPanLastImageRef.current = { x: image.x, y: image.y };
      if (dx !== 0 || dy !== 0) {
        onAnnotationsChange((prev) => prev.map((ann) => translateAnnotationByDelta(ann, dx, dy)));
      }
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
          } else if (
            (ann.type === 'semantic' || ann.type === 'magic_wand') &&
            ann.points?.length
          ) {
            const deltaX = image.x - dragOffset.x;
            const deltaY = image.y - dragOffset.y;
            const originalFirstPoint = ann.points[0];
            const moveDeltaX = deltaX - originalFirstPoint.x;
            const moveDeltaY = deltaY - originalFirstPoint.y;
            return {
              ...ann,
              points: ann.points.map((point) => ({
                x: point.x + moveDeltaX,
                y: point.y + moveDeltaY,
              })),
            };
          } else if (ann.type === 'cuboid_wire') {
            const deltaX = image.x - dragOffset.x;
            const deltaY = image.y - dragOffset.y;
            const originalFirstPoint = ann.corners[0];
            const moveDeltaX = deltaX - originalFirstPoint.x;
            const moveDeltaY = deltaY - originalFirstPoint.y;
            return {
              ...ann,
              corners: ann.corners.map((point) => ({
                x: point.x + moveDeltaX,
                y: point.y + moveDeltaY,
              })),
            };
          }
        }
        return ann;
      }));
      return;
    }
    
    const needsMoveDraw =
      isDrawing ||
      (isDrawingPolygon && polygonPoints.length > 0) ||
      (isDrawingPolyline && polylinePoints.length > 0) ||
      (isDrawingCuboidWire && cuboidWireCorners.length > 0);
    if (!needsMoveDraw) return;
    const image = screenToImage(e.clientX, e.clientY);

    if (activeTool === 'cuboid' && activeDrawing?.tool === 'cuboid' && activeDrawing.step === 2) {
      setActiveDrawing((p: any) => ({ ...p, dx: image.x - p.x, dy: image.y - p.y }));
      return;
    }

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
        if (isDrawingPolyline && polylinePoints.length > 0) {
          setPolylinePreviewPoint(image);
        }
        break;

      case 'bbox':
      case 'ellipse':
      case 'semantic':
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

      case 'cuboid':
        if (activeDrawing?.tool === 'cuboid' && activeDrawing.step === 1 && drawStart) {
          const width = image.x - drawStart.x;
          const height = image.y - drawStart.y;
          const newPreview = {
            x: width < 0 ? image.x : drawStart.x,
            y: height < 0 ? image.y : drawStart.y,
            width: Math.abs(width),
            height: Math.abs(height),
          };
          setDrawPreview(newPreview);
          setActiveDrawing((p: any) => (p?.tool === 'cuboid' ? { ...p, ...newPreview } : p));
        }
        break;

      case 'polygon':
        if (isDrawingPolygon && polygonPoints.length > 0) {
          setPolylinePreviewPoint(image);
        }
        break;

      case 'cuboid_wire':
        if (isDrawingCuboidWire && cuboidWireCorners.length > 0) {
          setPolylinePreviewPoint(image);
        }
        break;
    }
  }, [
    isDragging,
    activeTool,
    dragOffset,
    selectedId,
    isResizing,
    resizeHandle,
    resizeStartBox,
    screenToImage,
    onAnnotationsChange,
    setSavedBrushes,
    scale,
    isPanning,
    panStart,
    panStartOffset,
    setOffset,
    isDrawing,
    isDrawingPolyline,
    polylinePoints,
    setPolylinePreviewPoint,
    drawStart,
    setDrawPreview,
    isDrawingPolygon,
    polygonPoints,
    activeDrawing,
    setActiveDrawing,
    isDrawingCuboidWire,
    cuboidWireCorners,
  ]);

  // Handle pointer up
  const handlePointerUp = useCallback(() => {
    eraserPathRef.current = [];

    if (activeTool !== 'points') {
      pendingPointPlacementRef.current = null;
    }

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

    if (groupPanLastImageRef.current) {
      groupPanLastImageRef.current = null;
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

      case 'cuboid':
        if (activeDrawing?.tool === 'cuboid' && activeDrawing.step === 1) {
          if (drawPreview && drawPreview.width > MIN_BOX_SIZE) {
            setActiveDrawing((prev: any) => ({
              ...prev,
              step: 2,
              x: drawPreview.x,
              y: drawPreview.y,
              width: drawPreview.width,
              height: drawPreview.height,
            }));
            setDrawPreview(null);
            setDrawStart(null);
          } else {
            setActiveDrawing(null);
            setIsDrawing(false);
            setDrawPreview(null);
            setDrawStart(null);
          }
          return;
        }
        if (activeDrawing?.tool === 'cuboid' && activeDrawing.step === 2) {
          const { tool: _ct, step: _cs, ...rest } = activeDrawing;
          const newCuboid = {
            ...rest,
            id: `cuboid-${Date.now()}`,
            type: 'cuboid' as const,
            label: '',
          };
          onAnnotationsChange((prev) => [...prev, newCuboid]);
          setHistory((prev) => [...prev, { type: 'annotation', data: newCuboid }]);
          armSuppressObjectSelectAfterCreate(suppressObjectSelectUntilRef);
          onSelect?.(newCuboid.id);
          setActiveDrawing(null);
          setIsDrawing(false);
          setDrawPreview(null);
          setDrawStart(null);
          return;
        }
        break;

      case 'semantic':
        if (drawPreview && drawPreview.width > MIN_BOX_SIZE) {
          const withinBoundsSemantic =
            imageSize &&
            drawPreview.x >= 0 &&
            drawPreview.y >= 0 &&
            drawPreview.x + drawPreview.width <= imageSize.w &&
            drawPreview.y + drawPreview.height <= imageSize.h;
          if (withinBoundsSemantic) {
            const { x: sx, y: sy, width: sw, height: sh } = drawPreview;
            const newSemantic = {
              id: `semantic-${Date.now()}`,
              type: 'semantic' as const,
              points: [
                { x: sx, y: sy },
                { x: sx + sw, y: sy },
                { x: sx + sw, y: sy + sh },
                { x: sx, y: sy + sh },
              ],
              label: selectedLabel ?? '',
            };
            onAnnotationsChange((prev) => [...prev, newSemantic as Annotation]);
            setHistory((prev) => [...prev, { type: 'annotation', data: newSemantic }]);
            armSuppressObjectSelectAfterCreate(suppressObjectSelectUntilRef);
            onSelect?.(newSemantic.id);
          }
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
            onAnnotationsChange((prev) => [...prev, newBbox as Annotation]);
            // History'e ekle
            setHistory(prev => [...prev, { type: 'annotation', data: newBbox }]);
            armSuppressObjectSelectAfterCreate(suppressObjectSelectUntilRef);
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
              type: 'ellipse' as const,
              cx: drawPreview.x + drawPreview.width / 2,
              cy: drawPreview.y + drawPreview.height / 2,
              rx: Math.abs(drawPreview.width / 2),
              ry: Math.abs(drawPreview.height / 2),
              label: '',
            };
            onAnnotationsChange((prev) => [...prev, newEllipse]);
            // History'e ekle
            setHistory(prev => [...prev, { type: 'annotation', data: newEllipse }]);
            armSuppressObjectSelectAfterCreate(suppressObjectSelectUntilRef);
            onSelect?.(null);
          } else {
            console.log('[AnnotationCanvas] Ellipse outside image bounds, not saving');
          }
        }
        break;

      case 'polygon':
        // Poligon yalnızca ilk köşeye tıklanınca kapanır (pointerDown); mouseUp ile otomatik bitmez
        break;

      case 'polyline':
        // Polyline sol tıkla nokta eklenir; bitiş sağ tık (finalizePolylineDraft), Undo son noktayı siler
        break;

      case 'cuboid_wire':
        break;

      case 'points': {
        const pending = pendingPointPlacementRef.current;
        pendingPointPlacementRef.current = null;
        armSuppressObjectSelectAfterCreate(suppressObjectSelectUntilRef);
        if (!pending) break;
        const pointAnnotation = {
          id: `point-${Date.now()}`,
          type: 'point' as const,
          x: pending.x,
          y: pending.y,
          label: '',
        };
        onAnnotationsChange((prev) => [...prev, pointAnnotation]);
        setHistory((prev) => [...prev, { type: 'annotation', data: pointAnnotation }]);
        onSelect?.(pointAnnotation.id);
        break;
      }
    }
    
    // Reset drawing state for tools that need it
    if (['bbox', 'ellipse', 'semantic'].includes(activeTool)) {
      setIsDrawing(false);
      setDrawStart(null);
      setDrawPreview(null);
    }
  }, [isResizing, resizeHandle, resizeStartBox, setIsResizing, setResizeHandle, setResizeStartBox, isPanning, panStart, panStartOffset, setIsPanning, setPanStart, setPanStartOffset, isDragging, dragOffset, setIsDragging, setDragOffset, activeTool, brushPoints, brushColor, setSavedBrushes, setHistory, setBrushPoints, setIsDrawing, drawPreview, MIN_BOX_SIZE, imageSize, onAnnotationsChange, onSelect, isDrawingPolygon, polygonPoints, setIsDrawingPolygon, setPolygonPoints, isDrawingPolyline, polylinePoints, setIsDrawingPolyline, setPolylinePoints, setPolylinePreviewPoint, setIsDrawing, setDrawStart, setDrawPreview, activeDrawing, setActiveDrawing, selectedLabel, suppressObjectSelectUntilRef, isDrawingCuboidWire, cuboidWireCorners, setIsDrawingCuboidWire, setCuboidWireCorners]);

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  };
};
