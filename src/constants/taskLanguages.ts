export const TASK_LANGUAGES = [
  { code: 'tr', labelKey: 'languages.tr' },
  { code: 'en', labelKey: 'languages.en' },
  { code: 'ku', labelKey: 'languages.ku' },
  { code: 'ar', labelKey: 'languages.ar' },
  { code: 'az', labelKey: 'languages.az' },
  { code: 'unspecified', labelKey: 'languages.unspecified' },
] as const;

export type TaskLanguageCode = (typeof TASK_LANGUAGES)[number]['code'];

export const UNSPECIFIED_LANGUAGE = 'unspecified' as const;
export const DEFAULT_LANGUAGE = 'tr' as const;

export function getLanguageSlug(code: TaskLanguageCode): string {
  return code === UNSPECIFIED_LANGUAGE ? '' : code;
}
