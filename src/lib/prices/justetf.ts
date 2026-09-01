/**
 * Scraper JustETF.com (ETFs et Actions).
 * Récupère et analyse les pages publiques de JustETF pour extraire la composition
 * géographique look-through réelle, la ventilation sectorielle, les 10 principales
 * positions (top holdings), les frais de gestion (TER) et les métadonnées d'actions.
 */
import { Platform } from 'react-native';
import { logDebug } from '../debugLog';
import type { CountryCode, SectorKey } from '../types';
import { normalizeSector } from './sectors';

const TAG = 'justetf';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const CORS_PROXIES = [
  (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u: string) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
];

const JUSTETF_COUNTRY_MAP: Record<string, CountryCode> = {
  // English
  'UNITED STATES': 'US',
  USA: 'US',
  'UNITED KINGDOM': 'GB',
  UK: 'GB',
  'GREAT BRITAIN': 'GB',
  JAPAN: 'JP',
  FRANCE: 'FR',
  GERMANY: 'DE',
  SWITZERLAND: 'CH',
  CANADA: 'CA',
  CHINA: 'CN',
  AUSTRALIA: 'AU',
  TAIWAN: 'TW',
  'SOUTH KOREA': 'KR',
  KOREA: 'KR',
  INDIA: 'IN',
  NETHERLANDS: 'NL',
  'THE NETHERLANDS': 'NL',
  SPAIN: 'ES',
  ITALY: 'IT',
  IRELAND: 'IE',
  BELGIUM: 'BE',
  LUXEMBOURG: 'LU',
  BRAZIL: 'BR',
  SWEDEN: 'SE',
  DENMARK: 'DK',
  NORWAY: 'NO',
  OTHER: 'autre',

  // French
  'ÉTATS-UNIS': 'US',
  'ETATS-UNIS': 'US',
  'ROYAUME-UNI': 'GB',
  'GRANDE-BRETAGNE': 'GB',
  JAPON: 'JP',
  ALLEMAGNE: 'DE',
  SUISSE: 'CH',
  CHINE: 'CN',
  AUSTRALIE: 'AU',
  TAÏWAN: 'TW',
  'CORÉE DU SUD': 'KR',
  'COREE DU SUD': 'KR',
  INDE: 'IN',
  'PAYS-BAS': 'NL',
  ESPAGNE: 'ES',
  ITALIE: 'IT',
  IRLANDE: 'IE',
  BELGIQUE: 'BE',
  BRÉSIL: 'BR',
  BRESIL: 'BR',
  SUÈDE: 'SE',
  SUEDE: 'SE',
  DANEMARK: 'DK',
  NORVÈGE: 'NO',
  NORVEGE: 'NO',
  AUTRE: 'autre',

  // German
  DEUTSCHLAND: 'DE',
  SCHWEIZ: 'CH',
  VEREINIGTES_KÖNIGREICH: 'GB',
  VEREINIGTE_STAATEN: 'US',
  SÜDKOREA: 'KR',
  NIEDERLANDE: 'NL',
  SPANIEN: 'ES',
  ITALIEN: 'IT',
  IRLAND: 'IE',
  BELGIEN: 'BE',
  BRASILIEN: 'BR',
  SCHWEDEN: 'SE',
  DÄNEMARK: 'DK',
  NORWEGEN: 'NO',
  SONSTIGE: 'autre',
};

export function normalizeJustEtfCountry(raw: string | undefined): CountryCode {
  if (!raw) return 'autre';
  const key = raw.trim().toUpperCase().replace(/\s+/g, ' ');
  return JUSTETF_COUNTRY_MAP[key] ?? 'autre';
}

function cleanHtmlText(raw: string): string {
  return raw
    .replace(/&amp;/g, '&')
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, '')
    .trim();
}

function parsePct(raw: string): number {
  const cleaned = raw.replace(/\s+/g, '').replace(',', '.').replace('%', '');
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : 0;
}

export interface JustEtfTopHolding {
  isin?: string;
  name: string;
  weight: number; // 0 à 1
}

export interface JustEtfProfile {
  isin: string;
  name?: string;
  ter?: number; // % annuel (ex: 0.38)
  domicile?: CountryCode;
  countryWeights: { country: CountryCode; weight: number }[];
  sectorWeights: { sector: SectorKey; weight: number }[];
  topHoldings: JustEtfTopHolding[];
}

