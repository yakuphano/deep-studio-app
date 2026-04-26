import { Platform } from 'react-native';

/**
 * Web geliştirmede Edge’e doğrudan gitmek CORS/preflight riski taşır.
 * Metro `/_supabase-fn/*` → `SUPABASE_URL/functions/v1/*` (aynı origin).
 * Kapatmak: EXPO_PUBLIC_USE_EDGE_PROXY=0
 */
export function useMetroSupabaseEdgeProxy(): boolean {
  if (Platform.OS !== 'web') return false;
  if (process.env.EXPO_PUBLIC_USE_EDGE_PROXY === '0') return false;
  if (process.env.EXPO_PUBLIC_USE_EDGE_PROXY === '1') return true;
  return typeof __DEV__ !== 'undefined' && __DEV__;
}
