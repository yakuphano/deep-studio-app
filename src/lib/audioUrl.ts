import { supabase } from '@/lib/supabase';
import { normalizeRemoteMediaUrl } from '@/lib/mediaUrl';

/**
 * Görevlerde saklanan audio_url değerini tarayıcı / expo-av için oynatılabilir URL'ye çevirir.
 * - Zaten http(s) veya blob: ise olduğu gibi döner.
 * - Göreli storage yolu ise task-assets bucket için public URL üretir.
 */
export function resolvePlaybackAudioUrl(raw: string | null | undefined): string | null {
  if (raw == null || typeof raw !== 'string') return null;
  const u0 = raw.trim();
  if (!u0) return null;
  if (u0.startsWith('blob:')) return u0;
  if (u0.startsWith('http://') || u0.startsWith('https://')) {
    return normalizeRemoteMediaUrl(u0);
  }
  const u = u0;
  if (u.startsWith('file:') || u.startsWith('zip://')) {
    return null;
  }
  const path = u.replace(/^\//, '');
  const { data } = supabase.storage.from('task-assets').getPublicUrl(path);
  return data?.publicUrl ?? null;
}

/** Görüntü kaynakları için aynı kurallar (https / blob / storage göreli yol). */
export const resolveTaskImageUrl = resolvePlaybackAudioUrl;
