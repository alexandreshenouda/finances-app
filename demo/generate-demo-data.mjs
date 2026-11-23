#!/usr/bin/env node
/**
 * Générateur de données de démonstration (entièrement fictives) pour l'app Finances.
 *
 * Produit un fichier JSON au format de la sauvegarde (`AppData` de `src/lib/store.ts`), à
 * importer via Paramètres → Sauvegarde → « Importer depuis un fichier ». Sert aux captures
 * d'écran du README et à essayer l'app sans saisir ses propres comptes.
 *
 * Usage :
 *   node demo/generate-demo-data.mjs [sortie.json] [--today=YYYY-MM-DD] [--seed=N]
 *   (sortie par défaut : demo/demo-data.json ; date par défaut : aujourd'hui)
 *
 * Le foyer fictif : un couple à Lyon (deux salaires, ~5 150 €/mois nets), propriétaire d'un T3
 * acheté ~3 ans et demi plus tôt avec un prêt amortissable + un PTZ différé, un crédit auto,
 * un PEA alimenté chaque mois, une assurance-vie, un compte-titres d'actions US, un peu de
 * crypto en DCA, et des livrets réglementés.
 *
 * Tout est simulé jour par jour, puis réduit en snapshots comme l'app les enregistre :
 *  - les cours suivent un modèle à facteurs (marché mondial commun + part propre à chaque
 *    titre, crypto à part) entre un cours de départ et un cours « actuel » plausibles (pont
 *    brownien) ; une correction de marché d'environ −13 % est placée ~19 mois avant la date
 *    du jour ;
 *  - les quantités et les PRU ne sont pas saisis à la main : ils résultent des achats
 *    simulés (versements mensuels au PEA en titres entiers, DCA hebdomadaire en crypto,
 *    unités fractionnaires en assurance-vie) ;
 *  - dividendes calculés à partir des quantités détenues à la date de détachement ;
 *  - livrets : versements mensuels jusqu'au plafond, intérêts capitalisés au 1er janvier au
 *    taux de l'année ; fonds euros : rendement crédité au 1er janvier ;
 *  - compte courant : salaires le 28, prélèvements (crédits, épargne programmée, charges) à
 *    date fixe, dépenses quotidiennes bruitées, grosses dépenses saisonnières (vacances en
 *    juillet, taxe foncière en octobre) ; l'excédent part vers le LDDS (matelas de 5 000 €) puis le fonds euros, un
 *    passage sous 200 € est renfloué depuis le LDDS (puis le Livret A) ;
 *  - snapshots irréguliers (l'app n'en enregistre que les jours où elle est ouverte) :
 *    quasi quotidiens sur les dernières semaines, plus clairsemés avant.
 * Les montants du budget sont ceux qui pilotent le compte courant simulé, et les mensualités
 * des prêts sont recalculées avec la formule d'annuité : budget, comptes et crédits restent
 * cohérents entre eux.
 *
 * Simplifications assumées : taux de change EUR/USD fixe (celui par défaut de l'app), pas de
 * vente, frais de courtage ignorés, intérêts des livrets calculés sur le solde moyen annuel
 * plutôt que par quinzaine.
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ─── Arguments ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const opt = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const OUT = resolve(args.find((a) => !a.startsWith('--')) ?? resolve(dirname(fileURLToPath(import.meta.url)), 'demo-data.json'));
const TODAY_KEY = opt('today') ?? new Date().toISOString().slice(0, 10);
let seed = Number(opt('seed') ?? 20231);

// ─── Aléatoire reproductible ────────────────────────────────────────────────
function rnd() {
  // mulberry32
  seed = (seed + 0x6d2b79f5) | 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const round2 = (x) => Math.round(x * 100) / 100;

// ─── Dates (jours UTC entiers) ──────────────────────────────────────────────
const DAY = 86_400_000;
const toNum = (key) => Math.round(Date.parse(`${key}T00:00:00Z`) / DAY);
const toKey = (num) => new Date(num * DAY).toISOString().slice(0, 10);
const parts = (num) => {
  const d = new Date(num * DAY);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, day: d.getUTCDate(), dow: d.getUTCDay() };
};
/** Jour `day` du mois situé `months` mois avant/après `fromNum`. */
function monthDay(fromNum, months, day) {
  const { y, m } = parts(fromNum);
  return Math.round(Date.UTC(y, m - 1 + months, day) / DAY);
}
const iso = (num, h = 9) => new Date(num * DAY + h * 3_600_000).toISOString();

const TODAY = toNum(TODAY_KEY);
/** Début de l'historique suivi dans l'app (l'utilisateur l'a installée il y a ~34 mois). */
const START = monthDay(TODAY, -34, 8);
const D = TODAY - START;

