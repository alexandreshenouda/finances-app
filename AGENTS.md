# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v58.0.0/ before writing any code.

# Documentation update requirement (MANDATORY)
**Always update `README.md` (and any related documentation / `AGENTS.md`) whenever you implement, extend or modify features, settings, architecture patterns, or configuration options.** Keep documentation accurate and synchronized with the codebase in the same commit / PR.

# Architecture notes & constraints (read before touching related code)

## Navigation: 5 tabs maximum (user rule)
The tab bar holds **at most 5 tabs**: `index` (Synthèse), `patrimoine`, `budget`, `analyse`,
`settings`. Do **not** add a 6th tab — a new area goes inside an existing tab as a *section*.
- `patrimoine.tsx` and `analyse.tsx` are thin hosts: a `SectionSwitcher` (chips, hidden when a
  single section is visible) over the section components in `src/components/sections/`
  (`AccountsSection`, `RealEstateSection`, `LoansSection`, `DiversificationSection`; the AI
  section is `StockCounselView` in a ScrollView, kept mounted once opened so switching sections
  doesn't drop a running analysis). Each section owns its `ScrollView`.
- `store.showImmobilierTab` / `showEmpruntsTab` / `showDiversificationTab` / `showAiTab` now
  toggle **sections**, not tabs (names kept so the persisted setting survives). The Analyse tab
  is hidden (`href: null`) only when both of its sections are off.
- Deep link to the AI analysis of a ticker: `router.navigate({ pathname: '/analyse', params:
  { section: 'ai', symbol, isin, name, holdingId } })` — the old `/ai` route no longer exists.

## Budget tab (`src/lib/budget.ts`, `src/app/(tabs)/budget.tsx`, `src/app/budget-form.tsx`)
- The tab has two sections behind a `SectionSwitcher`: **Vue d'ensemble** (`synthese`: capacity,
  split, theoretical vs actual savings, 50/30/20, objectives, categories, advice) and **Postes**
  (`postes`: the three item groups + the "include loans" option). With no item the switcher is
  hidden and the Postes section is shown directly under an `EmptyState`.
- **Postes** view: `Liste` / `Par catégorie` (`Segmented`, local state, default by category). Each
  kind group folds via its `GroupHeader` (`onPress` + `expanded`), each category via a `ListRow`
  with `expanded`; folded keys live in one `collapsed` set (`kind` or `kind:category`).
- **Expense charts** (Vue d'ensemble): `DonutChart` (generic donut exported from `PieChart.tsx`,
  which `PieChart` now wraps) switching between vital / wants and by category. Category colors
  reuse `ACCOUNT_TYPE_COLORS` values (theme-aware); categories beyond the palette are summed
  into a grey "autres" slice.
- `BudgetItem` (`types.ts`): `kind` (`income` / `expense` / `saving`), `amount` in EUR per
  `frequency` (`monthly` / `quarterly` / `yearly`), `category` (`BUDGET_CATEGORIES[kind]`), and
  `essential` (dépense vitale, expenses only; pre-ticked from `BUDGET_ESSENTIAL_DEFAULT`).
  Stored in `store.budgetItems`, included in `exportData()` / `importData()` / `resetAll()`.
- Everything is derived from `budgetLines()` → `budgetSummary()`; reuse them, don't re-sum in
  the UI. A `saving` item is **not** an expense: capacity = income − expenses, and scheduled
  savings are only compared against it (`unallocated`).
- `store.budgetIncludeLoans` (default on) appends `loanBudgetLines()` — the current payment
  (insurance included) of every started, unfinished loan — as essential `credit` expenses
  flagged `auto` (read-only rows). Users who typed their loan payments by hand turn it off.
- `actualSavings()` = change in account values (ownership share applied) between the window
  start and today, per month. It **includes market performance** and excludes real estate /
  loan principal — the UI says so; keep that note. Accounts with no snapshot at or before the
  window start are skipped (their first value would look like savings) and counted in
  `skippedAccounts`; under `ACTUAL_SAVINGS_MIN_DAYS` no monthly figure is returned. Day counts
  are computed in UTC (see the timezone note in the tests section).
- `budgetRule()` is the 50/30/20 benchmark (needs = essential, wants = other expenses, savings
  = capacity); `objectivesMonthlyEffort()` sums `objectiveProgress().monthlyContribution`.
- `objective-form.tsx` offers "Reprendre les montants de mon budget" (essential expenses →
  `monthlyExpenses`, income → `monthlyIncome`) when the budget has essential expenses.
- **Budget advice** lives with the other insights: `computeBudgetInsights()` in
  `diversification.ts` (category `'budget'`, keys `diversification.budget_*`, thresholds in the
  exported `BUDGET_*` constants). Ids: `budget-missing`, `budget-deficit`,
  `budget-savings-rate-low` / `-good`, `budget-essential-heavy`, `budget-wants-heavy`,
  `budget-debt-ratio` (credit payments / income, 35 % = HCSF ceiling), `budget-overcommitted`,
  `budget-unallocated`, `budget-actual-below` (6-month window), `budget-objectives-gap`,
  `budget-precaution-mismatch`. `computeInsights()` takes an optional `budget` input and merges
  them (without it, no budget insight — existing callers/tests unchanged; with no wealth entered
  it returns only the insights of a non-empty budget). They are rendered both in the
  Diversification section and at the bottom of the Budget tab's Vue d'ensemble section — one function, two places; the
  Budget tab's `useMemo` also lists `privacyMode` (params are pre-formatted with `formatEur`).
