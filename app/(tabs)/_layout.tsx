import { Stack } from 'expo-router';
import TopNavbar from '../../components/TopNavbar';

export default function MainLayout() {
  return (
    <Stack
      screenOptions={{
        header: () => <TopNavbar />,
        headerShown: true,
        contentStyle: { backgroundColor: '#0f172a', width: '100%' },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="tasks" />
      <Stack.Screen name="earnings/daily" />
      <Stack.Screen name="earnings/total" />
      <Stack.Screen name="messages" />
      <Stack.Screen name="faq" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="task/[id]" />
    </Stack>
  );
}
