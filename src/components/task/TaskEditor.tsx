import React from 'react';
import { View, Text, TextInput, TouchableOpacity, Platform } from 'react-native';
import { useVideoAI } from '@/hooks/useVideoAI';
import { useThemeColors } from '@/contexts/ThemeContext';

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
  const themeColors = useThemeColors();
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

  return (
    <View style={{ flex: 1, minHeight: 0, paddingHorizontal: 16, paddingBottom: 8 }}>
      <View
        style={{
          flexShrink: 0,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 8,
        }}
      >
        <Text
          style={{
            fontSize: 14,
            fontWeight: '600',
            color: themeColors.text,
          }}
        >
          Transcription
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
        <TouchableOpacity
          style={{
            backgroundColor: themeColors.accentPurple,
            paddingVertical: 6,
            paddingHorizontal: 10,
            borderRadius: 6,
            opacity: transcribing ? 0.6 : 1,
          }}
          onPress={onAITranscription}
          disabled={transcribing}
        >
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>AI Transcribe</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={{
            backgroundColor: themeColors.accentPurple,
            paddingVertical: 6,
            paddingHorizontal: 10,
            borderRadius: 6,
            opacity: aiFixing ? 0.6 : 1,
          }}
          onPress={onAIFix}
          disabled={aiFixing}
        >
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>AI Fix</Text>
        </TouchableOpacity>
        </View>
      </View>

      <View
        style={{
          flex: 1,
          minHeight: 0,
          backgroundColor: themeColors.surface,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: themeColors.border,
          padding: 8,
        }}
      >
        <TextInput
          style={{
            flex: 1,
            fontSize: 14,
            lineHeight: 20,
            color: themeColors.text,
            textAlignVertical: 'top',
            ...(Platform.OS === 'web' ? ({ height: '100%', outlineStyle: 'none' } as object) : { minHeight: 80 }),
          }}
          value={transcription}
          onChangeText={onTranscriptionChange}
          placeholder="Enter transcription here..."
          placeholderTextColor={themeColors.textMuted}
          multiline
          scrollEnabled
        />
      </View>
    </View>
  );
};
