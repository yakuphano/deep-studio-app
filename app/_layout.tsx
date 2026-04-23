import '@/i18n';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '@/contexts/AuthContext';
import TopNavbar from '../components/TopNavbar';

function RootLayoutNav() {
  // KRITIK: Tüm yönlendirme mantiklari kaldirildi
  // Sadece statik layout render ediliyor
  return (
    <View style={{ flex: 1 }}>
      <TopNavbar />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="dashboard" options={{ headerShown: false }} />
        <Stack.Screen name="admin" />
      </Stack>
    </View>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <RootLayoutNav />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
