/// <reference types="vitest" />
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * Tests unitaires « purs calculs » (aucun test d'UI).
 *
 * Les modules de `src/lib` sont du TypeScript sans JSX, mais leur graphe d'imports
 * touche des modules natifs Expo/React Native inutilisables sous Node :
 *  - `expo-localization` (détection de langue au chargement de `src/lib/i18n.ts`) ;
 *  - `expo-secure-store` (secrets des connexions, `src/lib/secure.ts`) ;
 *  - `@react-native-async-storage/async-storage` (persistance zustand dans `src/lib/store.ts`) ;
 *  - `react-native` lui-même (`Platform`, écrit en Flow — non parsable hors Metro).
 * Ils sont remplacés ici par des bouchons en mémoire, ce qui permet de tester la
 * logique financière réelle sans démarrer l'application.
 */
export default defineConfig({
  resolve: {
    alias: [
      { find: 'expo-localization', replacement: here('./test/stubs/expo-localization.ts') },
      { find: 'expo-secure-store', replacement: here('./test/stubs/expo-secure-store.ts') },
      {
        find: '@react-native-async-storage/async-storage',
        replacement: here('./test/stubs/async-storage.ts'),
      },
      { find: /^react-native$/, replacement: here('./test/stubs/react-native.ts') },
      { find: /^@\/assets\//, replacement: here('./assets/') },
      { find: /^@\//, replacement: here('./src/') },
    ],
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    globals: false,
    // Couverture mesurée sur `src/lib` uniquement : c'est le périmètre des tests (logique
    // pure, aucun test d'interface — cf. README « Tests »). `json-summary` alimente le
    // badge du README (cf. `.github/workflows/tests.yml`).
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts'],
      reporter: ['text-summary', 'json-summary'],
      reportsDirectory: 'coverage',
      // Le badge doit refléter aussi un run rouge, pas rester figé sur le dernier vert.
      reportOnFailure: true,
      // Plancher : `npm run test:coverage` (donc la CI) échoue si la couverture de `src/lib`
      // repasse sous 90 %. Les branches restantes sont surtout des `catch` défensifs
      // inatteignables (erreurs déjà absorbées plus bas par les scrapers).
      thresholds: { statements: 90, branches: 90, functions: 90, lines: 90 },
    },
  },
});