- Same non-CIF stance as the diversification engine: arithmetic diagnostics and benchmarks
  only, no product recommendation.

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
`Loan.propertyId` is now **optional** — absent means a standalone "prêt conso". The
**Emprunts** section of the Patrimoine tab (`src/components/sections/LoansSection.tsx`) lists
both kinds; the shared
rendering (progress, stats, phases, schedule chart) lives in
`src/components/LoanCard.tsx`, reused as-is by the property detail screen — don't
duplicate that card again. `loan-form.tsx` only shows the attachment picker
(bien/conso) when opened without a `propertyId` param (i.e. from the Emprunts section);
opened from a property, attachment stays fixed to that property (no functionality was
removed from the real-estate flow). Conso debt is deducted from net worth via
`consoDebtEur()` regardless of the "show real estate" toggle.

Loans also support stepped/tiered payments (`Loan.steps`, `mensualités échelonnées`,
with deferral) in addition to constant monthly payments — see `realestate.ts`
(`loanStats`, `loanPhases`, `loanSchedule`) which simulates month-by-month rather than
closed-form.

## Translations (fr / en / de)
- Every user-visible string goes through i18next, keys in `src/i18n/locales/{fr,en,de}.json`.
  Components use `const { t } = useTranslation()`; `src/lib` (which has no hooks) imports
  the instance — `import i18next from '../i18n'` — and calls `i18next.t(...)` **at the
  moment the message is built**, so it follows the current language.
- Error / warning messages surfaced by `src/lib` (connector sync warnings, price/FX/
  classification errors, geocoding & DVF errors) live under `errors.*`. Use
  `errors.prefixe` (`{{source}} : {{message}}` in fr, no space before the colon in en/de)
  instead of hand-concatenating `` `${name} : ${msg}` ``. Proper nouns (Trade Republic,
  Yahoo…) are passed as interpolation values, not translated. Debug-log text
  (`logDebug*`) stays untranslated — it is a dev tool.
- Never rely on `t(key, { defaultValue })` to paper over a missing key: the fallback is
  French in every language. `test/i18n.test.ts` fails if fr/en/de don't declare exactly
  the same keys. Dynamic keys (`` t(`objectives.${category}`) ``) must point at an
  existing section — a wrong prefix renders the raw key on screen (this happened with a
  non-existent `objectiveCategories.*` in `ProjectionCard`).
- Tests run in French (i18next default), so existing assertions on French messages
  stay valid after moving a literal into the locale files.

## Design tokens & shared list primitives (`src/constants/theme.ts`, `src/components/ui.tsx`)
- **No raw `fontSize` / `borderRadius` numbers in screens.** Use `FONT` (`xs` 12, `sm` 13, `md` 15,
  `lg` 17, `xl` 22, `hero` 32) and `RADIUS` (`xs` 4, `sm` 8, `md` 14, `pill`). `SPACE` (4/8/12/16/24)
  is used by the shared primitives; older screens still carry literal paddings. A true circle is
  `RADIUS.pill`, not half its size. SVG text (`fontSize={…}` props in charts) is outside this scale.
- **Amounts** spread `...TABULAR` (`fontVariant: ['tabular-nums']`) in their text style so digits
  keep a fixed width in columns.
- **Lists**: `ListCard` + `ListRow` (title / subtitle / value / valueSub / left / chevron, `last`
  on the final row) and `GroupHeader` (dot + uppercase title + total). Don't re-create local
  `row` / `rowBorder` / `chevron` styles. `Chevron` is the SVG replacement for the `›` glyph.
- **Press feedback**: `ListRow` and `Card onPress={…}` switch to `C.cardAlt` while pressed, chips
  and checkboxes dim. A whole-card link is `<Card onPress>`, not a `Pressable` wrapping a `Card`.
- **`Segmented` vs `Chips`**: `Segmented` switches between *views of the same data* (Net/Brut,
  Valeur/Performance, Barre/Camembert); `Chips` stays for filters, value pickers and the
  `SectionSwitcher`. `Pill` is the tinted badge (period delta); its background is
  `withAlpha(color, 0.14)` — use `withAlpha` instead of hand-written `rgba(...)` literals.
- **`EmptyState`** (icon + text + optional CTA) is the empty state of a whole screen/section; when
  it carries the "add" action, don't also render the regular add button. `Empty` stays for small
  inline "nothing here" lines inside a card.
- **Line icons** for menu rows and empty states live in `TabIcons.tsx` next to the tab icons
  (`connexions`, `sauvegarde`, `affichage`, `langue`, `historique`, `developpeur`, `objectif`,
  `rafraichir`) — same 24 viewBox / stroke 2 style.
- **Screen width**: every screen's scroll `content` style spreads `...CONTENT` (full width, capped
  at `CONTENT_MAX_WIDTH` = 720, centered) so cards and charts don't stretch on web / Electron /
  tablets. New screens must do the same; `SectionSwitcher` aligns its chips on the same column.
