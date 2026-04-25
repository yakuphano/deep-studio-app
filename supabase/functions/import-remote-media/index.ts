/**
 * Uzak medyayı sunucuda indirip task-assets bucket'a yükler (CORS: corsHeaders + OPTIONS 204).
 *
 * Gerekli gizli anahtar (Supabase Dashboard → Edge Functions → Secrets):
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Dağıtım: supabase functions deploy import-remote-media
 */
import { createClient } from 'npm:@supabase/supabase-js@2.49.8';
import { importZipDatasetFromUrl, type ZipTaskTemplate, type ZipMediaKind } from './zipDataset.ts';

// CORS başlıkları (localhost dahil tarayıcıdan POST; preflight OPTIONS)
const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  // invoke / fetch istemcileri ek başlıklar gönderebilir; eksik Allow-Headers preflight’ı düşürür
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, prefer, accept, accept-profile, content-profile',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type TaskKind = 'image' | 'video' | 'audio';

const MAX_LIST_ITEMS = 300;
const MAX_BYTES_PER_FILE = 200 * 1024 * 1024;

const ALLOWED_EXT: Record<TaskKind, Set<string>> = {
  image: new Set(['jpg', 'jpeg', 'png', 'webp']),
  video: new Set(['mp4', 'webm', 'mov']),
  audio: new Set(['wav', 'mp3']),
};

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/wave': 'wav',
  'audio/x-wav': 'wav',
};

function pathLower(u: string): string {
  try {
    return new URL(u).pathname.toLowerCase();
  } catch {
    return '';
  }
}

function extFromPath(u: string): string {
  try {
    const pathname = new URL(u).pathname;
    const m = pathname.match(/\.([a-zA-Z0-9]+)$/);
    return m ? m[1].toLowerCase() : '';
  } catch {
    return '';
  }
}

function extractUrlsFromText(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const m = t.match(/https?:\/\/[^\s#'"<>]+/i);
    let u = m ? m[0] : t.startsWith('http') ? t : '';
    u = u.replace(/[),.;>}\]]+$/g, '').trim();
    if (!u || !/^https?:\/\//i.test(u)) continue;
    if (seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

function parseJsonManifest(text: string): { manifestType?: string; urls: string[] } {
  const j = JSON.parse(text) as { type?: unknown; items?: unknown };
  if (!j || typeof j !== 'object') throw new Error('Geçersiz JSON');
  if (!Array.isArray(j.items)) throw new Error('JSON içinde "items" dizisi gerekli');
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const x of j.items) {
    if (typeof x !== 'string') continue;
    const u = x.trim().replace(/[),.;>}\]]+$/g, '');
    if (!/^https?:\/\//i.test(u)) continue;
    if (seen.has(u)) continue;
    seen.add(u);
    urls.push(u);
  }
  const manifestType = typeof j.type === 'string' ? j.type.toLowerCase() : undefined;
  return { manifestType, urls };
}

function manifestHintFromPath(seedUrl: string): 'txt' | 'json' | null {
  const p = pathLower(seedUrl);
  if (p.endsWith('.txt')) return 'txt';
  if (p.endsWith('.json')) return 'json';
  return null;
}

/** Boşluk, virgül, noktalı virgül, |, satır sonu ile ayrılmış çoklu URL (tek satır dahil) */
function splitUrlsFromInput(text: string): string[] {
  const raw = String(text ?? '').trim();
  if (!raw) return [];
  const re = /https?:\/\/[^\s,;|'"<>]+/gi;
  const seen = new Set<string>();
  const out: string[] = [];
  let m: RegExpExecArray | null;
  const r = new RegExp(re.source, 'gi');
  while ((m = r.exec(raw)) !== null) {
    let u = m[0].replace(/[),.;>}\]]+$/g, '').trim();
    if (u.includes('%')) {
      try {
        u = decodeURIComponent(u);
      } catch {
        /* leave */
      }
    }
    if (!u || !/^https?:\/\//i.test(u)) continue;
    if (seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  if (out.length === 0 && /^https?:\/\//i.test(raw)) {
    const one = raw.match(/https?:\/\/[^\s]+/i)?.[0]?.replace(/[),.;>}\]]+$/g, '').trim();
    if (one) out.push(one);
  }
  return out;
}

