/** Tests des normalisations et heuristiques de classification des lignes
 *  (`src/lib/prices/classification.ts`, `sectors.ts`, `justetf.ts`, `referenceEtfs.ts`). */
import { describe, expect, it } from 'vitest';
import { countryFromIsin, needsClassification } from '@/lib/prices/classification';
import { normalizeSector } from '@/lib/prices/sectors';
import { normalizeJustEtfCountry } from '@/lib/prices/justetf';
import { referenceEtfForIsin } from '@/lib/prices/referenceEtfs';
import { holding } from './factories';

const daysFromNow = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

describe('countryFromIsin', () => {
  it('lit le pays sur le préfixe de l’ISIN', () => {
    expect(countryFromIsin('FR0010315770')).toBe('FR');
    expect(countryFromIsin('US0378331005')).toBe('US');
    expect(countryFromIsin('IE00B4L5Y983')).toBe('IE');
  });

  it('tolère espaces et minuscules', () => {
    expect(countryFromIsin('  fr0010315770 ')).toBe('FR');
  });

  it('classe en « autre » un préfixe valide mais non couvert', () => {
    expect(countryFromIsin('XS1234567890')).toBe('autre');
  });

  it('est indéfini (et non « autre ») sur un ISIN absent ou invalide', () => {
    expect(countryFromIsin(undefined)).toBeUndefined();
    expect(countryFromIsin('')).toBeUndefined();
    expect(countryFromIsin('12345')).toBeUndefined();
    expect(countryFromIsin('F')).toBeUndefined();
  });
});

describe('needsClassification', () => {
  it('classe toute ligne jamais traitée', () => {
    expect(needsClassification(holding({ accountId: 'a' }))).toBe(true);
  });

  it('laisse tranquille une ligne déjà classée avec succès', () => {
    const h = holding({
      accountId: 'a',
      classifiedAt: '2024-01-01T00:00:00.000Z',
      sectorWeights: [{ sector: 'technology', weight: 1 }],
    });
    expect(needsClassification(h)).toBe(false);
  });

  it('respecte le cooldown après un échec de toutes les sources', () => {
    const h = holding({
      accountId: 'a',
      isin: 'FR0010315770',
      classifiedAt: '2024-01-01T00:00:00.000Z',
      classificationRetryAfter: daysFromNow(7),
    });
    expect(needsClassification(h)).toBe(false);
  });

  it('retente une fois le cooldown expiré', () => {
    const h = holding({
      accountId: 'a',
      isin: 'FR0010315770',
      classifiedAt: '2024-01-01T00:00:00.000Z',
      classificationRetryAfter: daysFromNow(-1),
    });
    expect(needsClassification(h)).toBe(true);
  });

  it('ne retente pas une ligne sans ISIN (aucune source interrogeable)', () => {
    const h = holding({ accountId: 'a', classifiedAt: '2024-01-01T00:00:00.000Z' });
    expect(needsClassification(h)).toBe(false);
    expect(needsClassification(holding({ accountId: 'a', classifiedAt: '2024-01-01T00:00:00.000Z', isin: '   ' }))).toBe(
      false
    );
  });

  it('force tout en mode « reclassifier toutes les lignes »', () => {
    const h = holding({
      accountId: 'a',
      classifiedAt: '2024-01-01T00:00:00.000Z',
      sectorWeights: [{ sector: 'technology', weight: 1 }],
      classificationRetryAfter: daysFromNow(7),
    });
    expect(needsClassification(h, true)).toBe(true);
  });
});

describe('normalizeSector', () => {
  it('normalise les taxonomies anglaises', () => {
    expect(normalizeSector('Technology')).toBe('technology');
    expect(normalizeSector('Information Technology')).toBe('technology');
    expect(normalizeSector('Consumer Cyclical')).toBe('consumer_discretionary');
    expect(normalizeSector('Consumer Defensive')).toBe('consumer_staples');
    expect(normalizeSector('Financial Services')).toBe('financials');
    expect(normalizeSector('Health Care')).toBe('healthcare');
    expect(normalizeSector('Basic Materials')).toBe('materials');
    expect(normalizeSector('Communication Services')).toBe('communication');
  });

  it('normalise les libellés français, accentués ou non', () => {
    expect(normalizeSector('Santé')).toBe('healthcare');
    expect(normalizeSector('Sante')).toBe('healthcare');
    expect(normalizeSector('Énergie')).toBe('energy');
    expect(normalizeSector('Energie')).toBe('energy');
    expect(normalizeSector('Immobilier')).toBe('real_estate');
    expect(normalizeSector('Services financiers')).toBe('financials');
  });

  it('reconnaît la crypto', () => {
    expect(normalizeSector('crypto')).toBe('crypto');
    expect(normalizeSector('Cryptomonnaies')).toBe('crypto');
  });

  it('est insensible à la casse et aux espaces de bord', () => {
    expect(normalizeSector('  uTiLiTiEs  ')).toBe('utilities');
  });

  it('retombe sur « other » pour l’inconnu ou l’absent', () => {
    expect(normalizeSector(undefined)).toBe('other');
    expect(normalizeSector('')).toBe('other');
    expect(normalizeSector('Secteur inventé')).toBe('other');
  });
});