- **Touch targets & accessibility**: `Button` / `ListRow` / menu items are ≥ `TOUCH_MIN` (44) high;
  chips and segments are 36 px tall plus `hitSlop`. The primitives set `accessibilityRole`,
  `accessibilityState` (`selected` / `checked` / `disabled` / `expanded`) and labels — a custom
  `Pressable` in a screen must set them itself (icon-only buttons need an `accessibilityLabel`).
- **Motion** uses `react-native-reanimated` (works on web, Babel plugin comes with
  `babel-preset-expo`): `ProgressBar` animates its fill, `FadeInView` fades content in (give it a
  `key` per section to replay). Keep it to `MOTION_MS` (220 ms) transitions; Reanimated follows the
  system "reduce motion" setting by default. `ui.tsx` therefore imports Reanimated — keep it out
  of `src/lib` (the Vitest stubs don't cover it).
- **Modal scrim** is `SCRIM` from `theme.ts`. Figures in the AI screen use `...TABULAR`, not
  `fontFamily: 'monospace'` (kept only for inline code in the Markdown renderer).
- **Contrast**: `textFaint` is tuned to ≥ 4.5:1 on `bg` and `card` in both themes (it carries
  12–13 px text). Re-check the ratio if either palette changes.

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
or all — for fixing bad manual entries), `dev-tools.tsx` (debug log: every network request + raw connector traffic), a
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

## Synthèse header refresh
The Synthèse screen overrides `headerRight` with `navigation.setOptions` to put a refresh icon
next to `PrivacyToggle` (there is no full-width refresh button any more; `RefreshControl` is a
no-op on web, so the icon is the only web entry point). The sync message is `{ text, ok }`:
success is shown in `C.positive` and clears itself after `SUCCESS_MESSAGE_MS`; a warning/error
stays in `C.warning` until the next refresh.

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
- **Retry cooldown**: when all sources fail to find sector/country data for an ISIN, `Holding.classificationRetryAfter` (ISO timestamp) is set 7 days in the future. The `needsClassification(h)` helper (exported from `classification.ts`) checks this field before queuing a holding — preventing repeated HTTP scrapes on every Diversification screen focus. The same helper is used both by `classifyHoldings()` and by the `useFocusEffect` in `DiversificationSection.tsx` so the logic stays in one place.
- Network errors (transient failures) are **not** cooled down — those holdings remain eligible for the next focus so they retry automatically when connectivity is restored. This relies on the scrapers telling "unreachable" apart from "not found": `fetchJustEtf*` return `null` only for a missing/non-profile page (HTTP 4xx, or a page a web proxy actually relayed) and **throw `JustEtfUnavailableError`** on fetch failure, timeout, HTTP 429/5xx or when no CORS proxy relayed anything — such failures are never stored in the JustETF session cache. `searchYahooSymbol` likewise returns `[]` for an unknown query but **throws** when the search is unreachable. Don't turn those throws back into `null`/`[]`: an offline Diversification visit would then put every unclassified holding on the 7-day cooldown (that regression existed until the scrapers were fixed).
- **Force re-classification**: triggered via the "Classer mes lignes" button in the Diversification section or "Reclassifier toutes les lignes" in Paramètres → Avancé (`classifyHoldings({ forceAll: true })`). This wipes the in-memory JustETF cache via `clearJustEtfCache()` and re-queries JustETF / Yahoo for all holdings regardless of existing classification.
- `CountryCode` in `src/lib/types.ts` covers major global markets (`FR`, `DE`, `IT`, `ES`, `NL`, `BE`, `LU`, `IE`, `GB`, `CH`, `SE`, `DK`, `NO`, `FI`, `AT`, `PT`, `GR`, `IS` for Western Europe; `PL`, `CZ`, `HU`, `RO`, `TR` for Eastern Europe; `US`, `CA`, `MX`, `BR`, `CL`, `CO`, `PE`, `AR` for the Americas; `JP`, `AU`, `NZ`, `SG`, `HK` for developed Asia-Pacific; `CN`, `TW`, `KR`, `IN`, `TH`, `MY`, `ID`, `PH`, `VN`, `PK` for Emerging Asia; `SA`, `AE`, `QA`, `KW`, `BH`, `OM`, `IL`, `EG`, `MA` for Middle-East/North Africa; `ZA`, `NG`, `KE` for Sub-Saharan Africa; `autre` for everything else).

## Diversification & Fiscal Advice Engine (`src/lib/diversification.ts`, `src/components/InsightCard.tsx`)
- All advice adheres strictly to AMF / MiFID II non-CIF standards: objective mathematical diagnostics, pedagogical "why it matters", and general methodology action hints (no individual buy/sell product recommendations).
- `Account.openingDate` (ISO `YYYY-MM-DD`) tracks tax wrapper opening date, enabling automated computation of seniority and tax milestones for PEA (5-year mark for capital gains tax exemption and partial withdrawals) and Assurance-Vie (8-year mark for annual capital gains tax allowances: 4,600 € / 9,200 €).
- Look-through overlap detection crosses the `topHoldings` from JustETF and direct stocks to detect hidden mega-cap concentration across multiple funds.
- Fee audit combines `Holding.feesPct` and `Account.fees.managementPct` to calculate weighted annual costs and alert on expensive actively managed funds.
- Cards in `InsightCard.tsx` support accordion expansion (`whyKey` and `actionKey`) and category filtering chips in `DiversificationSection.tsx`.

