export interface TaskData {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'submitted' | 'completed';
  price: number;
  type: 'audio' | 'image' | 'video';
  category: string | null;
  audio_url: string | null;
  image_url: string | null;
  video_url: string | null;
  transcription: string;
  annotation_data: any;
  language: string | null;
}

export interface Annotation {
  id: string;
  type: string;
  label: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  points?: { x: number; y: number }[];
  cx?: number;
  cy?: number;
  rx?: number;
  ry?: number;
  timestamp?: number;
  seconds?: number;
}

export interface VideoAnnotation {
  id: string;
  label: string;
  timestamp: string;
  seconds: number;
}

export type TaskType = 'audio' | 'image' | 'video';

export type TaskStatus = 'pending' | 'in_progress' | 'submitted' | 'completed';

export type Tool = 'pan' | 'select' | 'bbox' | 'polygon' | 'points' | 'ellipse' | 'cuboid' | 'polyline' | 'semantic' | 'brush' | 'magic_wand';
