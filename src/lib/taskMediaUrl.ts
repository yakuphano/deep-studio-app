/**
 * Görev medyası için Edge proxy URL’si (Authorization header ile çağrılmalı).
 * Dağıtım: supabase functions deploy task-media
 */
export function getTaskMediaProxyUrl(taskId: string): string | null {
  const base = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, '') ?? '';
  if (!base || !taskId?.trim()) return null;
  return `${base}/functions/v1/task-media?task_id=${encodeURIComponent(taskId.trim())}`;
}