// ─── Facteurs de marché (rendements log quotidiens, index 0 = START) ─────────
const dvol = (annual) => annual / Math.sqrt(365);
const world = new Array(D + 1).fill(0);
const crypto = new Array(D + 1).fill(0);
const crashAt = D - 580; // correction ~19 mois avant aujourd'hui
for (let d = 1; d <= D; d++) {
  world[d] = dvol(0.14) * gauss();
  if (d > crashAt && d <= crashAt + 16) world[d] -= 0.0085; // ≈ −13 % en deux semaines
  if (d > crashAt + 16 && d <= crashAt + 70) world[d] += 0.0016; // rebond partiel
  crypto[d] = 0.35 * world[d] + dvol(0.4) * gauss();
}

/**
 * Trajectoire de cours (index 0..D) allant de `start` (cours au début du suivi) à `now` :
 * rendement = beta × facteur + bruit propre, puis dérive corrigée uniformément pour que la
 * somme tombe juste (pont brownien) — les co-mouvements avec le marché sont conservés.
 */
function pricePath(start, now, { beta = 1, idio = 0.2, factor = world }) {
  const r = new Array(D + 1).fill(0);
  for (let d = 1; d <= D; d++) r[d] = beta * factor[d] + dvol(idio) * gauss();
  const fix = (Math.log(now / start) - r.reduce((a, b) => a + b, 0)) / D;
  for (let d = 1; d <= D; d++) r[d] += fix;
  const p = new Array(D + 1);
  p[D] = now;
  for (let d = D; d > 0; d--) p[d - 1] = p[d] * Math.exp(-r[d]);
  return p;
}

// ─── Modèle ─────────────────────────────────────────────────────────────────
const USD = 0.86; // = DEFAULT_FX_RATES.USD de l'app
let counter = 0;
const id = (prefix) => `demo-${prefix}-${(++counter).toString(36).padStart(3, '0')}`;
const accounts = [];
const holdings = [];
const snapshots = [];
const cashFlows = [];

/** Compte simulé : `cash` et `lines` évoluent jour par jour, `value(d)` est relevée chaque jour. */
function simAccount(meta, { opened = START, cash = 0 } = {}) {
  const acc = { id: id('acc'), currency: 'EUR', createdAt: iso(opened), ...meta };
  accounts.push(acc);
  return { acc, opened, cash, lines: [], values: new Map(), latent: new Map() };
}
function line(sim, spec) {
  const l = { qty: 0, cost: 0, ...spec };
  sim.lines.push(l);
  return l;
}
const fx = (l) => (l.currency === 'USD' ? USD : 1);
/** Achat de `qty` parts au cours du jour (le coût entre dans le PRU). */
function buy(sim, l, d, qty) {
  if (qty <= 0) return;
  const price = l.path[d];
  l.qty += qty;
  l.cost += qty * price;
  sim.cash -= qty * price * fx(l);
}
function flow(sim, d, kind, amount, extra = {}) {
  cashFlows.push({ id: id('cf'), accountId: sim.acc.id, date: toKey(START + d), kind, amount: round2(amount), ...extra });
}

// Classification (normalement remplie par JustETF / Yahoo) fournie d'avance : pas de
// requête réseau à l'ouverture de la Diversification.
const SECTORS_WORLD = [
  ['technology', 26.4], ['financials', 16.1], ['industrials', 10.9], ['healthcare', 9.8],
  ['consumer_discretionary', 9.9], ['communication', 8.2], ['consumer_staples', 5.6],
  ['energy', 3.6], ['materials', 3.4], ['utilities', 2.7], ['real_estate', 2.0], ['other', 1.4],
].map(([sector, weight]) => ({ sector, weight }));
const SECTORS_SP500 = [
  ['technology', 33.5], ['financials', 13.4], ['communication', 9.9], ['consumer_discretionary', 10.4],
  ['healthcare', 9.1], ['industrials', 8.4], ['consumer_staples', 5.0], ['energy', 2.9],
  ['utilities', 2.4], ['real_estate', 2.0], ['materials', 1.8], ['other', 1.2],
].map(([sector, weight]) => ({ sector, weight }));
const COUNTRIES_WORLD = [
  ['US', 71.2], ['JP', 5.1], ['GB', 3.4], ['CA', 3.0], ['FR', 2.6], ['CH', 2.4], ['DE', 2.3],
  ['AU', 1.7], ['NL', 1.3], ['SE', 0.9], ['DK', 0.6], ['IT', 0.7], ['ES', 0.7], ['autre', 4.1],
].map(([country, weight]) => ({ country, weight }));
const TOP_WORLD = [
  ['US67066G1040', 'NVIDIA Corp.', 5.3], ['US0378331005', 'Apple Inc.', 4.8], ['US5949181045', 'Microsoft Corp.', 4.3],
  ['US0231351067', 'Amazon.com Inc.', 2.7], ['US30303M1027', 'Meta Platforms Inc.', 1.9], ['US11135F1012', 'Broadcom Inc.', 1.6],
  ['US02079K3059', 'Alphabet Inc. A', 1.5], ['US02079K1079', 'Alphabet Inc. C', 1.3], ['US88160R1014', 'Tesla Inc.', 1.2],
  ['US46625H1005', 'JPMorgan Chase & Co.', 0.9],
].map(([isin, name, weight]) => ({ isin, name, weight }));
const TOP_SP500 = TOP_WORLD.map((h) => ({ ...h, weight: round2(h.weight * 1.36) }));
const CLASSIFIED = { classificationSource: 'justetf', classifiedAt: iso(TODAY - 5) };
const stock = (country, sector) => ({
  country, sectorWeights: [{ sector, weight: 100 }], countryWeights: [{ country, weight: 100 }],
  classificationSource: 'yahoo', classifiedAt: iso(TODAY - 5),
});

