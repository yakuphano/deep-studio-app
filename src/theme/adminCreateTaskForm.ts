import { StyleSheet } from 'react-native';
import type { AppColors } from '@/theme/palettes';

/**
 * Admin “yeni görev oluştur” ekranları — ortalanmış panel, kompakt aralıklar.
 */
export function getAdminCreateTaskFormStyles(themeColors: AppColors) {
  return StyleSheet.create({
    formPageMax: {
      width: '100%' as const,
      maxWidth: 960,
      alignSelf: 'center',
    },
    formPanel: {
      backgroundColor: themeColors.surfaceElevated,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: themeColors.border,
      paddingHorizontal: 16,
      paddingVertical: 14,
      marginTop: 0,
    },
    formEyebrow: {
      fontSize: 11,
      fontWeight: '700',
      color: themeColors.textMuted,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      marginBottom: 8,
    },
    label: {
      fontSize: 11,
      fontWeight: '700',
      color: themeColors.textSecondary,
      marginBottom: 4,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    formGroup: {
      marginBottom: 10,
    },
    fieldHint: {
      fontSize: 12,
      color: themeColors.textMuted,
      lineHeight: 16,
      marginBottom: 6,
    },
    form: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      alignItems: 'flex-start',
    },
    leftColumn: {
      flex: 1,
      minWidth: 240,
    },
    rightColumn: {
      flex: 1,
      minWidth: 240,
    },
    saveInPanel: {
      width: '100%' as const,
      alignSelf: 'stretch',
      marginTop: 12,
    },
  });
}
