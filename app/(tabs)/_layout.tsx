import { Stack } from 'expo-router';
import { useThemeColors } from '@/contexts/ThemeContext';

export default function MainLayout() {
  const colors = useThemeColors();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background, width: '100%' },
        // Note: unmountOnBlur is not available in Stack navigation
        // The infinite loop issue should be resolved by the Air-Gap refactor already applied
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="earnings/daily" />
      <Stack.Screen name="earnings/total" />
      <Stack.Screen name="messages" />
      <Stack.Screen name="revisions" />
      <Stack.Screen name="faq" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="task/[id]" />
      <Stack.Screen name="video-annotation" options={{ headerShown: false }} />
    </Stack>
  );
}
