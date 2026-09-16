/** Bouchon de test pour `expo-localization` (module natif, indisponible sous Node).
 *  `src/lib/i18n.ts` n'en utilise que `getLocales()` au chargement. */
export function getLocales(): { languageCode: string | null; languageTag: string }[] {
  return [{ languageCode: 'fr', languageTag: 'fr-FR' }];
}

export function getCalendars(): unknown[] {
  return [];
}
