/**
 * ZIP veri seti: indir, güvenli çıkar, medyayı storage + tasks tablosuna yazar.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.8';
import JSZip from 'npm:jszip@3.10.1';

export type ZipTaskTemplate = {
  company_name: string;
  title_prefix: string;
  description: string;
  price: number;
  language?: string;
  annotation_type?: string;
};

const MAX_ZIP_BYTES = 1024 * 1024 * 1024; // 1 GB (Content-Length / tampon üst sınırı)
const MAX_EXTRACTED_FILE_BYTES = 200 * 1024 * 1024;
const MAX_FILES = 5000;
const UPLOAD_BATCH = 40;
const INSERT_CHUNK = 100;

const ZIP_IMAGE = new Set(['jpg', 'jpeg', 'png', 'webp']);
const ZIP_AUDIO = new Set(['wav', 'mp3']);
const ZIP_VIDEO = new Set(['mp4', 'webm', 'mov', 'm4v', 'avi', 'mkv']);

function extFromName(name: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
}

/** Zip-slip: yalnızca göreli, düz yollar */
export function safeZipEntryPath(raw: string): string | null {
  const n = raw.replace(/\\/g, '/').replace(/^\//, '');
  if (!n || n.includes('\0')) return null;
  const segments = n.split('/');
  for (const seg of segments) {
    if (seg === '..' || seg === '') return null;
  }
  return n;
}

function classifyMedia(ext: string): 'image' | 'audio' | 'video' | null {
  if (ZIP_IMAGE.has(ext)) return 'image';
  if (ZIP_AUDIO.has(ext)) return 'audio';
  if (ZIP_VIDEO.has(ext)) return 'video';
  return null;
}

export type ZipMediaKind = 'image' | 'audio' | 'video';

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
    case 'm4v':
      return 'video/x-m4v';
    case 'avi':
      return 'video/x-msvideo';
    case 'mkv':
      return 'video/x-matroska';
    case 'mp3':
      return 'audio/mpeg';
    case 'wav':
      return 'audio/wav';
    default:
      return 'application/octet-stream';
  }
}

function sanitizeStorageFileName(innerPath: string): string {
  const base = innerPath.split('/').pop() ?? 'file';
  return base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180);
}

function buildTaskRow(
  media: 'image' | 'audio' | 'video',
  publicUrl: string,
  storagePath: string,
  innerPath: string,
  index: number,
  tpl: ZipTaskTemplate
): Record<string, unknown> {
  const titleBase = `${tpl.title_prefix} — ${innerPath.split('/').pop() ?? `file-${index}`}`.slice(0, 240);
  const desc = `${tpl.description || ''}\n\nZIP içi yol: ${innerPath}\nKaynak: zip_import`.trim();
  const common = {
    title: titleBase,
    import_source: 'zip_import',
    media_storage_path: storagePath,
    price: Number(tpl.price) || 0,
    status: 'pending',
    assigned_to: null,
    is_pool_task: true,
  };

  if (media === 'image') {
    return {
      ...common,
      company_name: tpl.company_name,
      type: 'image',
      annotation_type: tpl.annotation_type || 'bbox',
      image_url: publicUrl,
      description: desc,
    };
  }
  if (media === 'audio') {
    return {
      ...common,
      company_name: tpl.company_name,
      type: 'audio',
      category: 'audio',
      audio_url: publicUrl,
      description: desc,
      language: tpl.language || 'tr',
    };
  }
  return {
    ...common,
    company_name: tpl.company_name,
    title: titleBase,
    description: desc,
    type: 'video',
    category: 'video',
    video_url: publicUrl,
  };
}

