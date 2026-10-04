/** Tests de la détection de langue (`src/lib/i18n.ts`) et des libellés traduits (`types.ts`). */
import { afterEach, describe, expect, it } from 'vitest';
import { __setLocales } from './stubs/expo-localization';
import i18next, { detectDeviceLanguage } from '@/lib/i18n';
import fr from '@/i18n/locales/fr.json';
import en from '@/i18n/locales/en.json';
import de from '@/i18n/locales/de.json';
import { geocodeAddress } from '@/lib/prices/localValuation';
import {
  ACCOUNT_TYPE_COLORS,
  ACCOUNT_TYPE_COLORS_CLASSIQUE,
  ACCOUNT_TYPE_COLORS_OR,
  ACCOUNT_TYPE_LABELS,
  setAccountTypeColors,
} from '@/lib/types';

afterEach(async () => {
  __setLocales(null);
  setAccountTypeColors('or');
  await i18next.changeLanguage('fr');
});

describe('detectDeviceLanguage', () => {
  const lang = (languageCode: string | null) => {
    __setLocales([{ languageCode, languageTag: `${languageCode}-XX` }]);
    return detectDeviceLanguage();
  };

  it('reconnaît l’anglais et l’allemand, quelle que soit la casse', () => {
    expect(lang('en')).toBe('en');
    expect(lang('DE')).toBe('de');
  });

  it('retombe sur le français pour toute autre langue, ou sans langue', () => {
    expect(lang('fr')).toBe('fr');
    expect(lang('es')).toBe('fr');
    expect(lang(null)).toBe('fr');
  });

  it('retombe sur le français si l’appareil ne déclare aucune locale', () => {
    __setLocales([]);
    expect(detectDeviceLanguage()).toBe('fr');
  });
});

describe('libellés traduits (proxy)', () => {
  it('suivent la langue courante sans recalcul', async () => {
    const fr = ACCOUNT_TYPE_LABELS.livret;
    await i18next.changeLanguage('en');
    const en = ACCOUNT_TYPE_LABELS.livret;
    expect(fr).toBeTruthy();
    expect(en).toBeTruthy();
    expect(en).not.toBe(fr);
    expect(en).toBe(i18next.t('accountTypes.livret'));
  });
});

/** Chemins des feuilles (`section.cle`) d'un fichier de traduction. */
function leafKeys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? leafKeys(v, `${prefix}${k}.`) : [`${prefix}${k}`]
  );
}

describe('fichiers de traduction', () => {
  it('fr, en et de déclarent exactement les mêmes clés', () => {
    const frKeys = leafKeys(fr).sort();
    expect(leafKeys(en).sort()).toEqual(frKeys);
    expect(leafKeys(de).sort()).toEqual(frKeys);
  });

  it('les messages de src/lib suivent la langue courante', async () => {
    expect(await geocodeAddress('  ')).toEqual({ ok: false, error: 'Adresse manquante' });
    await i18next.changeLanguage('en');
    expect(await geocodeAddress('  ')).toEqual({ ok: false, error: 'Missing address' });
  });
});

describe('setAccountTypeColors', () => {
  it('recopie en place la palette du thème choisi', () => {
    const ref = ACCOUNT_TYPE_COLORS;
    setAccountTypeColors('classique');
    expect(ACCOUNT_TYPE_COLORS).toBe(ref);
    expect(ACCOUNT_TYPE_COLORS).toEqual(ACCOUNT_TYPE_COLORS_CLASSIQUE);
    setAccountTypeColors('or');
    expect(ACCOUNT_TYPE_COLORS).toEqual(ACCOUNT_TYPE_COLORS_OR);
  });
});
