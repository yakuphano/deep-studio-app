import '../src/i18n';
import { useEffect } from 'react';
import { View, ActivityIndicator, Platform } from 'react-native';
import { Stack, useRouter, usePathname } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../src/contexts/AuthContext';

function RootLayoutNav() {
  const { session, loading, isAdmin } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const inAuthGroup = pathname === '/' || pathname === '/login' || pathname?.startsWith('/login');

  useEffect(() => {
    if (loading) return;

    if (!session) {
      if (!inAuthGroup) {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.location.href = '/';
        } else {
          router.replace('/');
        }
      }
    } else if (inAuthGroup) {
      router.replace((isAdmin ? '/admin' : '/tasks') as any);
    }
  }, [session, loading, isAdmin, inAuthGroup, router]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' }}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="login" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="admin" />
    </Stack>
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
