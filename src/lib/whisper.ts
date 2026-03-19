/**
 * Google Gemini API ile ses dosyasını metne çevirir.
 */

export interface TranscribeResult {
  text: string;
  error?: string;
}

const TRANSCRIPTION_PROMPT = 'Transcribe this audio. Lütfen bu ses dosyasını dinle ve içindeki tüm konuşmaları Türkçe olarak yazıya dök.';

const GEMINI_MODEL = 'gemini-2.5-flash';

const MAX_INLINE_SIZE_BYTES = 20 * 1024 * 1024;

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      let base64 = '';
      if (result?.includes(',')) {
        base64 = result.split(',')[1] ?? '';
      } else if (result?.includes('base64,')) {
        base64 = result.split('base64,')[1] ?? '';
      } else {
        base64 = result ?? '';
      }
      base64 = base64.trim();
      if (!base64) {
        reject(new Error('Base64 dönüşümü başarısız'));
        return;
      }
      resolve(base64);
    };
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(blob);
  });
}

function ensureCleanBase64(data: string): string {
  if (data.includes(',')) return data.split(',')[1]?.trim() ?? data;
  if (data.includes('base64,')) return data.split('base64,')[1]?.trim() ?? data;
  return data.trim();
}

export async function transcribeAudio(
  fileUri: string,
  mimeType?: string,
  fileName?: string,
  fileBlob?: Blob
): Promise<TranscribeResult> {
  const API_KEY =
    process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? process.env.GEMINI_API_KEY;

  if (!API_KEY) {
    return { text: '', error: 'API anahtarı tanımlı değil' };
  }

  if (!fileBlob) {
    return { text: '', error: 'Ses dosyası gerekli' };
  }

  if (fileBlob.size > MAX_INLINE_SIZE_BYTES) {
    return { text: '', error: 'Ses dosyası çok büyük (max 20MB)' };
  }

  try {
    const base64Data = await blobToBase64(fileBlob);
    const cleanBase64 = ensureCleanBase64(base64Data);

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${API_KEY}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { inlineData: { mimeType: 'audio/mpeg', data: cleanBase64 } },
              { text: TRANSCRIPTION_PROMPT },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      const is429 = res.status === 429 || errText.toLowerCase().includes('quota');
      throw new Error(is429 ? 'API kotası doldu. Lütfen daha sonra tekrar deneyin.' : errText);
    }

    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
    return { text };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { text: '', error: msg };
  }
}
