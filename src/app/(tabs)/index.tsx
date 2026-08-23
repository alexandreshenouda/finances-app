/** Synthèse : valeur totale, courbe par période, répartition par type, objectifs. */
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AllocationBar } from '@/components/AllocationBar';
import { LineChart } from '@/components/LineChart';
import { ObjectiveCard } from '@/components/ObjectiveCard';
import { PieChart } from '@/components/PieChart';
import { Button, Card, Checkbox, Chips, Empty, PeriodChips, SectionTitle } from '@/components/ui';
import { C } from '@/constants/theme';
import { syncAllConnections } from '@/lib/connectors';
import { formatEur, formatPct } from '@/lib/format';
import { accountCurrentValue, accountShare, seriesDelta } from '@/lib/portfolio';
import { refreshAllPrices } from '@/lib/prices';
import { houseIndexSeries, refreshHouseIndex } from '@/lib/prices/houseIndex';
import { buildPatrimoineSeries, consoDebtEur, realEstateTotals } from '@/lib/realestate';
import { useStore } from '@/lib/store';
import { type AccountType, type Period } from '@/lib/types';

const WORTH_MODES = ['net', 'brut'] as const;
const ALLOC_VIEWS = ['barre', 'camembert'] as const;

export default function Dashboard() {
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
  // null = suivre le réglage « période par défaut » ; sinon choix manuel de session.
  const [periodOverride, setPeriodOverride] = useState<Period | null>(null);
  const period = periodOverride ?? defaultPeriod;
  const [allocView, setAllocView] = useState<(typeof ALLOC_VIEWS)[number]>('barre');
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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

  const onRefresh = async () => {
    setRefreshing(true);
    setMessage(null);
    try {
      const prices = await refreshAllPrices();
      const sync = await syncAllConnections();
      const idx = hasRealEstate ? await refreshHouseIndex() : { ok: true as const };
      const issues = [...prices.errors, ...sync.errors, ...sync.warnings, ...(idx.ok ? [] : [idx.error!])];
      setMessage(
        issues.length > 0
          ? t('index.maj_partielle', { issues: issues.slice(0, 3).join(' · '), ellipsis: issues.length > 3 ? '…' : '' })
          : t('index.synchronise')
      );
    } catch (e: any) {
      setMessage(t('index.erreur', { message: e?.message ?? e }));
    } finally {
      setRefreshing(false);
    }
  };

  const deltaColor = delta.abs >= 0 ? C.positive : C.negative;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.text} />}
    >
      <Card>
        <View style={styles.totalHeader}>
          <Text style={styles.totalLabel}>{t('index.patrimoine_total')}</Text>
          {((hasRealEstate && showRealEstate) || consoDebt > 0) && (
            <Chips
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
          <Text style={[styles.delta, { color: deltaColor }]}>
            {delta.abs >= 0 ? '+' : ''}
            {formatEur(delta.abs)}
            {delta.pct !== undefined ? `  (${formatPct(delta.pct, true)})` : ''}
            <Text style={styles.deltaPeriod}>  {t('index.sur_periode', { period })}</Text>
          </Text>
        )}
        <View style={{ height: 12 }} />
        <PeriodChips value={period} onChange={setPeriodOverride} />
        <LineChart points={series} />
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

      <Button title={t('index.rafraichir')} variant="secondary" onPress={onRefresh} loading={refreshing} />
      {message && <Text style={styles.message}>{message}</Text>}

      <View style={styles.allocHeader}>
        <SectionTitle>{t('index.repartition')}</SectionTitle>
        {byType.size > 0 && (
          <Chips options={ALLOC_VIEWS} value={allocView} onChange={setAllocView} labels={ALLOC_LABELS} />
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
          <Empty text={t('index.repartition_vide')} />
        )}
      </Card>

      <View style={styles.allocHeader}>
        <SectionTitle>{t('objectives.title')}</SectionTitle>
      </View>
      {objectives.length === 0 ? (
        <Card>
          <Empty text={t('index.objectifs_vide')} />
        </Card>
      ) : (
        objectives.map((o) => (
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
        ))
      )}
      <Button title={t('index.ajouter_objectif')} variant="secondary" onPress={() => router.push('/objective-form')} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 40 },
  totalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  allocHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reToggle: { marginTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border, paddingTop: 12 },
  totalLabel: { color: C.textDim, fontSize: 14 },
  worthNote: { color: C.textFaint, fontSize: 12, marginTop: 2 },
  totalValue: { color: C.text, fontSize: 34, fontWeight: '700', marginTop: 2 },
  delta: { fontSize: 14, fontWeight: '600', marginTop: 4 },
  deltaPeriod: { color: C.textFaint, fontWeight: '400' },
  message: { color: C.warning, fontSize: 13, marginBottom: 8, paddingHorizontal: 4 },
});
