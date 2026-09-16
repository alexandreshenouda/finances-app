# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Documentation update requirement (MANDATORY)
**Always update `README.md` (and any related documentation / `AGENTS.md`) whenever you implement, extend or modify features, settings, architecture patterns, or configuration options.** Keep documentation accurate and synchronized with the codebase in the same commit / PR.

# Architecture notes & constraints (read before touching related code)

## `experiments.reactCompiler` MUST stay `false` in app.json
Privacy mode (see below) masks money via a module-level flag read outside React's data
flow. The React Compiler memoizes JSX on visible deps only, can't see that flag, and
silently breaks masking in some components but not others. Do not re-enable it unless
masking is first rewritten to flow through props/context/store subscription.

## Privacy mode (mask amounts)
- Eye icon in every tab header (`src/components/PrivacyToggle.tsx`) toggles
  `store.privacyMode` (persisted).
- Masking itself lives in `src/lib/format.ts`: `formatMoney`/`formatEur` return `••••`
  when a module-level flag is on. The store pushes that flag via
  `useStore.subscribe((s) => setMaskedMoney(s.privacyMode))` in `store.ts` (avoids a
  store↔format import cycle).
- `formatPct` is never masked — percentages (gains, allocation, rates, ownership %,
  loan progress) always stay visible.
- **Any new screen that displays money must add `useStore((s) => s.privacyMode);`**
  (a bare subscription, value unused) so it re-renders when the toggle flips. Screens
  that only show quantities/percentages don't need it.

## Theming & dynamic styles (`useStyles`)
- The app supports two themes (`'or'` sombre/or by default, and `'classique'` bleu-ardoise),
  selectable in **Paramètres → Affichage** and persisted in `store.theme`.
- `C` in `src/constants/theme.ts` is mutable and updated by `setTheme(themeName)` via `useStore.subscribe`.
- `ACCOUNT_TYPE_COLORS` in `src/lib/types.ts` is also updated by `setAccountTypeColors(themeName)`.
- **Crucial React Native rule**: `StyleSheet.create` must NOT be called once at module scope with `C.*`
  values (which would freeze colors at module initialization time). Always wrap styles in a `makeStyles`
  factory function and call `const styles = useStyles(makeStyles);` inside each component. `useStyles`
  memoizes the StyleSheet on the active theme and recalculates automatically upon theme switch.
- **Themed dialogs & alerts**: `notify` and `confirmAction` in `src/lib/confirm.ts` do not use native OS/browser `Alert.alert` or `window.alert` (which break the dark/gold theme). They are backed by a zustand store and rendered by `<ThemedDialogContainer />` in `src/app/_layout.tsx`, using `Modal`, `C.card`, `C.border`, `C.text`, and `useStyles`.

## Ownership quote-part (SCI / indivision)
Both `Property.ownershipPct` and `Account.ownershipPct` (optional, `undefined` = 100%)
follow the same pattern: the raw/detail value is always shown in full, but only the
owned share is counted in aggregates (net worth totals, patrimoine series, allocation
by type). Helpers: `ownershipShare(property)` and `accountShare(account)`
(`src/lib/realestate.ts` / `src/lib/portfolio.ts`). `buildSeries` takes an optional
per-account `weights` map for this.

## Loans: immo (attached to a Property) vs conso (no property)
`Loan.propertyId` is now **optional** — absent means a standalone "prêt conso". A
dedicated **Emprunts** tab (`src/app/(tabs)/loans.tsx`) lists both kinds; the shared
rendering (progress, stats, phases, schedule chart) lives in
`src/components/LoanCard.tsx`, reused as-is by the property detail screen — don't
duplicate that card again. `loan-form.tsx` only shows the attachment picker
(bien/conso) when opened without a `propertyId` param (i.e. from the Emprunts tab);
opened from a property, attachment stays fixed to that property (no functionality was
removed from the real-estate flow). Conso debt is deducted from net worth via
`consoDebtEur()` regardless of the "show real estate" toggle.

Loans also support stepped/tiered payments (`Loan.steps`, `mensualités échelonnées`,
with deferral) in addition to constant monthly payments — see `realestate.ts`
(`loanStats`, `loanPhases`, `loanSchedule`) which simulates month-by-month rather than
closed-form.