## Épargne de précaution : suggestion & conseils (`src/lib/objectives.ts`, `src/lib/diversification.ts`)
- The `epargne_precaution` objective stores `securityMonths`, `monthlyExpenses` and optional
  `monthlyIncome`. **`monthlyExpenses` now means *dépenses vitales*** (essential expenses) — the
  field name was kept so existing backups/imports stay valid; the target is still
  `securityMonths × monthlyExpenses` (`epargnePrecautionTarget`), so projection/objective
  progress are unchanged.
- `suggestPrecaution(vital, income?)` is the single source of the suggestion: months by
  vital/income ratio tiers (`PRECAUTION_MONTHS_TIERS`: <50 % → 3, 50–70 % → 4, 70–85 % → 5,
  ≥85 % → 6; `PRECAUTION_DEFAULT_MONTHS` = 3 without income), a `budget` status
  (`unknown`/`comfortable`/`tight`/`deficit`) and the monthly margin. `precautionBuildPlan`
  turns a shortfall into a monthly effort (`PRECAUTION_MARGIN_SHARE` = half the margin) and a
  duration. Reuse these in UI and insights — don't re-derive thresholds.
- `objective-form.tsx` shows the suggestion live with an "Appliquer la suggestion" button that
  only sets `securityMonths` (the amount is always months × vital expenses).
- `precautionAdvice` in `diversification.ts` emits: `precaution-missing`,
  `precaution-budget-deficit`, `precaution-income-missing`, `precaution-target-low` /
  `-high` (vs suggestion; high = more than suggestion + 3 months), and the cushion level
  `cash-cushion-low` (<50 %) / `cash-cushion-building` (50–100 %) / `cash-cushion-high` (>200 %),
  whose action becomes `cash_cushion_plan_action` when the margin is known. `idleCashAudit`'s
  threshold also accepts one month of income on the current account.
- Insight params are pre-formatted with `formatEur` at compute time, so the `useMemo` of
  `computeInsights` in `DiversificationSection.tsx` lists `privacyMode` as a dependency — keep it,
  or toggling the eye leaves amounts unmasked in the cards.

## Wealth Projection Engine (`src/lib/projection.ts`, `src/components/ProjectionCard.tsx`)
- Located under the objectives section on the Synthèse tab (`src/app/(tabs)/index.tsx`).
- Simulates future wealth month-by-month over horizons (3, 5, 10, 15, 20, 30 years).
- **True debt amortization**: in Net mode, outstanding loan balances are calculated at every future month via `loanBalanceAt(loan, futureDateKey)`, naturally reflecting real debt payoff and the resulting equity build-up.
- **Historical CAGR or Custom rate**: users can input an annual return rate or calculate the geometric annualized growth rate (CAGR) on any historical timeframe (`1M`, `3M`, `6M`, `1A`, `MAX`) dynamically evaluated on their actual assets.
- **Monthly contributions, fees & inflation**: includes monthly savings annuities, annual fee drag estimation (difference vs 0% fees), and inflation discounting to visualize in constant euros of purchasing power.
- **Objectives reach detection**: strictly aligns with `src/lib/objectives.ts` — already reached objectives (`current >= target`) are excluded from display; calculations use dedicated financial / liquid pools and never include physical real estate (`reVal`), regardless of the real estate toggle.
- **Saved scenarios**: multiple projection scenarios (`SavedProjection`: name, description, settings) can be saved, updated, and reloaded.
- Persisted in `store.projectionSettings` and `store.savedProjections` across app sessions, and included in `exportData()` / `importData()`. All holding classifications (`sectorWeights`, `countryWeights`, `topHoldings`, `feesPct`) and `objectives` are also fully covered in export/import.

## InvestCounsel AI & Stock Insights (`src/lib/aiCounsel.ts`, `src/components/StockCounselView.tsx`, `src/app/(tabs)/analyse.tsx`)
- **Dual entry points**:
  1. **IA** section of the Analyse tab (`src/app/(tabs)/analyse.tsx`, visibility toggled via `store.showAiTab` in **Paramètres → Affichage**) with universal ticker/ISIN search, user watchlist (`store.aiWatchlist`), popular presets, and quick-select chips for all detained portfolio holdings.
  2. **Detained holdings integration**: clicking any holding row in an account (`src/app/account/[id].tsx`) opens `src/app/holding-detail.tsx`, which embeds `<StockCounselView embedded ... />` for that holding (automatically resolving Yahoo ticker from `symbol`, `isin`, or `name`) and provides a button to open it in the full IA section (as well as an edit button for manual holdings).
