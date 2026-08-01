/**
 * Indice des prix des logements anciens (France entière).
 *
 * Sert à réévaluer automatiquement un prix d'achat vers aujourd'hui :
 * valeur ≈ prix_achat × indice(aujourd'hui) / indice(date_achat).
 * Le calcul étant un RATIO, la base de l'indice est sans importance (elle s'annule).
 *
 * Une table est embarquée (seed, base 100 en 2015, moyennes annuelles ~ INSEE
 * « logements anciens ») pour fonctionner hors-ligne et dès le 1er lancement.
 * Elle est rafraîchie en ligne depuis FRED (série BIS, gratuit, sans clé) ;
 * l'échec (CORS sur Web, hors-ligne…) est silencieux et conserve le seed.
 */
import { useStore } from '../store';
import type { HousePricePoint } from '../types';

/** Point annuel daté au milieu d'année (moyenne annuelle centrée). */
const seedYear = (year: number, value: number): HousePricePoint => ({ date: `${year}-07-01`, value });

/**
 * Indice INSEE des prix des logements anciens, France entière, base 100 en 2015
 * (valeurs annuelles approchées ; affinées par le refresh en ligne).
 */
export const HOUSE_INDEX_SEED: HousePricePoint[] = [
  seedYear(2000, 52),
  seedYear(2001, 57),
  seedYear(2002, 63),
  seedYear(2003, 71),
  seedYear(2004, 81),
  seedYear(2005, 90),
  seedYear(2006, 98),
  seedYear(2007, 104),
  seedYear(2008, 104),
  seedYear(2009, 97),
  seedYear(2010, 103),
  seedYear(2011, 108),
  seedYear(2012, 107),
  seedYear(2013, 105),
  seedYear(2014, 102),
  seedYear(2015, 100),
  seedYear(2016, 102),
  seedYear(2017, 106),
  seedYear(2018, 109),
  seedYear(2019, 113),
  seedYear(2020, 119),
  seedYear(2021, 127),
  seedYear(2022, 134),
  seedYear(2023, 132),
  seedYear(2024, 128),
  seedYear(2025, 129),
];

/** Série active : celle rafraîchie en ligne si disponible, sinon le seed embarqué. */
export function houseIndexSeries(): HousePricePoint[] {
  const stored = useStore.getState().houseIndex;
  return stored && stored.length >= 2 ? stored : HOUSE_INDEX_SEED;
}

/**
 * Valeur de l'indice à une date donnée : interpolation linéaire entre les deux
 * points encadrants, clampée aux bornes (avant le 1er point / après le dernier).
 * Suppose une série triée par date croissante.
 */
export function houseIndexValueAt(series: HousePricePoint[], dateKey: string): number {
  if (series.length === 0) return 1;
  if (dateKey <= series[0].date) return series[0].value;
  const last = series[series.length - 1];
  if (dateKey >= last.date) return last.value;
  for (let i = 1; i < series.length; i++) {
    const b = series[i];
    if (dateKey <= b.date) {
      const a = series[i - 1];
      const ta = new Date(`${a.date}T12:00:00`).getTime();
      const tb = new Date(`${b.date}T12:00:00`).getTime();
      const t = new Date(`${dateKey}T12:00:00`).getTime();
      const f = tb === ta ? 0 : (t - ta) / (tb - ta);
      return a.value + (b.value - a.value) * f;
    }
  }
  return last.value;
}

const FRED_CSV = 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=QFRN628BIS';

/**
 * Rafraîchit l'indice depuis FRED et le persiste. Silencieux en cas d'échec
 * (le seed / dernier indice connu reste utilisé). Même contrat que refreshFxRates.
 */
export async function refreshHouseIndex(): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(FRED_CSV);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const csv = await res.text();
    const points: HousePricePoint[] = [];
    for (const line of csv.split('\n').slice(1)) {
      const [date, raw] = line.split(',');
      if (!date || !raw || raw.trim() === '.') continue;
      const value = parseFloat(raw);
      if (Number.isFinite(value) && value > 0) points.push({ date: date.trim(), value });
    }
    if (points.length < 2) throw new Error('série vide');
    points.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    useStore.getState().setHouseIndex(points);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: `Indice immobilier : ${e?.message ?? e}` };
  }
}
