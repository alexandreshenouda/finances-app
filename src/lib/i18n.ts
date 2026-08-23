import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

import fr from '@/i18n/locales/fr.json';
import en from '@/i18n/locales/en.json';
import de from '@/i18n/locales/de.json';

export type Language = 'fr' | 'en' | 'de';

const resources = {
  fr: { translation: fr },
  en: { translation: en },
  de: { translation: de },
};

export function detectDeviceLanguage(): Language {
  const locales = Localization.getLocales();
  if (locales.length === 0) return 'fr';
  const deviceLang = locales[0].languageCode?.toLowerCase();
  if (deviceLang === 'en') return 'en';
  if (deviceLang === 'de') return 'de';
  return 'fr';
}

i18next.use(initReactI18next).init({
  resources,
  lng: 'fr',
  fallbackLng: 'fr',
  defaultNS: 'translation',
  interpolation: {
    escapeValue: false,
  },
  pluralSeparator: '_',
});

export default i18next;