- **Pure logic in `src/lib/aiCounsel.ts`**:
  - Multi-timeframe Yahoo Finance fetch (`1D`, `1W`, `1M`, `1Y`, `5Y`) with automatic ISIN-to-ticker resolution and web proxy routing (`/__yahoo` middleware in `metro.config.js` / `electron/main.js`, with `allorigins.win` fallback) — never calling `query1/query2.finance.yahoo.com` directly from a browser or `corsproxy.io` (which now returns 401/403).
  - `computeTechnicalAnalytics`: calculates moving averages (`SMA 20/50/200`, `EMA 20`), `RSI(14)`, `MACD(12,26,9)`, annualized volatility, max drawdown, `ATR(14)`, Sharpe estimate, 52W positioning, pivot levels (`S1/S2/R1/R2`), a 7-factor algorithmic sentiment score (`0–100`), and a 12-month log-normal drift & volatility cone (`quantProjections` for `3M`/`6M`/`1Y` and `futureCone`).
  - `generateGeminiInvestmentCounsel`: calls the Gemini REST endpoint (`generativelanguage.googleapis.com/v1beta/models/<model>:generateContent`) directly via `fetch` (no SDK dependency, works across native/web/Electron and `test/http.ts` mocks) with automatic model fallback on 404/429/503 and localized output (`fr`/`en`/`de`).
- **API Key security & Settings (`src/app/ai-settings.tsx`)**: the Gemini API key is configured in **Paramètres → Intelligence Artificielle (Gemini)** (`src/app/ai-settings.tsx`, also accessible from **Paramètres → Connexions** `src/app/connections.tsx`) and stored exclusively in device secure storage (`expo-secure-store` via `src/lib/secure.ts` under `GEMINI_SECRET_KEY = 'gemini.apiKey'`, purged on full data wipe alongside exchange/bank secrets) — never in AsyncStorage (`store.ts`). Non-secret preferences (`aiWatchlist`, `aiLastSymbol`, `aiModel`, `aiCustomPreprompt`, `aiReports`) live in `store.ts`.
- **Regulatory disclaimer (Non-CIF) & Zero personal data transmitted**: both `StockCounselView.tsx` and `ai-settings.tsx` permanently display the regulatory non-CIF disclaimer (`ai.avertissement_legal`) and the privacy notice (`ai.confidentialite_ia_texte`). `buildAssetTelemetryContext` never sends any personal or net-worth data (accounts, balances, held quantities/amounts, cost basis, real estate, loans, or income) to Google Gemini — only public Yahoo Finance market telemetry for the analyzed ticker plus the selected generic horizon/risk enum and optional user note.

## CI : build APK Android (`.github/workflows/`)
Two workflows publish a signed APK to the repo's GitHub Releases:
`android-apk-runner.yml` (prebuild + Gradle on the runner, needs the
`ANDROID_KEYSTORE_*` secrets, wired to `v*` tags **and** manual dispatch) and
`android-apk-eas.yml` (delegates to EAS Build, needs `EXPO_TOKEN`, manual only).
Only the runner one listens to tags — two workflows publishing to the same release
tag would clobber each other. Keep it that way if you add a third.

- Native dirs are **not** committed (CNG): `expo prebuild` runs in CI. The Expo
  template signs the `release` buildType with the **debug** keystore, so
  `.github/scripts/apply-release-signing.mjs` patches the generated
  `android/app/build.gradle` (adds a `release` signingConfig reading
  `ANDROID_KEYSTORE_*` from the env, switches the `release` buildType onto it).
  It is deliberately **fail-loud**: if the template's anchors move on an Expo
  bump, the job goes red instead of silently shipping a debug-signed APK. An
  `apksigner verify` step re-checks this before publishing.
- Workflow `run:` blocks execute under `bash -eo pipefail`. `[ test ] && assign`
  as a top-level statement **kills the step** when the test is false — use
  `if … then … fi`. This bit both workflows' prerelease flag once already.
- Of the signing secrets only `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`
  and `ANDROID_KEY_ALIAS` are required. `ANDROID_KEY_PASSWORD` falls back to the store
  password: keytool's default PKCS12 format rejects a distinct key password outright
  ("Different store and key passwords not supported for PKCS12 KeyStores"), so only a
  legacy JKS keystore ever needs it.
- `ANDROID_KEYSTORE_BASE64` must decode to a **Java keystore** (PKCS12/JKS), not a
  PEM — Gradle signs from a key container, not a bare key/cert pair. A dedicated step
  decodes and probes the keystore with `keytool` before the build so the four common
  mistakes (bad base64, PEM instead of keystore, wrong store password, missing alias)
  each get their own message instead of surfacing mid-Gradle.
- `eas.json`'s `preview` profile carries `android.buildType: apk` because a
  release asset must be directly installable; `production` still yields an AAB.
- Use `node_modules/.bin/expo` in CI too, matching the local convention below.

## Local property valuation: DVF freshness (`src/lib/prices/localValuation.ts`)
`dvf-api.data.gouv.fr/commune/<insee>` returns a monthly series that lags by several months and
is only republished twice a year, so refreshing a local estimate usually returns **the same
value** — that is not a failure. `LocalEstimate.dataThrough` (last `YYYY-MM` of the series used)
and `computedAt` are shown under the chart on the property screen so a refresh is visible even
when the figure does not move. The request is in the debug log (tag `immobilier`).

