import { resolveTaskType } from './inferTaskType';

/**
 * QA / düzeltme için workbench rotası: type + category ile medical/lidar ayırımı
 * (type bazen "image" kalır; category "medical" olabilir.)
 */
export function resolveTaskWorkbenchType(row: Record<string, unknown>): string {
  const typ = String(row.type ?? '').trim().toLowerCase();
  const cat = String(row.category ?? '').trim().toLowerCase();
  if (typ === 'medical' || cat === 'medical') return 'medical';
  if (typ === 'lidar' || cat === 'lidar') return 'lidar';
  return resolveTaskType(row);
}

export function getWorkbenchPathForTask(task: Record<string, unknown>): string {
  const id = String(task.id ?? '').trim();
  if (!id) return '/dashboard';
  const t = resolveTaskWorkbenchType(task).toLowerCase();
  if (t === 'audio' || t === 'transcription') return `/dashboard/audio/${id}`;
  if (t === 'video') return `/dashboard/video/${id}`;
  if (t === 'medical') return `/dashboard/medical/${id}`;
  if (t === 'lidar') return `/dashboard/lidar/${id}`;
  return `/dashboard/image/${id}`;
}

/** Sadece type string biliniyorsa (geri uyumluluk). */
export function getTaskWorkbenchPath(taskType: string | null | undefined, taskId: string): string {
  return getWorkbenchPathForTask({ type: taskType ?? null, id: taskId });
}