describe('normalizeJustEtfCountry', () => {
  it('reconnaît les libellés anglais, français et allemands', () => {
    expect(normalizeJustEtfCountry('United States')).toBe('US');
    expect(normalizeJustEtfCountry('Vereinigte Staaten')).toBe('US');
    expect(normalizeJustEtfCountry('Germany')).toBe('DE');
    expect(normalizeJustEtfCountry('Allemagne')).toBe('DE');
    expect(normalizeJustEtfCountry('Deutschland')).toBe('DE');
    expect(normalizeJustEtfCountry('France')).toBe('FR');
  });

  it('gère les libellés accentués et leurs variantes sans accent', () => {
    expect(normalizeJustEtfCountry('Pérou')).toBe('PE');
    expect(normalizeJustEtfCountry('Perou')).toBe('PE');
    expect(normalizeJustEtfCountry('Émirats arabes unis')).toBe('AE');
    expect(normalizeJustEtfCountry('Emirats arabes unis')).toBe('AE');
  });

  it('écrase la casse et les espaces multiples', () => {
    expect(normalizeJustEtfCountry('  united   states ')).toBe('US');
  });

  it('retombe sur « autre » pour l’inconnu ou l’absent', () => {
    expect(normalizeJustEtfCountry(undefined)).toBe('autre');
    expect(normalizeJustEtfCountry('Sonstige')).toBe('autre');
    expect(normalizeJustEtfCountry('Pays imaginaire')).toBe('autre');
  });
});

describe('referenceEtfForIsin', () => {
  /** Un ISIN par entrée de la table de repli locale. */
  const KNOWN_ISINS = ['LU1681043599', 'FR0011871128', 'FR0013412020', 'FR0010655688', 'LU1829221024', 'FR0007052782'];

  it('retrouve un ETF connu hors ligne, quelle que soit la casse', () => {
    const ref = referenceEtfForIsin('LU1681043599'); // MSCI World
    expect(ref).toBeDefined();
    expect(referenceEtfForIsin('lu1681043599')).toBe(ref);
    expect(referenceEtfForIsin('  LU1681043599  ')).toBe(ref);
  });

  it('fait pointer les différentes parts d’un même fonds vers la même entrée', () => {
    // Amundi CW8, iShares WPEA et Amundi Core MWRD répliquent tous le MSCI World.
    const ref = referenceEtfForIsin('LU1681043599');
    expect(referenceEtfForIsin('IE0002XZSHO1')).toBe(ref);
    expect(referenceEtfForIsin('IE000BI8OT95')).toBe(ref);
  });

  it('est indéfini pour un ISIN absent de la table', () => {
    expect(referenceEtfForIsin('FR0000000000')).toBeUndefined();
    expect(referenceEtfForIsin(undefined)).toBeUndefined();
    expect(referenceEtfForIsin('')).toBeUndefined();
  });

  it('expose des pondérations sectorielles et géographiques normalisées à 1', () => {
    const sum = (list?: { weight: number }[]) => (list ?? []).reduce((s, w) => s + w.weight, 0);
    for (const isin of KNOWN_ISINS) {
      const ref = referenceEtfForIsin(isin);
      expect(ref, isin).toBeDefined();
      expect(sum(ref!.sectorWeights), isin).toBeCloseTo(1, 2);
      // Un indice mono-pays n'a pas de ventilation géographique détaillée.
      if (ref!.countryWeights) expect(sum(ref!.countryWeights), isin).toBeCloseTo(1, 2);
      else expect(ref!.singleCountry, isin).toBeDefined();
    }
  });
});
