/**
 * DB satırından görev tipi: type alanı yoksa image_url / video_url / audio_url ve category ile çıkarım.
 */
export function inferTaskTypeFromRow(data: Record<string, unknown>): string {
  const cat = String(data.category ?? '').toLowerCase();
  const imageUrl = data.image_url ?? data.imageUrl;
  const videoUrl = data.video_url ?? data.videoUrl;
  const audioUrl = data.audio_url ?? data.audioUrl ?? data.content_url;
  const hasImage = String(imageUrl ?? '').trim().length > 0;
  const hasVideo = String(videoUrl ?? '').trim().length > 0;
  const hasAudio = String(audioUrl ?? '').trim().length > 0;

  if (cat === 'video' || hasVideo) return 'video';
  if (cat === 'image' || hasImage) return 'image';
  if (cat === 'transcription') return 'transcription';
  if (hasAudio) return 'audio';
  return 'audio';
}

/** type doluysa onu kullan; değilse inferTaskTypeFromRow */
export function resolveTaskType(data: Record<string, unknown>): string {
  const t = data?.type;
  if (t != null && String(t).trim() !== '') return String(t);
  return inferTaskTypeFromRow(data);
}
