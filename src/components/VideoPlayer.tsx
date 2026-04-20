import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Video } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';

interface VideoPlayerProps {
  videoUrl: string | null;
  isPlaying: boolean;
  position: number;
  duration: number | null;
  playbackSpeed: number;
  onTogglePlayPause: () => void;
  onSeek: (e: any) => void;
  onSpeedUp: () => void;
  onSpeedDown: () => void;
  onResetSpeed: () => void;
  onPlaybackStatusUpdate: (status: any) => void;
  videoRef: React.RefObject<any>;
  progressBarWidth: React.RefObject<number>;
}

export default function VideoPlayer({
  videoUrl,
  isPlaying,
  position,
  duration,
  playbackSpeed,
  onTogglePlayPause,
  onSeek,
  onSpeedUp,
  onSpeedDown,
  onResetSpeed,
  onPlaybackStatusUpdate,
  videoRef,
  progressBarWidth
}: VideoPlayerProps) {

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
      {/* Video Player */}
      <View style={styles.videoContainer}>
        <Video
          ref={videoRef}
          source={{ uri: videoUrl }}
          style={styles.video}
          useNativeControls={false}
          resizeMode="contain"
          shouldPlay={isPlaying}
          onPlaybackStatusUpdate={onPlaybackStatusUpdate}
        />
      </View>

      {/* Video Controls */}
      <View style={styles.controlsContainer}>
        {/* Play/Pause Button */}
        <TouchableOpacity
          style={styles.playButton}
          onPress={onTogglePlayPause}
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
            onLayout={(e) => {
              if (progressBarWidth.current !== undefined) {
                progressBarWidth.current = e.nativeEvent.layout.width;
              }
            }}
            onPress={onSeek}
          >
            <View style={styles.progressBackground}>
              <View 
                style={[
                  styles.progressFill, 
                  { 
                    width: duration ? `${(position / duration) * 100}%` : '0%' 
                  }
                ]} 
              />
            </View>
          </TouchableOpacity>
          <Text style={styles.timeText}>
            {formatTime(position)} / {formatTime(duration || 0)}
          </Text>
        </View>

        {/* Speed Controls */}
        <View style={styles.speedContainer}>
          <TouchableOpacity
            style={styles.speedButton}
            onPress={onSpeedDown}
          >
            <Ionicons name="remove" size={16} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.speedText}>{playbackSpeed}x</Text>
          <TouchableOpacity
            style={styles.speedButton}
            onPress={onSpeedUp}
          >
            <Ionicons name="add" size={16} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.resetButton}
            onPress={onResetSpeed}
          >
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
