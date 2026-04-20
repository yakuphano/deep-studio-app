import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '@/theme/colors';

const PLAYBACK_SPEED_STORAGE_KEY = 'deepstudio_playback_speed';
const MIN_SPEED = 0.1;
const MAX_SPEED = 3;
const SPEED_STEP = 0.1;

const clampSpeed = (n: number) =>
  Math.min(MAX_SPEED, Math.max(MIN_SPEED, Math.round(n * 10) / 10));

interface VideoPlayerControlsProps {
  videoUrl: string | null;
  onFrameCapture?: (frameData: string, frameNumber: number, timestamp: number) => void;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onLoadedMetadata?: (duration: number) => void;
}

export default function VideoPlayerControls({
  videoUrl,
  onFrameCapture,
  onTimeUpdate,
  onLoadedMetadata
}: VideoPlayerControlsProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [loading, setLoading] = useState(false);

  // Load saved playback speed
  useEffect(() => {
    const loadPlaybackSpeed = async () => {
      try {
        const savedSpeed = await AsyncStorage.getItem(PLAYBACK_SPEED_STORAGE_KEY);
        if (savedSpeed) {
          setPlaybackSpeed(parseFloat(savedSpeed));
        }
      } catch (error) {
        console.error('Failed to load playback speed:', error);
      }
    };
    loadPlaybackSpeed();
  }, []);

  // Save playback speed
  useEffect(() => {
    const savePlaybackSpeed = async () => {
      try {
        await AsyncStorage.setItem(PLAYBACK_SPEED_STORAGE_KEY, playbackSpeed.toString());
      } catch (error) {
        console.error('Failed to save playback speed:', error);
      }
    };
    savePlaybackSpeed();
  }, [playbackSpeed]);

  // Format time helper
  const formatTime = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // Toggle play/pause
  const togglePlayPause = useCallback(async () => {
    if (!videoRef.current) return;

    try {
      if (isPlaying) {
        await videoRef.current.pause();
        setIsPlaying(false);
      } else {
        await videoRef.current.play();
        setIsPlaying(true);
      }
    } catch (error) {
      console.error('Video play/pause error:', error);
    }
  }, [isPlaying]);

  // Speed controls
  const speedUp = useCallback(() => {
    setPlaybackSpeed(prev => clampSpeed(prev + SPEED_STEP));
  }, []);

  const speedDown = useCallback(() => {
    setPlaybackSpeed(prev => clampSpeed(prev - SPEED_STEP));
  }, []);

  const resetToNormal = useCallback(() => {
    setPlaybackSpeed(1);
  }, []);

  // Seek to position
  const handleSeek = useCallback((percentage: number) => {
    if (!videoRef.current || !duration) return;
    
    const newTime = percentage * duration;
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  }, [duration]);

  // Capture frame
  const captureFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    
    if (!context) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const frameData = canvas.toDataURL('image/png');
    const frameNumber = Math.floor(currentTime * 30); // Assuming 30 FPS
    const timestamp = currentTime;
    
    onFrameCapture?.(frameData, frameNumber, timestamp);
  }, [currentTime, onFrameCapture]);

  // Web Video Player Component
  const WebVideoPlayer = () => {
    useEffect(() => {
      const video = videoRef.current;
      if (!video || !videoUrl) return;
      
      const handleTimeUpdate = () => {
        setCurrentTime(video.currentTime);
        onTimeUpdate?.(video.currentTime, duration);
      };
      
      const handleLoadedMetadata = () => {
        setDuration(video.duration);
        onLoadedMetadata?.(video.duration);
      };
      
      const handlePlay = () => setIsPlaying(true);
      const handlePause = () => setIsPlaying(false);
      
      video.addEventListener('timeupdate', handleTimeUpdate);
      video.addEventListener('loadedmetadata', handleLoadedMetadata);
      video.addEventListener('play', handlePlay);
      video.addEventListener('pause', handlePause);
      
      return () => {
        video.removeEventListener('timeupdate', handleTimeUpdate);
        video.removeEventListener('loadedmetadata', handleLoadedMetadata);
        video.removeEventListener('play', handlePlay);
        video.removeEventListener('pause', handlePause);
      };
    }, [videoUrl, duration, onTimeUpdate, onLoadedMetadata]);

    useEffect(() => {
      if (videoRef.current) {
        videoRef.current.playbackRate = playbackSpeed;
      }
    }, [playbackSpeed]);

    if (!videoUrl) {
      return (
        <View style={styles.noVideoContainer}>
          <Text style={styles.noVideoText}>No video available</Text>
        </View>
      );
    }

    return (
      <View style={styles.videoContainer}>
        <video
          ref={videoRef}
          src={videoUrl}
          style={styles.video}
          controls={false}
          playsInline
        />
        <canvas ref={canvasRef} style={styles.hiddenCanvas} />
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <WebVideoPlayer />
      
      {/* Video Controls */}
      <View style={styles.controlsContainer}>
        {/* Play/Pause Button */}
        <TouchableOpacity
          style={styles.playButton}
          onPress={togglePlayPause}
        >
          <Ionicons 
            name={isPlaying ? 'pause' : 'play'} 
            size={24} 
            color={colors.text} 
          />
        </TouchableOpacity>

        {/* Progress Bar */}
        <View style={styles.progressContainer}>
          <TouchableOpacity
            style={styles.progressBar}
            onPress={(e) => {
              const { locationX } = e.nativeEvent;
              const percentage = locationX / 200; // Assuming 200px width
              handleSeek(percentage);
            }}
          >
            <View style={styles.progressBackground}>
              <View 
                style={[
                  styles.progressFill, 
                  { 
                    width: duration ? `${(currentTime / duration) * 100}%` : '0%' 
                  }
                ]} 
              />
            </View>
          </TouchableOpacity>
          <Text style={styles.timeText}>
            {formatTime(currentTime)} / {formatTime(duration)}
          </Text>
        </View>

        {/* Speed Controls */}
        <View style={styles.speedContainer}>
          <TouchableOpacity
            style={styles.speedButton}
            onPress={speedDown}
          >
            <Ionicons name="remove" size={16} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.speedText}>{playbackSpeed}x</Text>
          <TouchableOpacity
            style={styles.speedButton}
            onPress={speedUp}
          >
            <Ionicons name="add" size={16} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.resetButton}
            onPress={resetToNormal}
          >
            <Text style={styles.resetButtonText}>1x</Text>
          </TouchableOpacity>
        </View>

        {/* Capture Frame Button */}
        <TouchableOpacity
          style={styles.captureButton}
          onPress={captureFrame}
        >
          <Ionicons name="camera" size={20} color={colors.text} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  videoContainer: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 8,
    overflow: 'hidden',
  },
  video: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
  },
  hiddenCanvas: {
    display: 'none',
  },
  noVideoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 8,
  },
  noVideoText: {
    fontSize: 16,
    color: colors.textMuted,
    textAlign: 'center',
  },
  controlsContainer: {
    backgroundColor: colors.surfaceElevated,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  playButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accentPurple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressContainer: {
    flex: 1,
    flexDirection: 'column',
    gap: 8,
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
  },
  progressBackground: {
    flex: 1,
    height: '100%',
    backgroundColor: colors.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accentPurple,
    borderRadius: 4,
  },
  timeText: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
  },
  speedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  speedButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speedText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    minWidth: 40,
    textAlign: 'center',
  },
  resetButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
  },
  resetButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
  },
  captureButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accentPurple,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
