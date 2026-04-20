import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
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
    <View style={videoWorkbenchStyles.transcriptionSection}>
      <View style={videoWorkbenchStyles.sectionHeader}>
        <Text style={videoWorkbenchStyles.sectionTitle}>Transcription</Text>
        <View style={videoWorkbenchStyles.sectionActions}>
          <TouchableOpacity
            style={[
              videoWorkbenchStyles.actionButton,
              videoWorkbenchStyles.aiButton,
              isTranscribing && videoWorkbenchStyles.buttonDisabled
            ]}
            onPress={handleAITranscription}
            disabled={isTranscribing || !currentFrame}
          >
            <Ionicons 
              name="sparkles-outline" 
              size={16} 
              color={isTranscribing || !currentFrame ? '#94a3b8' : '#8b5cf6'} 
            />
            <Text style={[
              videoWorkbenchStyles.actionButtonText,
              isTranscribing && videoWorkbenchStyles.buttonDisabledText
            ]}>
              {isTranscribing ? 'Transcribing...' : 'AI Transcribe'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      
      <View style={videoWorkbenchStyles.transcriptionContainer}>
        <ScrollView style={videoWorkbenchStyles.transcriptionScroll}>
          <Text
            style={videoWorkbenchStyles.transcriptionInput}
            multiline
            value={transcription}
            onChangeText={setTranscription}
            placeholder="Transcription will appear here..."
            editable={!isTranscribing}
          />
        </ScrollView>
      </View>
      
      {currentFrame && (
        <View style={videoWorkbenchStyles.timeRangeInfo}>
          <Text style={videoWorkbenchStyles.timeRangeLabel}>Frame: {currentFrameNumber}</Text>
          <Text style={videoWorkbenchStyles.timeRangeLabel}>Time: {Math.floor(currentTimestamp)}s</Text>
        </View>
      )}
    </View>
  );
};