## Cash flows: deposits, dividends, PEA ceiling (`src/lib/cashflows.ts`, `src/components/AccountFlows.tsx`)
- `CashFlow` (`types.ts`): `kind` `deposit` / `withdrawal` / `dividend` / `interest`, `amount` in
  EUR **always positive**, optional `isin` and `externalId`. Stored in `store.cashFlows`
  (export / import / reset / deleted with the account). `mergeCashFlows(accountId, flows)` replaces
  a flow with the same `externalId` — a resync never duplicates, and flows older than the
  connector's window are kept. With its `since` argument (connector fetched the full window) it
  also drops imported flows of that window that are gone.
- Connectors feed them through `ExternalAccount.cashFlows` / `peaDepositsEur` / `peaCeilingEur`;
  `persistExternalAccounts` writes them. Only Trade Republic does today.
- Everything is derived in `cashflows.ts` — reuse, don't re-sum in the UI:
  `netContributions()` (deposits − withdrawals on `]from; to]`; `trackedAccountIds` = accounts
  that have a deposit history — an untracked account is *unknown*, not zero),
  `dividendSummary()` (12 rolling months, per year, per ISIN, yield on cost of holdings still
  held) and `peaCeilingStatus()` (`Account.peaDeposits` vs `Account.peaCeiling ?? PEA_CEILING_EUR`).
- `Account.peaDeposits` is typed by hand in `account-form.tsx` for an unsynced PEA and overwritten
  by the connector for a synced one (the field is then hidden). Withdrawals don't lower it — that
  is the legal rule. The `pea-ceiling-*` insight uses it when known (≥ `PEA_CEILING_NEAR_RATIO`)
  and only falls back to the plan's market value when it is not.
- The Budget tab shows net contributions next to `actualSavings()` over the same window: the
  former has no market performance, the latter does. Keep both notes.
- `AccountFlows` (account detail) displays money → it carries the `privacyMode` subscription.

### Trade Republic: timeline history & PEA utilization
Requests derived from the web bundle, **responses checked against a real account** (2026-11):
- REST, same cookies/headers as `/api/v2/auth/account`: `GET /api/v2/timeline/transactions`
  with `pageSize`, `categoryIds` (comma-joined — several parents in one request work),
  `cashAccountNumbers[]`, `isins[]`, `olderThan` (cursor) → `{ items, cursors: { after, before } }`.
  Item: `id`, `title`, `subtitle`, `timestamp` (`…+0000`), `status` (`EXECUTED` / `CANCELED`),
  `amount: { value, currency }` (positive = money in), `eventType`, `icon` / `avatar.asset`
  (`logos/<ISIN>/v2` for a security), `cashAccountNumber`. **`action` is always
  `{ type: 'timelineDetail', payload: <id> }`** — it carries no ISIN and says nothing about
  the operation (the first version assumed `instrumentDetail` and classified everything as interest).
- `GET /api/v2/timeline/transaction-categories` → `{ categories: [{ id, name, children }] }`:
  `INVESTING` (`STOCK`, `ETF`, `CRYPTO`, …), `INCOME` (`EARNINGS_V2`, `SELLS_V2`, `CASH_IN_V2`),
  `SPENDING` (`CARD_*`, `ATM_WITHDRAWAL`, `TRANSFERS`).
- **A category is not a kind.** `INCOME` mixes interest, dividends, incoming bank transfers
  *and the proceeds of sell orders*; `TRANSFERS` only holds outgoing transfers. Classification is
  by `eventType` only (`EVENT_KINDS`): `BANK_TRANSACTION_INCOMING` → deposit,
  `BANK_TRANSACTION_OUTGOING` → withdrawal, `INTEREST_PAYOUT` → interest,
  `SSP_CORPORATE_ACTION_CASH` → dividend (ISIN read from the logo). `TRADING_TRADE_EXECUTED` is
  ignored. Any other `eventType` is **not guessed**: it is skipped, logged at error level and
  counted in a warning (`errors.tr_operations_inconnues`) — add it to `EVENT_KINDS` /
  `IGNORED_EVENTS` from the logged payload. A sign that contradicts the kind is skipped too.
- A corrected dividend shows up as a `CANCELED` item plus a new `EXECUTED` one: skipping
  `CANCELED` is what keeps it from being counted twice.
- One request per page with `categoryIds=INCOME,TRANSFERS` (`HISTORY_CATEGORIES`), only for the
  ids the server lists; a missing one adds `errors.tr_versements_non_reconnus`.
- `cashFlowsSince` (start of the window) is set only when the whole window was fetched; it makes
  `mergeCashFlows` drop previously imported flows of that window that are no longer returned
  (misclassified by an older version, or cancelled since). Manual flows (no `externalId`) and
  flows older than the window are kept. A partial or failed fetch never purges.
- WS `taxWrapperAccountUtilization` + `secAccNo` → `{ totalAmount, usedAmount }` (`{ value,
  currency }`, plus `completionDate`, `taxFree`), asked for `TAX_WRAPPER` envelopes only →
  `peaCeilingEur` / `peaDepositsEur`.
