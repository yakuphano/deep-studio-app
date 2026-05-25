import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { LidarThreeViewProps } from './types';
import type { AppColors } from '@/theme/palettes';
import { useThemeColors } from '@/contexts/ThemeContext';
/** Native: 3D LiDAR editor is web-only */
export default function LidarThreeView(_props: LidarThreeViewProps) {
  const themeColors = useThemeColors();
  const styles = useMemo(() => createStyles(themeColors), [themeColors]);

  return (
    <View style={styles.box}>
      <Text style={styles.t}>The LiDAR 3D editor is only available in the web browser.</Text>
    </View>
  );
}

function createStyles(themeColors: AppColors) {
  return StyleSheet.create({
  box: {
    flex: 1,
    minHeight: 200,
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: themeColors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: themeColors.border,
  },
  t: { color: themeColors.textMuted, textAlign: 'center', fontSize: 14 },
});
}
