/** Onglet Budget : entrées / sorties d'argent récurrentes, capacité d'épargne, comparaison
 *  à l'épargne réellement constatée sur les comptes, repère 50/30/20, effort des objectifs. */
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { InsightCard } from '@/components/InsightCard';
import { DonutChart } from '@/components/PieChart';
import { SectionSwitcher } from '@/components/sections/SectionSwitcher';
import { TabIcon } from '@/components/TabIcons';
import {
  Button,
  Card,
  Checkbox,
  Chips,
  Empty,
  EmptyState,
  FadeInView,
  GroupHeader,
  ListCard,
  ListRow,
  ProgressBar,
  SectionTitle,
  Segmented,
} from '@/components/ui';
import { C, CONTENT, FONT, RADIUS, TABULAR, useStyles } from '@/constants/theme';
import {
  actualSavings,
  budgetLines,
  budgetRule,
  budgetSummary,
  compareSavings,
  objectivesMonthlyEffort,
  SAVINGS_PERIODS,
  type BudgetLine,
  type SavingsPeriod,
} from '@/lib/budget';
import { netContributions } from '@/lib/cashflows';
import { computeBudgetInsights } from '@/lib/diversification';
import { formatEur, formatPct } from '@/lib/format';
import { useStore } from '@/lib/store';
import {
  BUDGET_CATEGORY_LABELS,
  BUDGET_FREQUENCY_LABELS,
  ACCOUNT_TYPE_COLORS,
  BUDGET_KINDS,
  type BudgetCategory,
  type BudgetKind,
} from '@/lib/types';

/** Rubriques de l'onglet : diagnostics d'un côté, saisie des postes de l'autre. */
const BUDGET_SECTIONS = ['synthese', 'postes'] as const;
type BudgetSection = (typeof BUDGET_SECTIONS)[number];

const POSTES_VIEWS = ['liste', 'categories'] as const;
const SPLIT_CHARTS = ['vital', 'categories'] as const;

function makeStyles() {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.bg },
    content: { padding: 16, paddingBottom: 40, ...CONTENT },
    heroLabel: { color: C.textDim, fontSize: FONT.md },
    heroValue: { fontSize: FONT.hero, fontWeight: '700', marginTop: 2, ...TABULAR },
    heroSub: { color: C.textFaint, fontSize: FONT.sm, marginTop: 4 },
    statRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
    statRowFirst: {
      marginTop: 12,
      paddingTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: C.border,
    },
    statLabel: { color: C.textDim, fontSize: FONT.md },
    statLabelSub: { color: C.textFaint, fontSize: FONT.sm, paddingLeft: 12 },
    statValue: { color: C.text, fontSize: FONT.md, fontWeight: '600', ...TABULAR },
    statValueSub: { color: C.textDim, fontSize: FONT.sm, ...TABULAR },
    cardTitle: { color: C.text, fontSize: FONT.md, fontWeight: '700', marginBottom: 10 },
    bar: { flexDirection: 'row', height: 14, borderRadius: RADIUS.pill, overflow: 'hidden', marginBottom: 12 },
    legendRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
    swatch: { width: 10, height: 10, borderRadius: RADIUS.xs, marginRight: 8 },
    legendLabel: { color: C.text, fontSize: FONT.md, flex: 1 },
    legendValue: { color: C.text, fontSize: FONT.md, fontWeight: '600', ...TABULAR },
    legendPct: { color: C.textFaint, fontSize: FONT.sm, fontWeight: '400' },
    gaugeRow: { paddingVertical: 8 },
    gaugeHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
    gaugeLabel: { color: C.text, fontSize: FONT.md, fontWeight: '600' },
    gaugeValue: { color: C.textDim, fontSize: FONT.sm, ...TABULAR },
    verdict: { fontSize: FONT.sm, lineHeight: 18, marginTop: 8, color: C.textDim },
    note: { color: C.textFaint, fontSize: FONT.sm, lineHeight: 17, marginTop: 8 },
  });
}

