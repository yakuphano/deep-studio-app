import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { normalizeRemoteMediaUrl, splitRemoteMediaUrlsFromInput } from '@/lib/mediaUrl';

export type ImportTaskKind = 'image' | 'video' | 'audio';

export type ZipTaskTemplate = {
  company_name: string;
  title_prefix: string;
  description: string;
  price: number;
  language?: string;
  annotation_type?: string;
};

export type ImportRemoteMediaResultItem = {
  sourceUrl: string;
  publicUrl?: string;
  error?: string;
};

export type ImportRemoteMediaListResponse = {
  importMode?: undefined;
  manifestMode?: string;
  expandedCount?: number;
  results: ImportRemoteMediaResultItem[];
  error?: string;
};

export type ImportZipDatasetResponse = {
  importMode: 'zip_dataset';
  created: number;
  skipped: number;
  errors: string[];
  error?: string;
};

export type ImportSeedResponse = ImportRemoteMediaListResponse | ImportZipDatasetResponse;

export { splitRemoteMediaUrlsFromInput } from '@/lib/mediaUrl';

export function isZipDatasetUrl(raw: string): boolean {
  const u = normalizeRemoteMediaUrl(String(raw ?? '').trim());
  try {
    return new URL(u).pathname.toLowerCase().endsWith('.zip');
  } catch {
    return /\.zip(\?|#|$)/i.test(u);
  }
}

type ImportRemoteMediaRequestBody = {
  seedUrls: string[];
  taskKind: ImportTaskKind;
  zipTaskTemplate?: ZipTaskTemplate;
};

/** Web + __DEV__: Metro `/_supabase-fn` proxy (CORS’suz). Kapatmak: EXPO_PUBLIC_USE_EDGE_PROXY=0 */
function useMetroEdgeProxy(): boolean {
  if (Platform.OS !== 'web') return false;
  if (process.env.EXPO_PUBLIC_USE_EDGE_PROXY === '0') return false;
  if (process.env.EXPO_PUBLIC_USE_EDGE_PROXY === '1') return true;
  return typeof __DEV__ !== 'undefined' && __DEV__;
}

function resolveImportRemoteMediaPostUrl(supabaseUrl: string): string {
  const base = supabaseUrl.replace(/\/$/, '');
  const direct = `${base}/functions/v1/import-remote-media`;
  if (!useMetroEdgeProxy() || typeof window === 'undefined') return direct;
  return `${window.location.origin}/_supabase-fn/import-remote-media`;
}

function hintWrongEdgeDeploy(directUrl: string): string {
  return (
    ' Supabase’deki `import-remote-media` bu uygulamanın beklediği sürüm değil (repo: `supabase/functions/import-remote-media`). ' +
    'Doğrulama: `curl -sS -X POST ' +
    directUrl +
    " -H 'Content-Type: application/json' --data '{}' ` — şablon yanıt (ör. message: Başarılı) ise yeniden deploy edin: " +
    '`npx supabase@latest functions deploy import-remote-media`'
  );
}

function hintCorsDirectSupabase(directUrl: string): string {
  return (
    ' Tarayıcıdan doğrudan Supabase’e istek CORS ile engelleniyorsa: web geliştirmede Metro proxy varsayılan açıktır (`/_supabase-fn`); `npm run web` sonrası hâlâ oluyorsa `metro.config.js` yüklendi mi kontrol edin. ' +
    'Kalıcı çözüm: doğru Edge kodunu deploy edin. ' +
    directUrl
  );
}

async function postImportRemoteMedia(
  postUrl: string,
  supabaseAnon: string,
  requestBody: ImportRemoteMediaRequestBody
): Promise<ImportSeedResponse> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token ?? supabaseAnon;

  let res: Response;
  try {
    res = await fetch(postUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnon,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(requestBody),
    });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    const direct = postUrl.includes('/_supabase-fn')
      ? (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '') + '/functions/v1/import-remote-media'
      : postUrl;
    if (/failed to fetch|load failed|networkerror|cors/i.test(m)) {
      throw new Error(m + hintCorsDirectSupabase(direct));
    }
    throw new Error(m);
  }

  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`HTTP ${res.status}, yanıt JSON değil: ${text.slice(0, 240)}`);
  }

  if (!res.ok) {
    const errMsg =
      typeof json === 'object' &&
      json !== null &&
      'error' in json &&
      typeof (json as { error: unknown }).error === 'string'
        ? (json as { error: string }).error
        : text || res.statusText;
    throw new Error(`${errMsg} (HTTP ${res.status})`);
  }

  return json as ImportSeedResponse;
}

