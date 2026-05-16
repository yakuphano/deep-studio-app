import { supabase } from '@/lib/supabase';

export type GuidelineUploadResult = {
  guideline_url: string;
  guideline_storage_path: string;
  guideline_file_name: string;
};

export type GuidelineFileSelection = {
  name: string;
  uri: string;
  mimeType?: string | null;
  webFile?: File | null;
};

const EXT_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
  md: 'text/markdown',
  rtf: 'application/rtf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

export function guessGuidelineContentType(fileName: string, mime?: string | null): string {
  if (mime && mime !== 'application/octet-stream') return mime;
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  return EXT_MIME[ext] ?? 'application/octet-stream';
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180);
}

export async function uploadTaskGuideline(
  body: Blob | File | ArrayBuffer,
  fileName: string,
  userId: string,
  mime?: string | null
): Promise<GuidelineUploadResult> {
  const safe = sanitizeFileName(fileName);
  const path = `guidelines/${userId}/${Date.now()}_${safe}`;
  const contentType = guessGuidelineContentType(fileName, mime);

  const { error } = await supabase.storage.from('task-assets').upload(path, body, {
    contentType,
    upsert: false,
  });
  if (error) throw new Error(error.message || 'Kılavuz dosyası yüklenemedi');

  const { data } = supabase.storage.from('task-assets').getPublicUrl(path);
  return {
    guideline_url: data.publicUrl,
    guideline_storage_path: path,
    guideline_file_name: fileName,
  };
}

export async function uploadGuidelineFromSelection(
  file: GuidelineFileSelection,
  userId: string
): Promise<GuidelineUploadResult> {
  let body: Blob | File | ArrayBuffer;
  if (file.webFile) {
    body = file.webFile;
  } else {
    const res = await fetch(file.uri);
    if (!res.ok) throw new Error('Kılavuz dosyası okunamadı');
    body = await res.blob();
  }
  return uploadTaskGuideline(body, file.name, userId, file.mimeType);
}

export function mergeGuidelineIntoRows<T extends Record<string, unknown>>(
  rows: T[],
  guideline: GuidelineUploadResult | null
): T[] {
  if (!guideline) return rows;
  const fields = guidelineFieldsRecord(guideline);
  return rows.map((row) => ({ ...row, ...fields }));
}

export function guidelineFieldsRecord(
  guideline: GuidelineUploadResult
): GuidelineUploadResult {
  return {
    guideline_url: guideline.guideline_url,
    guideline_storage_path: guideline.guideline_storage_path,
    guideline_file_name: guideline.guideline_file_name,
  };
}

export async function applyGuidelineToTaskRows<T extends Record<string, unknown>>(
  rows: T[],
  guidelineFile: GuidelineFileSelection | null,
  userId: string | undefined
): Promise<T[]> {
  if (!guidelineFile || !userId) return rows;
  const uploaded = await uploadGuidelineFromSelection(guidelineFile, userId);
  return mergeGuidelineIntoRows(rows, uploaded);
}

export async function uploadGuidelineIfSelected(
  guidelineFile: GuidelineFileSelection | null,
  userId: string | undefined
): Promise<GuidelineUploadResult | null> {
  if (!guidelineFile || !userId) return null;
  return uploadGuidelineFromSelection(guidelineFile, userId);
}