- History is best-effort: any failure adds a warning, never fails the sync. Window =
  `HISTORY_DAYS` (400), up to `HISTORY_MAX_PAGES` × `HISTORY_PAGE_SIZE` per envelope.

## App lock (`src/lib/appLock.ts`, `src/components/AppLockGate.tsx`)
- `store.appLock` (persisted, **not exported** — it is a device setting; reset by `resetAll`).
  Toggled in Paramètres → Sécurité, hidden on web. Turning it on *or* off requires a successful
  `LocalAuthentication.authenticateAsync` (device passcode fallback allowed), and it cannot be
  enabled when `getEnrolledLevelAsync()` is `NONE`.
- `AppLockGate` (mounted in `_layout.tsx`) covers the app with a `Modal` — a `Modal` because an
  absolutely-positioned view would sit *under* natively presented modal screens. It starts locked
  until the store is hydrated, prompts on launch, and re-locks on return to foreground after
  `APP_LOCK_GRACE_MS` in the background (`shouldRelock`).
- `unlocksApp()` also lets the user in when the device reports no lock at all (`not_enrolled`,
  `passcode_not_set`, `not_available`) — otherwise removing the screen lock would brick the app.
- `expo-local-authentication` is imported by components only; keep it out of `src/lib` (no Vitest
  stub). Its config plugin in `app.json` sets `NSFaceIDUsageDescription`; a new native build is
  needed (not available in an old dev client).

## Debug log & network requests (`src/lib/debugLog.ts`)
- **Every HTTP request in `src/lib` goes through `tracedFetch(tag, url, init)`, never a bare
  `fetch`** — a bare call is invisible in Paramètres → Outils développeur (this is how the FRED /
  DVF / geocoding, FX, CoinGecko, Binance, Kraken, Enable Banking and Gemini calls went missing).
  With the log off it is a plain pass-through; with it on, one entry per finished request:
  method, URL, HTTP status (or the network error) and duration; non-2xx and thrown errors are
  logged at `error` level. It calls the global `fetch`, so `test/http.ts` `mockFetch` still works.
- **The log is semi-anonymised** (`src/lib/logAnonymize.ts`, `anonymizeLog`) so it can be shared:
  applied to message and detail in `logDebug*` — *before* truncation, while the JSON is whole —
  and again in `formatLogEntries` (copy / share), which also covers entries stored before the
  protection existed. It is idempotent. Two layers:
  - by JSON key: `NAME_KEYS` (owner, creditor, debtor, remittance…) → first/last letter of each
    word (`maskName`); `ACCOUNT_KEYS` (iban, accountNumber, secAccNo, uid…) → 2 first / 2 last
    characters (`maskMiddle`); a `title` is masked in the whole subtree of an operation whose
    `eventType` is not in `NON_PERSONAL_EVENT_TYPES` — unknown types are masked by default;
  - by pattern on any text (messages, URLs, non-JSON bodies): digit runs ≥ 8 (account / phone
    numbers), e-mails, IBANs, UUIDs (4 + 4 kept), the geocoding `q=` address, and the INSEE
    commune code reduced to its department. Truncated JSON falls back to patterns with every
    `title` masked.
  Amounts, dates, ISINs and security names are deliberately kept. **A connector that logs a new
  personal field must add its key or pattern there**, with a test in `test/logAnonymize.test.ts`.
- Headers and bodies are never logged (API keys, JWTs); secret query params (`key`, `signature`,
  `token`…) are masked by `redactUrl` — extend `SECRET_PARAMS` if a new API puts a secret in its URL.
- Trade Republic keeps its own hand-written logs (redacted bodies, WebSocket frames, timeline
  `trGetJson`) on bare `fetch`; don't wrap it too or every call shows twice. Don't add a `logDebug('GET …')` next to a
  `tracedFetch` either. Tags: `fx`, `immobilier` (FRED index, geocoding, DVF), `yahoo`, `justetf`,
  `coingecko`, `binance`, `kraken`, `enablebanking`, `aiCounsel` (Yahoo charts), `gemini`.

## Verification workflow
- **SDK 58 / React Native 0.88 Strict TypeScript API**: deep imports from `react-native/Libraries/*`
  are type errors and host refs use instance types — `useRef<ViewInstance>(null)` (also
  `TextInputInstance`, …), not `useRef<View>`. Node ≥ 22.13 is required (CI uses 22). If `npm install`
  hits an ERESOLVE on `expo-symbols` after a bump, regenerate `package-lock.json`.
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
- Unit tests: `node_modules/.bin/vitest run` (or `npm test`). This is the fastest
  feedback loop for anything in `src/lib` — see the section below before touching or
  adding tests.
- Pure calc logic (e.g. the loan amortization in `realestate.ts`) can also be validated
  ad hoc with a standalone `node script.mjs` instead of the app — importing the zustand
  store pulls in AsyncStorage/react-native, which only work inside the app runtime. Prefer
  adding a Vitest case in `test/` over a throwaway script: the stubs already make that
  import graph work under Node.

