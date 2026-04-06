import { Stack } from 'expo-router';
import TopNavbar from '../../components/TopNavbar';

export default function AdminLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#0f172a' },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="messages" />
      <Stack.Screen name="tasks/create" />
    </Stack>
  );
}
