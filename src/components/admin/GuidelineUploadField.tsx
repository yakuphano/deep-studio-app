import React, { useMemo, useRef, useCallback, createElement } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useTranslation } from 'react-i18next';
import type { GuidelineFileSelection } from '@/lib/uploadTaskGuideline';
import type { AppColors } from '@/theme/palettes';
import { useThemeColors } from '@/contexts/ThemeContext';
import { getAdminCreateTaskFormStyles } from '@/theme/adminCreateTaskForm';

const WEB_ACCEPT =
  '.pdf,.doc,.docx,.txt,.md,.rtf,.png,.jpg,.jpeg,.webp,.gif,application/pdf,text/*,image/*';

const PICKER_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
  'application/rtf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const;

type Props = {
  value: GuidelineFileSelection | null;
  onChange: (file: GuidelineFileSelection | null) => void;
  disabled?: boolean;
};

export default function GuidelineUploadField({ value, onChange, disabled }: Props) {
  const themeColors = useThemeColors();
  const styles = useMemo(() => createStyles(themeColors), [themeColors]);
  const acf = useMemo(() => getAdminCreateTaskFormStyles(themeColors), [themeColors]);

  const { t } = useTranslation();
  const webInputRef = useRef<HTMLInputElement | null>(null);

  const pickNative = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [...PICKER_TYPES],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.length) return;
      const a = result.assets[0];
      onChange({
        name: a.name || 'guideline',
        uri: a.uri,
        mimeType: a.mimeType ?? null,
        webFile: null,
      });
    } catch (e) {
      console.error('Guideline pick error:', e);
    }
  };

  const handlePress = () => {
    if (disabled) return;
    if (Platform.OS === 'web') {
      webInputRef.current?.click();
      return;
    }
    void pickNative();
  };

  const handleWebChange = useCallback(
    (e: Event) => {
      const target = e.target as HTMLInputElement;
      const file = target.files?.[0];
      target.value = '';
      if (!file) return;
      onChange({
        name: file.name,
        uri: URL.createObjectURL(file),
        mimeType: file.type || null,
        webFile: file,
      });
    },
    [onChange]
  );

  return (
    <View style={acf.formGroup}>
      {Platform.OS === 'web'
        ? createElement('input', {
            ref: webInputRef,
            type: 'file',
            accept: WEB_ACCEPT,
            style: { display: 'none' },
            onChange: handleWebChange,
          })
        : null}

      <Text style={acf.label}>{t('adminCreate.guidelineLabel')}</Text>
      <Text style={acf.fieldHint}>{t('adminCreate.guidelineHint')}</Text>

      <TouchableOpacity
        style={[styles.uploadButton, disabled && styles.uploadDisabled]}
        onPress={handlePress}
        disabled={disabled}
        activeOpacity={0.85}
      >
        <Ionicons name="document-text-outline" size={22} color="#a78bfa" />
        <Text style={styles.uploadText}>
          {value ? value.name : t('adminCreate.guidelinePick')}
        </Text>
      </TouchableOpacity>

      {value ? (
        <View style={styles.row}>
          <Text style={styles.fileMeta} numberOfLines={1}>
            {value.name}
          </Text>
          <TouchableOpacity
            onPress={() => onChange(null)}
            disabled={disabled}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close-circle" size={22} color="#f87171" />
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

function createStyles(themeColors: AppColors) {
  return StyleSheet.create({
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: themeColors.surface,
    borderWidth: 2,
    borderColor: themeColors.border,
    borderStyle: 'dashed',
    borderRadius: 10,
    padding: 10,
    gap: 8,
  },
  uploadDisabled: {
    opacity: 0.5,
  },
  uploadText: {
    fontSize: 15,
    color: themeColors.text,
    fontWeight: '500',
    flexShrink: 1,
    backgroundColor: 'transparent',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    gap: 8,
  },
  fileMeta: {
    flex: 1,
    fontSize: 13,
    color: themeColors.textMuted,
    backgroundColor: 'transparent',
  },
});
}
