/// <reference types="vitest" />
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * Tests unitaires « purs calculs » (aucun test d'UI).
 *
 * Les modules de `src/lib` sont du TypeScript sans JSX, mais leur graphe d'imports
 * touche deux modules natifs Expo/React Native inutilisables sous Node :
 *  - `expo-localization` (détection de langue au chargement de `src/lib/i18n.ts`) ;
 *  - `@react-native-async-storage/async-storage` (persistance zustand dans `src/lib/store.ts`) ;
 *  - `react-native` lui-même (`Platform`, écrit en Flow — non parsable hors Metro).
 * Ils sont remplacés ici par des bouchons en mémoire, ce qui permet de tester la
 * logique financière réelle sans démarrer l'application.
 */
export default defineConfig({
  resolve: {
    alias: [
      { find: 'expo-localization', replacement: here('./test/stubs/expo-localization.ts') },
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
  },
});
