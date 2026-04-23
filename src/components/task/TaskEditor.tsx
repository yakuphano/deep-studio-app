import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { taskDetailStyles } from '@/theme/taskDetailStyles';
import { useVideoAI } from '@/hooks/useVideoAI';
import { colors } from '@/theme/colors';

interface TaskEditorProps {
  transcription: string;
  onTranscriptionChange: (text: string) => void;
  onSaveDraft: () => void;
  onAITranscription: () => void;
  onAIFix: () => void;
  taskType: 'audio' | 'image' | 'video';
}

export const TaskEditor: React.FC<TaskEditorProps> = ({
  transcription,
  onTranscriptionChange,
  onSaveDraft,
  onAITranscription,
  onAIFix,
  taskType,
}) => {
  const { transcribing, aiFixing } = useVideoAI();

  // TEMP: Remove all conditions to test if component is being called
  // Check if task type is undefined
  // if (!taskType) {
  //   return (
  //     <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
  //       <Text style={{ color: '#64748b', fontSize: 16 }}>Loading task type...</Text>
  //     </View>
  //   );
  // }

  // // Image tasks don't need transcription editor
  // if (taskType?.toLowerCase() === 'image') {
  //   return null;
  // }

  // Audio/Video tasks - show transcription controls
  return (
    <View style={{ padding: 16 }}>
      {/* TRANSCRIPTION Header */}
      <Text style={{
        fontSize: 14,
        fontWeight: '600',
        color: colors.textMuted,
        marginBottom: 12,
        textTransform: 'uppercase',
      }}>
        TRANSCRIPTION
      </Text>

      {/* Small Purple Buttons - Side by Side */}
      <View style={{
        flexDirection: 'row',
        alignSelf: 'flex-start',
        gap: 8,
        marginBottom: 16,
      }}>
        <TouchableOpacity
          style={{
            backgroundColor: colors.accentPurple,
            paddingVertical: 6,
            paddingHorizontal: 12,
            borderRadius: 4,
          }}
          onPress={onAITranscription}
          disabled={transcribing}
        >
          <Text style={{
            color: '#fff',
            fontSize: 12,
            fontWeight: '500',
          }}>
            AI Yaz\u0131ya Dök
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={{
            backgroundColor: colors.accentPurple,
            paddingVertical: 6,
            paddingHorizontal: 12,
            borderRadius: 4,
          }}
          onPress={onAIFix}
          disabled={aiFixing}
        >
          <Text style={{
            color: '#fff',
            fontSize: 12,
            fontWeight: '500',
          }}>
            Yaz\u0131m Kurallar\u0131n\u0131 Düzelt
          </Text>
        </TouchableOpacity>
      </View>

      {/* Large White TextInput */}
      <TextInput
        style={{
          backgroundColor: '#fff',
          borderRadius: 8,
          padding: 16,
          fontSize: 16,
          color: '#000',
          minHeight: 120,
          textAlignVertical: 'top',
          borderWidth: 1,
          borderColor: colors.border,
        }}
        value={transcription}
        onChangeText={onTranscriptionChange}
        placeholder="Enter transcription here..."
        placeholderTextColor="#64748b"
        multiline
      />
    </View>
  );
};
