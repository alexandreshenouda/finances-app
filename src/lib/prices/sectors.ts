/**
 * Normalisation des libellés de secteur vers le `SectorKey` fermé de `types.ts`. Partagée
 * entre Yahoo (`sector` du résultat de recherche, ex : "Consumer Cyclical") et Alpha Vantage
 * (`Sector` de OVERVIEW, ex : "TECHNOLOGY" ; `sectors[].sector` de ETF_PROFILE, ex :
 * "INFORMATION TECHNOLOGY") — deux fournisseurs, deux casses, des taxonomies légèrement
 * différentes pour la même réalité, normalisées ici une seule fois.
 */
import type { SectorKey } from '../types';

const SECTOR_MAP: Record<string, SectorKey> = {
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
  'TRADE & SERVICES': 'consumer_discretionary',
  'CONSUMER STAPLES': 'consumer_staples',
  'CONSUMER DEFENSIVE': 'consumer_staples',
  INDUSTRIALS: 'industrials',
  MANUFACTURING: 'industrials',
  ENERGY: 'energy',
  'ENERGY & TRANSPORTATION': 'energy',
  MATERIALS: 'materials',
  'BASIC MATERIALS': 'materials',
  UTILITIES: 'utilities',
  'REAL ESTATE': 'real_estate',
  'REAL ESTATE & CONSTRUCTION': 'real_estate',
  'COMMUNICATION SERVICES': 'communication',
  TELECOMMUNICATIONS: 'communication',
  COMMUNICATIONS: 'communication',
};

export function normalizeSector(raw: string | undefined): SectorKey {
  if (!raw) return 'other';
  return SECTOR_MAP[raw.trim().toUpperCase()] ?? 'other';
}