export async function importZipDatasetFromUrl(
  admin: SupabaseClient,
  userId: string,
  zipUrl: string,
  tpl: ZipTaskTemplate,
  /** Yalnızca bu medya türü için görev oluştur (video zip’te resim/ses atlanır) */
  mediaKind?: ZipMediaKind | null
): Promise<{ importMode: 'zip_dataset'; created: number; skipped: number; errors: string[] }> {
  const headRes = await fetch(zipUrl, {
    method: 'HEAD',
    redirect: 'follow',
    headers: { 'User-Agent': 'DeepStudio-ZipImport/1.0', Accept: '*/*' },
  }).catch(() => null);

  const lenStr = headRes?.headers.get('content-length');
  if (lenStr) {
    const n = Number(lenStr);
    if (Number.isFinite(n) && n > MAX_ZIP_BYTES) {
      throw new Error(`ZIP dosyası çok büyük (>${MAX_ZIP_BYTES} bayt).`);
    }
  }

  const res = await fetch(zipUrl, {
    redirect: 'follow',
    headers: { 'User-Agent': 'DeepStudio-ZipImport/1.0', Accept: '*/*' },
  });
  if (!res.ok) throw new Error(`ZIP indirilemedi: HTTP ${res.status}`);

  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > MAX_ZIP_BYTES) {
    throw new Error(`ZIP dosyası çok büyük (>${MAX_ZIP_BYTES} bayt).`);
  }
  if (buf.byteLength < 22) {
    throw new Error('Geçersiz veya boş ZIP dosyası.');
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buf);
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    throw new Error(`ZIP açılamadı: ${m}`);
  }

  type Entry = { path: string; ext: string; media: 'image' | 'audio' | 'video' };
  const entries: Entry[] = [];

  zip.forEach((relPath, file) => {
    if (file.dir) return;
    const safe = safeZipEntryPath(relPath);
    if (!safe) {
      console.warn('[zip import] zip-slip veya geçersiz yol atlandı:', relPath);
      return;
    }
    const ext = extFromName(safe);
    const media = classifyMedia(ext);
    if (!media) {
      console.warn('[zip import] Desteklenmeyen uzantı atlandı:', safe);
      return;
    }
    entries.push({ path: safe, ext, media });
  });

  if (entries.length > MAX_FILES) {
    console.warn(`[zip import] En fazla ${MAX_FILES} dosya işlenecek; kalan atlandı.`);
  }
  const sliced = entries.slice(0, MAX_FILES);
  const list = mediaKind
    ? sliced.filter((e) => e.media === mediaKind)
    : sliced;
  if (mediaKind && list.length === 0) {
    return {
      importMode: 'zip_dataset',
      created: 0,
      skipped: sliced.length,
      errors: [`ZIP içinde ${mediaKind} dosyası bulunamadı (desteklenen uzantılar).`],
    };
  }

  const sessionStamp = Date.now();
  let created = 0;
  let skipped = 0;
  const errors: string[] = [];
  const pendingRows: Record<string, unknown>[] = [];

  const flushRows = async () => {
    if (pendingRows.length === 0) return;
    for (let i = 0; i < pendingRows.length; i += INSERT_CHUNK) {
      const chunk = pendingRows.slice(i, i + INSERT_CHUNK);
      const { error } = await admin.from('tasks').insert(chunk);
      if (error) {
        console.error('[zip import] DB insert:', error.message);
        errors.push(`DB insert: ${error.message}`);
        break;
      }
      created += chunk.length;
    }
    pendingRows.length = 0;
  };

  for (let i = 0; i < list.length; i++) {
    const ent = list[i];
    if (i > 0 && i % UPLOAD_BATCH === 0) {
      console.log(`[zip import] İlerleme: ${i}/${list.length}`);
      await flushRows();
    }
    if (i > 0 && i % 1000 === 0) {
      console.log(`[zip import] Toplu işlem: ${i} / ${list.length} dosya işlendi`);
    }

    try {
      const node = zip.file(ent.path);
      if (!node) {
        skipped++;
        continue;
      }
      const u8 = await node.async('uint8array');
      if (u8.byteLength === 0) {
        skipped++;
        errors.push(`${ent.path}: boş dosya`);
        continue;
      }
      if (u8.byteLength > MAX_EXTRACTED_FILE_BYTES) {
        skipped++;
        errors.push(`${ent.path}: dosya çok büyük`);
        continue;
      }

      const folder = ent.media === 'image' ? 'images' : ent.media === 'video' ? 'videos' : 'audios';
      const fname = sanitizeStorageFileName(ent.path);
      const objectPath = `${folder}/${userId}/zip_${sessionStamp}_${i}_${fname}`;
      const ct = contentTypeForExt(ent.ext);

      const { error: upErr } = await admin.storage.from('task-assets').upload(objectPath, u8, {
        contentType: ct,
        upsert: false,
      });
      if (upErr) {
        skipped++;
        errors.push(`${ent.path}: ${upErr.message}`);
        continue;
      }

      const { data: pub } = admin.storage.from('task-assets').getPublicUrl(objectPath);
      pendingRows.push(buildTaskRow(ent.media, pub.publicUrl, objectPath, ent.path, i, tpl));

      if (pendingRows.length >= INSERT_CHUNK) {
        await flushRows();
      }
    } catch (e) {
      skipped++;
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[zip import] Dosya hatası:', ent.path, msg);
      if (errors.length < 80) errors.push(`${ent.path}: ${msg}`);
    }
  }

  await flushRows();

  return {
    importMode: 'zip_dataset',
    created,
    skipped,
    errors: errors.slice(0, 100),
  };
}
