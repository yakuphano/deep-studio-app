/** Açık mavi-beyaz kurumsal tema (navbar, görevler, formlar). */
export const lightPalette = {
  background: '#eef3fb',
  surface: '#ffffff',
  surfaceElevated: '#e4edf9',
  canvasMuted: '#dde8f5',
  border: '#c8d8ee',
  borderLight: '#dce6f5',
  text: '#0f2744',
  textMuted: '#5c6d86',
  textSecondary: '#3a4d66',
  accent: '#1a56db',
  accentPurple: '#143d9e',
  accentMuted: 'rgba(26, 86, 219, 0.14)',
  onAccent: '#ffffff',
  success: '#15803d',
  warning: '#b45309',
  info: '#1a56db',
  error: '#dc2626',
} as const;

/** Koyu tema — aynı anahtarlar, kontrast korunur. */
export const darkPalette = {
  background: '#0b1020',
  surface: '#141c2e',
  surfaceElevated: '#1a2438',
  canvasMuted: '#121a2a',
  border: '#2d3a52',
  borderLight: '#243049',
  text: '#e8eef7',
  textMuted: '#94a3b8',
  textSecondary: '#cbd5e1',
  accent: '#3b82f6',
  accentPurple: '#60a5fa',
  accentMuted: 'rgba(59, 130, 246, 0.22)',
  onAccent: '#ffffff',
  success: '#22c55e',
  warning: '#fbbf24',
  info: '#60a5fa',
  error: '#f87171',
} as const;

export type AppColors = typeof lightPalette | typeof darkPalette;
export type ThemePreference = 'light' | 'dark';