## Tab icons & general UI theme
User rule: **all** UI added to this app (icons, screens, charts) must reuse the palette
in `src/constants/theme.ts` (`C`) and the primitives in `src/components/ui.tsx` — never
introduce ad-hoc colors. Tab/section icons are hand-drawn line-style SVGs via
`react-native-svg` (stroke-width 2, round caps, 24 viewBox), tinted by active/inactive
state — see `src/components/TabIcons.tsx`. UI text is in French.

Account types are centralized in `src/lib/types.ts`: adding one means extending
`AccountType` plus `ACCOUNT_TYPE_LABELS` / `ACCOUNT_TYPE_ORDER` / `ACCOUNT_TYPE_COLORS`
(the two `Record<AccountType, …>` maps make `tsc` list exactly what's missing). Every
screen derives from those three, so nothing else needs touching — only `immobilier`
has type-specific behaviour (ownership %). New colors must clear ≥3:1 contrast on the
`#0F172A` / `#0A0A0A` background and stay distinguishable from the existing hues.

## Logo & icon assets
Logo = the "Courbe" concept: a rising chart line (points 16,66 → 37,50 → 53,58 → 80,24,
stroke 7, round caps) with a faint area-fill gradient beneath and a green endpoint dot
(r8, bg-colored ring). Colors: accent `#5B8DEF`, gain-green `#34D399`, dark gradient bg
`#16233D`→`#0B1322`. In-app version: `src/components/Logo.tsx`, used as the Synthèse
header title. `app.json` splash + adaptive-icon backgrounds are `#0F172A`.

To regenerate the PNG assets in `assets/images/` (icon, favicon, adaptive
foreground/background/monochrome, splash lockup): use **`@resvg/resvg-js`** (npm,
prebuilt binary, no root needed) to rasterize SVG → PNG. **ImageMagick
(`convert`/`magick`) is unusable here** — its internal MSVG renderer silently drops
stroked/open paths and gradients, only filled shapes survive; `rsvg-convert` needs
sudo, usually unavailable. The splash wordmark ("Fin" bold + "ances" regular) is baked
in via resvg's font option loading Liberation Sans
(`/usr/share/fonts/truetype/liberation/LiberationSans-{Regular,Bold}.ttf`).

## Settings tab structure
`src/app/(tabs)/settings.tsx` is a menu screen linking to sub-screens (not nested
tabs): `connections.tsx`, `backup.tsx`, `display-settings.tsx` (default period for
charts/+/- value, `store.defaultPeriod`, and default chart mode `store.chartMode`),
`erase-history.tsx` (delete snapshots before a date or between two dates, per-account
or all — for fixing bad manual entries), `dev-tools.tsx` (connector debug log), a
"reclassify all holdings" action (`classifyHoldings({ forceAll: true })` clearing the
JustETF in-memory cache), and a "wipe all data" action with confirmation (`store.resetAll()`).

## Historical charts: Value vs Performance (%)
All historical curves (`src/app/(tabs)/index.tsx`, `src/app/account/[id].tsx`,
`src/app/property/[id].tsx`) support toggling between absolute value over time (currency)
and relative performance over time (in %).
- The mode (`'value' | 'percent'`) is stored in `store.chartMode` (persisted, default `'value'`).
- In `'percent'` mode, points are transformed via `toPerformanceSeries` (`src/lib/portfolio.ts`),
  starting at 0.0% at the beginning of the period.
- **The % transform alone is not enough**: `(v - base) / |base|` is *affine*, so with a y-axis
  auto-scaled to `[min, max]` of the plotted values the percent curve came out pixel-identical
  to the value curve. `LineChart` (`src/components/LineChart.tsx`) therefore, in `'percent'` mode:
  forces `0` into the y-domain (the 0 % reference is always on screen), anchors the area fill on
  `y(0)` instead of the chart bottom, and paints stroke + area through a hard-stop gradient at
  `y(0)` — the series `color` above 0 %, `C.negative` below. Same rule for the crosshair dot and
  the tooltip text. Keep the 0 in the domain if you touch that scale, or the two modes look alike again.
- SVG gradient ids are per-instance (`useId`) because several charts can share a page
  (Synthèse + `ProjectionCard`) and ids are document-global on web.
- The tooltip also shows `SeriesPoint.rawValue` (the currency amount behind the %), set by
  `toPerformanceSeries`.
- Under privacy mode, percentages remain visible while currency amounts are masked.

## Period chips
`PERIODS` includes `1J`/`1S` (day/week) in addition to the longer spans. Only
`PERIODS_PRIMARY` (5 entries) render as chips; the rest live behind a `···` dropdown
in `PeriodChips` (`src/components/ui.tsx`) — keep this split if adding new periods, the
dropdown exists so the chip row never grows past what fits on a phone screen.

## Trade Republic connector (`src/lib/connectors/traderepublic.ts`)
Unofficial, reverse-engineered API. Native-only (browser CORS blocks it), and every
sync needs a push approval in the TR app — no silent background sync.

**How to re-derive the protocol when TR changes it.** Do *not* guess topic names. The
web client at `https://app.traderepublic.com` ships the whole protocol in plain
(minified) JS: fetch `/`, crawl the `/assets/*.js` chunks it references, then grep. The
topic enum lives in the `analytics-*.js` chunk (search for `AccountPairs=`), and the
multi-account logic in `use-multi-portfolio-*.js`. This is how `accountPairs` was found
in minutes after blind topic-guessing led nowhere. A standalone Node script can replay
the whole flow (login → poll → WS) with no CORS restrictions, which is far faster than
rebuilding the app to test — cookies must be jarred manually from `set-cookie` and
passed as a `Cookie` header on the WS handshake.

**Envelopes.** `accountPairs` returns `{accounts:[{securitiesAccountNumber,
cashAccountNumber, productType}]}` where `productType` is `DEFAULT` (compte-titres) or
`TAX_WRAPPER` (**PEA**). Each envelope has its own securities *and* cash account and
must be queried separately — the `securitiesAccountNumber` at the root of
`GET /api/v2/auth/account` is the brokerage one **only**, so relying on it silently
drops the PEA entirely. The `origin:'pea'` tag seen in the web bundle is added
client-side after the fact; it is not in any server response.

**Positions.** `compactPortfolioByType` (and `V2`) take a `secAccNo` and group by
`categoryType` (`stocksAndETFs`, `privateMarkets`, `cryptos`, `bonds`, …). Fields are
`isin` + `netSize` + `name` — **not** `instrumentId`, which cost a silent-zero-holdings
bug; the parser deliberately accepts several field names and logs anything it skips
rather than dropping it quietly. `name` is in the payload, so no per-position
`instrument` subscription is needed. `compactPortfolio` and `portfolio` no longer exist
(`Unknown topic type`).

**Prices.** `ticker` id is `<isin>.<exchange>`; `LSX` is TR's default and covers stocks
and ETFs, but **not** private funds — `fetchPrice` falls back to the instrument's own
`exchangeIds` before giving up, and warns loudly instead of valuing a line at 0 €.

**Cash.** `cash` returns `[{accountNumber, currencyId, amount}]` for the main account
only; pass `{type:'cash', accountNumber}` to read a specific envelope's cash.

Accounts are emitted with stable literal `externalId`s (`traderepublic-main`,
`traderepublic-pea`, `traderepublic-private-markets`) so `persistExternalAccounts`
updates them in place instead of duplicating on every resync.

Full topic enum (93, from the web bundle) — useful if adding transactions history,
savings plans, PEA ceiling usage, etc.:

```
  L2                             accountPairs                   accruedInterestTermsRequired   addToWatchlist
  aggregateHistoryLight          aggregateHistoryLightV2        availableCash                  availableCashForPayout
  availableSize                  bondReturnV2                   bondValuationV2                cancelOrder
  cancelPriceAlarm               cancelSavingsPlan              cash                           changeOrder
  changeSavingsPlan              collection                     compactPortfolioByType         compactPortfolioByTypeV2
  confirmOrder                   createPriceAlarm               cryptoDetails                  cryptoPortfolioStatus
  customerPermissions            derivatives                    etfComposition                 etfDetails
  fincrimeBanner                 fixedIncomePortfolioStatus     fixedSavingsReturn             fixedSavingsValuation
  followWatchlist                frontendExperiment             homeInstrumentExchange         instrument
  instrumentExchange             instrumentSuitability          investableWatchlist            messageOfTheDay
  mutualFundComposition          mutualFundDetails              namedWatchlist                 neonCards
  neonNews                       neonSearch                     neonSearchAggregations         neonSearchSuggestedTags
  neonSearchTags                 newsSubscriptions              orderFeesV2                    orderUpdates
  orders                         performance                    portfolio                      portfolioStatus
  priceAlarmNotifications        priceAlarms                    priceForOrder                  priceForOrderV2
  privateMarketsOrders           privateMarketsPortfolioStatus  privateMarketsPositions        removeFromWatchlist
  savingsPlanParameters          savingsPlans                   savingsPlansV2                 settings
  simpleCreateOrder              stockDetailDividends           stockDetailKpis                stockDetails
  subscribeNews                  tape                           taxWrapperAccountUtilization   ticker
  tickerV3                       timeline                       timelineActions                timelineActionsV2
  timelineActivityLog            timelineDetail                 timelineDetailV2               timelineSavingsPlanOverview
  timelineTransactions           tradeAggregateHistory          tradingPerkConditionStatus     tradingStatus
  unfollowWatchlist              unsubscribeNews                watchlist                      watchlists
  yieldToMaturity
```

## JustETF scraper & Diversification classification (`src/lib/prices/justetf.ts`, `src/lib/prices/classification.ts`)
- **JustETF scraper** (`justetf.ts`) fetches and parses live public profile HTML for ETFs (`/en/etf-profile.html?isin=<ISIN>`) and single stocks (`/en/stock-profiles/<ISIN>`), with fallback to `/fr/...` endpoints.
- **ETF look-through composition**: extracts real underlying countries (`countryWeights`), sectors (`sectorWeights`), top 10 holdings (`topHoldings`: ISIN, name, weight), ongoing charges (`ter` / `feesPct`), fund name and domicile.
- **Single stock profile**: extracts country of domicile, industry/sector (FactSet RBICS / GICS), name, market cap, and dividend yield.
- **Classification cascade** in `classification.ts`:
  1. CoinGecko for crypto assets (`sector: 'crypto'`).
  2. JustETF web-scraping by ISIN (first tries ETF profile, then Stock profile) → stores `countryWeights`, `sectorWeights`, `topHoldings`, `feesPct`, with `classificationSource: 'justetf'`.
  3. Yahoo Finance search (`searchYahooSymbol`) by ISIN/symbol for stock sector.
  4. Local fallback table (`referenceEtfs.ts`) for common ETFs offline.
  5. ISIN country prefix fallback for legal domicile.
- **Retry cooldown**: when all sources fail to find sector/country data for an ISIN, `Holding.classificationRetryAfter` (ISO timestamp) is set 7 days in the future. The `needsClassification(h)` helper (exported from `classification.ts`) checks this field before queuing a holding — preventing repeated HTTP scrapes on every Diversification screen focus. The same helper is used both by `classifyHoldings()` and by the `useFocusEffect` in `diversification.tsx` so the logic stays in one place.
- Network errors (transient failures) are **not** cooled down — those holdings remain eligible for the next focus so they retry automatically when connectivity is restored.
- **Force re-classification**: triggered via the "Classer mes lignes" button in the Diversification tab or "Reclassifier toutes les lignes" in Paramètres → Avancé (`classifyHoldings({ forceAll: true })`). This wipes the in-memory JustETF cache via `clearJustEtfCache()` and re-queries JustETF / Yahoo for all holdings regardless of existing classification.
- `CountryCode` in `src/lib/types.ts` covers major global markets (`FR`, `DE`, `IT`, `ES`, `NL`, `BE`, `LU`, `IE`, `GB`, `CH`, `SE`, `DK`, `NO`, `FI`, `AT`, `PT`, `GR`, `IS` for Western Europe; `PL`, `CZ`, `HU`, `RO`, `TR` for Eastern Europe; `US`, `CA`, `MX`, `BR`, `CL`, `CO`, `PE`, `AR` for the Americas; `JP`, `AU`, `NZ`, `SG`, `HK` for developed Asia-Pacific; `CN`, `TW`, `KR`, `IN`, `TH`, `MY`, `ID`, `PH`, `VN`, `PK` for Emerging Asia; `SA`, `AE`, `QA`, `KW`, `BH`, `OM`, `IL`, `EG`, `MA` for Middle-East/North Africa; `ZA`, `NG`, `KE` for Sub-Saharan Africa; `autre` for everything else).

## Diversification & Fiscal Advice Engine (`src/lib/diversification.ts`, `src/components/InsightCard.tsx`)
- All advice adheres strictly to AMF / MiFID II non-CIF standards: objective mathematical diagnostics, pedagogical "why it matters", and general methodology action hints (no individual buy/sell product recommendations).
- `Account.openingDate` (ISO `YYYY-MM-DD`) tracks tax wrapper opening date, enabling automated computation of seniority and tax milestones for PEA (5-year mark for capital gains tax exemption and partial withdrawals) and Assurance-Vie (8-year mark for annual capital gains tax allowances: 4,600 € / 9,200 €).
- Look-through overlap detection crosses the `topHoldings` from JustETF and direct stocks to detect hidden mega-cap concentration across multiple funds.
- Fee audit combines `Holding.feesPct` and `Account.fees.managementPct` to calculate weighted annual costs and alert on expensive actively managed funds.
- Cards in `InsightCard.tsx` support accordion expansion (`whyKey` and `actionKey`) and category filtering chips in `diversification.tsx`.

## Wealth Projection Engine (`src/lib/projection.ts`, `src/components/ProjectionCard.tsx`)
- Located under the objectives section on the Synthèse tab (`src/app/(tabs)/index.tsx`).
- Simulates future wealth month-by-month over horizons (3, 5, 10, 15, 20, 30 years).
- **True debt amortization**: in Net mode, outstanding loan balances are calculated at every future month via `loanBalanceAt(loan, futureDateKey)`, naturally reflecting real debt payoff and the resulting equity build-up.
- **Historical CAGR or Custom rate**: users can input an annual return rate or calculate the geometric annualized growth rate (CAGR) on any historical timeframe (`1M`, `3M`, `6M`, `1A`, `MAX`) dynamically evaluated on their actual assets.
- **Monthly contributions, fees & inflation**: includes monthly savings annuities, annual fee drag estimation (difference vs 0% fees), and inflation discounting to visualize in constant euros of purchasing power.
- **Objectives reach detection**: strictly aligns with `src/lib/objectives.ts` — already reached objectives (`current >= target`) are excluded from display; calculations use dedicated financial / liquid pools and never include physical real estate (`reVal`), regardless of the real estate toggle.
- **Saved scenarios**: multiple projection scenarios (`SavedProjection`: name, description, settings) can be saved, updated, and reloaded.
- Persisted in `store.projectionSettings` and `store.savedProjections` across app sessions, and included in `exportData()` / `importData()`. All holding classifications (`sectorWeights`, `countryWeights`, `topHoldings`, `feesPct`) and `objectives` are also fully covered in export/import.

## Verification workflow
- `node_modules` is **not present by default** — run `npm install` first, before any
  typecheck or build (fresh clone / fresh session).
- Typecheck: `node_modules/.bin/tsc --noEmit` directly. Do **not** use `npx tsc` — an
  rtk shell hook rewrites `npx` commands and resolves to the wrong tsc.
- Bundling check: `node_modules/.bin/expo export --platform web` (not `npx expo`,
  rewritten to `npm run expo` by the same hook and breaks) — always `rm -rf dist`
  after. Metro can **segfault on the very first start** right after "Starting Metro
  Bundler" — this is a flaky env crash, not a code error; just re-run and it bundles
  fine.
- After changing `app.json` experiments (e.g. reactCompiler) or adding new routes,
  typed routes and the Babel/Metro cache can go stale: run `expo start --clear` once
  to regenerate `.expo/types/router.d.ts` and clear the compiler cache before trusting
  a "TSC_OK" that still fails at runtime.
- Pure calc logic (e.g. the loan amortization in `realestate.ts`) can be validated
  with a standalone `node script.mjs` instead of the app — importing the zustand store
  pulls in AsyncStorage/react-native, which only work inside the app runtime.