export interface JustEtfStockProfile {
  isin: string;
  name?: string;
  country?: CountryCode;
  sector?: SectorKey;
  marketCap?: string;
  dividendYield?: number; // % (ex: 2.87)
}

export type JustEtfClassification =
  | {
      kind: 'etf';
      isin: string;
      name?: string;
      feesPct?: number;
      countryWeights: { country: CountryCode; weight: number }[];
      sectorWeights: { sector: SectorKey; weight: number }[];
      topHoldings?: JustEtfTopHolding[];
      domicile?: CountryCode;
    }
  | {
      kind: 'stock';
      isin: string;
      name?: string;
      country?: CountryCode;
      sector?: SectorKey;
      sectorWeights?: { sector: SectorKey; weight: number }[];
      dividendYield?: number;
      marketCap?: string;
    };

const classificationCache = new Map<string, JustEtfClassification | null>();

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 4500,
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

async function fetchHtml(url: string, timeoutMs = 4500): Promise<string | null> {
  // 1. Sur environnement natif (iOS, Android, Electron Desktop) : appel direct sans CORS
  if (Platform.OS !== 'web') {
    try {
      logDebug(TAG, `GET ${url}`);
      const res = await fetchWithTimeout(
        url,
        {
          headers: {
            'User-Agent': USER_AGENT,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8',
          },
        },
        timeoutMs,
      );
      if (res.ok) {
        const html = await res.text();
        if (
          html &&
          (html.includes('etf-holdings_') ||
            html.includes('stock-title') ||
            html.includes('data-overview') ||
            html.includes('etf-basics_'))
        ) {
          return html;
        }
      }
    } catch (err: any) {
      logDebug(TAG, `Direct fetch ${url} failed or timed out: ${err?.message ?? err}`);
    }
    return null;
  }

  // 2. Sur navigateur Web (CORS imposé par le navigateur) : proxies gratuits
  const webProxies = [
    async (targetUrl: string) => {
      const res = await fetchWithTimeout(
        `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`,
        {},
        timeoutMs,
      );
      if (res.ok) {
        const json = await res.json();
        return typeof json?.contents === 'string' ? json.contents : null;
      }
      return null;
    },
    async (targetUrl: string) => {
      const res = await fetchWithTimeout(
        `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`,
        {},
        timeoutMs,
      );
      if (res.ok) {
        return res.text();
      }
      return null;
    },
  ];

  for (const proxyFn of webProxies) {
    try {
      const html = await proxyFn(url);
      if (
        html &&
        (html.includes('etf-holdings_') ||
          html.includes('stock-title') ||
          html.includes('data-overview') ||
          html.includes('etf-basics_'))
      ) {
        return html;
      }
    } catch (proxyErr: any) {
      logDebug(TAG, `Web proxy fetch failed or timed out: ${proxyErr?.message ?? proxyErr}`);
    }
  }

  return null;
}

/**
 * Scrape le profil d'un ETF sur JustETF par ISIN.
 */
