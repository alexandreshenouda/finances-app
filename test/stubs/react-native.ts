/** Bouchon de test minimal pour `react-native`.
 *  Les modules de `src/lib` n'en utilisent que `Platform` (branches web / natif des
 *  scrapers JustETF et Yahoo, et du stockage des secrets). `OS` vaut `'android'` par
 *  défaut (runtime natif) ; il est mutable pour que les tests puissent exercer la branche
 *  web (`Platform.OS = 'web'`) — à remettre à `'android'` en fin de test. */
export const Platform: {
  OS: 'android' | 'ios' | 'web';
  select: <T>(specifics: { android?: T; ios?: T; native?: T; web?: T; default?: T }) => T | undefined;
} = {
  OS: 'android',
  select: (specifics) =>
    Platform.OS === 'web'
      ? (specifics.web ?? specifics.default)
      : (specifics.android ?? specifics.native ?? specifics.default),
};
