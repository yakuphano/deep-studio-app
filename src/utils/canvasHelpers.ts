// Canvas Math and Drawing Helper Functions
// Extracted from AnnotationCanvas.web.tsx to reduce file size

import type { Annotation, BboxHandle } from '@/types/annotations';

/** Arka yüz köşeleri — dx/dy ile derinlik/perspektif */
export type CuboidBackCornerHandle = 'b_tl' | 'b_tr' | 'b_br' | 'b_bl';
export type ResizeHandleType = BboxHandle | CuboidBackCornerHandle;

export function isCuboidBackCornerHandle(h: string | null | undefined): h is CuboidBackCornerHandle {
  return h === 'b_tl' || h === 'b_tr' || h === 'b_br' || h === 'b_bl';
}

/** Ön yüz bbox tutamaçları + cuboid için arka yüz dört köşe (önce ön, sonra arka). */
export function getResizeHandleAt(
  px: number,
  py: number,
  annotation: { type: string; x: number; y: number; width: number; height: number; dx?: number; dy?: number },
  scale: number
): ResizeHandleType | null {
  const handleSize = Math.max(6 / scale, 10 / Math.max(scale, 0.15));
  const hit = (x: number, y: number) => Math.hypot(px - x, py - y) <= handleSize;

  const { x, y, width: w, height: h } = annotation;
  const front: { t: BboxHandle; x: number; y: number }[] = [
    { t: 'tl', x, y },
    { t: 'tr', x: x + w, y },
    { t: 'br', x: x + w, y: y + h },
    { t: 'bl', x, y: y + h },
    { t: 't', x: x + w / 2, y },
    { t: 'r', x: x + w, y: y + h / 2 },
    { t: 'b', x: x + w / 2, y: y + h },
    { t: 'l', x, y: y + h / 2 },
  ];

  for (const c of front) {
    if (hit(c.x, c.y)) return c.t;
  }

  if (annotation.type === 'cuboid') {
    const dx = annotation.dx ?? 0;
    const dy = annotation.dy ?? 0;
    const back: { t: CuboidBackCornerHandle; x: number; y: number }[] = [
      { t: 'b_tl', x: x + dx, y: y + dy },
      { t: 'b_tr', x: x + dx + w, y: y + dy },
      { t: 'b_br', x: x + dx + w, y: y + dy + h },
      { t: 'b_bl', x: x + dx, y: y + dy + h },
    ];
    for (const c of back) {
      if (hit(c.x, c.y)) return c.t;
    }
  }

  return null;
}

/** Dört köşenin eksen hizalı sınırlayıcı kutusu (semantic / magic_wand dikdörtgen resize). */
export function pointsQuadToBoxBounds(
  points: { x: number; y: number }[] | null | undefined
): { x: number; y: number; width: number; height: number } | null {
  if (!points || points.length !== 4) return null;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  const width = maxX - minX;
  const height = maxY - minY;
  if (width < 1 || height < 1) return null;
  return { x: minX, y: minY, width, height };
}

export interface Point {
  x: number;
  y: number;
}

export interface ImageSize {
  w: number;
  h: number;
}

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

// Coordinate transformation functions
export const screenToImage = (
  clientX: number,
  clientY: number,
  imageSize: ImageSize | null,
  scale: number,
  offset: Point,
  containerRef: React.RefObject<HTMLDivElement>
): Point => {
  if (!imageSize || !containerRef.current) return { x: 0, y: 0 };
  
  // Get container's exact position
  const rect = containerRef.current.getBoundingClientRect();
  
  // Apply the precise formula: (clientX - rect.left - offset.x) / scale
  const imageX = (clientX - rect.left - offset.x) / scale;
  const imageY = (clientY - rect.top - offset.y) / scale;
  
  return { x: imageX, y: imageY };
};

export const imageToScreen = (
  imageX: number,
  imageY: number,
  imageSize: ImageSize | null,
  scale: number,
  offset: Point
): Point => {
  if (!imageSize) return { x: 0, y: 0 };
  
  // Apply transform: translate(offset) scale(scale)
  return {
    x: imageX * scale + offset.x,
    y: imageY * scale + offset.y,
  };
};

