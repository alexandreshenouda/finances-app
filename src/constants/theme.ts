/** Palette sombre unique de l'application. */
import { useMemo } from 'react';
import type { TextStyle, ViewStyle } from 'react-native';

export type ThemeName = 'classique' | 'or';

/** Jeu de tokens commun aux deux thèmes. */
export type ThemeColors = {
  bg: string;
  card: string;
  cardAlt: string;
  border: string;
  text: string;
  textDim: string;
  textFaint: string;
  accent: string;
  /** Texte/icônes sur fond `accent`. */
  onAccent: string;
  positive: string;
  negative: string;
  warning: string;
};

/**
 * Échelle typographique : 6 niveaux, jamais de taille en dur dans un écran.
 * `xs` = légendes/badges, `sm` = texte secondaire, `md` = texte courant,
 * `lg` = titres de carte, `xl` = titres d'écran, `hero` = montant principal.
 */
export const FONT = { xs: 12, sm: 13, md: 15, lg: 17, xl: 22, hero: 32 } as const;

/** Rayons d'arrondi : `xs` pastilles/barres, `sm` champs & boutons, `md` cartes, `pill` puces. */
export const RADIUS = { xs: 4, sm: 8, md: 14, pill: 999 } as const;

/** Espacements (multiples de 4) pour les nouvelles primitives. */
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

/** À étaler sur tout style de montant : chiffres à chasse fixe (colonnes alignées). */
export const TABULAR: Pick<TextStyle, 'fontVariant'> = { fontVariant: ['tabular-nums'] };

/** Couleur du thème (hex `#RRGGBB`) rendue translucide — fonds teintés de pastilles/badges. */
export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** Largeur maximale du contenu d'un écran (web / Electron / tablette) : au-delà, il est centré. */
export const CONTENT_MAX_WIDTH = 720;

/** À étaler dans le `contentContainerStyle` d'un écran : contenu centré, borné en largeur. */
export const CONTENT: Pick<ViewStyle, 'width' | 'maxWidth' | 'alignSelf'> = {
  width: '100%',
  maxWidth: CONTENT_MAX_WIDTH,
  alignSelf: 'center',
};

/** Voile sombre derrière les fenêtres modales (identique dans les deux thèmes). */
export const SCRIM = 'rgba(0,0,0,0.72)';

/** Hauteur minimale d'une cible tactile (recommandation iOS 44 pt / Android 48 dp). */
export const TOUCH_MIN = 44;

const THEME_CLASSIQUE: ThemeColors = {
  bg: '#0F172A',
  card: '#1E293B',
  cardAlt: '#26334A',
  border: '#334155',
  text: '#E2E8F0',
  textDim: '#94A3B8',
  textFaint: '#8494AB',
  accent: '#5B8DEF',
  onAccent: '#fff',
  positive: '#34D399',
  negative: '#F87171',
  warning: '#FBBF24',
};

const THEME_OR: ThemeColors = {
  bg: '#0A0A0A',
  card: '#151515',
  cardAlt: '#1F1F1F',
  border: '#2E2E2E',
  text: '#F0F0F0',
  textDim: '#9C9C9C',
  textFaint: '#858585',
  accent: '#D4AF37',
  /** Texte/icônes sur fond `accent` (or clair) : jamais de blanc, contraste trop faible. */
  onAccent: '#171008',
  positive: '#34D399',
  negative: '#F87171',
  warning: '#F0954A',
};

export const THEMES: Record<ThemeName, ThemeColors> = {
  classique: THEME_CLASSIQUE,
  or: THEME_OR,
};

/**
 * Objet mutable utilisé partout dans l'app.
 * `setTheme()` copie la palette active dans cet objet en place,
 * déclenchant un re-render via `useStore.subscribe` (même pattern que `setMaskedMoney`).
 */
export const C: ThemeColors = { ...THEME_OR };

/** Appelé par le store à chaque changement de thème (et à la réhydratation). */
export function setTheme(name: ThemeName): void {
  const palette = THEMES[name];
  (Object.keys(palette) as (keyof ThemeColors)[]).forEach((k) => {
    (C as Record<string, string>)[k] = palette[k];
  });
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { setAccountTypeColors } = require('@/lib/types') as { setAccountTypeColors: (theme: ThemeName) => void };
    setAccountTypeColors(name);
  } catch {}
}

/**
 * Hook React : retourne le nom du thème actif et force un re-render lors d'un
 * changement. À utiliser dans les composants qui construisent leurs styles avec
 * `C.*` afin que ceux-ci soient recalculés après un switch de thème.
 *
 * Import lazily to avoid circular dependency (store → theme → store).
 */
export function useTheme(): ThemeName {
  // Import dynamique pour éviter la dépendance circulaire theme.ts ↔ store.ts.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { useStore } = require('@/lib/store') as { useStore: import('zustand').UseBoundStore<import('zustand').StoreApi<{ theme: ThemeName }>> };
  return useStore((s) => s.theme);
}

/**
 * Hook React : memoize un objet de styles (résultat de `StyleSheet.create(…)`)
 * et le recalcule à chaque changement de thème.
 *
 * Usage :
 * ```ts
 * const styles = useStyles(() => StyleSheet.create({ bg: { backgroundColor: C.bg } }));
 * ```
 */
export function useStyles<T extends object>(factory: () => T): T {
  const theme = useTheme();
  // `theme` comme dépendance : les styles sont recréés à chaque changement de palette.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(factory, [theme]);
}
