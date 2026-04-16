import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors } from '@/theme/colors';

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

  const tools = [
    { id: 'pan', icon: 'hand-right-outline', label: 'Pan', shortcut: 'G' },
    { id: 'bbox', icon: 'square-outline', label: 'Bounding Box', shortcut: 'R' },
    { id: 'polygon', icon: 'git-merge-outline', label: 'Polygon', shortcut: 'P' },
    { id: 'points', icon: 'radio-button-off-outline', label: 'Points', shortcut: 'N' },
    { id: 'ellipse', icon: 'ellipse-outline', label: 'Ellipse', shortcut: '' },
    { id: 'cuboid', icon: 'cube-outline', label: 'Cuboid', shortcut: '' },
    { id: 'polyline', icon: 'create-outline', label: 'Polyline', shortcut: '' },
    { id: 'semantic', icon: 'color-filter-outline', label: 'Semantic', shortcut: '' },
    { id: 'brush', icon: 'brush-outline', label: 'Brush', shortcut: '' },
    { id: 'magic_wand', icon: 'sparkles', label: 'Magic Wand', shortcut: '' },
  ];

  return (
    <View style={styles.container}>
      {/* Tools Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Tools</Text>
        <ScrollView style={styles.toolsContainer}>
          {tools.map((tool) => (
            <TouchableOpacity
              key={tool.id}
              style={[
                styles.toolButton,
                activeTool === tool.id && !isBrushActive && styles.toolButtonActive
              ]}
              onPress={() => {
                onActiveToolChange(tool.id);
              }}
              activeOpacity={0.8}
              {...(isWeb ? { accessibilityLabel: `${tool.label} (${tool.shortcut})`, title: `${tool.label} (${tool.shortcut})` } as any : {})}
            >
              <Ionicons name={tool.icon as any} size={20} color="#f1f5f9" />
              <Text style={styles.toolButtonText}>{tool.label}</Text>
            </TouchableOpacity>
          ))}
          
          {/* Undo Button */}
          <TouchableOpacity
            style={[styles.toolButton, activeTool === 'undo' && !isBrushActive && styles.toolButtonActive]}
            onPress={onUndo}
            activeOpacity={0.8}
            {...(isWeb ? { accessibilityLabel: 'Undo (V)', title: 'Undo (V)' } as any : {})}
          >
            <Ionicons name="arrow-undo-outline" size={20} color="#f1f5f9" />
            <Text style={styles.toolButtonText}>Undo (V)</Text>
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

const styles = StyleSheet.create({
  container: {
    width: 280,
    backgroundColor: '#1e293b',
    borderRightWidth: 1,
    borderRightColor: '#334155',
    flexDirection: 'column',
  },
  section: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94a3b8',
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
    backgroundColor: '#374151',
    borderWidth: 1,
    borderColor: '#4b5563',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'column',
    gap: 2,
    marginBottom: 6,
  },
  toolButtonActive: {
    backgroundColor: colors.accentPurple,
    borderColor: colors.accentPurple,
  },
  toolButtonText: {
    fontSize: 9,
    color: '#f1f5f9',
    textAlign: 'center',
    marginTop: 2,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  aiButtonWrapper: {
    marginBottom: 8,
  },
  // KRITIK: AI butonlar profesyonel ve accentPurple
  aiTranscribeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accentPurple,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    alignSelf: 'flex-start',
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
    backgroundColor: '#0f172a',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  transcriptionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8',
    marginBottom: 8,
  },
  transcriptionInput: {
    backgroundColor: '#1e293b',
    borderRadius: 6,
    padding: 12,
    color: '#f1f5f9',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#334155',
    textAlignVertical: 'top',
    minHeight: 80,
  },
  submitSection: {
    padding: 16,
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
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  submitExitButton: {
    backgroundColor: '#3b82f6',
  },
  submitSaveButton: {
    backgroundColor: '#8b5cf6',
  },
  submitButtonText: {
    fontSize: 14,
    fontWeight: '600',
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
  },
  submittedText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
});