// Handle detection for bbox resize
export const getHandleAt = (
  x: number,
  y: number,
  bbox: BboxAnnotation,
  scale: number,
  HANDLE_SIZE: number = 8
): BboxHandle | null => {
  const { x: bx, y: by, width, height } = bbox;
  const threshold = HANDLE_SIZE / scale;
  
  // Check corners
  if (Math.abs(x - bx) < threshold && Math.abs(y - by) < threshold) return 'tl';
  if (Math.abs(x - (bx + width)) < threshold && Math.abs(y - by) < threshold) return 'tr';
  if (Math.abs(x - (bx + width)) < threshold && Math.abs(y - (by + height)) < threshold) return 'br';
  if (Math.abs(x - bx) < threshold && Math.abs(y - (by + height)) < threshold) return 'bl';
  
  // Check edges
  if (Math.abs(x - bx) < threshold && y >= by && y <= by + height) return 'l';
  if (Math.abs(x - (bx + width)) < threshold && y >= by && y <= by + height) return 'r';
  if (Math.abs(y - by) < threshold && x >= bx && x <= bx + width) return 't';
  if (Math.abs(y - (by + height)) < threshold && x >= bx && x <= bx + width) return 'b';
  
  return null;
};

/** resizeBbox için: tutamaç hangi kenarı tutuyorsa delta o kenara göre (sol üst köşe değil) */
export function computeBboxResizeDeltas(
  bbox: { x: number; y: number; width: number; height: number },
  handle: BboxHandle,
  pointerX: number,
  pointerY: number
): { deltaX: number; deltaY: number } {
  const { x, y, width, height } = bbox;
  switch (handle) {
    case 'tl':
      return { deltaX: pointerX - x, deltaY: pointerY - y };
    case 'tr':
      return { deltaX: pointerX - (x + width), deltaY: pointerY - y };
    case 'br':
      return { deltaX: pointerX - (x + width), deltaY: pointerY - (y + height) };
    case 'bl':
      return { deltaX: pointerX - x, deltaY: pointerY - (y + height) };
    case 't':
      return { deltaX: 0, deltaY: pointerY - y };
    case 'r':
      return { deltaX: pointerX - (x + width), deltaY: 0 };
    case 'b':
      return { deltaX: 0, deltaY: pointerY - (y + height) };
    case 'l':
      return { deltaX: pointerX - x, deltaY: 0 };
    default:
      return { deltaX: pointerX - x, deltaY: pointerY - y };
  }
}

// Resize bbox based on handle
export const resizeBbox = (
  bbox: BboxAnnotation,
  handle: BboxHandle,
  deltaX: number,
  deltaY: number,
  imageSize: ImageSize | null
): BboxAnnotation => {
  const { x, y, width, height } = bbox;
  let newX = x, newY = y, newWidth = width, newHeight = height;
  
  switch (handle) {
    case 'tl':
      newX = x + deltaX;
      newY = y + deltaY;
      newWidth = width - deltaX;
      newHeight = height - deltaY;
      break;
    case 'tr':
      newY = y + deltaY;
      newWidth = width + deltaX;
      newHeight = height - deltaY;
      break;
    case 'br':
      newWidth = width + deltaX;
      newHeight = height + deltaY;
      break;
    case 'bl':
      newX = x + deltaX;
      newWidth = width - deltaX;
      newHeight = height + deltaY;
      break;
    case 't':
      newY = y + deltaY;
      newHeight = height - deltaY;
      break;
    case 'r':
      newWidth = width + deltaX;
      break;
    case 'b':
      newHeight = height + deltaY;
      break;
    case 'l':
      newX = x + deltaX;
      newWidth = width - deltaX;
      break;
  }
  
  // Ensure minimum size
  const MIN_SIZE = 10;
  if (newWidth < MIN_SIZE) {
    if (handle === 'tl' || handle === 'bl') newX = x + width - MIN_SIZE;
    newWidth = MIN_SIZE;
  }
  if (newHeight < MIN_SIZE) {
    if (handle === 'tl' || handle === 'tr') newY = y + height - MIN_SIZE;
    newHeight = MIN_SIZE;
  }
  
  // Ensure within image bounds
  if (imageSize) {
    newX = Math.max(0, Math.min(newX, imageSize.w - newWidth));
    newY = Math.max(0, Math.min(newY, imageSize.h - newHeight));
    newWidth = Math.min(newWidth, imageSize.w - newX);
    newHeight = Math.min(newHeight, imageSize.h - newY);
  }
  
  return { ...bbox, x: newX, y: newY, width: newWidth, height: newHeight };
};