// ─── PEA (ouvert 7 ans avant, déjà garni au début du suivi) ─────────────────
const pea = simAccount({ name: 'PEA', type: 'pea', institution: 'Bourse Direct', openingDate: toKey(monthDay(TODAY, -92, 14)) }, { cash: 186 });
const cw8 = line(pea, {
  name: 'Amundi MSCI World UCITS ETF', symbol: 'CW8.PA', isin: 'LU1681043599', priceSource: 'yahoo', feesPct: 0.38,
  path: pricePath(438, 612.4, { beta: 1, idio: 0.02 }), sectorWeights: SECTORS_WORLD, countryWeights: COUNTRIES_WORLD, topHoldings: TOP_WORLD, ...CLASSIFIED,
});
const psp5 = line(pea, {
  name: 'Amundi PEA S&P 500 ESG', symbol: 'PSP5.PA', isin: 'FR0011871128', priceSource: 'yahoo', feesPct: 0.15,
  path: pricePath(36.2, 51.83, { beta: 1.08, idio: 0.04 }), sectorWeights: SECTORS_SP500, countryWeights: [{ country: 'US', weight: 100 }], topHoldings: TOP_SP500, ...CLASSIFIED,
});
const airLiquide = line(pea, { name: 'Air Liquide', symbol: 'AI.PA', isin: 'FR0000120073', priceSource: 'yahoo', path: pricePath(162, 176.9, { beta: 0.7, idio: 0.14 }), ...stock('FR', 'materials') });
const total = line(pea, { name: 'TotalEnergies', symbol: 'TTE.PA', isin: 'FR0000120271', priceSource: 'yahoo', path: pricePath(61.5, 57.42, { beta: 0.5, idio: 0.2 }), ...stock('FR', 'energy') });
const lvmh = line(pea, { name: 'LVMH', symbol: 'MC.PA', isin: 'FR0000121014', priceSource: 'yahoo', path: pricePath(745, 618.5, { beta: 1, idio: 0.26 }), ...stock('FR', 'consumer_discretionary') });
// Lignes héritées d'avant le suivi : PRU historiques, plus bas que les cours de départ.
Object.assign(cw8, { qty: 64, cost: 64 * 341.8 });
Object.assign(psp5, { qty: 150, cost: 150 * 29.4 });
Object.assign(airLiquide, { qty: 30, cost: 30 * 128.6 });
Object.assign(total, { qty: 85, cost: 85 * 51.2 });
const PEA_PRIOR_DEPOSITS = 34_500;
const PEA_MONTHLY = 500;
const LVMH_BUY_DAY = monthDay(START, 7, 12) - START;

// ─── Assurance-vie ──────────────────────────────────────────────────────────
const av = simAccount(
  { name: 'Assurance-vie', type: 'assurance_vie', institution: 'Linxea Spirit 2', openingDate: toKey(monthDay(TODAY, -113, 2)), fees: { managementPct: 0.5 } },
);
// Fonds euros : sans ISIN, l'app ne le classe pas (ni secteur ni pays) et ne le compte pas dans
// l'encours classable de la Diversification.
const fondsEuros = line(av, { name: 'Fonds euros Suravenir Rendement', priceSource: 'manual', unitValue: 18_400, classifiedAt: iso(TODAY - 5) });
const iwda = line(av, {
  name: 'iShares Core MSCI World UCITS ETF', symbol: 'IWDA.AS', isin: 'IE00B4L5Y983', priceSource: 'yahoo', feesPct: 0.2,
  path: pricePath(82.4, 109.6, { beta: 1, idio: 0.015 }), sectorWeights: SECTORS_WORLD, countryWeights: COUNTRIES_WORLD, topHoldings: TOP_WORLD, ...CLASSIFIED,
});
const comgest = line(av, {
  name: 'Comgest Monde C', isin: 'FR0000284020', priceSource: 'manual', feesPct: 1.95,
  path: pricePath(2510, 2890, { beta: 0.85, idio: 0.07 }),
  sectorWeights: [{ sector: 'technology', weight: 27 }, { sector: 'healthcare', weight: 24 }, { sector: 'consumer_staples', weight: 18 }, { sector: 'industrials', weight: 21 }, { sector: 'consumer_discretionary', weight: 10 }],
  countryWeights: [{ country: 'US', weight: 58 }, { country: 'FR', weight: 12 }, { country: 'JP', weight: 9 }, { country: 'NL', weight: 7 }, { country: 'autre', weight: 14 }],
  topHoldings: [{ isin: 'US5949181045', name: 'Microsoft Corp.', weight: 7.1 }, { isin: 'NL0010273215', name: 'ASML Holding', weight: 5.2 }, { isin: 'FR0000121014', name: 'LVMH', weight: 3.4 }],
  ...CLASSIFIED,
});
Object.assign(iwda, { qty: 118, cost: 118 * 66.9 });
Object.assign(comgest, { qty: 2.1, cost: 2.1 * 2405 });
const AV_MONTHLY_UC = 150;
/** Rendement net du fonds euros crédité au 1er janvier, par année écoulée. */
const FONDS_EUROS_RATE = { 2022: 0.022, 2023: 0.0275, 2024: 0.031, 2025: 0.028, 2026: 0.027 };

