/**
 * Classification géographique/sectorielle des lignes pour les suggestions de diversification
 * (voir `diversification.ts`). Par ordre de préférence (gratuit/précis avant payant/limité) :
 * 1. CoinGecko → catégorie pour les lignes crypto (déjà utilisé pour les cours).
 * 2. JustETF (web-scraping par ISIN) → look-through géographique et sectoriel complet pour ETF
 *    (pays, secteurs, top 10 positions, TER), et pays/secteur pour actions. Couvre l'ensemble
 *    des ETFs UCITS européens et actions internationales, gratuit, sans clé.
 * 3. Yahoo (recherche par ISIN ou ticker) → secteur d'une action individuelle, gratuit, sans clé.
 * 4. Table locale (`referenceEtfs.ts`, aucun réseau) → dernier recours hors-ligne pour les ETF
 *    les plus courants.
 * 5. Préfixe ISIN → pays juridique de repli si aucune autre source géographique n'a répondu.
 */
import { useStore } from '../store';
import type { CountryCode, Holding } from '../types';
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

    // 3. Dernier recours, sans réseau : table locale des ETF les plus courants (voir
    // `referenceEtfs.ts`), si toujours rien après JustETF + Yahoo.
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
    let deferred = false;
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
