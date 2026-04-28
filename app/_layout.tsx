import '@/i18n';
import { View, Platform } from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import TopNavbar from '../components/TopNavbar';

/** Web: TopNavbar is position:fixed — reserve space so routes are not hidden under it. */
/** Matches compact TopNavbar row height below safe area (web). */
const WEB_NAV_BODY_OFFSET = 64;

function RootLayoutNav() {
  const insets = useSafeAreaInsets();
  const { user, session } = useAuth();
  const showTopNav = Boolean(user && session);
  const webStackPadTop =
    Platform.OS === 'web' && showTopNav ? insets.top + WEB_NAV_BODY_OFFSET : 0;

  return (
    <View style={{ flex: 1 }}>
      <TopNavbar />
      <View style={{ flex: 1, paddingTop: webStackPadTop }}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="login" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="dashboard" options={{ headerShown: false }} />
          <Stack.Screen name="admin" />
        </Stack>
      </View>
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