// ─── Compte-titres (actions US, ouvert 6 mois après le début du suivi) ────────
const ctoOpened = monthDay(START, 6, 3);
const cto = simAccount({ name: 'Compte-titres', type: 'cto', institution: 'Interactive Brokers' }, { opened: ctoOpened });
const aapl = line(cto, { name: 'Apple', symbol: 'AAPL', isin: 'US0378331005', currency: 'USD', priceSource: 'yahoo', path: pricePath(186, 268.4, { beta: 1.1, idio: 0.24 }), ...stock('US', 'technology') });
const msft = line(cto, { name: 'Microsoft', symbol: 'MSFT', isin: 'US5949181045', currency: 'USD', priceSource: 'yahoo', path: pricePath(372, 507.2, { beta: 1.05, idio: 0.22 }), ...stock('US', 'technology') });
const nvda = line(cto, { name: 'NVIDIA', symbol: 'NVDA', isin: 'US67066G1040', currency: 'USD', priceSource: 'yahoo', path: pricePath(49, 186.3, { beta: 1.5, idio: 0.42 }), ...stock('US', 'technology') });
/** Achats ponctuels : [jour depuis l'ouverture, ligne, quantité]. */
const CTO_TRADES = [[2, aapl, 10], [2, msft, 5], [95, nvda, 40], [240, aapl, 8], [410, msft, 4]];

// ─── Crypto (DCA hebdomadaire) ──────────────────────────────────────────────
const cryptoOpened = monthDay(START, 10, 15);
const kraken = simAccount({ name: 'Crypto', type: 'crypto', institution: 'Kraken' }, { opened: cryptoOpened });
const btc = line(kraken, { name: 'Bitcoin', symbol: 'bitcoin', priceSource: 'coingecko', path: pricePath(39_500, 81_200, { beta: 1, idio: 0.12, factor: crypto }), sectorWeights: [{ sector: 'crypto', weight: 100 }], classificationSource: 'coingecko', classifiedAt: iso(TODAY - 5) });
const eth = line(kraken, { name: 'Ethereum', symbol: 'ethereum', priceSource: 'coingecko', path: pricePath(2_150, 2_780, { beta: 1.1, idio: 0.2, factor: crypto }), sectorWeights: [{ sector: 'crypto', weight: 100 }], classificationSource: 'coingecko', classifiedAt: iso(TODAY - 5) });

// ─── Livrets ────────────────────────────────────────────────────────────────
const livretA = simAccount({ name: 'Livret A', type: 'livret', institution: 'Boursorama' }, { cash: 10_200 });
const ldds = simAccount({ name: 'LDDS', type: 'livret', institution: 'Boursorama' }, { cash: 1_800 });
const LIVRET_A_CEILING = 22_950;
const LDDS_CEILING = 12_000;
/** Le LDDS sert de matelas tampon (≤ 5 000 €) : au-delà, l'excédent part en assurance-vie. */
const LDDS_BUFFER = 5_000;
const LIVRET_A_MONTHLY = 150;
/** Taux du Livret A / LDDS (moyenne annuelle) ; au-delà, dernier taux connu. */
const LIVRET_RATE = { 2022: 0.0138, 2023: 0.0292, 2024: 0.03, 2025: 0.0229, 2026: 0.017 };
const rateOf = (table, year) => table[year] ?? table[Math.max(...Object.keys(table).map(Number).filter((y) => y <= year))] ?? 0.017;

// ─── Compte courant ─────────────────────────────────────────────────────────
const courant = simAccount({ name: 'Compte joint', type: 'courant', institution: 'Boursorama' }, { cash: 3_100 });

