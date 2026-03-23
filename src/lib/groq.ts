/**
 * Groq Cloud API - Whisper-large-v3 ile ses transkripsiyonu
 * Türkçe dahil tüm dillerde yüksek doğruluk
 */

export interface GroqTranscribeResult {
  text: string;
  error?: string;
}

const GROQ_MODEL = 'whisper-large-v3';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

const ANTI_HALLUCINATION_PROMPT =
  'Bu bir ses kaydı dökümüdür. Lütfen sadece duyduğun kelimeleri yaz. Videolardan kalma "abone ol", "beğenmeyi unutmayın" gibi ifadeleri asla ekleme. Eğer ses yoksa boş bırak.';

const HALLUCINATION_PHRASES = [
  /\bAbone\s+ol\b/gi,
  /\bHerkese\s+merhaba\b/gi,
  /\bBeğenmeyi\s+unutmayın\b/gi,
  /\bBeğenmeyi\s+unutma\b/gi,
  /\bYouTube\b/gi,
  /\bİzlediğiniz\s+için\s+teşekkürler\b/gi,
  /\bİzlediğiniz\s+için\b/gi,
  /\bLike\s+and\s+subscribe\b/gi,
  /\bSubscribe\s+to\s+my\s+channel\b/gi,
  /\bThanks\s+for\s+watching\b/gi,
  /\bZil\s+ikonuna\s+tıklayın\b/gi,
  /\bYorum\s+yapın\b/gi,
  /\bTakip\s+etmeyi\s+unutmayın\b/gi,
  /\bPaylaşmayı\s+unutmayın\b/gi,
];

function cleanHallucinations(text: string): string {
  let result = text.trim();
  for (const re of HALLUCINATION_PHRASES) {
    result = result.replace(re, '').trim();
  }
  return result.replace(/\s+/g, ' ').trim();
}

/** Baş ve sondaki sessizliği kırpar (sadece web ortamında, AudioContext varsa) */
async function trimSilencePadding(blob: Blob): Promise<Blob> {
  if (typeof window === 'undefined' || !(window as any).AudioContext) return blob;
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const ctx = new ((window as any).AudioContext || (window as any).webkitAudioContext)();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const channel = audioBuffer.getChannelData(0);
    const sr = audioBuffer.sampleRate;
    const threshold = 0.01;
    const paddingSamples = Math.floor(0.05 * sr);
    let start = 0;
    let end = channel.length - 1;
    for (let i = 0; i < channel.length; i++) {
      if (Math.abs(channel[i]) > threshold) {
        start = Math.max(0, i - paddingSamples);
        break;
      }
    }
    for (let i = channel.length - 1; i >= 0; i--) {
      if (Math.abs(channel[i]) > threshold) {
        end = Math.min(channel.length - 1, i + paddingSamples);
        break;
      }
    }
    const newLength = end - start + 1;
    if (newLength >= channel.length * 0.98) return blob;
    const newBuffer = ctx.createBuffer(1, newLength, sr);
    const newChannel = newBuffer.getChannelData(0);
    for (let i = 0; i < newLength; i++) {
      newChannel[i] = channel[start + i] ?? 0;
    }
    const wav = audioBufferToWav(newBuffer);
    return new Blob([wav], { type: 'audio/wav' });
  } catch {
    return blob;
  }
}

function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1;
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataLength = buffer.length * numChannels * bytesPerSample;
  const bufferLength = 44 + dataLength;
  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeStr(36, 'data');
  view.setUint32(40, dataLength, true);
  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i] ?? 0));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }
  return arrayBuffer;
}

const REQUEST_DELAY_MS = 800;
let lastRequestTime = 0;

