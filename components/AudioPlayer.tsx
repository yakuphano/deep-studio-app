import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Audio } from 'expo-av';

interface AudioPlayerProps {
  uri: string;
  onTranscriptionReady?: (text: string) => void;
}

export default function AudioPlayer({ uri }: AudioPlayerProps) {
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState<number | null>(null);
  const [position, setPosition] = useState(0);

  useEffect(() => {
    return () => {
      if (sound) sound.unloadAsync();
    };
  }, [sound]);

  const loadAndPlay = async () => {
    try {
      if (sound) await sound.unloadAsync();
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true, isLooping: false }
      );
      const status = await newSound.getStatusAsync();
      if (status.isLoaded) setDuration(status.durationMillis ?? null);
      newSound.setOnPlaybackStatusUpdate((s) => {
        if (s.isLoaded) {
          setPosition(s.positionMillis ?? 0);
          if (s.didJustFinish && !s.isLooping) setIsPlaying(false);
        }
      });
      setSound(newSound);
      setIsPlaying(true);
    } catch (err) {
      console.error('Audio load error:', err);
    }
  };

  const togglePlayPause = async () => {
    if (isPlaying && sound) {
      await sound.pauseAsync();
      setIsPlaying(false);
    } else if (sound) {
      await sound.playAsync();
      setIsPlaying(true);
    } else {
      await loadAndPlay();
    }
  };

  const formatTime = (ms: number) => {
    const secs = Math.floor(ms / 1000);
    const mins = Math.floor(secs / 60);
    return `${mins}:${(secs % 60).toString().padStart(2, '0')}`;
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.playButton} onPress={togglePlayPause}>
        <Text style={styles.playIcon}>{isPlaying ? '⏸' : '▶'}</Text>
      </TouchableOpacity>
      <View style={styles.info}>
        <View style={[
          styles.progress,
          { width: duration ? `${(position / duration) * 100}%` : '0%' }
        ]} />
        <Text style={styles.time}>
          {formatTime(position)}
          {duration ? ` / ${formatTime(duration)}` : ''}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#1e293b',
    borderRadius: 12,
  },
  playButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  playIcon: { fontSize: 20, color: '#fff' },
  info: { flex: 1 },
  progress: {
    height: 6,
    backgroundColor: '#3b82f6',
    borderRadius: 3,
    marginBottom: 4,
  },
  time: { fontSize: 12, color: '#94a3b8' },
});
