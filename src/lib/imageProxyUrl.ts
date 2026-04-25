/**
 * Tarayıcıda doğrudan fetch’i engelleyen CORS için son çare: images.weserv.nl vekili.
 * Hassas görselleri bu yola sokmayın; admin’den dosyayı Supabase Storage’a yükleyin.
 */
export function buildWeservImageProxyUrl(originalHttpUrl: string): string | null {
  const raw = String(originalHttpUrl ?? '').trim();
  if (!raw || !/^https?:\/\//i.test(raw)) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    const hostLower = u.hostname.toLowerCase();
    if (hostLower === 'images.weserv.nl' || hostLower.endsWith('.weserv.nl')) return null;
    const location = u.host + u.pathname + u.search + u.hash;
    if (!location) return null;
    return `https://images.weserv.nl/?url=${encodeURIComponent(location)}`;
  } catch {
    return null;
  }
}