export async function fetchJustEtfProfile(isin: string): Promise<JustEtfProfile | null> {
  const cleanIsin = isin.trim().toUpperCase();
  if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(cleanIsin)) return null;

  // 1. Tente la version anglaise, sinon française
  let html = await fetchHtml(`https://www.justetf.com/en/etf-profile.html?isin=${cleanIsin}`);
  if (!html || (!html.includes('etf-holdings_') && !html.includes('etf-basics_'))) {
    const frHtml = await fetchHtml(`https://www.justetf.com/fr/etf-profile.html?isin=${cleanIsin}`);
    if (frHtml && (frHtml.includes('etf-holdings_') || frHtml.includes('etf-basics_'))) {
      html = frHtml;
    }
  }

  if (!html) return null;

  // Vérifie si la page correspond bien à un profil ETF valide
  const titleMatch =
    html.match(/<h1[^>]*id="etf-title"[^>]*>([\s\S]*?)<\/h1>/i) ||
    html.match(/data-testid="etf-profile-header_etf-name"[^>]*>([\s\S]*?)<\/h1>/i);
  const name = titleMatch ? cleanHtmlText(titleMatch[1]) : undefined;

  // TER (% de frais)
  const terMatch =
    html.match(/data-testid="etf-profile-header_ter-value"[^>]*>([\d.,]+)%\s*p\.a\./i) ||
    html.match(/data-testid="tl_etf-basics_value_ter"[^>]*>([\d.,]+)%/i);
  const ter = terMatch ? parsePct(terMatch[1]) : undefined;

  // Domicile
  const domicileMatch = html.match(/data-testid="tl_etf-basics_value_domicile-country"[^>]*>([\s\S]*?)<\/td>/i);
  const domicile = domicileMatch ? normalizeJustEtfCountry(cleanHtmlText(domicileMatch[1])) : undefined;

  // Pays (look-through)
  const countryMatches = [
    ...html.matchAll(
      /<tr[^>]*data-testid="etf-holdings_countries_row"[^>]*>[\s\S]*?<td[^>]*data-testid="tl_etf-holdings_countries_value_name"[^>]*>([\s\S]*?)<\/td>[\s\S]*?<span[^>]*data-testid="tl_etf-holdings_countries_value_percentage"[^>]*>([\d.,]+)%<\/span>/gi,
    ),
  ];
  const rawCountries = countryMatches.map((m) => ({
    country: normalizeJustEtfCountry(cleanHtmlText(m[1])),
    weight: parsePct(m[2]) / 100,
  }));

  // Secteurs
  const sectorMatches = [
    ...html.matchAll(
      /<tr[^>]*data-testid="etf-holdings_sectors_row"[^>]*>[\s\S]*?<td[^>]*data-testid="tl_etf-holdings_sectors_value_name"[^>]*>([\s\S]*?)<\/td>[\s\S]*?<span[^>]*data-testid="tl_etf-holdings_sectors_value_percentage"[^>]*>([\d.,]+)%<\/span>/gi,
    ),
  ];
  const rawSectors = sectorMatches.map((m) => ({
    sector: normalizeSector(cleanHtmlText(m[1])),
    weight: parsePct(m[2]) / 100,
  }));

  // 10 principales positions
  const topHoldingsMatches = [
    ...html.matchAll(
      /<tr[^>]*data-testid="etf-holdings_top-holdings_row"[^>]*>[\s\S]*?<a[^>]*data-testid="tl_etf-holdings_top-holdings_link_name"[^>]*href="[^"]*\/stock-profiles\/([A-Z0-9]{12})"[^>]*>[\s\S]*?<span>([\s\S]*?)<\/span>[\s\S]*?<\/a>[\s\S]*?<span[^>]*data-testid="tl_etf-holdings_top-holdings_value_percentage"[^>]*>([\d.,]+)%<\/span>/gi,
    ),
  ];
  const topHoldings: JustEtfTopHolding[] = topHoldingsMatches.map((m) => ({
    isin: m[1],
    name: cleanHtmlText(m[2]),
    weight: parsePct(m[3]) / 100,
  }));

  // Agrège les pays identiques si présents
  const countryMap = new Map<CountryCode, number>();
  for (const c of rawCountries) {
    countryMap.set(c.country, (countryMap.get(c.country) ?? 0) + c.weight);
  }
  const countryWeights = Array.from(countryMap.entries())
    .map(([country, weight]) => ({ country, weight: Math.round(weight * 10000) / 10000 }))
    .filter((c) => c.weight > 0);

  // Agrège les secteurs identiques si présents
  const sectorMap = new Map<SectorKey, number>();
  for (const s of rawSectors) {
    sectorMap.set(s.sector, (sectorMap.get(s.sector) ?? 0) + s.weight);
  }
  const sectorWeights = Array.from(sectorMap.entries())
    .map(([sector, weight]) => ({ sector, weight: Math.round(weight * 10000) / 10000 }))
    .filter((s) => s.weight > 0);

  // Si on n'a trouvé ni pays ni secteur, la page n'est pas un profil ETF complet
  if (countryWeights.length === 0 && sectorWeights.length === 0 && !name) {
    return null;
  }

  return {
    isin: cleanIsin,
    name,
    ter,
    domicile,
    countryWeights,
    sectorWeights,
    topHoldings,
  };
}

/**
 * Scrape le profil d'une action individuelle sur JustETF par ISIN.
 */
