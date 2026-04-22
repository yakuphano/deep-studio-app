import React, { useEffect, useState, createElement } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { resolvePlaybackAudioUrl } from '@/lib/audioUrl';

type AudioPlayerProps = {
  /** @deprecated uri ile aynı; geriye dönük uyumluluk */
  audioUri?: string;
  uri?: string;
};

export default function AudioPlayer({ audioUri, uri }: AudioPlayerProps) {
  const raw = (audioUri ?? uri ?? '').trim();
  const resolved = resolvePlaybackAudioUrl(raw);

  if (!raw) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Ses kaynağı tanımlı değil.</Text>
      </View>
    );
  }

  if (!resolved) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Ses adresi çözümlenemedi (zip veya geçersiz yol).</Text>
      </View>
    );
  }

  if (Platform.OS === 'web') {
    return createElement(
      View,
      { style: styles.container },
      createElement('audio', {
        key: resolved,
        src: resolved,
        controls: true,
        preload: 'metadata',
        style: {
          width: '100%',
          minHeight: 40,
        },
      })
    );
  }

  return <NativeExpoAudioPlayer key={resolved} uri={resolved} />;
}

function NativeExpoAudioPlayer({ uri }: { uri: string }) {
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);

  useEffect(() => {
    return sound
      ? () => {
          sound.unloadAsync();
        }
      : undefined;
  }, [sound]);

  const handlePlayPause = async () => {
    try {
      if (!sound) {
        const { sound: newSound } = await Audio.Sound.createAsync(
          { uri },
          { shouldPlay: true }
        );
        setSound(newSound);
        setIsPlaying(true);

        newSound.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded) {
            setDuration(status.durationMillis || 0);
            setPosition(status.positionMillis || 0);
          }
          if (status.didJustFinish) {
            setIsPlaying(false);
            setPosition(0);
          }
        });
      } else {
        if (isPlaying) {
          await sound.pauseAsync();
          setIsPlaying(false);
        } else {
          await sound.playAsync();
          setIsPlaying(true);
        }
      }
    } catch (e) {
      console.error('[AudioPlayer] playback error:', e);
    }
  };

  const formatTime = (milliseconds: number) => {
    const minutes = Math.floor(milliseconds / 60000);
    const seconds = Math.floor((milliseconds % 60000) / 1000);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <View style={styles.container}>
      <View style={styles.controls}>
        <TouchableOpacity style={styles.playButton} onPress={handlePlayPause}>
          <Ionicons name={isPlaying ? 'pause' : 'play'} size={24} color="#fff" />
        </TouchableOpacity>

        <View style={styles.timeInfo}>
          <Text style={styles.timeText}>
            {formatTime(position)} / {formatTime(duration)}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1e293b',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  playButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#8b5cf6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  timeInfo: {
    flex: 1,
  },
  timeText: {
    color: '#94a3b8',
    fontSize: 14,
    fontFamily: 'monospace',
  },
  errorText: {
    color: '#f87171',
    fontSize: 14,
  },
});
