/** Synthèse : valeur totale, courbe par période, répartition par type. */
import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AllocationBar } from '@/components/AllocationBar';
import { LineChart } from '@/components/LineChart';
import { Button, Card, Chips, Empty, SectionTitle } from '@/components/ui';
import { C } from '@/constants/theme';
import { syncAllConnections } from '@/lib/connectors';
import { formatEur, formatPct } from '@/lib/format';
import { accountCurrentValue, buildSeries, seriesDelta } from '@/lib/portfolio';
import { refreshAllPrices } from '@/lib/prices';
import { useStore } from '@/lib/store';
import { PERIODS, type AccountType, type Period } from '@/lib/types';

export default function Dashboard() {
  const accounts = useStore((s) => s.accounts);
  const holdings = useStore((s) => s.holdings);
  const snapshots = useStore((s) => s.snapshots);
  const rates = useStore((s) => s.fxRates);
  const [period, setPeriod] = useState<Period>('6M');
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const active = useMemo(() => accounts.filter((a) => !a.archived), [accounts]);

  const totalValue = useMemo(
    () => active.reduce((acc, a) => acc + accountCurrentValue(a, holdings, snapshots, rates), 0),
    [active, holdings, snapshots, rates]
  );

  const series = useMemo(
    () => buildSeries(active.map((a) => a.id), snapshots, period),
    [active, snapshots, period]
  );

  const delta = useMemo(() => seriesDelta(series), [series]);

  const byType = useMemo(() => {
    const m = new Map<AccountType, number>();
    for (const a of active) {
      const v = accountCurrentValue(a, holdings, snapshots, rates);
      if (v > 0) m.set(a.type, (m.get(a.type) ?? 0) + v);
    }
    return m;
  }, [active, holdings, snapshots, rates]);

  const onRefresh = async () => {
    setRefreshing(true);
    setMessage(null);
    try {
      const prices = await refreshAllPrices();
      const sync = await syncAllConnections();
      const issues = [...prices.errors, ...sync.errors, ...sync.warnings];
      setMessage(
        issues.length > 0
          ? `Mise à jour partielle : ${issues.slice(0, 3).join(' · ')}${issues.length > 3 ? '…' : ''}`
          : 'Cours et comptes synchronisés.'
      );
    } catch (e: any) {
      setMessage(`Erreur : ${e?.message ?? e}`);
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
        <Text style={styles.totalLabel}>Patrimoine total</Text>
        <Text style={styles.totalValue}>{formatEur(totalValue)}</Text>
        {series.length >= 2 && (
          <Text style={[styles.delta, { color: deltaColor }]}>
            {delta.abs >= 0 ? '+' : ''}
            {formatEur(delta.abs)}
            {delta.pct !== undefined ? `  (${formatPct(delta.pct, true)})` : ''}
            <Text style={styles.deltaPeriod}>  sur {period}</Text>
          </Text>
        )}
        <View style={{ height: 12 }} />
        <Chips options={PERIODS} value={period} onChange={setPeriod} />
        <LineChart points={series} />
      </Card>

      <Button title="Rafraîchir cours et synchronisations" variant="secondary" onPress={onRefresh} loading={refreshing} />
      {message && <Text style={styles.message}>{message}</Text>}

      <SectionTitle>Répartition</SectionTitle>
      <Card>
        {byType.size > 0 ? (
          <AllocationBar byType={byType} />
        ) : (
          <Empty text="Ajoutez des comptes dans l'onglet Comptes pour voir la répartition." />
        )}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 40 },
  totalLabel: { color: C.textDim, fontSize: 14 },
  totalValue: { color: C.text, fontSize: 34, fontWeight: '700', marginTop: 2 },
  delta: { fontSize: 14, fontWeight: '600', marginTop: 4 },
  deltaPeriod: { color: C.textFaint, fontWeight: '400' },
  message: { color: C.warning, fontSize: 13, marginBottom: 8, paddingHorizontal: 4 },
});
