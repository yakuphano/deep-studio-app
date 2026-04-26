import { useMetroSupabaseEdgeProxy } from '@/lib/supabaseEdgeDevProxy';

/**
 * Görev medyası için Edge proxy URL’si (Authorization header ile çağrılmalı).
 * Web __DEV__: Metro `/_supabase-fn` (CORS’suz). Prod: doğrudan Supabase.
 * Dağıtım: supabase functions deploy task-media
 */
export function getTaskMediaProxyUrl(taskId: string): string | null {
  const base = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, '') ?? '';
  if (!base || !taskId?.trim()) return null;
  const q = `task_id=${encodeURIComponent(taskId.trim())}`;
  if (useMetroSupabaseEdgeProxy() && typeof window !== 'undefined') {
    return `${window.location.origin}/_supabase-fn/task-media?${q}`;
  }
  return `${base}/functions/v1/task-media?${q}`;
}
