import { useState, useRef, useCallback } from 'react';
import { Audio } from 'expo-av';

interface VideoAnnotation {
  id: string;
  label: string;
  timestamp: string;
  seconds: number;
}

export const useVideoPlayer = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoAnnotations, setVideoAnnotations] = useState<VideoAnnotation[]>([]);
  const progressBarWidth = useRef(0);
  const videoRef = useRef<any>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  const MIN_SPEED = 0.5;
  const MAX_SPEED = 3;

  const togglePlayPause = useCallback(async () => {
    if (!videoRef.current) return;

    try {
      if (isPlaying) {
        await videoRef.current.pauseAsync();
        setIsPlaying(false);
      } else {
        await videoRef.current.playAsync();
        setIsPlaying(true);
      }
    } catch (error) {
      console.error('Video play/pause error:', error);
    }
  }, [isPlaying]);

  const handleSeek = useCallback((e: any) => {
    if (!duration || !progressBarWidth.current || !videoRef.current) return;
    
    const { locationX } = e.nativeEvent;
    const percentage = locationX / progressBarWidth.current;
    const newPosition = percentage * duration;
    
    videoRef.current.setPositionAsync(newPosition);
    setPosition(newPosition);
  }, [duration]);

  const formatTime = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  const speedUp = useCallback(() => {
    setPlaybackSpeed(prev => Math.min(MAX_SPEED, prev + 0.25));
  }, []);

  const speedDown = useCallback(() => {
    setPlaybackSpeed(prev => Math.max(MIN_SPEED, prev - 0.25));
  }, []);

  const resetToNormal = useCallback(() => {
    setPlaybackSpeed(1);
  }, []);

  const addVideoAnnotation = useCallback((timestamp: string) => {
    const seconds = parseTimestamp(timestamp);
    const newAnnotation: VideoAnnotation = {
      id: `annotation-${Date.now()}`,
      label: '',
      timestamp,
      seconds,
    };
    setVideoAnnotations(prev => [...prev, newAnnotation].sort((a, b) => a.seconds - b.seconds));
  }, []);

  const removeVideoAnnotation = useCallback((id: string) => {
    setVideoAnnotations(prev => prev.filter(ann => ann.id !== id));
  }, []);

  const updateVideoAnnotation = useCallback((id: string, label: string) => {
    setVideoAnnotations(prev => 
      prev.map(ann => ann.id === id ? { ...ann, label } : ann)
    );
  }, []);

  return {
    isPlaying,
    position,
    duration,
    playbackSpeed,
    currentTime,
    videoAnnotations,
    progressBarWidth,
    videoRef,
    soundRef,
    togglePlayPause,
    handleSeek,
    formatTime,
    speedUp,
    speedDown,
    resetToNormal,
    addVideoAnnotation,
    removeVideoAnnotation,
    updateVideoAnnotation,
    setVideoAnnotations,
    setPosition,
    setDuration,
    setIsPlaying,
  };
};

function parseTimestamp(timestamp: string): number {
  const parts = timestamp.split(':');
  if (parts.length === 2) {
    const mins = parseInt(parts[0]);
    const secs = parseInt(parts[1]);
    return mins * 60 + secs;
  }
  return 0;
}
