export type TaskCategory = 'audio' | 'transcription' | 'image' | 'survey' | 'testing';

export const TASK_CATEGORIES: { id: TaskCategory | 'all'; labelKey: string; icon: string; color: string }[] = [
  { id: 'all', labelKey: 'tasks.categoryAll', icon: '📋', color: '#94a3b8' },
  { id: 'audio', labelKey: 'tasks.categoryAudio', icon: '🎙️', color: '#38bdf8' },
  { id: 'transcription', labelKey: 'tasks.categoryTranscription', icon: '📝', color: '#818cf8' },
  { id: 'image', labelKey: 'tasks.categoryImage', icon: '🖼️', color: '#f472b6' },
  { id: 'survey', labelKey: 'tasks.categorySurvey', icon: '📊', color: '#fb923c' },
  { id: 'testing', labelKey: 'tasks.categoryTesting', icon: '🔍', color: '#a78bfa' },
];

export function getCategoryColor(category: TaskCategory): string {
  const c = TASK_CATEGORIES.find((x) => x.id === category);
  return c?.color ?? '#64748b';
}
