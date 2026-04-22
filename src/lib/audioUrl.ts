import { supabase } from '@/lib/supabase';

/**
 * Görevlerde saklanan audio_url değerini tarayıcı / expo-av için oynatılabilir URL'ye çevirir.
 * - Zaten http(s) veya blob: ise olduğu gibi döner.
 * - Göreli storage yolu ise task-assets bucket için public URL üretir.
 */
export function resolvePlaybackAudioUrl(raw: string | null | undefined): string | null {
  if (raw == null || typeof raw !== 'string') return null;
  const u = raw.trim();
  if (!u) return null;
  if (u.startsWith('http://') || u.startsWith('https://') || u.startsWith('blob:')) {
    return u;
  }
  if (u.startsWith('file:') || u.startsWith('zip://')) {
    return null;
  }
  const path = u.replace(/^\//, '');
  const { data } = supabase.storage.from('task-assets').getPublicUrl(path);
  return data?.publicUrl ?? null;
}

/** Görüntü kaynakları için aynı kurallar (https / blob / storage göreli yol). */
export const resolveTaskImageUrl = resolvePlaybackAudioUrl;