async function expandMediaUrls(seedUrl: string, taskKind: TaskKind): Promise<{ mode: string; urls: string[] }> {
  const hint = manifestHintFromPath(seedUrl);
  const res = await fetch(seedUrl, {
    redirect: 'follow',
    headers: { 'User-Agent': 'DeepStudio-Import/1.0', Accept: '*/*' },
  });
  if (!res.ok) {
    throw new Error(`Manifest / kaynak indirilemedi: HTTP ${res.status}`);
  }
  const ct = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  const buf = new Uint8Array(await res.arrayBuffer());
  const text = new TextDecoder('utf-8', { fatal: false }).decode(buf);
  const trimmed = text.trim();

  if (hint === 'json') {
    const { manifestType, urls } = parseJsonManifest(text);
    if (manifestType && manifestType !== taskKind) {
      console.warn(
        `[import-remote-media] manifest type=${manifestType} istek taskKind=${taskKind} ile uyuşmuyor; uzantı filtresi uygulanır.`
      );
    }
    if (!urls.length) throw new Error('JSON manifest içinde geçerli URL yok.');
    return { mode: 'json', urls };
  }
  if (hint === 'txt') {
    const urls = extractUrlsFromText(text);
    if (!urls.length) throw new Error('TXT içinde geçerli URL yok.');
    return { mode: 'txt', urls };
  }

  if (ct.includes('application/json') || (trimmed.startsWith('{') && trimmed.includes('"items"'))) {
    try {
      const { manifestType, urls } = parseJsonManifest(text);
      if (manifestType && manifestType !== taskKind) {
        console.warn(
          `[import-remote-media] manifest type=${manifestType} istek taskKind=${taskKind} ile uyuşmuyor; uzantı filtresi uygulanır.`
        );
      }
      if (urls.length) return { mode: 'json', urls };
    } catch {
      /* tek medya URL’si HTML/JSON değilse tek kalem devam */
    }
  }
  if (ct.includes('text/plain')) {
    const urls = extractUrlsFromText(text);
    if (urls.length) return { mode: 'txt', urls };
  }

  return { mode: 'single', urls: [seedUrl] };
}

function filterUrlsForTaskKind(urls: string[], taskKind: TaskKind, singleSeed: boolean): string[] {
  const allow = ALLOWED_EXT[taskKind];
  const out: string[] = [];
  for (const u of urls) {
    const ext = extFromPath(u);
    if (ext && allow.has(ext)) {
      out.push(u);
      continue;
    }
    if (singleSeed && urls.length === 1) {
      out.push(u);
      continue;
    }
    console.error(`[import-remote-media] Atlandı (desteklenmeyen uzantı veya eksik): ${u}`);
  }
  return out;
}

function inferExt(url: string, contentType: string, taskKind: TaskKind): string {
  const allow = ALLOWED_EXT[taskKind];
  const fromPath = extFromPath(url);
  if (fromPath && allow.has(fromPath)) return fromPath;

  const ct = contentType.split(';')[0].trim().toLowerCase();
  const fromMime = MIME_TO_EXT[ct];
  if (fromMime && allow.has(fromMime)) return fromMime;

  if (ct === 'application/octet-stream' && fromPath && allow.has(fromPath)) return fromPath;

  throw new Error(`Desteklenmeyen içerik (${ct || 'bilinmiyor'}) veya uzantı`);
}

function contentTypeForExt(ext: string): string {
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'mp4':
      return 'video/mp4';
    case 'webm':
      return 'video/webm';
    case 'mov':
      return 'video/quicktime';
    case 'mp3':
      return 'audio/mpeg';
    case 'wav':
      return 'audio/wav';
    default:
      return 'application/octet-stream';
  }
}

