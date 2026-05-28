import { Stack } from 'expo-router';
import TopNavbar from '../../components/TopNavbar';
import { useThemeColors } from '@/contexts/ThemeContext';

export default function AdminLayout() {
  const colors = useThemeColors();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="export" />
      <Stack.Screen name="messages" />
      <Stack.Screen name="tasks" />
      <Stack.Screen name="tasks/create" />
      <Stack.Screen name="users" />
    </Stack>
  );
}
