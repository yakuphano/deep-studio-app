import { Platform } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { getTaskMediaProxyUrl } from '@/lib/taskMediaUrl';

const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

function isTaskMediaProxyUrl(url: string): boolean {
  return (
    url.includes('/functions/v1/task-media') ||
    url.includes('/_supabase-fn/task-media')
  );
}

/** Public bucket — `<video src>` doğrudan oynatır. */
function isLikelyPublicStorageObjectUrl(url: string): boolean {
  const u = url.toLowerCase();
  return /^https?:\/\//i.test(url) && u.includes('/storage/v1/object/public/');
}

/**
 * Web’de `<video src>` Authorization gönderemediği için `task-media` Edge ile
 * 302 sonrası imzalı / ham URL keşfi. Public depo adresi doğrudan kullanılır.
 *
 * Not: `?stream=1` proxy akışı Edge’de ayrıca desteklenir; varsayılan olarak
 * kullanılmaz (yanlış/eksik deploy’da video hiç açılmamasını önler).
 * İsterseniz: EXPO_PUBLIC_TASK_MEDIA_STREAM=1 ile açın.
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

  const useStreamProxy =
    process.env.EXPO_PUBLIC_TASK_MEDIA_STREAM === '1' && session?.access_token;

  if (useStreamProxy) {
    const proxy = getTaskMediaProxyUrl(taskId);
    if (proxy) {
      try {
        const u = new URL(proxy);
        u.searchParams.set('stream', '1');
        u.searchParams.set('access_token', session.access_token);
        return u.href;
      } catch {
        /* aşağıya düş */
      }
    }
  }

  if (raw && isLikelyPublicStorageObjectUrl(raw)) {
    return raw;
  }

  const proxy = getTaskMediaProxyUrl(taskId);
  if (proxy && session?.access_token) {
    const headers = {
      Authorization: `Bearer ${session.access_token}`,
      apikey: anonKey,
    };
    if (typeof window !== 'undefined' && proxy.startsWith(window.location.origin)) {
      try {
        const manual = await fetch(proxy, { method: 'GET', headers, redirect: 'manual' });
        if (manual.status >= 300 && manual.status < 400) {
          const loc = manual.headers.get('Location');
          if (loc) {
            try {
              const abs = new URL(loc, proxy).href;
              if (abs && !isTaskMediaProxyUrl(abs)) return abs;
            } catch {
              /* ignore */
            }
          }
        }
      } catch {
        /* Range denemesine geç */
      }
    }
    try {
      const res = await fetch(proxy, {
        method: 'GET',
        headers: {
          ...headers,
          Range: 'bytes=0-0',
        },
      });
      if (res.ok) {
        const finalUrl = res.url;
        if (finalUrl && !isTaskMediaProxyUrl(finalUrl)) {
          return finalUrl;
        }
      }
    } catch {
      /* ham URL’e düş */
    }
  }

  if (raw && /^https?:\/\//i.test(raw)) return raw;
  return raw || null;
}