Deno.serve(async (req) => {
  // 1. OPTIONS (preflight): anında CORS izinleri — gövdesiz 204 (HTTP uyumlu)
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { ...corsHeaders, 'Access-Control-Max-Age': '86400' },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // 2. JWT: supabase/config.toml içinde verify_jwt=false; oturum aşağıda createClient + auth.getUser() ile doğrulanır.

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!supabaseUrl || !anonKey) {
      return new Response(JSON.stringify({ error: 'Sunucu yapılandırması eksik (SUPABASE_URL / ANON).' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!serviceKey) {
      return new Response(
        JSON.stringify({
          error:
            'SUPABASE_SERVICE_ROLE_KEY tanımlı değil. Dashboard → Project Settings → Edge Functions → Secrets ekleyin.',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: authErr,
    } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Oturum gerekli' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = (await req.json()) as {
      seedUrl?: string;
      seedUrls?: string[];
      taskKind?: string;
      zipTaskTemplate?: Record<string, unknown>;
    };

    const fromClientArray = Array.isArray(body.seedUrls)
      ? (body.seedUrls as unknown[])
          .filter((x): x is string => typeof x === 'string')
          .map((x) => x.trim())
          .filter((u) => /^https?:\/\//i.test(u))
      : [];
    const seedUrlField = typeof body.seedUrl === 'string' ? body.seedUrl.trim() : '';
    const combined =
      fromClientArray.length > 0 ? fromClientArray : splitUrlsFromInput(seedUrlField);

    if (combined.length === 0 || !combined.some((u) => /^https?:\/\//i.test(u))) {
      return new Response(
        JSON.stringify({
          error:
            'Geçerli en az bir http(s) adresi gerekli. Çoklu URL: boşluk, virgül, noktalı virgül veya satır sonu ile ayırın.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const admin = createClient(supabaseUrl, serviceKey);

    if (combined.length === 1 && pathLower(combined[0]).endsWith('.zip')) {
      const tkZip = body.taskKind as TaskKind;
      if (tkZip !== 'image' && tkZip !== 'video' && tkZip !== 'audio') {
        return new Response(
          JSON.stringify({
            error: 'ZIP içe aktarma için taskKind: image | video | audio gönderilmeli.',
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const zipUrl = combined[0];
      const zt = body.zipTaskTemplate;
      const titlePrefix = String(
        zt?.title_prefix ?? (zt as { titlePrefix?: string })?.titlePrefix ?? ''
      ).trim();
      const companyName = String(
        zt?.company_name ?? (zt as { companyName?: string })?.companyName ?? ''
      ).trim();
      if (!zt || !titlePrefix || !companyName) {
        return new Response(
          JSON.stringify({
            error:
              'ZIP içe aktarma için zipTaskTemplate gerekli: company_name, title_prefix, description, price.',
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const tpl: ZipTaskTemplate = {
        company_name: companyName,
        title_prefix: titlePrefix,
        description: String(zt.description ?? ''),
        price: Number(zt.price) || 0,
        language: typeof zt.language === 'string' ? zt.language : undefined,
        annotation_type: typeof zt.annotation_type === 'string' ? zt.annotation_type : undefined,
      };
      const zipResult = await importZipDatasetFromUrl(admin, user.id, zipUrl, tpl, tkZip as ZipMediaKind);
      return new Response(JSON.stringify(zipResult), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (combined.length > 1 && combined.some((u) => pathLower(u).endsWith('.zip'))) {
      return new Response(
        JSON.stringify({ error: 'Birden fazla URL verildiğinde .zip kullanılamaz; ZIP’i tek başına gönderin.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const taskKind = body.taskKind as TaskKind;
    if (taskKind !== 'image' && taskKind !== 'video' && taskKind !== 'audio') {
      return new Response(JSON.stringify({ error: 'taskKind: image | video | audio olmalı.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let mode: string;
    let rawUrls: string[];
    if (combined.length === 1) {
      const expanded = await expandMediaUrls(combined[0], taskKind);
      mode = expanded.mode;
      rawUrls = expanded.urls;
    } else {
      mode = 'multi_paste';
      rawUrls = combined;
    }

    const singleSeed = mode === 'single';
    let mediaUrls = filterUrlsForTaskKind(rawUrls, taskKind, singleSeed);
    if (mediaUrls.length > MAX_LIST_ITEMS) {
      mediaUrls = mediaUrls.slice(0, MAX_LIST_ITEMS);
    }
    if (mediaUrls.length === 0) {
      return new Response(JSON.stringify({ error: 'İşlenecek uygun medya URL’si yok (uzantı / tür filtresi).' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const folder = taskKind === 'image' ? 'images' : taskKind === 'video' ? 'videos' : 'audios';
    const results: { sourceUrl: string; publicUrl?: string; error?: string }[] = [];

    for (let i = 0; i < mediaUrls.length; i++) {
      const sourceUrl = mediaUrls[i];
      try {
        const r = await fetch(sourceUrl, {
          redirect: 'follow',
          headers: { 'User-Agent': 'DeepStudio-Import/1.0', Accept: '*/*' },
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const buf = new Uint8Array(await r.arrayBuffer());
        if (buf.byteLength === 0) throw new Error('Boş yanıt');
        if (buf.byteLength > MAX_BYTES_PER_FILE) throw new Error(`Dosya çok büyük (>${MAX_BYTES_PER_FILE} bayt)`);

        const ct = (r.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
        const ext = inferExt(sourceUrl, ct, taskKind);
        const objectPath = `${folder}/${user.id}/import_${Date.now()}_${i}_${crypto.randomUUID().slice(0, 8)}.${ext}`;
        const uploadCt = contentTypeForExt(ext);

        const { error: upErr } = await admin.storage.from('task-assets').upload(objectPath, buf, {
          contentType: uploadCt,
          upsert: false,
        });
        if (upErr) throw new Error(upErr.message);

        const { data: pub } = admin.storage.from('task-assets').getPublicUrl(objectPath);
        results.push({ sourceUrl, publicUrl: pub.publicUrl });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[import-remote-media] Hata:', sourceUrl, msg);
        results.push({ sourceUrl, error: msg });
      }
    }

    return new Response(
      JSON.stringify({
        manifestMode: mode,
        expandedCount: mediaUrls.length,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[import-remote-media]', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
