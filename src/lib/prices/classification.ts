/**
 * Classification géographique/sectorielle des lignes pour les suggestions de diversification
 * (voir `diversification.ts`). Par ordre de préférence (gratuit/précis avant payant/limité) :
 * 1. CoinGecko → catégorie pour les lignes crypto (déjà utilisé pour les cours).
 * 2. JustETF (web-scraping par ISIN) → look-through géographique et sectoriel complet pour ETF
 *    (pays, secteurs, top 10 positions, TER), et pays/secteur pour actions. Couvre l'ensemble
 *    des ETFs UCITS européens et actions internationales, gratuit, sans clé.
 * 3. Yahoo (recherche par ISIN ou ticker) → secteur d'une action individuelle, gratuit, sans clé.
 * 4. Alpha Vantage (optionnel, clé utilisateur) → pour les actions/ETFs cotés US si JustETF/Yahoo
 *    n'ont rien donné.
 * 5. Table locale (`referenceEtfs.ts`, aucun réseau) → dernier recours hors-ligne pour les ETF
 *    les plus courants.
 * 6. Préfixe ISIN → pays juridique de repli si aucune autre source géographique n'a répondu.
 */
import { ALPHA_VANTAGE_SECRET_KEY, getSecret } from '../secure';
import { useStore } from '../store';
import type { CountryCode, Holding } from '../types';
import { fetchAlphaVantageEtfProfile, fetchAlphaVantageOverview } from './alphavantage';
import { fetchCoinGeckoCategory } from './coingecko';
import { fetchJustEtfClassification } from './justetf';
import { referenceEtfForIsin } from './referenceEtfs';
import { normalizeSector } from './sectors';
import { searchYahooSymbol } from './yahoo';

const ISIN_COUNTRY: Partial<Record<string, CountryCode>> = {
  FR: 'FR',
  DE: 'DE',
  IT: 'IT',
  ES: 'ES',
  NL: 'NL',
  BE: 'BE',
  LU: 'LU',
  IE: 'IE',
  GB: 'GB',
  US: 'US',
  CA: 'CA',
  JP: 'JP',
  CN: 'CN',
  CH: 'CH',
  AU: 'AU',
  TW: 'TW',
  KR: 'KR',
  IN: 'IN',
  BR: 'BR',
  SE: 'SE',
  DK: 'DK',
  NO: 'NO',
};

/** Pays depuis le préfixe ISIN. `undefined` si l'ISIN est absent/invalide (vraiment inconnu) ;
 * `'autre'` si le préfixe est valide mais hors de la liste des pays courants couverts. */
export function countryFromIsin(isin: string | undefined): CountryCode | undefined {
  const prefix = isin?.trim().slice(0, 2).toUpperCase();
  if (!prefix || !/^[A-Z]{2}$/.test(prefix)) return undefined;
  return ISIN_COUNTRY[prefix] ?? 'autre';
}

