import { Stack } from 'expo-router';

export default function DashboardLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="audio" options={{ title: 'Audio Tasks' }} />
      <Stack.Screen name="image" options={{ title: 'Image Tasks' }} />
      <Stack.Screen name="video" options={{ title: 'Video Tasks' }} />
      <Stack.Screen name="medical" options={{ title: 'Medical Tasks' }} />
      <Stack.Screen name="lidar" options={{ title: 'LiDAR Tasks' }} />
      <Stack.Screen name="audio/[id]" options={{ title: 'Audio Task' }} />
      <Stack.Screen name="image/[id]" options={{ title: 'Image Task' }} />
      <Stack.Screen name="video/[id]" options={{ title: 'Video Task' }} />
      <Stack.Screen name="medical/[id]" options={{ title: 'Medical Task' }} />
      <Stack.Screen name="lidar/[id]" options={{ title: 'LiDAR Task' }} />
    </Stack>
  );
}