function validateImportPayload(payload: unknown, directFnUrl: string): ImportSeedResponse {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Sunucudan beklenmeyen yanıt' + hintWrongEdgeDeploy(directFnUrl));
  }
  const any = payload as Record<string, unknown>;
  if (typeof any.message === 'string' && any.results === undefined && any.importMode === undefined) {
    throw new Error('Sunucudaki import-remote-media şablon veya eski sürüm.' + hintWrongEdgeDeploy(directFnUrl));
  }
  return payload as ImportSeedResponse;
}

/**
 * Uzak URL: tek veya çoklu (boşluk, virgül, ;, |, satır sonu), .txt, .json veya .zip.
 * Web __DEV__: varsayılan olarak Metro `/_supabase-fn` üzerinden proxy (CORS yok).
 */
export async function importRemoteMediaViaEdge(
  rawInput: string,
  taskKind: ImportTaskKind,
  options?: { zipTaskTemplate?: ZipTaskTemplate }
): Promise<ImportSeedResponse> {
  const urls = splitRemoteMediaUrlsFromInput(String(rawInput ?? '').trim());
  if (urls.length === 0) {
    throw new Error(
      'Geçerli en az bir http(s) adresi girin. Birden fazla URL: boşluk, virgül, noktalı virgül, | veya yeni satır ile ayırın.'
    );
  }

  const zipOnly = urls.length === 1 && isZipDatasetUrl(urls[0]);
  if (zipOnly) {
    const tpl = options?.zipTaskTemplate;
    if (!tpl?.company_name?.trim() || !tpl.title_prefix?.trim()) {
      throw new Error('ZIP içe aktarma için şirket adı ve başlık şablonu gerekir.');
    }
  }

  const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
  const supabaseAnon = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
  if (!supabaseUrl || !supabaseAnon) {
    throw new Error(
      'Supabase ortam değişkenleri eksik: EXPO_PUBLIC_SUPABASE_URL ve EXPO_PUBLIC_SUPABASE_ANON_KEY (.env) tanımlı olmalı; Expo\'yu yeniden başlatın.'
    );
  }

  const body: ImportRemoteMediaRequestBody = {
    seedUrls: urls,
    taskKind,
    ...(zipOnly && options?.zipTaskTemplate ? { zipTaskTemplate: options.zipTaskTemplate } : {}),
  };

  const postUrl = resolveImportRemoteMediaPostUrl(supabaseUrl);
  const directFnUrl = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/import-remote-media`;

  if (useMetroEdgeProxy() && typeof window !== 'undefined') {
    console.info('[importRemoteMediaViaEdge] POST →', postUrl, '(Metro proxy; doğrudan:', directFnUrl, ')');
  }

  const raw = await postImportRemoteMedia(postUrl, supabaseAnon, body);

  if (raw && typeof raw === 'object' && typeof (raw as { error?: unknown }).error === 'string' && (raw as { error: string }).error) {
    throw new Error((raw as { error: string }).error);
  }

  const payload = validateImportPayload(raw, directFnUrl);

  if (payload.importMode === 'zip_dataset') {
    return payload as ImportZipDatasetResponse;
  }

  if (!Array.isArray((payload as ImportRemoteMediaListResponse).results)) {
    throw new Error('Sunucudan beklenmeyen yanıt' + hintWrongEdgeDeploy(directFnUrl));
  }

  return payload as ImportRemoteMediaListResponse;
}

export function logImportFailures(results: ImportRemoteMediaResultItem[], context: string) {
  for (const r of results) {
    if (r.error) {
      console.warn(`[${context}] Atlanan URL:`, r.sourceUrl, '—', r.error);
    }
  }
}

export function isZipDatasetResponse(r: ImportSeedResponse): r is ImportZipDatasetResponse {
  return (r as ImportZipDatasetResponse).importMode === 'zip_dataset';
}
