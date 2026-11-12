/** Synthèse : valeur totale, courbe par période, répartition par type, objectifs. */
import { useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AllocationBar } from '@/components/AllocationBar';
import { LineChart } from '@/components/LineChart';
import { ObjectiveCard } from '@/components/ObjectiveCard';
import { PieChart } from '@/components/PieChart';
import { PrivacyToggle } from '@/components/PrivacyToggle';
import { ProjectionCard } from '@/components/ProjectionCard';
import { TabIcon } from '@/components/TabIcons';
import { Button, Card, Checkbox, EmptyState, PeriodChips, Pill, SectionTitle, Segmented } from '@/components/ui';
import { C, CONTENT, FONT, TABULAR, useStyles } from '@/constants/theme';
import { syncAllConnections } from '@/lib/connectors';
import { formatEur, formatPct } from '@/lib/format';
import { accountCurrentValue, accountShare, seriesDelta, toPerformanceSeries } from '@/lib/portfolio';
import { refreshAllPrices } from '@/lib/prices';
import { houseIndexSeries, refreshHouseIndex } from '@/lib/prices/houseIndex';
import { buildPatrimoineSeries, consoDebtEur, realEstateTotals } from '@/lib/realestate';
import { useStore } from '@/lib/store';
import { CHART_MODES, type AccountType, type ChartMode, type Period } from '@/lib/types';

const WORTH_MODES = ['net', 'brut'] as const;
const ALLOC_VIEWS = ['barre', 'camembert'] as const;
/** Durée d'affichage de la confirmation « synchronisé ». */
const SUCCESS_MESSAGE_MS = 4000;

function makeStyles() {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.bg },
    content: { padding: 16, paddingBottom: 40, ...CONTENT },
    totalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    allocHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    chartControls: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 12,
    },
    deltaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 6 },
    headerActions: { flexDirection: 'row', alignItems: 'center' },
    headerButton: { marginRight: 16, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
    reToggle: { marginTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border, paddingTop: 12 },
    totalLabel: { color: C.textDim, fontSize: FONT.md },
    worthNote: { color: C.textFaint, fontSize: FONT.sm, marginTop: 2 },
    totalValue: { color: C.text, fontSize: FONT.hero, fontWeight: '700', marginTop: 2, ...TABULAR },
    deltaPeriod: { color: C.textFaint, fontSize: FONT.sm },
    message: { fontSize: FONT.sm, lineHeight: 18, marginBottom: 12, paddingHorizontal: 4 },
  });
}

