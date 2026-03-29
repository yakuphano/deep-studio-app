import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface AudioAreaProps {
  audioUrl: string | null;
  transcription: string;
  setTranscription: (text: string) => void;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  position: number;
  setPosition: (position: number) => void;
  duration: number | null;
  setDuration: (duration: number | null) => void;
  playbackSpeed: number;
  setPlaybackSpeed: (speed: number) => void;
  transcribing: boolean;
  aiFixing: boolean;
  onAITranscription: () => void;
  onAIFix: () => void;
}

export default function AudioArea({
  audioUrl,
  transcription,
  setTranscription,
  isPlaying,
  setIsPlaying,
  position,
  setPosition,
  duration,
  setDuration,
  playbackSpeed,
  setPlaybackSpeed,
  transcribing,
  aiFixing,
  onAITranscription,
  onAIFix
}: AudioAreaProps) {
  return (
    <View style={styles.audioSection}>
      <Text style={styles.sectionLabel}>Audio Label</Text>
      <View style={styles.audioCard}>
        {audioUrl ? (
          <>
            {/* Web Audio Player */}
            <View style={styles.playerContent}>
              <TouchableOpacity
                style={styles.playButton}
                onPress={() => setIsPlaying(!isPlaying)}
                activeOpacity={0.8}
              >
                <Text style={styles.playIcon}>{isPlaying ? '⏸' : '▶'}</Text>
              </TouchableOpacity>
              <View style={styles.playerInfo}>
                <Pressable
                  style={styles.progressBar}
                  onPress={() => {
                    // Simple seek functionality
                    if (duration) {
                      const newPercent = Math.random() * 100; // Placeholder for actual seek
                      setPosition((newPercent / 100) * duration);
                    }
                  }}
                >
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: duration
                          ? `${Math.min(100, (position / duration) * 100)}%`
                          : '0%',
                      },
                    ]}
                  />
                </Pressable>
                <Text style={styles.timeText}>
                  {formatTime(position)}
                  {duration !== null ? ` / ${formatTime(duration)}` : ''}
                </Text>
              </View>
            </View>

            {/* Speed Controls */}
            <View style={styles.speedRow}>
              <Text style={styles.speedLabel}>Playback Speed</Text>
              <View style={styles.speedControlRow}>
                <TouchableOpacity
                  style={[styles.speedBtn, playbackSpeed <= 0.1 && styles.speedBtnDisabled]}
                  onPress={() => setPlaybackSpeed(Math.max(0.1, playbackSpeed - 0.1))}
                  disabled={playbackSpeed <= 0.1}
                  activeOpacity={0.8}
                >
                  <Text style={styles.speedBtnText}>−</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.speedValue} 
                  onPress={() => setPlaybackSpeed(1)}
                >
                  <Text style={styles.speedValueText}>{`${playbackSpeed.toFixed(1)}x`}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.speedBtn, playbackSpeed >= 3 && styles.speedBtnDisabled]}
                  onPress={() => setPlaybackSpeed(Math.min(3, playbackSpeed + 0.1))}
                  disabled={playbackSpeed >= 3}
                  activeOpacity={0.8}
                >
                  <Text style={styles.speedBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        ) : (
          <Text style={styles.noAudioText}>No audio available</Text>
        )}
      </View>

      {/* Transcription Section */}
      <View style={styles.transcriptionSection}>
        <View style={styles.transcriptionHeader}>
          <Text style={styles.sectionLabel}>Transcription</Text>
        </View>
        <View style={styles.aiButtonWrapper}>
          <Pressable
            style={[
              styles.aiTranscribeButton,
              transcribing && styles.aiTranscribeButtonDisabled,
              { zIndex: 9999 },
            ]}
            onPress={onAITranscription}
            disabled={transcribing}
          >
            {transcribing ? (
              <>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={styles.aiTranscribeButtonText}>
                  Transcribing...
                </Text>
              </>
            ) : (
              <>
                <Ionicons name="sparkles" size={18} color="#fff" />
                <Text style={styles.aiTranscribeButtonText}>
                  Transcribe
                </Text>
              </>
            )}
          </Pressable>
        </View>
        <View style={styles.transcriptionCard}>
          <TextInput
            style={styles.transcriptionInput}
            placeholder="Enter transcription..."
            placeholderTextColor="#64748b"
            value={transcription}
            onChangeText={setTranscription}
            multiline
            textAlignVertical="top"
            editable={true}
          />
        </View>
        <View style={styles.aiButtonWrapper}>
          <Pressable
            style={[
              styles.aiTranscribeButton,
              aiFixing && styles.aiTranscribeButtonDisabled,
              { zIndex: 9999 },
            ]}
            onPress={onAIFix}
            disabled={aiFixing}
          >
            {aiFixing ? (
              <>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={styles.aiTranscribeButtonText}>
                  AI Fixing...
                </Text>
              </>
            ) : (
              <>
                <Ionicons name="sparkles" size={18} color="#fff" />
                <Text style={styles.aiTranscribeButtonText}>
                  AI Fix
                </Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// Helper functions
const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const styles = StyleSheet.create({
  audioSection: {
    marginBottom: 10,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8',
    marginBottom: 4,
  },
  audioCard: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  playerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  playButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  playIcon: {
    fontSize: 20,
    color: '#fff',
  },
  playerInfo: {
    flex: 1,
  },
  progressBar: {
    height: 6,
    backgroundColor: '#334155',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#3b82f6',
    borderRadius: 3,
  },
  timeText: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 4,
  },
  noAudioText: {
    fontSize: 13,
    color: '#64748b',
  },
  speedRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  speedLabel: {
    fontSize: 11,
    color: '#94a3b8',
    marginBottom: 6,
  },
  speedControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  speedBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#334155',
    borderWidth: 1,
    borderColor: '#475569',
    justifyContent: 'center',
    alignItems: 'center',
  },
  speedBtnDisabled: {
    opacity: 0.4,
  },
  speedBtnText: {
    fontSize: 18,
    color: '#f1f5f9',
    fontWeight: '600',
  },
  speedValue: {
    minWidth: 52,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speedValueText: {
    fontSize: 15,
    color: '#3b82f6',
    fontWeight: '700',
  },
  transcriptionSection: {
    marginBottom: 10,
  },
  transcriptionHeader: {
    marginBottom: 6,
  },
  aiButtonWrapper: {
    position: 'relative',
    zIndex: 9999,
    marginBottom: 8,
    overflow: 'visible',
  },
  aiTranscribeButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  aiTranscribeButtonDisabled: {
    opacity: 0.5,
  },
  aiTranscribeButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#fff',
  },
  transcriptionCard: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  transcriptionInput: {
    color: '#e2e8f0',
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
  },
});
