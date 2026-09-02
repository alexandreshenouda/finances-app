/**
 * Normalisation des libellés de secteur vers le `SectorKey` fermé de `types.ts`. Partagée
 * entre JustETF, Yahoo (`sector` du résultat de recherche, ex : "Consumer Cyclical") et CoinGecko
 * — différentes sources et taxonomies normalisées ici une seule fois.
 */
import type { SectorKey } from '../types';

const SECTOR_MAP: Record<string, SectorKey> = {
  // English
  TECHNOLOGY: 'technology',
  'INFORMATION TECHNOLOGY': 'technology',
  FINANCE: 'financials',
  FINANCIALS: 'financials',
  'FINANCIAL SERVICES': 'financials',
  HEALTHCARE: 'healthcare',
  'HEALTH CARE': 'healthcare',
  'LIFE SCIENCES': 'healthcare',
  'CONSUMER DISCRETIONARY': 'consumer_discretionary',
  'CONSUMER CYCLICAL': 'consumer_discretionary',
  'CONSUMER CYCLICALS': 'consumer_discretionary',
  'TRADE & SERVICES': 'consumer_discretionary',
  'CONSUMER STAPLES': 'consumer_staples',
  'CONSUMER NON-CYCLICALS': 'consumer_staples',
  'CONSUMER NON CYCLICALS': 'consumer_staples',
  'CONSUMER DEFENSIVE': 'consumer_staples',
  INDUSTRIALS: 'industrials',
  INDUSTRIAL: 'industrials',
  MANUFACTURING: 'industrials',
  ENERGY: 'energy',
  'ENERGY & TRANSPORTATION': 'energy',
  MATERIALS: 'materials',
  'BASIC MATERIALS': 'materials',
  UTILITIES: 'utilities',
  'REAL ESTATE': 'real_estate',
  'REAL ESTATE & CONSTRUCTION': 'real_estate',
  'COMMUNICATION SERVICES': 'communication',
  COMMUNICATION: 'communication',
  COMMUNICATIONS: 'communication',
  TELECOMMUNICATIONS: 'communication',
  TELECOMMUNICATION: 'communication',

  // French
  TECHNOLOGIE: 'technology',
  FINANCES: 'financials',
  'SERVICES FINANCIERS': 'financials',
  SANTÉ: 'healthcare',
  SANTE: 'healthcare',
  'SOINS DE SANTÉ': 'healthcare',
  'SOINS DE SANTE': 'healthcare',
  'CONSOMMATION DISCRÉTIONNAIRE': 'consumer_discretionary',
  'CONSOMMATION DISCRETIONNAIRE': 'consumer_discretionary',
  'CONSOMMATION CYCLIQUE': 'consumer_discretionary',
  'BIENS DE CONSOMMATION CYCLIQUES': 'consumer_discretionary',
  'CONSOMMATION DE BASE': 'consumer_staples',
  'CONSOMMATION NON CYCLIQUE': 'consumer_staples',
  'BIENS DE CONSOMMATION DE BASE': 'consumer_staples',
  'CONSOMMATION DÉFENSIVE': 'consumer_staples',
  INDUSTRIE: 'industrials',
  INDUSTRIES: 'industrials',
  'BIENS INDUSTRIELS': 'industrials',
  ÉNERGIE: 'energy',
  ENERGIE: 'energy',
  MATÉRIAUX: 'materials',
  MATERIAUX: 'materials',
  'MATIÈRES PREMIÈRES': 'materials',
  'MATIERES PREMIERES': 'materials',
  'SERVICES PUBLICS': 'utilities',
  'SERVICES AUX COLLECTIVITÉS': 'utilities',
  IMMOBILIER: 'real_estate',
  'SERVICES DE COMMUNICATION': 'communication',
  TÉLÉCOMMUNICATIONS: 'communication',

  // Crypto
  CRYPTO: 'crypto',
  CRYPTOACTIFS: 'crypto',
  CRYPTOMONNAIES: 'crypto',
};

export function normalizeSector(raw: string | undefined): SectorKey {
  if (!raw) return 'other';
  return SECTOR_MAP[raw.trim().toUpperCase()] ?? 'other';
}
