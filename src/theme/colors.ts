/**
 * Geriye dönük: `colors` yalnızca light palet (statik).
 * Tema destekli ekranlarda `useThemeColors()` kullanın.
 */
export type { AppColors, ThemePreference } from './palettes';
export { lightPalette, darkPalette } from './palettes';

import { lightPalette } from './palettes';

export const colors = lightPalette;