export default function Budget() {
  const styles = useStyles(makeStyles);
  const { t } = useTranslation();
  const router = useRouter();
  const items = useStore((s) => s.budgetItems);
  const includeLoans = useStore((s) => s.budgetIncludeLoans);
  const setIncludeLoans = useStore((s) => s.setBudgetIncludeLoans);
  const loans = useStore((s) => s.loans);
  const accounts = useStore((s) => s.accounts);
  const holdings = useStore((s) => s.holdings);
  const snapshots = useStore((s) => s.snapshots);
  const cashFlows = useStore((s) => s.cashFlows);
  const objectives = useStore((s) => s.objectives);
  const rates = useStore((s) => s.fxRates);
  // Re-render au changement de mode confidentialité ; aussi dépendance du memo des conseils,
  // dont les montants sont formatés (donc masqués ou non) au calcul.
  const privacyMode = useStore((s) => s.privacyMode);
  const [period, setPeriod] = useState<SavingsPeriod>('6M');
  const [selected, setSelected] = useState<BudgetSection>('synthese');
  const [postesView, setPostesView] = useState<(typeof POSTES_VIEWS)[number]>('categories');
  const [splitChart, setSplitChart] = useState<(typeof SPLIT_CHARTS)[number]>('vital');
  // Clés repliées : `income` / `expense` / `saving` pour un groupe entier, `kind:catégorie`
  // pour une catégorie. Tout est déplié par défaut.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  const lines = useMemo(
    () => budgetLines(items, { loans, rates, includeLoans }),
    [items, loans, rates, includeLoans]
  );
  const summary = useMemo(() => budgetSummary(lines), [lines]);
  const rule = useMemo(() => budgetRule(summary), [summary]);
  const actual = useMemo(() => actualSavings(accounts, snapshots, period), [accounts, snapshots, period]);
  // Versements nets constatés (connecteurs) sur la même fenêtre : l'effort d'épargne sans la performance.
  const contributions = useMemo(
    () => (actual.from ? netContributions(cashFlows, accounts, actual.from) : undefined),
    [cashFlows, accounts, actual.from]
  );
  const effort = useMemo(
    () => objectivesMonthlyEffort(objectives, { accounts, holdings, snapshots, rates }),
    [objectives, accounts, holdings, snapshots, rates]
  );

  const insights = useMemo(
    () =>
      computeBudgetInsights({ budgetItems: items, loans, includeLoans, accounts, holdings, snapshots, rates, objectives }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- privacyMode : voir plus haut
    [items, loans, includeLoans, accounts, holdings, snapshots, rates, objectives, privacyMode]
  );

  const perMonth = (v: number) => t('budget.par_mois', { amount: formatEur(v) });
  const hasData = lines.length > 0;
  const hasLoanLines = lines.some((l) => l.auto);
  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  // Répartition des revenus : vitales / autres dépenses / épargne programmée / non affecté.
  const split = [
    { key: 'vitales', value: summary.essential, color: C.accent },
    { key: 'autres', value: summary.discretionary, color: C.warning },
    { key: 'epargne_programmee', value: Math.max(0, Math.min(summary.plannedSavings, summary.capacity)), color: C.positive },
    { key: 'non_affecte', value: Math.max(0, summary.unallocated), color: C.textFaint },
  ].filter((s) => s.value > 0);
  const splitTotal = split.reduce((a, s) => a + s.value, 0);

  const comparison = actual.monthly !== undefined && hasData ? compareSavings(summary.capacity, actual.monthly) : undefined;
  const gaugeMax = Math.max(Math.abs(summary.capacity), Math.abs(actual.monthly ?? 0), Math.abs(contributions?.monthly ?? 0), 1);
  const signColor = (v: number) => (v >= 0 ? C.positive : C.negative);

  const ruleColor = (key: string, pct: number, target: number) => {
    // Besoins / envies : rester sous le repère ; épargne : l'atteindre.
    const ok = key === 'savings' ? pct >= target : pct <= target;
    const close = key === 'savings' ? pct >= target - 5 : pct <= target + 5;
    return ok ? C.positive : close ? C.warning : C.negative;
  };

  const lineSub = (l: BudgetLine) => {
    if (l.auto) return t('budget.ligne_pret_auto');
    const item = itemsById.get(l.id);
    // Sans libellé personnalisé, le nom de la ligne est déjà la catégorie : ne pas la répéter.
    const parts = l.label === BUDGET_CATEGORY_LABELS[l.category] ? [] : [BUDGET_CATEGORY_LABELS[l.category]];
    if (item && item.frequency !== 'monthly') {
      parts.push(`${formatEur(item.amount)} · ${BUDGET_FREQUENCY_LABELS[item.frequency].toLowerCase()}`);
    }
    if (l.kind === 'expense' && l.essential) parts.push(t('budget.vitale'));
    return parts.join('  ·  ');
  };

  // Couleurs catégorielles : la palette des types de compte (suit le thème), « autres » en gris.
  const palette = Object.values(ACCOUNT_TYPE_COLORS);
  const top = summary.byCategory.slice(0, palette.length);
  const rest = summary.byCategory.slice(palette.length).reduce((a, c) => a + c.monthly, 0);
  const categorySlices = [
    ...top.map((c, i) => ({
      key: c.category,
      label: BUDGET_CATEGORY_LABELS[c.category],
      value: c.monthly,
      color: palette[i],
    })),
    { key: 'autres', label: t('budget.autres_categories'), value: rest, color: C.textFaint },
  ];
  const vitalSlices = [
    { key: 'vitales', label: t('budget.part_vitales'), value: summary.essential, color: C.accent },
    { key: 'autres', label: t('budget.part_autres'), value: summary.discretionary, color: C.warning },
  ];

  const groupTotal = (kind: BudgetKind) =>
    kind === 'income' ? summary.income : kind === 'expense' ? summary.expenses : summary.plannedSavings;

  // Sans donnée, pas de diagnostic à montrer : on affiche directement la saisie des postes.
  const section: BudgetSection = hasData ? selected : 'postes';

  return (
    <View style={styles.screen}>
      {hasData && (
        <SectionSwitcher
          options={BUDGET_SECTIONS}
          value={section}
          onChange={setSelected}
          labels={{ synthese: t('budget.rubrique_synthese'), postes: t('budget.rubrique_postes') }}
        />
      )}
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        {!hasData && (
          <EmptyState
            icon={<TabIcon name="budget" color={C.textDim} size={30} />}
            title={t('budget.intro_titre')}
            text={t('budget.intro_texte')}
          />
        )}

        {section === 'synthese' && (
          <FadeInView key="synthese">
              {hasData && (
                <Card>
                  <Text style={styles.heroLabel}>{t('budget.capacite')}</Text>
                  <Text style={[styles.heroValue, { color: signColor(summary.capacity) }]}>{perMonth(summary.capacity)}</Text>
                  <Text style={styles.heroSub}>
                    {t('budget.par_an', { amount: formatEur(summary.capacity * 12) })}
                    {summary.savingsRate !== undefined
                      ? `  ·  ${t('budget.taux_epargne', { pct: formatPct(summary.savingsRate * 100) })}`
                      : ''}
                  </Text>
                  <View style={[styles.statRow, styles.statRowFirst]}>
                    <Text style={styles.statLabel}>{t('budget.revenus')}</Text>
                    <Text style={styles.statValue}>{formatEur(summary.income)}</Text>
                  </View>
                  <View style={styles.statRow}>
                    <Text style={styles.statLabel}>{t('budget.depenses')}</Text>
                    <Text style={styles.statValue}>− {formatEur(summary.expenses)}</Text>
                  </View>
                  <View style={styles.statRow}>
                    <Text style={styles.statLabelSub}>{t('budget.dont_vitales')}</Text>
                    <Text style={styles.statValueSub}>
                      {formatEur(summary.essential)}
                      {summary.essentialRatio !== undefined ? `  ·  ${formatPct(summary.essentialRatio * 100)}` : ''}
                    </Text>
                  </View>
                  {summary.plannedSavings > 0 && (
                    <>
                      <View style={styles.statRow}>
                        <Text style={styles.statLabel}>{t('budget.epargne_programmee')}</Text>
                        <Text style={styles.statValue}>− {formatEur(summary.plannedSavings)}</Text>
                      </View>
                      <View style={styles.statRow}>
                        <Text style={styles.statLabel}>{t('budget.reste_non_affecte')}</Text>
                        <Text style={[styles.statValue, { color: signColor(summary.unallocated) }]}>
                          {formatEur(summary.unallocated)}
                        </Text>
                      </View>
                    </>
                  )}
                  {summary.capacity < 0 && <Text style={[styles.verdict, { color: C.negative }]}>{t('budget.deficit')}</Text>}
                  {summary.capacity >= 0 && summary.unallocated < 0 && (
                    <Text style={[styles.verdict, { color: C.warning }]}>{t('budget.epargne_superieure_capacite')}</Text>
                  )}
                </Card>
              )}

              {hasData && summary.income > 0 && splitTotal > 0 && (
                <Card>
                  <Text style={styles.cardTitle}>{t('budget.repartition_titre')}</Text>
                  <View style={styles.bar}>
                    {split.map((s) => (
                      <View key={s.key} style={{ flex: s.value / splitTotal, backgroundColor: s.color, marginRight: 2 }} />
                    ))}
                  </View>
                  {split.map((s) => (
                    <View key={s.key} style={styles.legendRow}>
                      <View style={[styles.swatch, { backgroundColor: s.color }]} />
                      <Text style={styles.legendLabel}>{t(`budget.part_${s.key}`)}</Text>
                      <Text style={styles.legendValue}>
                        {formatEur(s.value)}
                        <Text style={styles.legendPct}>  {formatPct((s.value / summary.income) * 100)}</Text>
                      </Text>
                    </View>
                  ))}
                </Card>
              )}

              {hasData && (
                <Card>
                  <Text style={styles.cardTitle}>{t('budget.reel_titre')}</Text>
                  <Chips options={SAVINGS_PERIODS} value={period} onChange={setPeriod} />
                  <View style={styles.gaugeRow}>
                    <View style={styles.gaugeHead}>
                      <Text style={styles.gaugeLabel}>{t('budget.reel_theorique')}</Text>
                      <Text style={styles.gaugeValue}>{perMonth(summary.capacity)}</Text>
                    </View>
                    <ProgressBar ratio={Math.abs(summary.capacity) / gaugeMax} color={summary.capacity >= 0 ? C.accent : C.negative} />
                  </View>
                  {actual.monthly !== undefined ? (
                    <View style={styles.gaugeRow}>
                      <View style={styles.gaugeHead}>
                        <Text style={styles.gaugeLabel}>{t('budget.reel_constatee')}</Text>
                        <Text style={styles.gaugeValue}>{perMonth(actual.monthly)}</Text>
                      </View>
                      <ProgressBar ratio={Math.abs(actual.monthly) / gaugeMax} color={signColor(actual.monthly)} />
                    </View>
                  ) : (
                    <Text style={styles.verdict}>{t('budget.reel_insuffisant')}</Text>
                  )}
                  {contributions?.monthly !== undefined && (
                    <View style={styles.gaugeRow}>
                      <View style={styles.gaugeHead}>
                        <Text style={styles.gaugeLabel}>{t('budget.reel_versements')}</Text>
                        <Text style={styles.gaugeValue}>{perMonth(contributions.monthly)}</Text>
                      </View>
                      <ProgressBar ratio={Math.abs(contributions.monthly) / gaugeMax} color={signColor(contributions.monthly)} />
                    </View>
                  )}
                  {comparison && (
                    <Text
                      style={[
                        styles.verdict,
                        { color: comparison.status === 'aligned' ? C.positive : comparison.status === 'below' ? C.warning : C.textDim },
                      ]}
                    >
                      {t(`budget.reel_${comparison.status}`, { gap: formatEur(Math.abs(comparison.gap)) })}
                    </Text>
                  )}
                  <Text style={styles.note}>
                    {t('budget.reel_note')}
                    {actual.skippedAccounts > 0 ? ` ${t('budget.reel_comptes_ignores', { count: actual.skippedAccounts })}` : ''}
                    {contributions?.monthly !== undefined
                      ? ` ${t('budget.reel_versements_note', { count: contributions.trackedAccountIds.length })}`
                      : ''}
                  </Text>
                </Card>
              )}

              {hasData && rule && (
                <Card>
                  <Text style={styles.cardTitle}>{t('budget.regle_titre')}</Text>
                  {rule.map((r) => (
                    <View key={r.key} style={styles.gaugeRow}>
                      <View style={styles.gaugeHead}>
                        <Text style={styles.gaugeLabel}>{t(`budget.regle_${r.key}`)}</Text>
                        <Text style={styles.gaugeValue}>
                          {t('budget.regle_valeur', { pct: formatPct(r.pct), target: formatPct(r.target) })}
                        </Text>
                      </View>
                      <ProgressBar ratio={r.pct / 100} color={ruleColor(r.key, r.pct, r.target)} />
                    </View>
                  ))}
                  <Text style={styles.note}>{t('budget.regle_note')}</Text>
                </Card>
              )}

              {hasData && effort > 0 && (
                <Card>
                  <Text style={styles.cardTitle}>{t('budget.objectifs_titre')}</Text>
                  <View style={styles.gaugeHead}>
                    <Text style={styles.gaugeLabel}>{t('budget.objectifs_effort')}</Text>
                    <Text style={styles.gaugeValue}>{perMonth(effort)}</Text>
                  </View>
                  <ProgressBar
                    ratio={summary.capacity > 0 ? effort / summary.capacity : 1}
                    color={effort <= summary.capacity ? C.positive : C.negative}
                  />
                  <Text style={styles.verdict}>
                    {summary.capacity > 0
                      ? t(effort <= summary.capacity ? 'budget.objectifs_ok' : 'budget.objectifs_trop', {
                          pct: formatPct((effort / summary.capacity) * 100),
                        })
                      : t('budget.objectifs_sans_capacite')}
                  </Text>
                </Card>
              )}

              {summary.expenses > 0 && (
                <Card>
                  <Text style={styles.cardTitle}>{t('budget.postes_titre')}</Text>
                  <Segmented
                    options={SPLIT_CHARTS}
                    value={splitChart}
                    onChange={setSplitChart}
                    labels={{ vital: t('budget.graphe_vital'), categories: t('budget.vue_categories') }}
                    style={{ marginBottom: 12 }}
                  />
                  <DonutChart
                    slices={splitChart === 'vital' ? vitalSlices : categorySlices}
                    centerLabel={t('budget.depenses')}
                  />
                </Card>
              )}

              {items.length > 0 && insights.length > 0 && (
                <>
                  <SectionTitle>{t('budget.conseils')}</SectionTitle>
                  {insights.map((insight) => (
                    <InsightCard key={insight.id} insight={insight} />
                  ))}
                </>
              )}
          </FadeInView>
        )}

        {section === 'postes' && (
          <FadeInView key="postes">
              {hasData && (
                <Segmented
                  options={POSTES_VIEWS}
                  value={postesView}
                  onChange={setPostesView}
                  labels={{ liste: t('budget.vue_liste'), categories: t('budget.vue_categories') }}
                />
              )}
              {BUDGET_KINDS.map((kind) => {
                const group = lines.filter((l) => l.kind === kind).sort((a, b) => b.monthly - a.monthly);
                const open = !collapsed.has(kind);
                const row = (l: BudgetLine, last: boolean, indent = false) => (
                  <ListRow
                    key={l.id}
                    title={l.label}
                    subtitle={lineSub(l) || undefined}
                    value={perMonth(l.monthly)}
                    left={indent ? <View style={{ width: 8 }} /> : undefined}
                    disabled={l.auto}
                    onPress={() => router.push({ pathname: '/budget-form', params: { itemId: l.id } })}
                    last={last}
                  />
                );
                // Catégories triées par total décroissant (les lignes le sont déjà).
                const byCat = new Map<BudgetCategory, BudgetLine[]>();
                for (const l of group) byCat.set(l.category, [...(byCat.get(l.category) ?? []), l]);
                const cats = Array.from(byCat, ([category, catLines]) => ({
                  category,
                  catLines,
                  total: catLines.reduce((a, l) => a + l.monthly, 0),
                })).sort((a, b) => b.total - a.total);
                return (
                  <View key={kind}>
                    <GroupHeader
                      title={t(`budget.groupe_${kind}`)}
                      total={group.length > 0 ? perMonth(groupTotal(kind)) : undefined}
                      onPress={group.length > 0 ? () => toggle(kind) : undefined}
                      expanded={open}
                    />
                    {group.length === 0 ? (
                      <Empty text={t(`budget.vide_${kind}`)} />
                    ) : !open ? null : postesView === 'liste' ? (
                      <ListCard>{group.map((l, i) => row(l, i === group.length - 1))}</ListCard>
                    ) : (
                      <ListCard>
                        {cats.map((c, ci) => {
                          const catKey = `${kind}:${c.category}`;
                          const catOpen = !collapsed.has(catKey);
                          const lastCat = ci === cats.length - 1;
                          return (
                            <View key={c.category}>
                              <ListRow
                                title={BUDGET_CATEGORY_LABELS[c.category]}
                                subtitle={t('budget.nb_postes', { count: c.catLines.length })}
                                value={perMonth(c.total)}
                                onPress={() => toggle(catKey)}
                                expanded={catOpen}
                                last={lastCat && !catOpen}
                              />
                              {catOpen &&
                                c.catLines.map((l, i) => row(l, lastCat && i === c.catLines.length - 1, true))}
                            </View>
                          );
                        })}
                      </ListCard>
                    )}
                    {open && (
                      <Button
                        title={t(`budget.ajouter_${kind}`)}
                        variant={kind === 'income' && !hasData ? 'primary' : 'secondary'}
                        onPress={() => router.push({ pathname: '/budget-form', params: { kind } })}
                      />
                    )}
                  </View>
                );
              })}

              {(loans.length > 0 || hasLoanLines) && (
                <>
                  <SectionTitle>{t('budget.options')}</SectionTitle>
                  <Card>
                    <Checkbox label={t('budget.inclure_prets')} value={includeLoans} onChange={setIncludeLoans} />
                    <Text style={styles.note}>{t('budget.inclure_prets_note')}</Text>
                  </Card>
                </>
              )}
          </FadeInView>
        )}

        <Text style={[styles.note, { paddingHorizontal: 4 }]}>{t('budget.avertissement')}</Text>
      </ScrollView>
    </View>
  );
}
