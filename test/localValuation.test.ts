/** Tests de l'estimation immobilière locale (`src/lib/prices/localValuation.ts`) :
 *  géocodage IGN puis prix/m² DVF pondéré par le nombre de ventes. `fetch` est simulé. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchLocalEstimate, geocodeAddress, LOCAL_MODE_KINDS } from '@/lib/prices/localValuation';
import type { PropertyGeo } from '@/lib/types';
import { json, mockFetch, networkError, text } from './http';

afterEach(() => vi.unstubAllGlobals());

const GEO: PropertyGeo = { inseeCode: '69123', lat: 45.76, lon: 4.83, label: 'Lyon' };

/** Série mensuelle DVF : `months` mois identiques. */
const rows = (months: number, row: Record<string, number | null>) =>
  Array.from({ length: months }, (_, i) => ({ d: `2024-${String((i % 12) + 1).padStart(2, '0')}`, ...row }));

describe('geocodeAddress', () => {
  it('refuse une adresse vide sans appel réseau', async () => {
    const calls = mockFetch([]);
    expect(await geocodeAddress('   ')).toEqual({ ok: false, error: 'Adresse manquante' });
    expect(calls).toHaveLength(0);
  });

  it('extrait code INSEE, code postal et coordonnées (GeoJSON = [lon, lat])', async () => {
    const calls = mockFetch([
      [
        'data.geopf.fr/geocodage/search',
        json({
          features: [
            {
              geometry: { coordinates: [2.35, 48.85] },
              properties: { citycode: '75104', postcode: '75004', label: '1 Rue de Rivoli 75004 Paris' },
            },
          ],
        }),
      ],
    ]);
    expect(await geocodeAddress(' 1 rue de Rivoli, Paris ')).toEqual({
      ok: true,
      geo: { inseeCode: '75104', postalCode: '75004', lat: 48.85, lon: 2.35, label: '1 Rue de Rivoli 75004 Paris' },
    });
    expect(calls[0].url).toContain(`q=${encodeURIComponent('1 rue de Rivoli, Paris')}&limit=1`);
  });

  it('reprend l’adresse saisie si le service ne renvoie pas de libellé', async () => {
    mockFetch([['geocodage', json({ features: [{ geometry: { coordinates: [1, 2] }, properties: { citycode: '01001' } }] })]]);
    const r = await geocodeAddress('quelque part');
    expect(r.ok && r.geo.label).toBe('quelque part');
  });

  it('signale une adresse introuvable', async () => {
    mockFetch([['geocodage', json({ features: [] })]]);
    expect(await geocodeAddress('nulle part')).toEqual({ ok: false, error: 'Géocodage : adresse introuvable' });
    mockFetch([['geocodage', json({ features: [{ geometry: { coordinates: [1] }, properties: { citycode: '1' } }] })]]);
    expect(await geocodeAddress('nulle part')).toEqual({ ok: false, error: 'Géocodage : adresse introuvable' });
  });

  it('traduit une panne réseau ou HTTP en message lisible', async () => {
    const msg = 'Géocodage : service de géocodage indisponible pour le moment, réessayez plus tard';
    mockFetch([['geocodage', networkError()]]);
    expect(await geocodeAddress('x')).toEqual({ ok: false, error: msg });
    mockFetch([['geocodage', text('', 503)]]);
    expect(await geocodeAddress('x')).toEqual({ ok: false, error: msg });
  });
});