// ─── Immobilier & crédits ───────────────────────────────────────────────────
const purchase = monthDay(TODAY, -44, 20);
const property = {
  id: id('prop'), name: 'Appartement Lyon 7e', kind: 'appartement', address: '12 rue de Marseille, 69007 Lyon',
  purchasePrice: 289_000, purchaseCosts: 22_400, purchaseDate: toKey(purchase), surface: 67, valuationMode: 'local',
  geo: { inseeCode: '69387', postalCode: '69007', lat: 45.7497, lon: 4.8418, label: '12 Rue de Marseille 69007 Lyon' },
  // ~4 740 €/m² : ordre de grandeur des ventes DVF d'appartements dans le 7e.
  localEstimate: { pricePerM2: 4_740, sampleSize: 418, scope: 'commune', computedAt: iso(TODAY - 4, 18), dataThrough: toKey(monthDay(TODAY, -5, 1)).slice(0, 7) },
  currency: 'EUR', notes: 'T3 au 4e étage avec balcon, acheté en résidence principale.', createdAt: iso(START),
};
const loanStart = monthDay(purchase, 2, 5);
const loans = [
  { id: id('loan'), propertyId: property.id, name: 'Prêt immobilier', lender: 'Crédit Mutuel', principal: 236_000, annualRate: 3.45, termMonths: 300, startDate: toKey(loanStart), insuranceMonthly: 35.4, currency: 'EUR', createdAt: iso(START) },
  // PTZ : 5 ans de différé total, puis 15 ans d'amortissement.
  { id: id('loan'), propertyId: property.id, name: 'Prêt à taux zéro', lender: 'Crédit Mutuel', principal: 45_000, annualRate: 0, termMonths: 240, startDate: toKey(loanStart), steps: [{ months: 60, monthlyPayment: 0 }, { months: 180 }], currency: 'EUR', createdAt: iso(START) },
  { id: id('loan'), name: 'Crédit auto', lender: 'Cetelem', principal: 16_500, annualRate: 4.9, termMonths: 60, startDate: toKey(monthDay(START, 4, 5)), insuranceMonthly: 6.2, currency: 'EUR', notes: 'Peugeot e-208 d’occasion', createdAt: iso(monthDay(START, 4, 1)) },
];
const annuity = (P, ratePct, n) => (ratePct === 0 ? P / n : (P * (ratePct / 1200)) / (1 - (1 + ratePct / 1200) ** -n));
const loanPayment = (loan, num) => {
  const k = Math.round((num - toNum(loan.startDate)) / 30.44);
  if (k < 0 || k >= loan.termMonths) return 0;
  if (loan.steps) {
    if (k < loan.steps[0].months) return 0;
    return loan.principal / loan.steps[1].months;
  }
  return annuity(loan.principal, loan.annualRate, loan.termMonths) + (loan.insuranceMonthly ?? 0);
};

// ─── Budget (pilote aussi le compte courant simulé) ─────────────────────────
const budgetCreated = iso(monthDay(TODAY, -20, 3));
const B = (kind, label, amount, category, extra = {}) => ({ id: id('bud'), kind, label, amount, frequency: 'monthly', category, createdAt: budgetCreated, ...extra });
const budgetItems = [
  B('income', 'Salaire Camille', 2_850, 'salaire'),
  B('income', 'Salaire Julien', 2_300, 'salaire'),
  B('income', 'Prime annuelle', 3_400, 'salaire', { frequency: 'yearly' }),
  B('expense', 'Charges de copropriété', 540, 'logement', { frequency: 'quarterly', essential: true }),
  B('expense', 'Taxe foncière', 1_260, 'impots', { frequency: 'yearly', essential: true }),
  B('expense', 'Impôt sur le revenu (prélèvement à la source)', 0, 'impots', { essential: true }), // remplacé ci-dessous
  B('expense', 'Électricité & gaz', 112, 'energie', { essential: true }),
  B('expense', 'Courses', 680, 'alimentation', { essential: true }),
  B('expense', 'Recharge, transports en commun', 128, 'transport', { essential: true }),
  B('expense', 'Assurances habitation & auto', 81, 'assurance', { essential: true }),
  B('expense', 'Mutuelle', 58, 'sante', { essential: true }),
  B('expense', 'Box & forfaits mobiles', 54, 'telecom', { essential: false }),
  B('expense', 'Restaurants & sorties', 240, 'loisirs'),
  B('expense', 'Abonnements (streaming, sport)', 63, 'loisirs'),
  B('expense', 'Vacances', 3_200, 'loisirs', { frequency: 'yearly' }),
  B('expense', 'Vêtements & maison', 140, 'autre_depense'),
  B('expense', 'Cadeaux', 600, 'autre_depense', { frequency: 'yearly' }),
  B('saving', 'Virement PEA', PEA_MONTHLY, 'versement_investissement'),
  B('saving', 'Versement assurance-vie', AV_MONTHLY_UC, 'versement_investissement'),
  B('saving', 'Livret A', LIVRET_A_MONTHLY, 'versement_epargne'),
  B('saving', 'Achats crypto programmés', 150, 'versement_investissement'),
];
// Les salaires affichés sont nets d'impôt à la source : on retire la ligne fictive.
budgetItems.splice(budgetItems.findIndex((b) => b.amount === 0), 1);
const monthly = (b) => (b.frequency === 'monthly' ? b.amount : b.frequency === 'quarterly' ? b.amount / 3 : b.amount / 12);
const byLabel = (label) => budgetItems.find((b) => b.label === label).amount;
/** Dépenses courantes « au fil de l'eau » (hors prélèvements datés simulés à part). */
const DAILY_SPEND_MONTHLY = budgetItems
  .filter((b) => b.kind === 'expense' && b.frequency === 'monthly')
  .reduce((s, b) => s + b.amount, 0);

