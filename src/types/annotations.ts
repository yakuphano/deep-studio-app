// Annotation Types and Constants
// Extracted from AnnotationCanvas.web.tsx to reduce file size

export type Tool =
  | 'pan'
  | 'undo'
  | 'select'
  | 'bbox'
  | 'polygon'
  | 'points'
  | 'ellipse'
  | 'cuboid'
  | 'cuboid_wire'
  | 'polyline'
  | 'semantic'
  | 'brush'
  | 'eraser'
  | 'magic_wand';
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
  width?: number;
}

export interface EllipseAnnotation {
  id: string;
  type: 'ellipse';
  cx: number; // Center x
  cy: number; // Center y
  rx: number; // Radius x
  ry: number; // Radius y
  label: string;
}

export interface CuboidAnnotation {
  id: string;
  type: 'cuboid';
  x: number;
  y: number;
  width: number;
  height: number;
  /** Arka yüz ofseti (piksel) — katmanda çizilir */
  dx?: number;
  dy?: number;
  label: string;
  z_index?: number;
}

/** Kalibrasyonsuz 3B tel kutu: ön yüz [0–3], arka yüz [4–7] (köşe eşlemesi i–i+4). */
export interface CuboidWireAnnotation {
  id: string;
  type: 'cuboid_wire';
  corners: { x: number; y: number }[];
  label: string;
  z_index?: number;
}

export interface SemanticAnnotation {
  id: string;
  type: 'semantic';
  points?: {x: number; y: number}[];
  label: string;
}

export interface MagicWandAnnotation {
  id: string;
  type: 'magic_wand';
  points?: {x: number; y: number}[];
  label: string;
  color?: string;
}

export type Annotation =
  | BboxAnnotation
  | PolygonAnnotation
  | PointAnnotation
  | PolylineAnnotation
  | BrushAnnotation
  | EllipseAnnotation
  | CuboidAnnotation
  | CuboidWireAnnotation
  | SemanticAnnotation
  | MagicWandAnnotation;

// Constants
export const MIN_BOX_SIZE = 10;
export const HANDLE_SIZE = 8;
export const DEFAULT_BRUSH_COLOR = '#ff0000';
export const DEFAULT_BRUSH_WIDTH = 3;
