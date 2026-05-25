import { Stack } from 'expo-router';
import { useThemeColors } from '@/contexts/ThemeContext';

export default function ReviewLayout() {
  const colors = useThemeColors();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" />
    </Stack>
  );
}
