import React, { useRef, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Video } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';

/** Tam kontrollü kullanım (parent state) veya yalnızca `videoUrl` ile basit oynatma */
export type VideoPlayerProps = {
  videoUrl: string | null;
  /** TaskMediaView uyumluluğu — şu an kullanılmıyor */
  annotations?: unknown[];
  onAnnotationsChange?: (annotations: unknown[]) => void;
  isPlaying?: boolean;
  position?: number;
  duration?: number | null;
  playbackSpeed?: number;
  onTogglePlayPause?: () => void;
  onSeek?: (e: { nativeEvent: { locationX: number } }) => void;
  onSpeedUp?: () => void;
  onSpeedDown?: () => void;
  onResetSpeed?: () => void;
  onPlaybackStatusUpdate?: (status: Record<string, unknown>) => void;
  videoRef?: React.RefObject<Video | null>;
  progressBarWidth?: React.MutableRefObject<number>;
};

export default function VideoPlayer(props: VideoPlayerProps) {
  const {
    videoUrl,
    isPlaying: isPlayingProp,
    position: positionProp,
    duration: durationProp,
    playbackSpeed: speedProp,
    onTogglePlayPause,
    onSeek,
    onSpeedUp,
    onSpeedDown,
    onResetSpeed,
    onPlaybackStatusUpdate: onPlaybackProp,
    videoRef: videoRefProp,
    progressBarWidth: progressBarWidthProp,
  } = props;

  const simpleMode = onTogglePlayPause == null;

  const fallbackVideoRef = useRef<Video | null>(null);
  const videoRef = videoRefProp ?? fallbackVideoRef;

  const fallbackProgressW = useRef(300);
  const progressBarWidth = progressBarWidthProp ?? fallbackProgressW;

  const [playInternal, setPlayInternal] = useState(false);
  const [posInternal, setPosInternal] = useState(0);
  const [durInternal, setDurInternal] = useState<number | null>(null);
  const [speedInternal, setSpeedInternal] = useState(1);

  const isPlaying = simpleMode ? playInternal : Boolean(isPlayingProp);
  const position = simpleMode ? posInternal : Number(positionProp ?? 0);
  const duration = simpleMode ? durInternal : durationProp ?? null;
  const playbackSpeed = simpleMode ? speedInternal : Number(speedProp ?? 1);

  const handleStatus = useCallback(
    (status: Record<string, unknown>) => {
      if (onPlaybackProp) {
        onPlaybackProp(status);
        return;
      }
      if (!status?.isLoaded) return;
      const pm = status.positionMillis;
      const dm = status.durationMillis;
      if (typeof pm === 'number') setPosInternal(pm / 1000);
      if (typeof dm === 'number' && dm > 0) setDurInternal(dm / 1000);
    },
    [onPlaybackProp]
  );

  const togglePlay = useCallback(() => {
    if (onTogglePlayPause) {
      onTogglePlayPause();
      return;
    }
    setPlayInternal((p) => !p);
  }, [onTogglePlayPause]);

  const seek = useCallback(
    async (e: { nativeEvent: { locationX: number } }) => {
      if (onSeek) {
        onSeek(e);
        return;
      }
      const w = progressBarWidth.current || 300;
      const pct = Math.max(0, Math.min(1, e.nativeEvent.locationX / w));
      const d = duration ?? 0;
      if (d <= 0) return;
      const ms = pct * d * 1000;
      try {
        await videoRef.current?.setPositionAsync?.(ms);
      } catch {
        /* ignore */
      }
      setPosInternal(pct * d);
    },
    [onSeek, duration, progressBarWidth, videoRef]
  );

  const speedUp = useCallback(() => {
    if (onSpeedUp) return onSpeedUp();
    setSpeedInternal((s) => Math.min(2, s + 0.25));
  }, [onSpeedUp]);

  const speedDown = useCallback(() => {
    if (onSpeedDown) return onSpeedDown();
    setSpeedInternal((s) => Math.max(0.5, s - 0.25));
  }, [onSpeedDown]);

  const resetSpeed = useCallback(() => {
    if (onResetSpeed) return onResetSpeed();
    setSpeedInternal(1);
  }, [onResetSpeed]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!videoUrl) {
    return (
      <View style={styles.container}>
        <Text style={styles.noVideoText}>No video available</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.videoContainer}>
        <Video
          ref={videoRef as React.RefObject<Video>}
          source={{ uri: videoUrl }}
          style={styles.video}
          useNativeControls={false}
          resizeMode="contain"
          shouldPlay={isPlaying}
          rate={playbackSpeed}
          onPlaybackStatusUpdate={handleStatus as (s: unknown) => void}
        />
      </View>

      <View style={styles.controlsContainer}>
        <TouchableOpacity style={styles.playButton} onPress={togglePlay}>
          <Ionicons name={isPlaying ? 'pause' : 'play'} size={24} color={colors.text} />
        </TouchableOpacity>

        <View style={styles.progressContainer}>
          <TouchableOpacity
            style={styles.progressBar}
            onLayout={(e) => {
              progressBarWidth.current = e.nativeEvent.layout.width;
            }}
            onPress={seek}
          >
            <View style={styles.progressBackground}>
              <View
                style={[
                  styles.progressFill,
                  { width: duration ? `${(position / (duration || 1)) * 100}%` : '0%' },
                ]}
              />
            </View>
          </TouchableOpacity>
          <Text style={styles.timeText}>
            {formatTime(position)} / {formatTime(duration || 0)}
          </Text>
        </View>

        <View style={styles.speedContainer}>
          <TouchableOpacity style={styles.speedButton} onPress={speedDown}>
            <Ionicons name="remove" size={16} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.speedText}>{playbackSpeed}x</Text>
          <TouchableOpacity style={styles.speedButton} onPress={speedUp}>
            <Ionicons name="add" size={16} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.resetButton} onPress={resetSpeed}>
            <Text style={styles.resetButtonText}>1x</Text>
          </TouchableOpacity>
        </View>
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
    flex: 1,
  },
  controlsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  playButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accentPurple,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
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
    marginLeft: 16,
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
  noVideoText: {
    fontSize: 16,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 100,
  },
});
