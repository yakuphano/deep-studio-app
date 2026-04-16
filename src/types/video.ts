export interface TaskData {
  id: string;
  title: string;
  status?: string;
  price?: number | null;
  type?: 'audio' | 'image' | 'video' | string | null;
  category?: string | null;
  audio_url?: string;
  image_url?: string | null;
  video_url?: string | null;
  transcription?: string;
  annotation_data?: unknown;
  language?: string | null;
}

export interface VideoAnnotation {
  id: string;
  frameNumber: number;
  timestamp: number;
  annotations: any[];
}

export interface WebVideoPlayerProps {
  src: string; 
  onFrameCapture: (frameData: string, frameNumber: number, timestamp: number) => void;
  onTimeUpdate: (currentTime: number, duration: number) => void;
  onLoadedMetadata: (duration: number) => void;
}

export interface VideoPlayerState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackSpeed: number;
}

export interface TranscriptionState {
  text: string;
  isTranscribing: boolean;
  isSaving: boolean;
}

export interface AnnotationTool {
  id: string;
  name: string;
  icon: string;
  active?: boolean;
}

export interface TimeRange {
  start: number;
  end: number;
}

export interface FrameData {
  data: string;
  number: number;
  timestamp: number;
}
