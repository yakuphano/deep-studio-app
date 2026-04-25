/**
 * Yapıştırılmış metinden tüm http(s) adreslerini çıkarır (satır sonu, boşluk, virgül, noktalı virgül, | ayırıcı).
 * Tek satırda yan yana çoklu URL için kullanılır.
 */
export function splitRemoteMediaUrlsFromInput(input: string): string[] {
  const raw = String(input ?? '').trim();
  if (!raw) return [];

  const re = /https?:\/\/[^\s,;|'"<>]+/gi;
  const seen = new Set<string>();
  const out: string[] = [];
  let m: RegExpExecArray | null;
  const r = new RegExp(re.source, 'gi');
  while ((m = r.exec(raw)) !== null) {
    const normalized = normalizeRemoteMediaUrl(m[0]);
    if (!normalized || !/^https?:\/\//i.test(normalized)) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }

  if (out.length === 0) {
    const one = normalizeRemoteMediaUrl(raw);
    if (one && /^https?:\/\//i.test(one)) return [one];
  }

  return out;
}

/**
 * Görev / tuval için uzak medya adresi: yapıştırma hatalarını toparlar.
 * - Çift tırnak / tek tırnak sarmalayıcı
 * - Aynı satırda birden fazla http(s) adresi → ilki (çoklu liste için `splitRemoteMediaUrlsFromInput` kullanın)
 * - Sondaki yanlışlıkla gelen noktalama ),.;>]}
 */
export function normalizeRemoteMediaUrl(input: string): string {
  let u = String(input ?? '').trim();
  if (!u) return u;

  if (u.includes('%')) {
    try {
      u = decodeURIComponent(u);
    } catch {
      /* leave encoded */
    }
  }

  if (
    (u.startsWith('"') && u.endsWith('"') && u.length > 1) ||
    (u.startsWith("'") && u.endsWith("'") && u.length > 1)
  ) {
    u = u.slice(1, -1).trim();
  }

  const matches = u.match(/https?:\/\/[^\s\n\r\t]+/gi);
  if (matches && matches.length > 0) {
    u = matches[0];
  }

  return u.replace(/[),.;>\]}]+$/g, '').trim();
}