export async function fetchJustEtfStockProfile(isin: string): Promise<JustEtfStockProfile | null> {
  const cleanIsin = isin.trim().toUpperCase();
  if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(cleanIsin)) return null;

  let html = await fetchHtml(`https://www.justetf.com/en/stock-profiles/${cleanIsin}`);
  if (!html || !html.includes('stock-title')) {
    const frHtml = await fetchHtml(`https://www.justetf.com/fr/stock-profiles/${cleanIsin}`);
    if (frHtml && frHtml.includes('stock-title')) {
      html = frHtml;
    }
  }

  if (!html) return null;

  const titleMatch = html.match(/<h1[^>]*id="stock-title"[^>]*>([\s\S]*?)<\/h1>/i);
  const name = titleMatch ? cleanHtmlText(titleMatch[1]) : undefined;

  // Extraction de la section data-overview
  const overviewMatch = html.match(/class="data-overview[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/i);
  const overviewHtml = overviewMatch ? overviewMatch[1] : html;

  const blocks = overviewHtml.split(/<div class="d-flex d-flex-column">/i);
  let country: CountryCode | undefined;
  let sector: SectorKey | undefined;
  let marketCap: string | undefined;
  let dividendYield: number | undefined;

  for (const block of blocks) {
    const valMatch = block.match(/<div class="val bold">([\s\S]*?)<\/div>/i);
    const rawVal = valMatch ? cleanHtmlText(valMatch[1]) : null;
    if (!rawVal) continue;

    if (/\b(?:Country|Pays)\b/i.test(block)) {
      country = normalizeJustEtfCountry(rawVal);
    } else if (/\b(?:Sector|Secteur)\b/i.test(block)) {
      sector = normalizeSector(rawVal);
    } else if (/\b(?:Market cap|Cap\. boursière)\b/i.test(block)) {
      marketCap = rawVal;
    } else if (/(?:Dividend|Rendement|Dividendes)/i.test(block)) {
      dividendYield = parsePct(rawVal);
    }
  }

  // Si pas de secteur dans l'overview, on regarde les labels
  if (!sector) {
    const labelsMatch = html.match(/class="pfofile-labels"[\s\S]*?>([\s\S]*?)<\/div>/i);
    if (labelsMatch) {
      const labelMatches = [...labelsMatch[1].matchAll(/<span[^>]*class="label[^"]*"[^>]*>([\s\S]*?)<\/span>/g)];
      for (const m of labelMatches) {
        const s = normalizeSector(cleanHtmlText(m[1]));
        if (s !== 'other') {
          sector = s;
          break;
        }
      }
    }
  }

  if (!name && !country && !sector) {
    return null;
  }

  return {
    isin: cleanIsin,
    name,
    country,
    sector,
    marketCap,
    dividendYield,
  };
}

/**
 * Tente d'abord le scraping ETF JustETF, puis le scraping Action JustETF.
 */
export async function fetchJustEtfClassification(isin: string): Promise<JustEtfClassification | null> {
  const cleanIsin = isin.trim().toUpperCase();
  if (!cleanIsin) return null;

  if (classificationCache.has(cleanIsin)) {
    return classificationCache.get(cleanIsin)!;
  }

  let result: JustEtfClassification | null = null;
  try {
    const etf = await fetchJustEtfProfile(cleanIsin);
    if (etf && (etf.sectorWeights.length > 0 || etf.countryWeights.length > 0)) {
      result = {
        kind: 'etf',
        isin: cleanIsin,
        name: etf.name,
        feesPct: etf.ter,
        countryWeights: etf.countryWeights,
        sectorWeights: etf.sectorWeights,
        topHoldings: etf.topHoldings,
        domicile: etf.domicile,
      };
    }
  } catch (err: any) {
    logDebug(TAG, `fetchJustEtfProfile(${cleanIsin}) failed: ${err?.message ?? err}`);
  }

  if (!result) {
    try {
      const stock = await fetchJustEtfStockProfile(cleanIsin);
      if (stock && (stock.sector || stock.country)) {
        result = {
          kind: 'stock',
          isin: cleanIsin,
          name: stock.name,
          country: stock.country,
          sector: stock.sector,
          sectorWeights: stock.sector ? [{ sector: stock.sector, weight: 1 }] : undefined,
          dividendYield: stock.dividendYield,
          marketCap: stock.marketCap,
        };
      }
    } catch (err: any) {
      logDebug(TAG, `fetchJustEtfStockProfile(${cleanIsin}) failed: ${err?.message ?? err}`);
    }
  }

  classificationCache.set(cleanIsin, result);
  return result;
}