// ─── Simulation jour par jour ───────────────────────────────────────────────
const lastMonthDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
let lvmhBought = false;
const DIVIDENDS = [
  // [ligne, mois, jour, dividende par action]
  [airLiquide, 5, 19, 3.3], [total, 1, 6, 0.79], [total, 4, 3, 0.85], [total, 7, 2, 0.85], [total, 10, 2, 0.85],
  [lvmh, 4, 28, 7.5], [lvmh, 12, 4, 5.5],
];
let peaDeposits = PEA_PRIOR_DEPOSITS;
const livretFlows = { a: { sum: 0, days: 0 }, ldds: { sum: 0, days: 0 } };

for (let d = 0; d <= D; d++) {
  const num = START + d;
  const { y, m, day } = parts(num);

  // 1er janvier : intérêts des livrets (solde moyen de l'année écoulée) et du fonds euros.
  if (m === 1 && day === 1 && d > 0) {
    for (const [sim, acc] of [[livretA, livretFlows.a], [ldds, livretFlows.ldds]]) {
      const avg = acc.days ? acc.sum / acc.days : sim.cash;
      const interest = round2(avg * rateOf(LIVRET_RATE, y - 1) * Math.min(1, acc.days / 365));
      sim.cash += interest;
      flow(sim, d, 'interest', interest, { label: `Intérêts ${y - 1}` });
      acc.sum = 0;
      acc.days = 0;
    }
    const fe = round2(fondsEuros.unitValue * rateOf(FONDS_EUROS_RATE, y - 1) * 0.995);
    fondsEuros.unitValue += fe;
    flow(av, d, 'interest', fe, { label: `Participation aux bénéfices ${y - 1}` });
  }

  // ── Compte courant : salaires, prime, prélèvements, dépenses ────────────
  const isPayday = day === Math.min(28, lastMonthDay(y, m));
  if (isPayday) courant.cash += byLabel('Salaire Camille') + byLabel('Salaire Julien') + 40 * gauss();
  if (m === 3 && day === 28) courant.cash += byLabel('Prime annuelle');
  if (day === 5) for (const loan of loans) courant.cash -= loanPayment(loan, num);
  if (day === 10 && m % 3 === 1) courant.cash -= byLabel('Charges de copropriété');
  if (m === 10 && day === 15) courant.cash -= byLabel('Taxe foncière');
  if (m === 7 && day === 20) courant.cash -= byLabel('Vacances') * (0.85 + 0.3 * rnd());
  if (m === 12 && day === 18) courant.cash -= byLabel('Cadeaux') * (0.8 + 0.4 * rnd());
  // Dépenses quotidiennes : plus fortes le week-end, bruit log-normal.
  const weekend = parts(num).dow % 6 === 0;
  courant.cash -= (DAILY_SPEND_MONTHLY / 30.4) * (weekend ? 1.45 : 0.82) * Math.exp(0.45 * gauss() - 0.1);

  // Livret A : virement programmé le 2, plafond respecté.
  if (day === 2) {
    const toA = Math.max(0, Math.min(LIVRET_A_MONTHLY, LIVRET_A_CEILING - livretA.cash));
    livretA.cash += toA;
    courant.cash -= toA;
    if (toA) flow(livretA, d, 'deposit', toA, { label: 'Virement programmé' });
  }

  // ── PEA : versement le 5 (achats le 7, voir plus bas) ──
  if (day === 5) {
    pea.cash += PEA_MONTHLY;
    courant.cash -= PEA_MONTHLY;
    peaDeposits += PEA_MONTHLY;
    flow(pea, d, 'deposit', PEA_MONTHLY, { label: 'Versement mensuel' });
  }
  // Achat le 7 de la ligne sous-pondérée (cible 70 % World / 30 % S&P 500), en titres
  // entiers : une part de World coûtant plus qu'un versement, le cash s'accumule parfois.
  if (day === 7) {
    const vW = cw8.qty * cw8.path[d];
    const vS = psp5.qty * psp5.path[d];
    const target = vW / (vW + vS) < 0.7 ? cw8 : psp5;
    buy(pea, target, d, Math.floor(pea.cash / target.path[d]));
  }
  if (d === LVMH_BUY_DAY && !lvmhBought) {
    pea.cash += 3_000;
    courant.cash -= 3_000;
    peaDeposits += 3_000;
    flow(pea, d, 'deposit', 3_000, { label: 'Versement exceptionnel' });
    buy(pea, lvmh, d, Math.floor(pea.cash / lvmh.path[d]));
    lvmhBought = true;
  }
  for (const [l, dm, dd, dps] of DIVIDENDS) {
    if (m === dm && day === dd && l.qty > 0) {
      const amount = l.qty * dps;
      pea.cash += amount;
      flow(pea, d, 'dividend', amount, { isin: l.isin, label: l.name });
    }
  }

  // ── Assurance-vie : versement programmé en UC le 10 (unités fractionnaires) ──
  if (day === 10) {
    courant.cash -= AV_MONTHLY_UC;
    const net = AV_MONTHLY_UC; // 0 % de frais de versement
    iwda.qty += net / iwda.path[d];
    iwda.cost += net;
    flow(av, d, 'deposit', AV_MONTHLY_UC, { label: 'Versement programmé' });
  }
  // Frais de gestion prélevés trimestriellement sur les UC (0,5 %/an).
  if (day === 1 && m % 3 === 1) {
    iwda.qty *= 1 - 0.005 / 4;
    comgest.qty *= 1 - 0.005 / 4;
  }

  // ── Compte-titres ───────────────────────────────────────────────────────
  if (num >= ctoOpened) {
    for (const [offset, l, qty] of CTO_TRADES) {
      if (num === ctoOpened + offset) {
        const need = qty * l.path[d] * USD - cto.cash + 50;
        if (need > 0) {
          const amount = Math.ceil(need / 100) * 100;
          cto.cash += amount;
          courant.cash -= amount;
          flow(cto, d, 'deposit', amount, { label: 'Virement' });
        }
        buy(cto, l, d, qty);
      }
    }
  }

  // ── Crypto : 25 € de BTC chaque lundi, 40 € d'ETH le 15 ───────────────
  if (num >= cryptoOpened) {
    if (num === cryptoOpened) {
      kraken.cash += 2_400;
      courant.cash -= 2_400;
      flow(kraken, d, 'deposit', 2_400, { label: 'Dépôt initial' });
      buy(kraken, btc, d, 1_400 / btc.path[d]);
      buy(kraken, eth, d, 1_000 / eth.path[d]);
    }
    if (parts(num).dow === 1) {
      courant.cash -= 25;
      kraken.cash += 25;
      buy(kraken, btc, d, 25 / btc.path[d]);
    }
    if (day === 15) {
      courant.cash -= 40;
      kraken.cash += 40;
      buy(kraken, eth, d, 40 / eth.path[d]);
    }
  }

  // ── Excédent du compte courant, la veille de la paie : vers le LDDS (sous plafond),
  //    jusqu'à 5 000 €, sinon le fonds euros, en gardant ~1 500 € de matelas ──
  if (day === 26 && courant.cash > 2_500) {
    const surplus = Math.floor((courant.cash - 1_500) / 100) * 100;
    const toLdds = Math.max(0, Math.min(surplus, Math.min(LDDS_BUFFER, LDDS_CEILING) - ldds.cash));
    ldds.cash += toLdds;
    if (toLdds) flow(ldds, d, 'deposit', toLdds, { label: 'Virement' });
    const toAv = surplus - toLdds;
    if (toAv > 0) {
      fondsEuros.unitValue += toAv;
      flow(av, d, 'deposit', toAv, { label: 'Versement libre (fonds euros)' });
    }
    courant.cash -= surplus;
  }

  // Découvert évité : virement depuis le LDDS (puis le Livret A) pour remonter à ~1 500 €.
  if (courant.cash < 200) {
    let need = Math.ceil((1_500 - courant.cash) / 100) * 100;
    for (const src of [ldds, livretA]) {
      const take = Math.min(need, Math.floor(src.cash / 100) * 100);
      if (take <= 0) continue;
      src.cash -= take;
      courant.cash += take;
      need -= take;
      flow(src, d, 'withdrawal', take, { label: 'Virement vers le compte joint' });
    }
  }

  livretFlows.a.sum += livretA.cash;
  livretFlows.a.days++;
  livretFlows.ldds.sum += ldds.cash;
  livretFlows.ldds.days++;

  // Relevé des valeurs du jour.
  for (const sim of [courant, livretA, ldds, pea, av, cto, kraken]) {
    if (num < sim.opened) continue;
    const lines = sim.lines.reduce((s, l) => s + (l.unitValue ?? l.qty * l.path[d]) * fx(l), 0);
    sim.values.set(d, sim.cash + lines);
    // +/- value latente des lignes avec PRU (pas le fonds euros), comme `accountGain` de l'app.
    const priced = sim.lines.filter((l) => l.unitValue === undefined && l.qty > 0 && l.cost > 0);
    if (priced.length > 0) {
      const cost = priced.reduce((s, l) => s + l.cost * fx(l), 0);
      const gain = priced.reduce((s, l) => s + (l.qty * l.path[d] - l.cost) * fx(l), 0);
      sim.latent.set(d, { gain: round2(gain), cost: round2(cost) });
    }
  }
}

