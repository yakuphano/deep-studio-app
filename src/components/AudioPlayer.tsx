import React, { useMemo, useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Pressable } from 'react-native';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { resolvePlaybackAudioUrl } from '@/lib/audioUrl';
import type { AppColors } from '@/theme/palettes';
import { useThemeColors } from '@/contexts/ThemeContext';

type AudioPlayerProps = {
  /** @deprecated uri ile aynı; geriye dönük uyumluluk */
  audioUri?: string;
  uri?: string;
};

const SPEED_STEPS = [0.75, 1, 1.25, 1.5, 2] as const;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/** Web: tarayıcı kontrol çubuğu (indirme menüsü) yerine özel oynatıcı — indirme yok. */
function WebAudioPlayer({ uri, styles }: { uri: string; styles: ReturnType<typeof createStyles> }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speedIdx, setSpeedIdx] = useState(1);

  const rate = SPEED_STEPS[speedIdx];

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.playbackRate = rate;
  }, [rate, uri]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    const onTime = () => setCurrent(el.currentTime);
    const onMeta = () => setDuration(el.duration || 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      setCurrent(0);
    };

    el.addEventListener('timeupdate', onTime);
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('durationchange', onMeta);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('ended', onEnded);

    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('durationchange', onMeta);
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('ended', onEnded);
    };
  }, [uri]);

  const togglePlay = useCallback(async () => {
    const el = audioRef.current;
    if (!el) return;
    try {
      if (el.paused) await el.play();
      else el.pause();
    } catch (e) {
      console.error('[AudioPlayer] play error:', e);
    }
  }, []);

  const onSeek = useCallback(
    (e: { nativeEvent: { locationX: number }; currentTarget?: { clientWidth?: number } }) => {
      const el = audioRef.current;
      if (!el || !duration) return;
      const w =
        (e.currentTarget as unknown as { clientWidth?: number })?.clientWidth ??
        (e.nativeEvent as unknown as { target?: { clientWidth?: number } })?.target?.clientWidth ??
        1;
      const ratio = Math.max(0, Math.min(1, e.nativeEvent.locationX / w));
      el.currentTime = ratio * duration;
      setCurrent(el.currentTime);
    },
    [duration]
  );

  const cycleSpeed = useCallback(() => {
    setSpeedIdx((i) => (i + 1) % SPEED_STEPS.length);
  }, []);

  const progress = duration > 0 ? (current / duration) * 100 : 0;

  return (
    <View
      style={styles.webWrap}
      // @ts-expect-error web only
      onContextMenu={(ev: { preventDefault: () => void }) => ev.preventDefault()}
    >
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio
        ref={audioRef}
        src={uri}
        preload="metadata"
        style={{ display: 'none' }}
        controlsList="nodownload nofullscreen noremoteplayback"
      />
      <View style={styles.webRow}>
        <TouchableOpacity style={styles.webPlayBtn} onPress={togglePlay} accessibilityLabel="Play pause">
          <Ionicons name={playing ? 'pause' : 'play'} size={18} color="#fff" />
        </TouchableOpacity>
        <View style={styles.webMain}>
          <Pressable style={styles.webProgressTrack} onPress={onSeek}>
            <View style={[styles.webProgressFill, { width: `${progress}%` }]} />
          </Pressable>
          <View style={styles.webMetaRow}>
            <Text style={styles.timeText}>
              {formatTime(current)} / {formatTime(duration)}
            </Text>
            <TouchableOpacity style={styles.speedChip} onPress={cycleSpeed}>
              <Text style={styles.speedChipText}>{rate.toFixed(2).replace(/\.?0+$/, '')}x</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

export default function AudioPlayer({ audioUri, uri }: AudioPlayerProps) {
  const themeColors = useThemeColors();
  const styles = useMemo(() => createStyles(themeColors), [themeColors]);

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
    return (
      <View style={styles.container}>
        <WebAudioPlayer uri={resolved} styles={styles} />
      </View>
    );
  }

  return <NativeExpoAudioPlayer key={resolved} uri={resolved} styles={styles} />;
}

function NativeExpoAudioPlayer({
  uri,
  styles,
}: {
  uri: string;
  styles: ReturnType<typeof createStyles>;
}) {
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
        const { sound: newSound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true });
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
      } else if (isPlaying) {
        await sound.pauseAsync();
        setIsPlaying(false);
      } else {
        await sound.playAsync();
        setIsPlaying(true);
      }
    } catch (e) {
      console.error('[AudioPlayer] playback error:', e);
    }
  };

  const formatMs = (milliseconds: number) => {
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
            {formatMs(position)} / {formatMs(duration)}
          </Text>
        </View>
      </View>
    </View>
  );
}

function createStyles(themeColors: AppColors) {
  return StyleSheet.create({
    container: {
      backgroundColor: themeColors.surface,
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: themeColors.border,
    },
    webWrap: {
      width: '100%',
    },
    webRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    webPlayBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: themeColors.accent,
      justifyContent: 'center',
      alignItems: 'center',
      flexShrink: 0,
    },
    webMain: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    webProgressTrack: {
      height: 6,
      borderRadius: 3,
      backgroundColor: themeColors.surfaceElevated,
      overflow: 'hidden',
      width: '100%',
    },
    webProgressFill: {
      height: '100%',
      backgroundColor: themeColors.accent,
      borderRadius: 3,
    },
    webMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    speedChip: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      backgroundColor: themeColors.surfaceElevated,
      borderWidth: 1,
      borderColor: themeColors.border,
    },
    speedChipText: {
      fontSize: 12,
      fontWeight: '600',
      color: themeColors.text,
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
      backgroundColor: themeColors.accent,
      justifyContent: 'center',
      alignItems: 'center',
    },
    timeInfo: {
      flex: 1,
    },
    timeText: {
      color: themeColors.textMuted,
      fontSize: 12,
      fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
    },
    errorText: {
      color: '#f87171',
      fontSize: 14,
    },
  });
}
