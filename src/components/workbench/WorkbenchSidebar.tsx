import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { AppColors } from '@/theme/palettes';
import { useThemeColors } from '@/contexts/ThemeContext';
interface WorkbenchSidebarProps {
  activeTool: string;
  isBrushActive: boolean;
  annotations: any[];
  onActiveToolChange: (tool: string) => void;
  onUndo: () => void;
  transcription: string;
  onTranscriptionChange: (text: string) => void;
  transcribing: boolean;
  aiFixing: boolean;
  onAITranscription: () => void;
  onAIFix: () => void;
  onSubmit: () => void;
  onExit: () => void;
  isSubmitted: boolean;
  saving: boolean;
  isWeb: boolean;
}

export default function WorkbenchSidebar({
  activeTool,
  isBrushActive,
  annotations,
  onActiveToolChange,
  onUndo,
  transcription,
  onTranscriptionChange,
  transcribing,
  aiFixing,
  onAITranscription,
  onAIFix,
  onSubmit,
  onExit,
  isSubmitted,
  saving,
  isWeb
}: WorkbenchSidebarProps) {
  const themeColors = useThemeColors();
  const styles = useMemo(() => createStyles(themeColors), [themeColors]);


  const tools = [
    {
      id: 'pan',
      icon: 'hand-right-outline',
      label: 'Pan',
      shortcut: 'G',
      hint: 'Shift+sürükle: tüm nesneleri taşı',
    },
    { id: 'bbox', icon: 'square-outline', label: 'Bounding Box', shortcut: 'R' },
    { id: 'polygon', icon: 'git-merge-outline', label: 'Polygon', shortcut: 'P' },
    { id: 'points', icon: 'radio-button-off-outline', label: 'Points', shortcut: 'N' },
    { id: 'ellipse', icon: 'ellipse-outline', label: 'Ellipse', shortcut: '' },
    { id: 'cuboid', icon: 'cube-outline', label: 'Cuboid', shortcut: '' },
    {
      id: 'cuboid_wire',
      icon: 'git-network-outline',
      label: 'Cuboid (wire)',
      shortcut: '',
      hint: '8 tık: ön 1–4, arka 5–8; köşe i ile i+4 derinlik',
    },
    { id: 'polyline', icon: 'create-outline', label: 'Polyline', shortcut: '' },
    {
      id: 'semantic',
      icon: 'color-filter-outline',
      label: 'Semantic',
      shortcut: '',
      hint: 'Dikdörtgen sınıf bölgesi; etiket soldan. Bbox gibi 8 tutamaçla yeniden boyutlandırma, Pan ile taşıma.',
    },
    { id: 'brush', icon: 'brush-outline', label: 'Brush', shortcut: '' },
    { id: 'eraser', icon: 'remove-outline', label: 'Eraser', shortcut: '' },
    { id: 'magic_wand', icon: 'sparkles', label: 'Magic Wand', shortcut: '' },
  ];

  return (
    <View style={styles.container}>
      {/* Tools Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Tools</Text>
        <ScrollView style={styles.toolsContainer}>
          {tools.map((tool) => {
            const toolActive = activeTool === tool.id && !isBrushActive;
            return (
            <TouchableOpacity
              key={tool.id}
              style={[
                styles.toolButton,
                toolActive && styles.toolButtonActive
              ]}
              onPress={() => {
                onActiveToolChange(tool.id);
              }}
              activeOpacity={0.8}
              {...(isWeb
                ? ({
                    accessibilityLabel: `${tool.label} (${tool.shortcut})${(tool as any).hint ? `. ${(tool as any).hint}` : ''}`,
                    title: `${tool.label} (${tool.shortcut})${(tool as any).hint ? ` — ${(tool as any).hint}` : ''}`,
                  } as any)
                : {})}
            >
              <Ionicons name={tool.icon as any} size={20} color={toolActive ? '#ffffff' : themeColors.text} />
              <Text style={[styles.toolButtonText, toolActive && styles.toolButtonTextActive]}>{tool.label}</Text>
            </TouchableOpacity>
          );})}
          
          {/* Undo Button */}
          <TouchableOpacity
            style={[styles.toolButton, activeTool === 'undo' && !isBrushActive && styles.toolButtonActive]}
            onPress={onUndo}
            activeOpacity={0.8}
            {...(isWeb ? { accessibilityLabel: 'Undo (V)', title: 'Undo (V)' } as any : {})}
          >
            <Ionicons name="arrow-undo-outline" size={20} color={activeTool === 'undo' && !isBrushActive ? '#ffffff' : themeColors.text} />
            <Text style={[styles.toolButtonText, activeTool === 'undo' && !isBrushActive && styles.toolButtonTextActive]}>Undo (V)</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* AI Transcription Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>AI Assistant</Text>
        
        {/* AI Transcribe Button - KRITIK: MOR RENK */}
        <View style={styles.aiButtonWrapper}>
          <Pressable
            style={[
              styles.aiTranscribeButton,
              transcribing && styles.aiTranscribeButtonDisabled,
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
                <Ionicons name="sparkles" size={16} color="#fff" />
                <Text style={styles.aiTranscribeButtonText}>
                  AI Transcribe
                </Text>
              </>
            )}
          </Pressable>
        </View>

        {/* AI Fix Button - KRITIK: MOR RENK */}
        <View style={styles.aiButtonWrapper}>
          <Pressable
            style={[
              styles.aiTranscribeButton,
              aiFixing && styles.aiTranscribeButtonDisabled,
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
                <Ionicons name="sparkles" size={16} color="#fff" />
                <Text style={styles.aiTranscribeButtonText}>
                  AI Fix
                </Text>
              </>
            )}
          </Pressable>
        </View>

        {/* Transcription Input */}
        <View style={styles.transcriptionCard}>
          <Text style={styles.transcriptionLabel}>Transcription</Text>
          <TextInput
            style={styles.transcriptionInput}
            value={transcription}
            onChangeText={onTranscriptionChange}
            placeholder="Enter transcription here..."
            placeholderTextColor="#64748b"
            multiline
            numberOfLines={4}
            editable={true}
          />
        </View>
      </View>

      {/* Submit Section */}
      <View style={styles.submitSection}>
        {isSubmitted ? (
          <View style={styles.submittedBadge}>
            <Ionicons name="checkmark-circle" size={16} color="#10b981" />
            <Text style={styles.submittedText}>Submitted</Text>
          </View>
        ) : (
          <View style={styles.submitContainer}>
            <TouchableOpacity
              style={[styles.submitButton, styles.submitExitButton]}
              onPress={onExit}
              disabled={saving}
            >
              <Text style={styles.submitButtonText}>Exit</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.submitButton, styles.submitSaveButton]}
              onPress={onSubmit}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.submitButtonText}>Submit</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

function createStyles(themeColors: AppColors) {
  return StyleSheet.create({
  container: {
    width: 280,
    backgroundColor: themeColors.surface,
    borderRightWidth: 1,
    borderRightColor: themeColors.border,
    flexDirection: 'column',
  },
  section: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: themeColors.border,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: themeColors.textMuted,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  toolsContainer: {
    maxHeight: 400,
  },
  toolButton: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: themeColors.surface,
    borderWidth: 1.5,
    borderColor: themeColors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'column',
    gap: 2,
    marginBottom: 6,
  },
  toolButtonActive: {
    backgroundColor: themeColors.accentPurple,
    borderColor: themeColors.accentPurple,
    borderWidth: 2,
  },
  toolButtonText: {
    fontSize: 9,
    color: themeColors.text,
    textAlign: 'center',
    marginTop: 2,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  toolButtonTextActive: {
    color: '#ffffff',
  },
  aiButtonWrapper: {
    marginBottom: 8,
  },
  // KRITIK: AI butonlar profesyonel ve accentPurple
  aiTranscribeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: themeColors.accentPurple,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    alignSelf: 'flex-start',
    borderWidth: 2,
    borderColor: '#0f2744',
  },
  aiTranscribeButtonDisabled: {
    opacity: 0.6,
  },
  aiTranscribeButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  transcriptionCard: {
    backgroundColor: themeColors.background,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: themeColors.border,
  },
  transcriptionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: themeColors.textMuted,
    marginBottom: 8,
  },
  transcriptionInput: {
    backgroundColor: themeColors.surface,
    borderRadius: 6,
    padding: 12,
    color: themeColors.text,
    fontSize: 14,
    borderWidth: 1,
    borderColor: themeColors.border,
    textAlignVertical: 'top',
    minHeight: 80,
  },
  submitSection: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginTop: 'auto',
  },
  submitContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  submitButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 8,
  },
  submitExitButton: {
    backgroundColor: '#3b82f6',
    borderWidth: 2,
    borderColor: '#1e40af',
  },
  submitSaveButton: {
    backgroundColor: '#8b5cf6',
    borderWidth: 2,
    borderColor: '#5b21b6',
  },
  submitButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#fff',
  },
  submittedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#8b5cf6',
    borderWidth: 2,
    borderColor: '#5b21b6',
  },
  submittedText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#fff',
  },
});
}
