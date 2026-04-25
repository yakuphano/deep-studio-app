import { Platform } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { getTaskMediaProxyUrl } from '@/lib/taskMediaUrl';

const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/**
 * Web’de `<video src>` Authorization gönderemediği için `task-media` Edge’e
 * JWT ile istek atılır; 302 zincirinin son URL’si (imzalı depo) oynatıcıya verilir.
 */
export async function resolvePlayableTaskVideoUrl(params: {
  taskId: string;
  rawVideoUrl: string | null | undefined;
  session: Session | null;
}): Promise<string | null> {
  const { taskId, rawVideoUrl, session } = params;
  const raw = rawVideoUrl?.trim() ?? '';

  if (Platform.OS !== 'web') {
    if (raw && /^https?:\/\//i.test(raw)) return raw;
    return raw || null;
  }

  const proxy = getTaskMediaProxyUrl(taskId);
  if (proxy && session?.access_token) {
    try {
      const res = await fetch(proxy, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: anonKey,
          Range: 'bytes=0-0',
        },
      });
      if (res.ok) {
        const finalUrl = res.url;
        if (finalUrl && !finalUrl.includes('/functions/v1/task-media')) {
          return finalUrl;
        }
      }
    } catch {
      /* aşağıdaki ham URL’e düş */
    }
  }

  if (raw && /^https?:\/\//i.test(raw)) return raw;
  return raw || null;
}
