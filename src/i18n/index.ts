import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
// @ts-ignore
import tr from './locales/tr.json';
// @ts-ignore
import en from './locales/en.json';

const LANG_STORAGE_KEY = 'deepstudio_lang';

i18n.use(initReactI18next).init({
  resources: { tr: { translation: tr as Record<string, unknown> }, en: { translation: en as Record<string, unknown> } },
  lng: 'tr',
  fallbackLng: 'tr',
  interpolation: { escapeValue: false },
});

AsyncStorage.getItem(LANG_STORAGE_KEY).then((saved) => {
  if (saved && (saved === 'tr' || saved === 'en')) {
    i18n.changeLanguage(saved);
  }
});

i18n.on('languageChanged', (lng) => {
  AsyncStorage.setItem(LANG_STORAGE_KEY, lng);
});

export default i18n;
