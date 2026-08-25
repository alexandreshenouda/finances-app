/**
 * Classification géographique/sectorielle des lignes pour les suggestions de diversification
 * (voir `diversification.ts`). Par ordre de préférence (gratuit avant payant/limité) :
 * 1. ISIN → pays de l'émetteur (préfixe à 2 lettres), local, instantané, sans réseau.
 * 2. CoinGecko → catégorie pour les lignes crypto (déjà utilisé pour les cours).
 * 3. Yahoo (recherche par ISIN si connu, sinon par ticker) → secteur d'une action individuelle,
 *    gratuit, sans clé, sans crumb (contrairement à `quoteSummary`, verrouillé par Yahoo en
 *    2024). Ne donne jamais de secteur pour un ETF/fonds (pas de composition exposée par cette
 *    recherche).
 * 4. Alpha Vantage (optionnel, clé utilisateur) → seulement quand Yahoo n'a rien donné
 *    (typiquement un ETF/fonds) — AV n'accepte pas les ISIN en entrée (uniquement un ticker),
 *    donc pas d'usage possible avant l'étape 3. Sa couverture gratuite s'est confirmée limitée
 *    aux bourses américaines (`LISTING_STATUS` ne liste que AMEX/BATS/NASDAQ/NYSE/NYSE
 *    ARCA/NYSE MKT) : pour un ETF européen, cette étape échoue systématiquement.
 * 5. Table locale (`referenceEtfs.ts`, aucun réseau) → dernier recours pour les ETF les plus
 *    courants chez un investisseur français/européen, quand les quatre étapes précédentes n'ont
 *    rien donné.
 * Chaque ligne traitée est marquée `classifiedAt` pour ne jamais refaire un appel Alpha Vantage
 * (25 requêtes/jour) sur une ligne déjà tentée — sauf si l'appel Alpha Vantage a dû être différé
 * faute de quota : dans ce cas la ligne reste éligible à un prochain passage plutôt que de se
 * figer sur un résultat partiel (ISIN/Yahoo/table locale déjà tentés, mais pas Alpha Vantage).
 */
import { getSecret, ALPHA_VANTAGE_SECRET_KEY } from '../secure';
import { useStore } from '../store';
import type { CountryCode, Holding } from '../types';
import { fetchAlphaVantageEtfProfile, fetchAlphaVantageOverview } from './alphavantage';
import { fetchCoinGeckoCategory } from './coingecko';
import { referenceEtfForIsin } from './referenceEtfs';
import { normalizeSector } from './sectors';
import { searchYahooSymbol } from './yahoo';

const ISIN_COUNTRY: Partial<Record<string, CountryCode>> = {
  FR: 'FR', DE: 'DE', IT: 'IT', ES: 'ES', NL: 'NL', BE: 'BE', LU: 'LU', IE: 'IE',
  GB: 'GB', US: 'US', CA: 'CA', JP: 'JP', CN: 'CN', CH: 'CH',
};

/** Pays depuis le préfixe ISIN. `undefined` si l'ISIN est absent/invalide (vraiment inconnu) ;
 * `'autre'` si le préfixe est valide mais hors de la liste des pays courants couverts. */
export function countryFromIsin(isin: string | undefined): CountryCode | undefined {
  const prefix = isin?.trim().slice(0, 2).toUpperCase();
  if (!prefix || !/^[A-Z]{2}$/.test(prefix)) return undefined;
  return ISIN_COUNTRY[prefix] ?? 'autre';
}

const AV_COUNTRY_NAMES: Record<string, CountryCode> = {
  FRANCE: 'FR', GERMANY: 'DE', ITALY: 'IT', SPAIN: 'ES', NETHERLANDS: 'NL', BELGIUM: 'BE',
  LUXEMBOURG: 'LU', IRELAND: 'IE', 'UNITED KINGDOM': 'GB', SWITZERLAND: 'CH',
  USA: 'US', 'UNITED STATES': 'US', CANADA: 'CA', JAPAN: 'JP', CHINA: 'CN',
};

function countryFromAvName(raw: string | undefined): CountryCode | undefined {
  if (!raw) return undefined;
  return AV_COUNTRY_NAMES[raw.trim().toUpperCase()] ?? 'autre';
}

/** Nombre maximal d'appels Alpha Vantage par passage — garde une marge sous le quota
 * journalier gratuit (25/jour) même si l'utilisateur relance plusieurs fois dans la journée. */
const MAX_AV_CALLS = 20;

/** Alpha Vantage limite en plus à 1 requête/seconde (burst) — respecté ici en espaçant tout
 * appel réseau vers l'API, quel que soit le point d'appel (OVERVIEW ou ETF_PROFILE). */
const AV_MIN_INTERVAL_MS = 1100;
let lastAvCallAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function throttleAv(): Promise<void> {
  const wait = lastAvCallAt + AV_MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastAvCallAt = Date.now();
}