const AV_COUNTRY_NAMES: Record<string, CountryCode> = {
  FRANCE: 'FR',
  GERMANY: 'DE',
  ITALY: 'IT',
  SPAIN: 'ES',
  NETHERLANDS: 'NL',
  BELGIUM: 'BE',
  LUXEMBOURG: 'LU',
  IRELAND: 'IE',
  'UNITED KINGDOM': 'GB',
  SWITZERLAND: 'CH',
  USA: 'US',
  'UNITED STATES': 'US',
  CANADA: 'CA',
  JAPAN: 'JP',
  CHINA: 'CN',
  AUSTRALIA: 'AU',
  TAIWAN: 'TW',
  'SOUTH KOREA': 'KR',
  INDIA: 'IN',
  BRAZIL: 'BR',
  SWEDEN: 'SE',
  DENMARK: 'DK',
  NORWAY: 'NO',
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

export async function classifyHoldings(options?: { forceAll?: boolean }): Promise<ClassifyResult> {
  const errors: string[] = [];
  let classified = 0;

  const { holdings, upsertHolding } = useStore.getState();
  const pending = holdings.filter(
    (h) => options?.forceAll || !h.classifiedAt || (!h.sectorWeights && !!h.isin?.trim()),
  );
  if (pending.length === 0) return { classified: 0, errors: [] };

  const apiKey = (await getSecret(ALPHA_VANTAGE_SECRET_KEY))?.trim() || null;
  let avCallsUsed = 0;

  for (const h of pending) {
    const isCrypto = h.priceSource === 'coingecko' && !!h.symbol?.trim();
    let country = countryFromIsin(h.isin);
    let sectorWeights: Holding['sectorWeights'];
    let source: Holding['classificationSource'] | undefined = country ? 'isin' : undefined;

    let holdingHasError = false;

    if (isCrypto) {
      try {
        const category = await fetchCoinGeckoCategory(h.symbol!.toLowerCase().trim());
        if (category) {
          sectorWeights = [{ sector: 'crypto', weight: 1 }];
          source = 'coingecko';
        }
      } catch (e: any) {
        errors.push(`${h.name} : ${e?.message ?? e}`);
        holdingHasError = true;
      }
      
      const isDeferred = !sectorWeights && holdingHasError;
      upsertHolding({ ...h, country, sectorWeights, classificationSource: source, classifiedAt: isDeferred ? h.classifiedAt : new Date().toISOString() });
      if (!isDeferred) classified++;
      continue;
    }

    let countryWeights: Holding['countryWeights'];
    let topHoldings: Holding['topHoldings'];
    let feesPct = h.feesPct;
    let holdingError: string | undefined;

    // 1. JustETF : web-scraping en direct (look-through géographique et sectoriel réel pour ETF,
    // secteur et pays pour actions). Nécessite un ISIN.
    const isin = h.isin?.trim();
    if (isin) {
      try {
        const justEtf = await fetchJustEtfClassification(isin);
        if (justEtf) {
          if (justEtf.kind === 'etf') {
            if (justEtf.countryWeights.length > 0) countryWeights = justEtf.countryWeights;
            if (justEtf.sectorWeights.length > 0) sectorWeights = justEtf.sectorWeights;
            if (justEtf.topHoldings && justEtf.topHoldings.length > 0) topHoldings = justEtf.topHoldings;
            if (justEtf.feesPct !== undefined && feesPct === undefined) feesPct = justEtf.feesPct;
            if (justEtf.domicile) country = justEtf.domicile;
            source = 'justetf';
          } else if (justEtf.kind === 'stock') {
            if (justEtf.sectorWeights && justEtf.sectorWeights.length > 0) {
              sectorWeights = justEtf.sectorWeights;
            }
            if (justEtf.country) country = justEtf.country;
            source = 'justetf';
          }
        }
      } catch (e: any) {
        holdingError = e?.message ?? String(e);
      }
    }

    // 2. Yahoo (gratuit, sans clé) : si JustETF n'a pas trouvé de secteur.
    const yahooQuery = h.isin?.trim() || h.symbol?.trim();
    if (!sectorWeights && yahooQuery) {
      try {
        const best = (await searchYahooSymbol(yahooQuery))[0];
        if (best?.sector) {
          sectorWeights = [{ sector: normalizeSector(best.sector), weight: 1 }];
          source = 'yahoo';
        }
      } catch (e: any) {
        if (!holdingError) holdingError = e?.message ?? String(e);
      }
    }

    // 3. Alpha Vantage ensuite, seulement si JustETF + Yahoo n'ont rien donné
    // (et qu'une clé utilisateur est configurée).
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
        avCallsUsed++;
        await throttleAv();
        try {
          const etf = await fetchAlphaVantageEtfProfile(symbol, apiKey!);
          if (etf.sectorWeights.length > 0) {
            sectorWeights = etf.sectorWeights;
            source = 'alphavantage';
          }
        } catch (e: any) {
          if (!holdingError) holdingError = e?.message ?? String(e);
        }
      }
    }

    // 4. Dernier recours, sans réseau : table locale des ETF les plus courants (voir
    // `referenceEtfs.ts`), si toujours rien après JustETF + Yahoo + Alpha Vantage.
    if (!sectorWeights) {
      const ref = referenceEtfForIsin(h.isin);
      if (ref) {
        sectorWeights = ref.sectorWeights;
        if (ref.countryWeights) countryWeights = ref.countryWeights;
        else if (ref.singleCountry) country = ref.singleCountry;
        source = 'reference';
      }
    }

    // Si on a trouvé un secteur ou des pays, la ligne est classée avec succès
    if (sectorWeights || countryWeights) {
      deferred = false;
    } else if (holdingError) {
      // Échec complet avec erreur réseau
      errors.push(`${h.name} : ${holdingError}`);
      deferred = true;
    }

    upsertHolding({
      ...h,
      country,
      countryWeights,
      sectorWeights,
      topHoldings,
      feesPct,
      classificationSource: source,
      classifiedAt: deferred ? h.classifiedAt : new Date().toISOString(),
    });
    if (!deferred) classified++;
  }

  return { classified, errors };
}