async function waitBetweenRequests(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < REQUEST_DELAY_MS && lastRequestTime > 0) {
    await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

function getFileExtension(mimeType: string, url: string): string {
  const normalized = mimeType?.split(';')[0]?.trim().toLowerCase();
  if (normalized?.includes('webm')) return 'webm';
  if (normalized?.includes('mpeg') || normalized?.includes('mp3')) return 'mp3';
  if (normalized?.includes('wav')) return 'wav';
  if (normalized?.includes('m4a') || normalized?.includes('mp4')) return 'm4a';
  if (normalized?.includes('ogg')) return 'ogg';
  if (normalized?.includes('flac')) return 'flac';
  const path = (url || '').toLowerCase();
  if (path.includes('.mp3')) return 'mp3';
  if (path.includes('.webm')) return 'webm';
  if (path.includes('.wav')) return 'wav';
  if (path.includes('.m4a') || path.includes('.mp4')) return 'm4a';
  if (path.includes('.ogg')) return 'ogg';
  if (path.includes('.flac')) return 'flac';
  return 'mp3';
}

/** Groq/Whisper desteklediği diller - listede yoksa undefined (otomatik algılama) */
const GROQ_SUPPORTED_LANGUAGES = new Set([
  'tr', 'en', 'ar', 'az', 'zh', 'de', 'es', 'fr', 'ru', 'ko', 'ja', 'pt', 'pl', 'nl', 'it', 'id',
  'hi', 'fi', 'vi', 'he', 'uk', 'el', 'cs', 'ro', 'da', 'hu', 'ta', 'th', 'ur', 'hr', 'bg', 'lt',
  'sk', 'te', 'fa', 'lv', 'bn', 'sr', 'sl', 'et', 'mk', 'sw', 'gl', 'mr', 'pa', 'km', 'af', 'ka',
  'be', 'gu', 'am', 'lo', 'uz', 'ps', 'tk', 'nn', 'mt', 'sa', 'my', 'bo', 'tl', 'mg', 'as', 'tt',
  'ln', 'ha', 'jw', 'su',
]);

/** Groq ISO-639-1 dil kodu - destekleniyorsa döner, yoksa undefined (otomatik algılama) */
function toGroqLanguage(taskLang?: string | null): string | undefined {
  if (!taskLang || taskLang === 'unspecified') return undefined;
  const code = String(taskLang).trim().toLowerCase().slice(0, 2);
  return GROQ_SUPPORTED_LANGUAGES.has(code) ? code : undefined;
}

export interface GroqTranscribeOptions {
  /** Ses dosyası Blob (file ile gönderim) */
  fileBlob?: Blob;
  /** Ses dosyası URL (url ile gönderim, 25MB+ için) */
  fileUrl?: string;
  /** MIME type (örn: audio/mpeg, audio/wav) */
  mimeType?: string;
  /** Dosya adı (uzantı gerekli) */
  fileName?: string;
  /** Görev dil kodu (tr, en, ku, ar, az) - boşsa otomatik algılanır */
  language?: string | null;
}

export async function transcribeWithGroq(options: GroqTranscribeOptions): Promise<GroqTranscribeResult> {
  const { fileBlob, fileUrl, mimeType, fileName, language } = options;

  const API_KEY = process.env.EXPO_PUBLIC_GROQ_API_KEY;

  if (!API_KEY || API_KEY === 'gsk_your_key_here' || (typeof API_KEY === 'string' && API_KEY.trim() === '')) {
    return {
      text: '',
      error: 'Groq API anahtarı tanımlı değil (.env: EXPO_PUBLIC_GROQ_API_KEY)',
    };
  }

  if (!fileBlob && !fileUrl) {
    return { text: '', error: 'Ses dosyası veya URL gerekli' };
  }

  try {
    await waitBetweenRequests();

    const groqLang = toGroqLanguage(language);
    const isPublicUrl = /^https?:\/\//.test(fileUrl?.trim() ?? '');

    if (isPublicUrl && !fileBlob) {
      const formData = new FormData();
      formData.append('url', fileUrl!.trim());
      formData.append('model', GROQ_MODEL);
      formData.append('response_format', 'text');
      formData.append('prompt', ANTI_HALLUCINATION_PROMPT);
      formData.append('temperature', '0');
      if (groqLang) formData.append('language', groqLang);

      const res = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${API_KEY}` },
        body: formData,
      });

      if (!res.ok) {
        const errText = await res.text();
        const isBusy = res.status === 429 || /quota|rate|meşgul/i.test(errText);
        console.error('[Groq API] Hata:', { status: res.status, statusText: res.statusText, body: errText });
        throw new Error(isBusy ? 'Groq servisi şu an meşgul' : errText || `API hatası: ${res.status}`);
      }

      const rawText = (await res.text()).trim();
      const text = cleanHallucinations(rawText);
      return { text };
    }

    if (!fileBlob) {
      return { text: '', error: 'Ses dosyası gerekli' };
    }

    if (fileBlob.size > MAX_FILE_SIZE_BYTES) {
      return { text: '', error: 'Ses dosyası çok büyük (max 25MB)' };
    }

    let audioToSend = fileBlob;
    try {
      audioToSend = await trimSilencePadding(fileBlob);
    } catch {
      audioToSend = fileBlob;
    }

    const ext = getFileExtension(mimeType ?? '', fileUrl ?? '');
    const safeName =
      fileName && /\.(mp3|wav|m4a|webm|ogg|flac|mp4|mpeg|mpga)$/i.test(fileName)
        ? fileName
        : `audio_${Date.now()}.${ext}`;

    const sendExt = audioToSend.type?.includes('wav') ? 'wav' : ext;
    const sendName = `audio_${Date.now()}.${sendExt}`;
    const formData = new FormData();
    const file =
      typeof File !== 'undefined'
        ? new File([audioToSend], sendName, { type: audioToSend.type || 'audio/mpeg' })
        : audioToSend;
    formData.append('file', file, sendName);
    formData.append('model', GROQ_MODEL);
    formData.append('response_format', 'text');
    formData.append('prompt', ANTI_HALLUCINATION_PROMPT);
    formData.append('temperature', '0');
    if (groqLang) formData.append('language', groqLang);

    const res = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${API_KEY}` },
      body: formData,
    });

    if (!res.ok) {
      const errText = await res.text();
      const isBusy = res.status === 429 || /quota|rate|meşgul/i.test(errText);
      console.error('[Groq API] Hata:', { status: res.status, statusText: res.statusText, body: errText });
      throw new Error(isBusy ? 'Groq servisi şu an meşgul' : errText || `API hatası: ${res.status}`);
    }

    const rawText = (await res.text()).trim();
    const text = cleanHallucinations(rawText);
    return { text };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isBusy = /429|quota|rate|meşgul/i.test(msg);
    console.error('[Groq transcribeWithGroq] Detay:', err);
    return {
      text: '',
      error: isBusy ? 'Groq servisi şu an meşgul' : msg,
    };
  }
}