// Calculate initial scale to fit image in container
export const calculateInitialFit = (
  naturalWidth: number,
  naturalHeight: number,
  containerWidth: number,
  containerHeight: number
): { scale: number; offset: Point } => {
  // Calculate initial scale to fit image in container
  const scaleX = containerWidth / naturalWidth;
  const scaleY = containerHeight / naturalHeight;
  /** Küçük görüntüleri büyütüp ekrana sığdır; aşırı zoom’u sınırla */
  const raw = Math.min(scaleX, scaleY);
  const initialScale = Math.min(Math.max(raw, 0.02), 16);

  // Center the image
  const offsetX = (containerWidth - naturalWidth * initialScale) / 2;
  const offsetY = (containerHeight - naturalHeight * initialScale) / 2;
  
  return {
    scale: initialScale,
    offset: { x: offsetX, y: offsetY }
  };
};

/** SVG’de CSS scale sonrası ekranda yaklaşık sabit piksel yarıçap (nokta/tutamak) */
export const screenConstantRadius = (scale: number, screenPx = 3.5): number =>
  Math.max(1.25, screenPx / Math.max(scale, 0.06));

// Distance calculation helper
export const distance = (p1: Point, p2: Point): number => {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
};

// Check if point is within bbox
export const isPointInBbox = (point: Point, bbox: BboxAnnotation): boolean => {
  return point.x >= bbox.x && 
         point.x <= bbox.x + bbox.width && 
         point.y >= bbox.y && 
         point.y <= bbox.y + bbox.height;
};

/** Kapalı poligon içi — görüntü uzayında piksel koordinatları */
export const isPointInPolygon = (x: number, y: number, vertices: Point[]): boolean => {
  if (vertices.length < 3) return false;
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const xi = vertices[i].x;
    const yi = vertices[i].y;
    const xj = vertices[j].x;
    const yj = vertices[j].y;
    const denom = yj - yi;
    const intersect =
      yi > y !== yj > y && (denom === 0 ? x < xi : x < ((xj - xi) * (y - yi)) / denom + xi);
    if (intersect) inside = !inside;
  }
  return inside;
};

// Check if point is near line (for polyline/segment selection)
export const isPointNearLine = (
  point: Point,
  lineStart: Point,
  lineEnd: Point,
  threshold: number = 5
): boolean => {
  const A = point.x - lineStart.x;
  const B = point.y - lineStart.y;
  const C = lineEnd.x - lineStart.x;
  const D = lineEnd.y - lineStart.y;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;

  if (lenSq !== 0) {
    param = dot / lenSq;
  }

  let xx, yy;

  if (param < 0) {
    xx = lineStart.x;
    yy = lineStart.y;
  } else if (param > 1) {
    xx = lineEnd.x;
    yy = lineEnd.y;
  } else {
    xx = lineStart.x + param * C;
    yy = lineStart.y + param * D;
  }

  const dx = point.x - xx;
  const dy = point.y - yy;

  return Math.sqrt(dx * dx + dy * dy) <= threshold;
};

/** Görüntü uzayında tüm anotasyonları aynı öteleme ile kaydır (Pan + Shift toplu taşıma). */
export function translateAnnotationByDelta(ann: Annotation, dx: number, dy: number): Annotation {
  switch (ann.type) {
    case 'bbox':
    case 'cuboid':
      return { ...ann, x: ann.x + dx, y: ann.y + dy };
    case 'ellipse':
      return { ...ann, cx: ann.cx + dx, cy: ann.cy + dy };
    case 'point':
      return { ...ann, x: ann.x + dx, y: ann.y + dy };
    case 'polygon':
    case 'polyline':
    case 'brush':
      return {
        ...ann,
        points: (ann.points || []).map((p) => ({ x: p.x + dx, y: p.y + dy })),
      };
    case 'cuboid_wire':
      return {
        ...ann,
        corners: (ann.corners || []).map((p) => ({ x: p.x + dx, y: p.y + dy })),
      };
    case 'semantic':
    case 'magic_wand': {
      const pts = ann.points;
      if (!pts?.length) return ann;
      return { ...ann, points: pts.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
    }
    default:
      return ann;
  }
}

// Format time for video annotations
export const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

// Constants
export const MIN_BOX_SIZE = 10;
export const HANDLE_SIZE = 8;
export const DEFAULT_BRUSH_COLOR = '#ff0000';
export const DEFAULT_BRUSH_WIDTH = 3;