export default function Dashboard() {
  const styles = useStyles(makeStyles);
  const { t } = useTranslation();
  const WORTH_LABELS: Record<(typeof WORTH_MODES)[number], string> = {
    net: t('index.net'),
    brut: t('index.brut'),
  };
  const ALLOC_LABELS: Record<(typeof ALLOC_VIEWS)[number], string> = {
    barre: t('index.barre'),
    camembert: t('index.camembert'),
  };
  const router = useRouter();
  const accounts = useStore((s) => s.accounts);
  const holdings = useStore((s) => s.holdings);
  const snapshots = useStore((s) => s.snapshots);
  const rates = useStore((s) => s.fxRates);
  useStore((s) => s.privacyMode); // re-render au changement de mode confidentialité (masquage dans format.ts)
  const properties = useStore((s) => s.properties);
  const loans = useStore((s) => s.loans);
  const objectives = useStore((s) => s.objectives);
  const houseIndex = useStore((s) => s.houseIndex);
  const patrimoineNet = useStore((s) => s.patrimoineNet);
  const setPatrimoineNet = useStore((s) => s.setPatrimoineNet);
  const showRealEstate = useStore((s) => s.showRealEstate);
  const setShowRealEstate = useStore((s) => s.setShowRealEstate);
  const defaultPeriod = useStore((s) => s.defaultPeriod);
  const chartMode = useStore((s) => s.chartMode);
  const setChartMode = useStore((s) => s.setChartMode);
  const CHART_MODE_LABELS: Record<ChartMode, string> = {
    value: t('chart.mode_valeur'),
    percent: t('chart.mode_performance'),
  };
  // null = suivre le réglage « période par défaut » ; sinon choix manuel de session.
  const [periodOverride, setPeriodOverride] = useState<Period | null>(null);
  const period = periodOverride ?? defaultPeriod;
  const [allocView, setAllocView] = useState<(typeof ALLOC_VIEWS)[number]>('barre');
  const [refreshing, setRefreshing] = useState(false);
  // `ok` : confirmation discrète qui s'efface seule ; sinon l'avertissement reste affiché.
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const navigation = useNavigation();

  const active = useMemo(() => accounts.filter((a) => !a.archived), [accounts]);
  const series0 = useMemo(() => houseIndexSeries(), [houseIndex]);

  const accountsValue = useMemo(
    () => active.reduce((acc, a) => acc + accountCurrentValue(a, holdings, snapshots, rates) * accountShare(a), 0),
    [active, holdings, snapshots, rates]
  );

  const re = useMemo(
    () => realEstateTotals(properties, loans, series0, rates),
    [properties, loans, series0, rates]
  );

  const hasRealEstate = properties.some((p) => !p.archived);
  // Contribution des biens immobiliers, neutralisée si l'utilisateur les masque
  // (les comptes bancaires de type « immobilier » restent toujours comptés).
  const reGross = showRealEstate ? re.gross : 0;
  const reDebt = showRealEstate ? re.debt : 0;
  const reEquity = showRealEstate ? re.equity : 0;
  // Les prêts conso sont toujours déduits du net (indépendants du masquage immo).
  const consoDebt = useMemo(() => consoDebtEur(loans, rates), [loans, rates]);
  const debtTotal = reDebt + consoDebt;
  const grossTotal = accountsValue + reGross;
  const totalValue = patrimoineNet ? grossTotal - debtTotal : grossTotal;

  const series = useMemo(
    () =>
      buildPatrimoineSeries(
        active,
        snapshots,
        showRealEstate ? properties : [],
        // Les prêts immo des biens masqués sont ignorés en interne ; les conso restent comptés.
        showRealEstate ? loans : loans.filter((l) => !l.propertyId),
        series0,
        rates,
        period,
        patrimoineNet
      ),
    [active, snapshots, showRealEstate, properties, loans, series0, rates, period, patrimoineNet]
  );

  const delta = useMemo(() => seriesDelta(series), [series]);
  const displayPoints = useMemo(
    () => (chartMode === 'percent' ? toPerformanceSeries(series) : series),
    [chartMode, series]
  );

  const byType = useMemo(() => {
    const m = new Map<AccountType, number>();
    for (const a of active) {
      const v = accountCurrentValue(a, holdings, snapshots, rates) * accountShare(a);
      if (v > 0) m.set(a.type, (m.get(a.type) ?? 0) + v);
    }
    const immo = patrimoineNet ? reEquity : reGross;
    if (immo > 0) m.set('immobilier', (m.get('immobilier') ?? 0) + immo);
    return m;
  }, [active, holdings, snapshots, rates, reEquity, reGross, patrimoineNet]);

  const refreshingRef = useRef(false);
  const onRefresh = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    setMessage(null);
    try {
      const prices = await refreshAllPrices();
      const sync = await syncAllConnections();
      const idx = hasRealEstate ? await refreshHouseIndex() : { ok: true as const };
      const issues = [...prices.errors, ...sync.errors, ...sync.warnings, ...(idx.ok ? [] : [idx.error!])];
      setMessage(
        issues.length > 0
          ? {
              ok: false,
              text: t('index.maj_partielle', {
                issues: issues.slice(0, 3).join(' · '),
                ellipsis: issues.length > 3 ? '…' : '',
              }),
            }
          : { ok: true, text: t('index.synchronise') }
      );
    } catch (e: any) {
      setMessage({ ok: false, text: t('index.erreur', { message: e?.message ?? e }) });
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
    }
  }, [hasRealEstate, t]);

  // La confirmation de succès disparaît d'elle-même ; une erreur reste jusqu'au prochain essai.
  useEffect(() => {
    if (!message?.ok) return;
    const timer = setTimeout(() => setMessage(null), SUCCESS_MESSAGE_MS);
    return () => clearTimeout(timer);
  }, [message]);

  // Rafraîchir vit dans l'en-tête (à côté de l'œil) : le tirer-pour-rafraîchir n'existe pas
  // sur le web, et un bouton pleine largeur sous la carte principale prenait trop de place.
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerActions}>
          <Pressable
            onPress={onRefresh}
            disabled={refreshing}
            hitSlop={10}
            style={({ pressed }) => [styles.headerButton, pressed && { opacity: 0.6 }]}
            accessibilityRole="button"
            accessibilityLabel={t('index.rafraichir')}
          >
            {refreshing ? (
              <ActivityIndicator size="small" color={C.textDim} />
            ) : (
              <TabIcon name="rafraichir" color={C.textDim} size={24} />
            )}
          </Pressable>
          <PrivacyToggle />
        </View>
      ),
    });
  }, [navigation, onRefresh, refreshing, styles, t]);

  const deltaColor = delta.abs >= 0 ? C.positive : C.negative;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.text} />}
    >
      {message && (
        <Text style={[styles.message, { color: message.ok ? C.positive : C.warning }]}>{message.text}</Text>
      )}
      <Card>
        <View style={styles.totalHeader}>
          <Text style={styles.totalLabel}>{t('index.patrimoine_total')}</Text>
          {((hasRealEstate && showRealEstate) || consoDebt > 0) && (
            <Segmented
              options={WORTH_MODES}
              value={patrimoineNet ? 'net' : 'brut'}
              onChange={(v) => setPatrimoineNet(v === 'net')}
              labels={WORTH_LABELS}
            />
          )}
        </View>
        <Text style={styles.totalValue}>{formatEur(totalValue)}</Text>
        {debtTotal > 0 && (
          <Text style={styles.worthNote}>
            {patrimoineNet
              ? t('index.net_de_credits', {
                  amount: formatEur(debtTotal),
                  kind:
                    consoDebt > 0 && reDebt === 0
                      ? t('index.credits_conso')
                      : reDebt > 0 && consoDebt === 0
                        ? t('index.credits_immobiliers')
                        : '',
                })
              : t('index.brut_credits', { amount: formatEur(debtTotal) })}
          </Text>
        )}
        {series.length >= 2 && (
          <View style={styles.deltaRow}>
            <Pill
              color={deltaColor}
              text={`${delta.abs >= 0 ? '+' : ''}${formatEur(delta.abs)}${
                delta.pct !== undefined ? `  ·  ${formatPct(delta.pct, true)}` : ''
              }`}
            />
            <Text style={styles.deltaPeriod}>{t('index.sur_periode', { period })}</Text>
          </View>
        )}
        <View style={{ height: 12 }} />
        <LineChart points={displayPoints} mode={chartMode} />
        <View style={styles.chartControls}>
          <PeriodChips value={period} onChange={setPeriodOverride} style={{ marginBottom: 0 }} />
          <Segmented options={CHART_MODES} value={chartMode} onChange={setChartMode} labels={CHART_MODE_LABELS} />
        </View>
        {hasRealEstate && (
          <View style={styles.reToggle}>
            <Checkbox
              label={t('index.inclure_biens')}
              value={showRealEstate}
              onChange={setShowRealEstate}
            />
          </View>
        )}
      </Card>

      <View style={styles.allocHeader}>
        <SectionTitle>{t('index.repartition')}</SectionTitle>
        {byType.size > 0 && (
          <Segmented options={ALLOC_VIEWS} value={allocView} onChange={setAllocView} labels={ALLOC_LABELS} />
        )}
      </View>
      <Card>
        {byType.size > 0 ? (
          allocView === 'camembert' ? (
            <PieChart byType={byType} />
          ) : (
            <AllocationBar byType={byType} />
          )
        ) : (
          <EmptyState
            icon={<TabIcon name="comptes" color={C.textDim} size={30} />}
            text={t('index.repartition_vide')}
            actionLabel={t('accounts.ajouter')}
            onAction={() => router.push('/account-form')}
          />
        )}
      </Card>

      <View style={styles.allocHeader}>
        <SectionTitle>{t('objectives.title')}</SectionTitle>
      </View>
      {objectives.length === 0 ? (
        <Card>
          <EmptyState
            icon={<TabIcon name="objectif" color={C.textDim} size={30} />}
            text={t('index.objectifs_vide')}
            actionLabel={t('index.ajouter_objectif')}
            onAction={() => router.push('/objective-form')}
          />
        </Card>
      ) : (
        <>
          {objectives.map((o) => (
            <ObjectiveCard
              key={o.id}
              objective={o}
              objectives={objectives}
              accounts={active}
              holdings={holdings}
              snapshots={snapshots}
              rates={rates}
              onPress={() => router.push({ pathname: '/objective-form', params: { objectiveId: o.id } })}
            />
          ))}
          <Button
            title={t('index.ajouter_objectif')}
            variant="secondary"
            onPress={() => router.push('/objective-form')}
          />
        </>
      )}

      <View style={[styles.allocHeader, { marginTop: 12 }]}>
        <SectionTitle>{t('projection.title')}</SectionTitle>
      </View>
      <ProjectionCard
        accounts={active}
        holdings={holdings}
        snapshots={snapshots}
        rates={rates}
        properties={properties}
        loans={loans}
        houseSeries={series0}
        objectives={objectives}
      />
    </ScrollView>
  );
}
