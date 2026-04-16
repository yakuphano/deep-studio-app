import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';

interface TranscriptionPanelProps {
  transcription: string;
  onTranscriptionChange: (text: string) => void;
  transcribing: boolean;
  aiFixing: boolean;
  onAITranscription: () => void;
  onAIFix: () => void;
  audioUrl?: string;
}

export default function TranscriptionPanel({
  transcription,
  onTranscriptionChange,
  transcribing,
  aiFixing,
  onAITranscription,
  onAIFix,
  audioUrl
}: TranscriptionPanelProps) {
  const [isEditing, setIsEditing] = useState(false);

  return (
    <View style={styles.container}>
      {/* Transcription Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Transcription</Text>
        <TouchableOpacity
          style={styles.editButton}
          onPress={() => setIsEditing(!isEditing)}
        >
          <Ionicons 
            name={isEditing ? 'checkmark' : 'create'} 
            size={20} 
            color={colors.accentPurple} 
          />
        </TouchableOpacity>
      </View>

      {/* AI Buttons */}
      <View style={styles.aiButtonsContainer}>
        <TouchableOpacity
          style={[
            styles.aiButton,
            styles.transcribeButton,
            (!audioUrl || transcribing) && styles.aiButtonDisabled
          ]}
          onPress={onAITranscription}
          disabled={!audioUrl || transcribing}
        >
          {transcribing ? (
            <ActivityIndicator size="small" color={colors.text} />
          ) : (
            <>
              <Ionicons name="sparkles" size={16} color={colors.text} />
              <Text style={styles.aiButtonText}>AI Transcribe</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.aiButton,
            styles.fixButton,
            (!transcription.trim() || aiFixing) && styles.aiButtonDisabled
          ]}
          onPress={onAIFix}
          disabled={!transcription.trim() || aiFixing}
        >
          {aiFixing ? (
            <ActivityIndicator size="small" color={colors.text} />
          ) : (
            <>
              <Ionicons name="sparkles" size={16} color={colors.text} />
              <Text style={styles.aiButtonText}>AI Fix</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Transcription Content */}
      <View style={styles.transcriptionContainer}>
        {isEditing ? (
          <TextInput
            style={styles.transcriptionInput}
            value={transcription}
            onChangeText={onTranscriptionChange}
            multiline
            placeholder="Edit transcription here..."
            placeholderTextColor={colors.textMuted}
            textAlignVertical="top"
          />
        ) : (
          <ScrollView style={styles.transcriptionScroll}>
            <Text style={styles.transcriptionText}>
              {transcription || 'No transcription available. Click "AI Transcribe" to generate transcription.'}
            </Text>
          </ScrollView>
        )}
      </View>

      {/* Character Count */}
      <View style={styles.footer}>
        <Text style={styles.characterCount}>
          {transcription.length} characters
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  editButton: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
  },
  aiButtonsContainer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  aiButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: colors.accentPurple,
    alignSelf: 'flex-start',
  },
  aiButtonDisabled: {
    opacity: 0.6,
  },
  transcribeButton: {
    backgroundColor: colors.accentPurple,
  },
  fixButton: {
    backgroundColor: colors.accentPurple,
  },
  aiButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  transcriptionContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  transcriptionScroll: {
    flex: 1,
  },
  transcriptionText: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
    minHeight: 100,
  },
  transcriptionInput: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
    backgroundColor: 'transparent',
    borderWidth: 0,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  characterCount: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'right',
  },
});
