import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
// @ts-ignore
import tr from './locales/tr.json';
// @ts-ignore
import en from './locales/en.json';

export const LANG_STORAGE_KEY = 'deepstudio_lang';
export const DEFAULT_UI_LANGUAGE = 'en' as const;
export const SUPPORTED_UI_LANGUAGES = ['en', 'tr'] as const;
export type UiLanguage = (typeof SUPPORTED_UI_LANGUAGES)[number];

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en as Record<string, unknown> },
    tr: { translation: tr as Record<string, unknown> },
  },
  lng: DEFAULT_UI_LANGUAGE,
  fallbackLng: DEFAULT_UI_LANGUAGE,
  supportedLngs: [...SUPPORTED_UI_LANGUAGES],
  interpolation: { escapeValue: false },
});

void AsyncStorage.getItem(LANG_STORAGE_KEY).then((saved) => {
  if (saved === 'tr' || saved === 'en') {
    void i18n.changeLanguage(saved);
  }
});

i18n.on('languageChanged', (lng) => {
  const code = lng.split('-')[0];
  if (code === 'tr' || code === 'en') {
    void AsyncStorage.setItem(LANG_STORAGE_KEY, code);
  }
});

export default i18n;
