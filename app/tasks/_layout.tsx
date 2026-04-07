import { Stack } from 'expo-router';

export default function TasksLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="audio" options={{ title: 'Audio Tasks' }} />
      <Stack.Screen name="image" options={{ title: 'Image Tasks' }} />
      <Stack.Screen name="video" options={{ title: 'Video Tasks' }} />
      <Stack.Screen name="audio/[id]" options={{ title: 'Audio Task' }} />
      <Stack.Screen name="image/[id]" options={{ title: 'Image Task' }} />
      <Stack.Screen name="video/[id]" options={{ title: 'Video Task' }} />
    </Stack>
  );
}