export interface ClassifyResult {
  classified: number;
  errors: string[];
}

export async function classifyHoldings(): Promise<ClassifyResult> {
  const errors: string[] = [];
  let classified = 0;

  const { holdings, upsertHolding } = useStore.getState();
  const pending = holdings.filter((h) => !h.classifiedAt);
  if (pending.length === 0) return { classified: 0, errors: [] };

  const apiKey = (await getSecret(ALPHA_VANTAGE_SECRET_KEY))?.trim() || null;
  let avCallsUsed = 0;

  for (const h of pending) {
    const isCrypto = h.priceSource === 'coingecko' && !!h.symbol?.trim();
    let country = countryFromIsin(h.isin);
    let sectorWeights: Holding['sectorWeights'];
    let source: Holding['classificationSource'] | undefined = country ? 'isin' : undefined;

    if (isCrypto) {
      try {
        const category = await fetchCoinGeckoCategory(h.symbol!.toLowerCase().trim());
        if (category) {
          sectorWeights = [{ sector: 'crypto', weight: 1 }];
          source = 'coingecko';
        }
      } catch (e: any) {
        errors.push(`${h.name} : ${e?.message ?? e}`);
      }
      upsertHolding({ ...h, country, sectorWeights, classificationSource: source, classifiedAt: new Date().toISOString() });
      classified++;
      continue;
    }

    let countryWeights: Holding['countryWeights'];

    // Yahoo d'abord (gratuit, sans clé) : par ISIN si connu (le plus précis — désambiguïse
    // la place de cotation), sinon par ticker existant.
    const yahooQuery = h.isin?.trim() || h.symbol?.trim();
    if (yahooQuery) {
      try {
        const best = (await searchYahooSymbol(yahooQuery))[0];
        if (best?.sector) {
          sectorWeights = [{ sector: normalizeSector(best.sector), weight: 1 }];
          source = 'yahoo';
        }
      } catch (e: any) {
        errors.push(`${h.name} : ${e?.message ?? e}`);
      }
    }

    // Alpha Vantage ensuite, seulement si Yahoo n'a rien donné (typiquement un ETF/fonds — Yahoo
    // ne fournit jamais de secteur dans ce cas) et qu'une clé est configurée. Si le quota est
    // épuisé pour ce passage, on ne fige pas la ligne : `deferred` la laisse éligible à un
    // prochain appui plutôt que de perdre le travail déjà fait (ISIN/Yahoo) sur un résultat
    // marqué définitif à tort.
    const wantsAv = !sectorWeights && !!apiKey && !!h.symbol?.trim();
    let deferred = false;
    if (wantsAv && avCallsUsed >= MAX_AV_CALLS) {
      deferred = true;
    } else if (wantsAv) {
      const symbol = h.symbol!.trim();
      avCallsUsed++;
      await throttleAv();
      try {
        const overview = await fetchAlphaVantageOverview(symbol, apiKey!);
        sectorWeights = [{ sector: overview.sector, weight: 1 }];
        country = countryFromAvName(overview.country) ?? country;
        source = 'alphavantage';
      } catch {
        // OVERVIEW ne couvre que les actions individuelles : un échec est attendu pour un
        // ETF, on retente alors via ETF_PROFILE avant d'abandonner.
        avCallsUsed++;
        await throttleAv();
        try {
          const etf = await fetchAlphaVantageEtfProfile(symbol, apiKey!);
          if (etf.sectorWeights.length > 0) {
            sectorWeights = etf.sectorWeights;
            source = 'alphavantage';
          }
        } catch (e: any) {
          errors.push(`${h.name} : ${e?.message ?? e}`);
        }
      }
    }

    // Dernier recours, sans réseau : table locale des ETF les plus courants (voir
    // `referenceEtfs.ts`), seulement si toujours rien après Yahoo + Alpha Vantage.
    if (!sectorWeights) {
      const ref = referenceEtfForIsin(h.isin);
      if (ref) {
        sectorWeights = ref.sectorWeights;
        if (ref.countryWeights) countryWeights = ref.countryWeights;
        else if (ref.singleCountry) country = ref.singleCountry;
        source = 'reference';
      }
    }

    // Un secteur trouvé par un autre moyen (Yahoo, table locale) rend le report Alpha Vantage
    // sans objet : la ligne est traitée, pas besoin de la retenter juste pour un Alpha Vantage
    // qui n'aurait de toute façon rien apporté de plus.
    if (sectorWeights) deferred = false;

    upsertHolding({
      ...h,
      country,
      countryWeights,
      sectorWeights,
      classificationSource: source,
      classifiedAt: deferred ? h.classifiedAt : new Date().toISOString(),
    });
    if (!deferred) classified++;
  }

  return { classified, errors };
}
