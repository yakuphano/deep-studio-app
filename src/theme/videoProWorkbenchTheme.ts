import { StyleSheet } from 'react-native';
import { colors } from './colors';
import type { AppColors } from './palettes';

/** Web masaüstü iş tezgâhı — açık mavi-beyaz (video / görüntü pro) */
export const desktopWorkbenchDark = {
  bg: colors.background,
  panel: colors.surface,
  border: colors.border,
  accent: colors.accent,
  accentMuted: colors.accentMuted,
  text: colors.text,
  textMuted: colors.textMuted,
  textSoft: colors.textSecondary,
  danger: colors.error,
  radius: 8,
} as const;

export const desktopWorkbenchLight = {
  bg: '#f5f8fd',
  panel: '#ffffff',
  border: colors.border,
  accent: colors.accent,
  accentMuted: colors.accentMuted,
  text: colors.text,
  textMuted: colors.textMuted,
  textSoft: colors.textSecondary,
  danger: colors.error,
  radius: 8,
} as const;

/** LiDAR / annotator — aynı kurumsal palet, gökyüzü mavsi vurgu */
export const annotatorWorkbenchDark = {
  bg: colors.background,
  panel: colors.surface,
  border: colors.border,
  accent: '#0b6bcb',
  accentMuted: 'rgba(11, 108, 203, 0.14)',
  text: colors.text,
  textMuted: colors.textMuted,
  textSoft: colors.textSecondary,
  danger: colors.error,
  radius: 10,
} as const;

export const annotatorWorkbenchLight = {
  bg: colors.background,
  panel: colors.surface,
  border: colors.border,
  accent: colors.accent,
  accentMuted: colors.accentMuted,
  text: colors.text,
  textMuted: colors.textMuted,
  textSoft: colors.textSecondary,
  danger: colors.error,
  radius: 10,
} as const;

export type ProThemeColors =
  | typeof desktopWorkbenchDark
  | typeof desktopWorkbenchLight
  | typeof annotatorWorkbenchDark
  | typeof annotatorWorkbenchLight;

export type WorkbenchChromeOptions = {
  radius?: number;
  accentOverride?: string;
  accentMutedOverride?: string;
};

/** İş tezgâhı kabuğu — uygulama light/dark paletinden (ThemeContext). */
export function workbenchChromeFromAppColors(theme: AppColors, opts?: WorkbenchChromeOptions): ProThemeColors {
  const radius = opts?.radius ?? 8;
  return {
    bg: theme.background,
    panel: theme.surface,
    border: theme.border,
    accent: opts?.accentOverride ?? theme.accent,
    accentMuted: (opts?.accentMutedOverride ?? theme.accentMuted) as string,
    text: theme.text,
    textMuted: theme.textMuted,
    textSoft: theme.textSecondary,
    danger: theme.error,
    radius,
  } as ProThemeColors;
}

/** @deprecated Use desktopWorkbenchDark — kept as alias for imports expecting `proColors` */
export const proColors: ProThemeColors = desktopWorkbenchDark;

