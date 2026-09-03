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
import { clearJustEtfCache, fetchJustEtfClassification } from './justetf';
import { referenceEtfForIsin } from './referenceEtfs';
import { normalizeSector } from './sectors';
import { searchYahooSymbol } from './yahoo';

/** Durée de cooldown (en ms) avant de re-tenter une classification qui a échoué sur toutes sources. */
const CLASSIFICATION_RETRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours

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

/**
 * Renvoie `true` si la holding doit être (re-)classifiée.
 * Exclut les holdings déjà traitées avec succès ou en période de cooldown.
 */
export function needsClassification(h: Holding, forceAll = false): boolean {
  if (forceAll) return true;

  // Jamais traitée → toujours à classer
  if (!h.classifiedAt) return true;

  // Cooldown actif après un échec total de toutes les sources → on attend
  if (h.classificationRetryAfter && new Date(h.classificationRetryAfter) > new Date()) {
    return false;
  }

  // Traitée avec succès (a déjà un secteur) → rien à faire
  if (h.sectorWeights) return false;

  // Traitée mais sans secteur et ISIN disponible → re-tenter (cooldown expiré ou absent)
  if (h.isin?.trim()) return true;

  return false;
}

export interface ClassifyResult {
  classified: number;
  errors: string[];
}

export async function classifyHoldings(options?: { forceAll?: boolean }): Promise<ClassifyResult> {
  const errors: string[] = [];
  let classified = 0;

  const { holdings, upsertHolding } = useStore.getState();
  const forceAll = options?.forceAll ?? false;
  if (forceAll) {
    clearJustEtfCache();
  }
  const pending = holdings.filter((h) => needsClassification(h, forceAll));
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
      // N'écrit dans le store que si quelque chose a changé
      const nowIso = new Date().toISOString();
      if (
        sectorWeights !== h.sectorWeights ||
        source !== h.classificationSource ||
        (!isDeferred && !h.classifiedAt)
      ) {
        upsertHolding({
          ...h,
          country,
          sectorWeights,
          classificationSource: source,
          classifiedAt: isDeferred ? h.classifiedAt : nowIso,
          // Réinitialise le cooldown si on a trouvé quelque chose
          classificationRetryAfter: sectorWeights ? undefined : h.classificationRetryAfter,
        });
      }
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

    // Succès si on a trouvé un secteur ou des pays
    const hasData = !!(sectorWeights || countryWeights);

    if (hasData) {
      // Trouvé — enregistre avec succès et réinitialise le cooldown
      upsertHolding({
        ...h,
        country,
        countryWeights,
        sectorWeights,
        topHoldings,
        feesPct,
        classificationSource: source,
        classifiedAt: new Date().toISOString(),
        classificationRetryAfter: undefined, // cooldown levé
      });
      classified++;
    } else if (holdingError) {
      // Erreur réseau — on reporte au prochain focus (pas de cooldown, l'erreur peut être transitoire)
      errors.push(`${h.name} : ${holdingError}`);
      // Ne pas écrire dans le store : laisse la holding inchangée pour re-tenter au prochain focus
    } else {
      // Aucune source n'a trouvé de données (ISIN inconnu de JustETF et Yahoo) : cooldown 7 jours
      // pour éviter de re-scraper à chaque focus.
      const retryAfter = new Date(Date.now() + CLASSIFICATION_RETRY_MS).toISOString();
      upsertHolding({
        ...h,
        country,
        classificationSource: source,
        classifiedAt: new Date().toISOString(),
        classificationRetryAfter: retryAfter,
      });
      // Ne compte pas comme "classifié" (pas de secteur trouvé)
    }
  }

  return { classified, errors };
}
