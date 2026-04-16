// Canvas Math and Drawing Helper Functions
// Extracted from AnnotationCanvas.web.tsx to reduce file size

export interface Point {
  x: number;
  y: number;
}

export interface ImageSize {
  w: number;
  h: number;
}

export type BboxHandle = 'tl' | 'tr' | 'br' | 'bl' | 't' | 'r' | 'b' | 'l';

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
  const initialScale = Math.min(scaleX, scaleY, 1); // Don't upscale, only downscale
  
  // Center the image
  const offsetX = (containerWidth - naturalWidth * initialScale) / 2;
  const offsetY = (containerHeight - naturalHeight * initialScale) / 2;
  
  return {
    scale: initialScale,
    offset: { x: offsetX, y: offsetY }
  };
};

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