export function createVideoProWorkbenchStyles(c: ProThemeColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      width: '100%',
      height: '100%',
      minHeight: 480,
      backgroundColor: c.bg,
    },
    topNav: {
      minHeight: 52,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 4,
      gap: 10,
      backgroundColor: c.panel,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    topNavBack: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: c.radius,
      backgroundColor: c.accentMuted,
    },
    topNavBackText: {
      fontSize: 14,
      fontWeight: '600',
      color: c.accent,
      marginLeft: 6,
    },
    topNavMeta: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'column',
      justifyContent: 'center',
      gap: 2,
    },
    topNavMetaLine: {
      fontSize: 11,
      color: c.textMuted,
    },
    topNavMetaStrong: {
      fontSize: 12,
      fontWeight: '600',
      color: c.text,
    },
    topNavActions: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 6,
      maxWidth: 420,
      justifyContent: 'flex-end',
    },
    topNavActionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: c.radius,
      backgroundColor: c.bg,
      borderWidth: 1.5,
      borderColor: c.accent,
      gap: 6,
    },
    topNavActionBtnDisabled: {
      opacity: 0.45,
    },
    topNavActionLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: c.text,
    },
    topNavActionHint: {
      fontSize: 10,
      color: c.textSoft,
    },
    topNavStatus: {
      flexDirection: 'column',
      alignItems: 'flex-end',
      justifyContent: 'center',
      gap: 2,
      minWidth: 120,
    },
    topNavStatusLine: {
      fontSize: 11,
      color: c.textMuted,
    },
    assistRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 6,
      paddingHorizontal: 12,
      gap: 8,
      backgroundColor: c.bg,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    assistBtn: {
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderRadius: c.radius,
      borderWidth: 1.5,
      borderColor: c.accent,
      backgroundColor: c.panel,
    },
    assistBtnText: {
      fontSize: 11,
      fontWeight: '700',
      color: c.text,
    },
    mainRow: {
      flex: 1,
      flexDirection: 'row',
      minHeight: 0,
      minWidth: 0,
    },
    leftToolRail: {
      width: 104,
      minWidth: 104,
      maxWidth: 104,
      backgroundColor: c.bg,
      borderRightWidth: 1,
      borderRightColor: c.border,
    },
    leftToolRailContent: {
      paddingVertical: 8,
      paddingHorizontal: 8,
      alignItems: 'center',
      gap: 6,
      paddingBottom: 16,
    },
    toolRailBtn: {
      position: 'relative' as const,
      width: 44,
      height: 44,
      borderRadius: c.radius,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.panel,
      borderWidth: 1.5,
      borderColor: c.accent,
    },
    toolRailBtnActive: {
      borderWidth: 2,
      borderColor: c.accent,
      backgroundColor: c.accentMuted,
    },
    toolKeyHint: {
      position: 'absolute',
      bottom: 2,
      right: 3,
      fontSize: 8,
      fontWeight: '700',
      color: c.textMuted,
    },
    rightDivider: {
      height: 1,
      backgroundColor: c.border,
      marginVertical: 14,
      marginHorizontal: 4,
    },
    centerColumn: {
      flex: 1,
      minWidth: 0,
      minHeight: 0,
      flexDirection: 'column',
      backgroundColor: c.bg,
    },
    center: {
      flex: 1,
      minWidth: 0,
      minHeight: 0,
      flexDirection: 'column',
      backgroundColor: c.bg,
    },
    centerStack: {
      flex: 1,
      minHeight: 0,
      minWidth: 0,
      flexDirection: 'row',
    },
    rightPanel: {
      flex: 0,
      width: 320,
      minWidth: 320,
      maxWidth: 320,
      backgroundColor: c.panel,
      borderLeftWidth: 1,
      borderLeftColor: c.border,
      paddingHorizontal: 0,
      paddingTop: 0,
      paddingBottom: 0,
      flexDirection: 'column',
      minHeight: 0,
    },
    rightPanelScroll: {
      paddingHorizontal: 8,
      paddingBottom: 20,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '700',
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: c.text,
      paddingHorizontal: 12,
      paddingTop: 12,
      paddingBottom: 10,
    },
    sectionTitleRight: {
      paddingTop: 8,
      paddingHorizontal: 8,
    },
    labelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
      paddingHorizontal: 12,
      gap: 10,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    labelRowActive: {
      backgroundColor: c.accentMuted,
      borderLeftWidth: 3,
      borderLeftColor: c.accent,
    },
    labelDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    labelText: {
      flex: 1,
      fontSize: 13,
      color: c.text,
    },
    labelShortcut: {
      fontSize: 11,
      color: c.textMuted,
    },
    videoWrap: {
      flex: 1,
      minWidth: 0,
      minHeight: 0,
      position: 'relative',
      overflow: 'hidden' as const,
    },
    canvasWrap: {
      flex: 1,
      minWidth: 0,
      minHeight: 0,
      backgroundColor: c.bg,
      position: 'relative' as const,
      borderRightWidth: 1,
      borderRightColor: c.border,
    },
    canvasFitBar: {
      position: 'absolute',
      top: 6,
      left: 6,
      right: 6,
      zIndex: 20,
      flexDirection: 'row',
      justifyContent: 'flex-end',
      pointerEvents: 'box-none' as const,
    },
    canvasFitButton: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: c.radius,
      backgroundColor: c.panel,
      borderWidth: 1.5,
      borderColor: c.accent,
    },
    canvasWorkspace: {
      flex: 1,
      backgroundColor: c.bg,
      borderRadius: c.radius,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: c.border,
    },
    propLabel: {
      fontSize: 10,
      fontWeight: '600',
      color: c.textMuted,
      marginBottom: 6,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    propHint: {
      fontSize: 12,
      color: c.textSoft,
      lineHeight: 18,
      marginTop: 24,
      fontStyle: 'italic',
    },
    propHintRight: {
      fontSize: 12,
      color: c.textSoft,
      lineHeight: 18,
      marginTop: 8,
      marginBottom: 8,
      paddingHorizontal: 10,
      fontStyle: 'italic',
    },
    selectRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
      paddingHorizontal: 10,
      borderRadius: c.radius,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.bg,
      marginBottom: 6,
    },
    selectRowText: {
      fontSize: 13,
      color: c.text,
      flex: 1,
    },
    deleteBtn: {
      marginTop: 16,
      paddingVertical: 10,
      borderRadius: c.radius,
      borderWidth: 1,
      borderColor: 'rgba(239,68,68,0.45)',
      alignItems: 'center',
    },
    deleteBtnText: {
      fontSize: 13,
      fontWeight: '600',
      color: c.danger,
    },
    checkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 14,
      gap: 10,
    },
    checkLabel: {
      fontSize: 13,
      color: c.text,
    },
    readOnlyBox: {
      marginTop: 14,
      padding: 10,
      borderRadius: c.radius,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.bg,
    },
    readOnlyLabel: {
      fontSize: 10,
      fontWeight: '600',
      color: c.textMuted,
      marginBottom: 4,
    },
    readOnlyValue: {
      fontSize: 12,
      color: c.text,
      fontFamily: 'monospace',
    },
    loadingText: {
      color: c.textMuted,
      fontSize: 14,
      textAlign: 'center',
      marginTop: 40,
    },
    bottomButtonBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 6,
      backgroundColor: c.panel,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    bottomLeftActions: {
      flexDirection: 'row',
      gap: 12,
      alignItems: 'center',
    },
    bottomRightActions: {
      flexDirection: 'row',
      gap: 12,
      alignItems: 'center',
    },
    exitButton: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: c.radius,
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: c.danger,
    },
    exitButtonText: {
      fontSize: 14,
      color: c.danger,
      fontWeight: '500',
    },
    submitExitButton: {
      paddingHorizontal: 16,
      paddingVertical: 7,
      borderRadius: c.radius,
      backgroundColor: c.accent,
    },
    submitExitButtonText: {
      fontSize: 14,
      color: '#fff',
      fontWeight: '500',
    },
    submitButtonGreen: {
      paddingHorizontal: 16,
      paddingVertical: 7,
      borderRadius: c.radius,
      backgroundColor: '#43A047',
    },
    submitButtonGreenText: {
      fontSize: 14,
      color: '#fff',
      fontWeight: '500',
    },
    submitButtonDisabled: {
      opacity: 0.6,
    },
  });
}

export type VideoProWorkbenchStyles = ReturnType<typeof createVideoProWorkbenchStyles>;

/** Static dark styles for modules that do not yet accept a theme factory */
export const videoProWorkbenchStyles = createVideoProWorkbenchStyles(desktopWorkbenchDark);
