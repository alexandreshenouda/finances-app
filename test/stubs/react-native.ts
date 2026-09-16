/** Bouchon de test minimal pour `react-native`.
 *  Les modules de calcul testés n'en utilisent que `Platform` (branches web / natif
 *  des scrapers JustETF et Yahoo). Les tests ciblent des fonctions pures, jamais ces
 *  branches réseau : `OS` est fixé à `'android'` pour représenter le runtime natif. */
export const Platform = {
  OS: 'android' as const,
  select: <T,>(specifics: { android?: T; ios?: T; native?: T; web?: T; default?: T }): T | undefined =>
    specifics.android ?? specifics.native ?? specifics.default,
};