// ─── Snapshots : irréguliers, comme une app qu'on n'ouvre pas tous les jours ──
for (const sim of [courant, livretA, ldds, pea, av, cto, kraken]) {
  for (const [d, value] of sim.values) {
    const age = D - d;
    const first = START + d === sim.opened;
    const keep = first || age === 0 || (age < 21 ? rnd() < 0.85 : age < 120 ? rnd() < 0.45 : rnd() < 0.22);
    if (keep) {
      snapshots.push({ id: id('snap'), accountId: sim.acc.id, date: toKey(START + d), value: round2(value), source: 'auto', ...sim.latent.get(d) });
    }
  }
}

// ─── Lignes et soldes finaux ────────────────────────────────────────────────
for (const sim of [pea, av, cto, kraken]) {
  for (const l of sim.lines) {
    const { path, qty, cost, unitValue, ...rest } = l;
    const h = { id: id('hold'), accountId: sim.acc.id, ...rest };
    // Les pondérations sont écrites en % ci-dessus pour la lisibilité ; l'app les stocke en
    // fractions (0..1), comme le scraper JustETF.
    for (const k of ['sectorWeights', 'countryWeights', 'topHoldings']) {
      if (h[k]) h[k] = h[k].map((w) => ({ ...w, weight: Math.round(w.weight * 100) / 10_000 }));
    }
    if (unitValue !== undefined) {
      Object.assign(h, { quantity: 1, unitPrice: round2(unitValue) });
    } else {
      const decimals = sim === kraken ? 8 : sim === av ? 4 : 0;
      const q = Math.round(qty * 10 ** decimals) / 10 ** decimals;
      if (q <= 0) continue;
      Object.assign(h, { quantity: q, unitPrice: round2(path[D]), buyPrice: round2(cost / qty), unitPriceDate: iso(TODAY, 17) });
    }
    holdings.push(h);
  }
}
for (const sim of [courant, livretA, ldds, pea, cto, kraken]) sim.acc.cashBalance = round2(sim.cash);
pea.acc.peaDeposits = Math.round(peaDeposits);

