/** Bouchon de test pour `expo-localization` (module natif, indisponible sous Node).
 *  `src/lib/i18n.ts` n'en utilise que `getLocales()`. La langue renvoyée est française
 *  par défaut et modifiable via `__setLocales` pour tester la détection de langue. */
type Locale = { languageCode: string | null; languageTag: string };

const DEFAULT_LOCALES: Locale[] = [{ languageCode: 'fr', languageTag: 'fr-FR' }];
let locales: Locale[] = DEFAULT_LOCALES;

export function __setLocales(next: Locale[] | null): void {
  locales = next ?? DEFAULT_LOCALES;
}

export function getLocales(): Locale[] {
  return locales;
}

export function getCalendars(): unknown[] {
  return [];
}