describe('fetchLocalEstimate', () => {
  it('ne couvre que les appartements et maisons', async () => {
    expect(LOCAL_MODE_KINDS).toEqual(['appartement', 'maison']);
    const calls = mockFetch([]);
    expect(await fetchLocalEstimate(GEO, 'parking')).toEqual({
      ok: false,
      error: 'Ce type de bien n’est pas couvert par les ventes DVF',
    });
    expect(calls).toHaveLength(0);
  });

  it('pondère le prix/m² par le nombre de ventes sur les 12 derniers mois de la commune', async () => {
    // 18 mois : les 6 premiers (hors fenêtre) à 1 000 €/m², puis 12 mois alternant
    // 4 000 €/m² × 1 vente et 5 000 €/m² × 3 ventes.
    const data = [
      ...rows(6, { a: 10, m_a: 1_000 }),
      ...Array.from({ length: 12 }, (_, i) => (i % 2 ? { d: 'x', a: 3, m_a: 5_000 } : { d: 'x', a: 1, m_a: 4_000 })),
    ];
    const calls = mockFetch([['/commune/69123', json({ data })]]);
    const r = await fetchLocalEstimate(GEO, 'appartement');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 6 × (4 000 × 1) + 6 × (5 000 × 3) sur 6 × 1 + 6 × 3 ventes.
    expect(r.estimate.pricePerM2).toBeCloseTo((6 * 4_000 + 6 * 15_000) / 24, 10);
    expect(r.estimate.sampleSize).toBe(24);
    expect(r.estimate.scope).toBe('commune');
    expect(Date.parse(r.estimate.computedAt)).not.toBeNaN();
    expect(calls).toHaveLength(1);
  });

  it('lit les champs « maison » pour une maison et ignore les mois sans prix ou sans vente', async () => {
    const data = [
      { d: '2024-01', m: 4, m_m: 3_000, a: 50, m_a: 9_999 },
      { d: '2024-02', m: 0, m_m: 8_000 },
      { d: '2024-03', m: 3, m_m: null },
      { d: '2024-04', m: 2, m_m: 2_000 },
    ];
    mockFetch([['/commune/', json({ data })]]);
    const r = await fetchLocalEstimate(GEO, 'maison');
    expect(r.ok && r.estimate).toMatchObject({ pricePerM2: (4 * 3_000 + 2 * 2_000) / 6, sampleSize: 6, scope: 'commune' });
  });

  it('élargit à tout l’historique de la commune si les 12 derniers mois sont trop maigres', async () => {
    const data = [...rows(1, { a: 10, m_a: 2_000 }), ...rows(12, { a: 0, m_a: null })];
    const calls = mockFetch([['/commune/', json({ data })]]);
    const r = await fetchLocalEstimate(GEO, 'appartement');
    expect(r.ok && r.estimate).toMatchObject({ pricePerM2: 2_000, sampleSize: 10, scope: 'commune' });
    expect(calls).toHaveLength(1);
  });

  it('se rabat sur le département quand la commune a moins de 5 ventes', async () => {
    const calls = mockFetch([
      ['/commune/', json({ data: rows(3, { a: 1, m_a: 9_000 }) })],
      ['/departement/69', json({ data: rows(12, { a: 2, m_a: 3_500 }) })],
    ]);
    const r = await fetchLocalEstimate(GEO, 'appartement');
    expect(r.ok && r.estimate).toMatchObject({ pricePerM2: 3_500, sampleSize: 24, scope: 'departement' });
    expect(calls.map((c) => c.url.split('.gouv.fr')[1])).toEqual(['/commune/69123', '/departement/69']);
  });

  it('dérive le département des DOM (3 chiffres) et de la Corse (2A/2B)', async () => {
    const calls = mockFetch([
      ['/commune/', json({ data: [] })],
      ['/departement/', json({ data: rows(1, { a: 1, m_a: 1 }).concat(rows(1, { a: 9, m_a: 1 })) })],
    ]);
    await fetchLocalEstimate({ ...GEO, inseeCode: '97411' }, 'appartement');
    await fetchLocalEstimate({ ...GEO, inseeCode: '98818' }, 'appartement');
    await fetchLocalEstimate({ ...GEO, inseeCode: '2A004' }, 'appartement');
    expect(calls.filter((c) => c.url.includes('/departement/')).map((c) => c.url.split('/departement/')[1])).toEqual([
      '974',
      '988',
      '2A',
    ]);
  });

  it('échoue proprement si même le département manque de ventes', async () => {
    mockFetch([
      ['/commune/', json({})],
      ['/departement/', json({ data: 'invalide' })],
    ]);
    expect(await fetchLocalEstimate(GEO, 'maison')).toEqual({
      ok: false,
      error: 'Estimation locale : pas assez de ventes comparables disponibles, même à l’échelle du département',
    });
  });

  it('traduit une panne du service DVF en message lisible', async () => {
    mockFetch([['/commune/', text('', 500)]]);
    expect(await fetchLocalEstimate(GEO, 'maison')).toEqual({
      ok: false,
      error: 'Estimation locale : service DVF indisponible pour le moment, réessayez plus tard',
    });
  });
});
