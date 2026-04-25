import React from 'react';
import { View, Text, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { videoWorkbenchStyles } from '@/theme/videoWorkbenchStyles';

interface TranscriptionEditorProps {
  transcription: string;
  setTranscription: (text: string) => void;
  isTranscribing: boolean;
  handleAITranscription: () => void;
  currentFrame: string | null;
  currentFrameNumber: number;
  currentTimestamp: number;
}

export const TranscriptionEditor: React.FC<TranscriptionEditorProps> = ({
  transcription,
  setTranscription,
  isTranscribing,
  handleAITranscription,
  currentFrame,
  currentFrameNumber,
  currentTimestamp,
}) => {
  return (
    <View
      style={[
        videoWorkbenchStyles.transcriptionSection,
        videoWorkbenchStyles.transcriptionEditorSidebar,
      ]}
    >
      <View style={videoWorkbenchStyles.sectionHeader}>
        <Text style={videoWorkbenchStyles.sectionTitle}>Notes (optional)</Text>
        <View style={videoWorkbenchStyles.sectionActions}>
          <TouchableOpacity
            style={[
              videoWorkbenchStyles.actionButton,
              videoWorkbenchStyles.aiButton,
              isTranscribing && videoWorkbenchStyles.buttonDisabled,
            ]}
            onPress={handleAITranscription}
            disabled={isTranscribing || !currentFrame}
          >
            <Ionicons
              name="sparkles-outline"
              size={16}
              color={isTranscribing || !currentFrame ? '#94a3b8' : '#8b5cf6'}
            />
            <Text
              style={[
                videoWorkbenchStyles.actionButtonText,
                isTranscribing && videoWorkbenchStyles.buttonDisabledText,
              ]}
            >
              {isTranscribing ? 'Transcribing...' : 'AI draft'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={videoWorkbenchStyles.transcriptionContainer}>
        <TextInput
          style={videoWorkbenchStyles.transcriptionInput}
          multiline
          value={transcription}
          onChangeText={setTranscription}
          placeholder="Add notes for this frame…"
          placeholderTextColor="#64748b"
          editable={!isTranscribing}
        />
      </View>

      {currentFrame ? (
        <View style={videoWorkbenchStyles.timeRangeInfo}>
          <Text style={videoWorkbenchStyles.timeRangeLabel}>Frame: {currentFrameNumber}</Text>
          <Text style={videoWorkbenchStyles.timeRangeLabel}>Time: {Math.floor(currentTimestamp)}s</Text>
        </View>
      ) : null}
    </View>
  );
};