## Unit tests (Vitest) — `test/`
Logic only; **no UI tests** (deliberate user rule — don't add them unprompted). All of
`src/lib` is covered — the financial calculations, but also `store`, `debugLog`, `confirm`,
`secure`, `i18n`, every price source in `prices/` and every connector in `connectors/`
(≈ 98 % statements / 92 % branches). `coverage.thresholds` in `vitest.config.mts` fails
`npm run test:coverage` (hence CI) below **90 %** on any metric — add tests with new code.

- CI: `.github/workflows/tests.yml` runs `npm ci && npm run test:coverage` (Node 22) on every
  `pull_request` and on pushes to `main`. Keep the suite runnable under plain Node with
  no secrets and no live HTTP calls — that workflow provides no secrets.
- README badges (tests pass % + `src/lib` line coverage): on `main` pushes only, a separate
  `badges` job (the only one with `contents: write`, never runs the tested code) turns the
  Vitest reports into shields.io endpoint JSON via `.github/scripts/make-badges.mjs` and
  force-pushes them as a single commit to the orphan **`badges`** branch — don't merge or
  base anything on that branch. `coverage.reportOnFailure` is on so a red run still updates
  the badges instead of leaving the last green numbers up.
- Runner: **Vitest** (`npm test`, `npm run test:watch`), config in `vitest.config.mts`.
  It is `.mts` (not `.ts`) because `package.json` has no `"type": "module"` and Vite's
  native config loader warns on ESM-in-CJS; `tsconfig.json` includes `**/*.mts` so the
  config is still typechecked.
- **Why aliases are needed**: `src/lib` is JSX-free TypeScript, but its import graph reaches
  four modules Node cannot load — `expo-localization` (pulled in by `lib/i18n.ts`, itself
  imported by `format.ts`), `expo-secure-store` (`secure.ts`),
  `@react-native-async-storage/async-storage` (zustand `persist` in `store.ts`, reached from
  `fx.ts` → everything), and `react-native` itself (`Platform` in `secure.ts` and
  `prices/{justetf,yahoo}.ts` — written in Flow, which rolldown refuses to parse). They
  are aliased to in-memory stubs in `test/stubs/`. **Everything else is the real code**:
  don't mock app modules, and if a new `src/lib` import breaks a test with a parse error
  about Flow or a missing native module, add a stub rather than mocking the caller.
- **Stub test hooks**: the stubs expose test-only controls — `Platform.OS` is mutable (set
  `'web'` to exercise CORS-proxy / localStorage branches, reset to `'android'` after),
  `__setLocales` (`expo-localization`), `__secureMemory` (`expo-secure-store`). Import those
  from `./stubs/…` directly, not from the package name: tests are typechecked by `tsc`
  against the real package types, and the alias makes both paths the same module instance.
  Exception: after `vi.resetModules()` (used by `yahoo.test.ts` to drop its module-level FX
  cache) the app module gets a *fresh* stub — re-import `Platform` from the same registry.
- **Network**: never let a test hit the network. `test/http.ts` `mockFetch([[pattern, reply]])`
  stubs global `fetch` with an URL router (first match wins, unrouted URL = network error)
  and records calls; clean up with `vi.unstubAllGlobals()`. Trade Republic's WebSocket is a
  scripted `FakeWebSocket` in `traderepublic.test.ts`. Synthetic JustETF pages
  (`test/justetfPages.ts`) mirror the real markup (`data-testid`, `data-overview` blocks) —
  if JustETF changes its HTML, update those builders from a real page, not from the regexes.
- **Store tests**: `useStore` is a singleton persisted on every `set` — reset with
  `resetAll()` in `beforeEach`, and remember `setState` immediately overwrites the
  AsyncStorage stub (seed storage *after* it when testing rehydration).
- `@/…` path aliases are re-declared in the Vitest config (Vite doesn't read tsconfig
  `paths`); `@/assets/…` must stay listed **before** the generic `@/…` rule, order matters.
- Object factories live in `test/factories.ts` (`account`, `holding`, `snapshot`,
  `property`, `loan`, `objective`, plus fixed `RATES`) — extend those rather than
  hand-rolling entities in each test.
- **Assert against an independent formula, not against the implementation.** The loan
  tests recompute expected balances with the closed-form annuity
  (`P·i/(1−(1+i)^−n)` and `P(1+i)^k − pay·((1+i)^k−1)/i`) while `realestate.ts` simulates
  month by month — the point is that the two agree. Same spirit elsewhere: interpolation
  expectations are written as `100 + 20 × 366/1461`, not as a copied magic number.
- Anything that reads the real clock (`todayKey()` defaults: manual/local property
  valuation, PEA/AV seniority) must be called with an explicit `today`/date argument, or
  pinned relative to `new Date()` — never hardcode a date that will age out.
- **Timezone**: CI runs in UTC (no DST), so local-time date bugs only show up on a dev
  machine. Date keys are parsed as `${key}T12:00:00` (local) across `src/lib`; that is safe
  for calendar fields and for day counts rounded with `Math.round(ms / 86_400_000)`, but
  **not for raw millisecond ratios** — a DST change in between skews them by an hour.
  Parse in UTC there (`Date.parse(`${key}T00:00:00Z`)`, cf. `houseIndexValueAt`), and pin
  `process.env.TZ` to a DST zone (e.g. `Europe/Paris`) in the test, as `houseIndex.test.ts` does.
