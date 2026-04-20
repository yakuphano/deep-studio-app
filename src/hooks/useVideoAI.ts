import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import { transcribeWithGroq } from '@/lib/groq';

export const useVideoAI = () => {
  const [transcribing, setTranscribing] = useState(false);
  const [aiFixing, setAiFixing] = useState(false);

  // AI Transcription using Groq API
  const handleAITranscription = useCallback(async (audioUrl: string, onTranscriptionChange: (text: string) => void) => {
    if (!audioUrl) return;
    
    setTranscribing(true);
    try {
      const result = await transcribeWithGroq({ fileUrl: audioUrl });
      onTranscriptionChange(result.text);
    } catch (error) {
      console.error('AI Transcription Error:', error);
      Alert.alert('Error', 'Failed to transcribe audio');
    } finally {
      setTranscribing(false);
    }
  }, []);

  // AI Fix transcription (mock implementation - replace with actual AI service)
  const handleAIFix = useCallback(async (currentText: string, onTranscriptionChange: (text: string) => void) => {
    if (!currentText.trim()) return;
    
    setAiFixing(true);
    try {
      // Mock AI fix - replace with actual implementation
      await new Promise(resolve => setTimeout(resolve, 1500));
      const fixedText = currentText + ' (AI Fixed)';
      onTranscriptionChange(fixedText);
    } catch (error) {
      console.error('AI Fix Error:', error);
      Alert.alert('Error', 'Failed to fix transcription');
    } finally {
      setAiFixing(false);
    }
  }, []);

  return {
    transcribing,
    aiFixing,
    handleAITranscription,
    handleAIFix,
  };
};