// ─── Objectifs (montants tirés du budget, comme « Reprendre les montants de mon budget ») ──
const income = budgetItems.filter((b) => b.kind === 'income').reduce((s, b) => s + monthly(b), 0);
const vital =
  budgetItems.filter((b) => b.kind === 'expense' && b.essential).reduce((s, b) => s + monthly(b), 0) +
  loans.reduce((s, l) => s + loanPayment(l, TODAY), 0);
const objectives = [
  { id: id('obj'), category: 'epargne_precaution', securityMonths: 6, monthlyExpenses: Math.round(vital / 10) * 10, monthlyIncome: Math.round(income / 10) * 10, createdAt: budgetCreated },
  { id: id('obj'), category: 'projet_court_terme', name: 'Voyage au Japon', targetAmount: 6_000, deadline: toKey(monthDay(TODAY, 10, 1)), createdAt: iso(monthDay(TODAY, -8, 12)) },
  { id: id('obj'), category: 'projet_long_terme', name: 'Indépendance financière', targetAmount: 650_000, deadline: toKey(monthDay(TODAY, 14 * 12, 1)), createdAt: budgetCreated },
];

const savedProjections = [
  {
    id: id('proj'), name: 'Prudent', description: '4 % / an, 1 200 € investis par mois, en euros constants',
    settings: { horizonYears: 15, rateMode: 'custom', customRatePct: 4, historicalPeriod: '1A', monthlyContribution: 1_200, annualFeesPct: 0.4, adjustForInflation: true, inflationRatePct: 2, net: true, includeRealEstate: true, realEstateGrowthPct: 1 },
  },
];

const data = {
  accounts, holdings, snapshots, connections: [], properties: [property], loans, objectives,
  savedProjections, budgetItems, cashFlows: cashFlows.sort((a, b) => (a.date < b.date ? -1 : 1)),
};
writeFileSync(OUT, `${JSON.stringify(data, null, 2)}\n`);

// ─── Résumé ─────────────────────────────────────────────────────────────────
const fmt = (x) => Math.round(x).toLocaleString('fr-FR');
console.log(`Données de démo au ${TODAY_KEY} → ${OUT}`);
for (const sim of [courant, livretA, ldds, pea, av, cto, kraken]) {
  console.log(`  ${sim.acc.name.padEnd(15)} ${fmt(sim.values.get(D)).padStart(9)} €  (${snapshots.filter((s) => s.accountId === sim.acc.id).length} snapshots)`);
}
console.log(`  revenus ${fmt(income)} €/mois, dépenses vitales ${fmt(vital)} €/mois, versements PEA ${fmt(peaDeposits)} €`);
console.log(`  ${holdings.length} lignes, ${cashFlows.length} flux, ${loans.length} prêts`);
