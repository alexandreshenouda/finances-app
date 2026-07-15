/** Détail d'un bien : valeur estimée, plus-value, courbe, crédits & amortissement. */
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LineChart } from '@/components/LineChart';
import { Button, Card, Empty, PeriodChips, ProgressBar, SectionTitle } from '@/components/ui';
import { C } from '@/constants/theme';
import { confirmAction } from '@/lib/confirm';
import { formatDate, formatDuration, formatEur, formatMoney, formatPct } from '@/lib/format';
import { houseIndexSeries } from '@/lib/prices/houseIndex';
import {
  buildPropertyValueSeries,
  loanPhases,
  loanSchedule,
  loanStats,
  ownershipShare,
  propertyDebtEur,
  propertyGainEur,
} from '@/lib/realestate';
import { useStore } from '@/lib/store';
import { ACCOUNT_TYPE_COLORS, PROPERTY_KIND_LABELS, type Currency, type Loan, type Period } from '@/lib/types';

const IMMO = ACCOUNT_TYPE_COLORS.immobilier;

export default function PropertyDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const property = useStore((s) => s.properties.find((p) => p.id === id));
  const allLoans = useStore((s) => s.loans);
  const rates = useStore((s) => s.fxRates);
  const houseIndex = useStore((s) => s.houseIndex);
  const deleteProperty = useStore((s) => s.deleteProperty);

  const [period, setPeriod] = useState<Period>('MAX');

  const series = useMemo(() => houseIndexSeries(), [houseIndex]);
  const loans = useMemo(() => allLoans.filter((l) => l.propertyId === id), [allLoans, id]);
  const valueSeries = useMemo(
    () => (property ? buildPropertyValueSeries(property, series, rates, period) : []),
    [property, series, rates, period]
  );

  if (!property) return <Empty text="Bien introuvable." />;

  const gain = propertyGainEur(property, series, rates);
  const debt = propertyDebtEur(property.id, allLoans, rates);
  const equity = gain.value - debt;
  const share = ownershipShare(property);
  const partial = share < 1;
  const cur: Currency = property.currency ?? 'EUR';
  const gainColor = gain.gainAbs >= 0 ? C.positive : C.negative;

  const onDelete = () =>
    confirmAction('Supprimer le bien', `« ${property.name} », ses crédits et son suivi seront supprimés.`, () => {
      deleteProperty(property.id);
      router.back();
    });

  return (
    <>
      <Stack.Screen options={{ title: property.name }} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Card>
          <Text style={styles.kind}>
            {PROPERTY_KIND_LABELS[property.kind]}
            {property.address ? `  ·  ${property.address}` : ''}
            {cur !== 'EUR' ? `  ·  ${cur}` : ''}
          </Text>
          <Text style={styles.value}>{formatEur(gain.value)}</Text>
          <Text style={[styles.gain, { color: gainColor }]}>
            {gain.gainAbs >= 0 ? '+' : ''}
            {formatEur(gain.gainAbs)} ({formatPct(gain.gainPct, true)})
            <Text style={styles.gainRef}>  vs prix d'achat</Text>
          </Text>
          <View style={{ height: 12 }} />
          <PeriodChips value={period} onChange={setPeriod} />
          <LineChart points={valueSeries} color={IMMO} />
          <Text style={styles.estimateNote}>
            {property.valuationMode === 'manual'
              ? 'Valeur saisie manuellement (historique projeté via l’indice INSEE).'
              : 'Estimée via l’indice national des prix des logements anciens (INSEE).'}
          </Text>
        </Card>

        <SectionTitle>Bilan</SectionTitle>
        <Card>
          <Row label="Valeur estimée" value={formatEur(gain.value)} />
          <Row label="Prix d'achat" value={formatEur(gain.purchase)} />
          {property.purchaseCosts !== undefined && <Row label="Prix de revient (avec frais)" value={formatEur(gain.cost)} />}
          {property.surface !== undefined && property.surface > 0 && (
            <Row label="Prix estimé au m²" value={formatEur(gain.value / property.surface)} />
          )}
          <Row label="Acheté le" value={formatDate(property.purchaseDate)} />
          {partial && <Row label="Quote-part détenue" value={formatPct(property.ownershipPct!)} />}
          {debt > 0 && <Row label="Capital restant dû" value={formatEur(debt)} />}
          <View style={styles.equityRow}>
            <Text style={styles.equityLabel}>Valeur nette (équité)</Text>
            <Text style={styles.equityValue}>{formatEur(equity)}</Text>
          </View>
          {partial && (
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Votre part nette ({formatPct(property.ownershipPct!)})</Text>
              <Text style={styles.rowValue}>{formatEur(equity * share)}</Text>
            </View>
          )}
        </Card>

        <SectionTitle>Crédits</SectionTitle>
        {loans.length === 0 && <Empty text="Aucun crédit. Ajoutez le prêt immobilier finançant ce bien." />}
        {loans.map((loan) => (
          <LoanCard key={loan.id} loan={loan} onEdit={() => router.push({ pathname: '/loan-form', params: { propertyId: property.id, loanId: loan.id } })} />
        ))}
        <Button
          title="+ Ajouter un crédit"
          variant="secondary"
          onPress={() => router.push({ pathname: '/loan-form', params: { propertyId: property.id } })}
        />

        {property.notes ? (
          <>
            <SectionTitle>Notes</SectionTitle>
            <Card>
              <Text style={styles.notes}>{property.notes}</Text>
            </Card>
          </>
        ) : null}

        <View style={{ height: 16 }} />
        <Button title="Modifier le bien" variant="secondary" onPress={() => router.push({ pathname: '/property-form', params: { propertyId: property.id } })} />
        <Button title="Supprimer le bien" variant="danger" onPress={onDelete} />
      </ScrollView>
    </>
  );
}

function LoanCard({ loan, onEdit }: { loan: Loan; onEdit: () => void }) {
  const cur: Currency = loan.currency ?? 'EUR';
  const st = loanStats(loan);
  const schedule = useMemo(() => loanSchedule(loan), [loan]);
  const phases = useMemo(() => (st.stepped ? loanPhases(loan) : []), [loan, st.stepped]);
  const paidRatio = loan.principal > 0 ? Math.max(0, st.paidPrincipal / loan.principal) : 0;

  return (
    <Pressable onPress={onEdit}>
      <Card>
        <View style={styles.loanHead}>
          <View style={{ flex: 1 }}>
            <Text style={styles.loanName}>{loan.name}</Text>
            <Text style={styles.loanSub}>
              {loan.lender ? `${loan.lender}  ·  ` : ''}
              {formatPct(loan.annualRate, false, 2)}  ·  {formatMoney(st.monthlyWithInsurance, cur, true)}/mois
              {loan.insuranceMonthly ? ' (assur. incl.)' : ''}
              {st.stepped ? '  ·  paliers' : ''}
            </Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </View>

        <View style={styles.progressWrap}>
          <ProgressBar ratio={paidRatio} color={IMMO} />
          <View style={styles.progressLabels}>
            <Text style={styles.progressLabel}>Remboursé {formatMoney(st.paidPrincipal, cur)}</Text>
            <Text style={styles.progressLabel}>{formatPct(paidRatio * 100)}</Text>
          </View>
        </View>

        <View style={styles.loanStatsGrid}>
          <Stat label="Capital restant dû" value={formatMoney(st.remainingBalance, cur)} />
          <Stat label="Temps restant" value={st.remainingMonths > 0 ? formatDuration(st.remainingMonths) : 'Soldé'} />
          <Stat label="Fin du prêt" value={formatDate(st.endDate)} />
          <Stat label="Coût du crédit" value={formatMoney(st.totalCost, cur)} sub={loan.insuranceMonthly ? `dont assur. ${formatMoney(st.insuranceTotal, cur)}` : undefined} />
        </View>

        {phases.length > 1 && (
          <View style={styles.phases}>
            {phases.map((ph, idx) => (
              <View key={idx} style={styles.phaseRow}>
                <Text style={styles.phaseLabel}>
                  Palier {idx + 1} · {formatDuration(ph.months)}
                </Text>
                <Text style={styles.phaseValue}>{formatMoney(ph.payment, cur, true)}/mois</Text>
              </View>
            ))}
          </View>
        )}

        <LineChart points={schedule} color={IMMO} />
        <Text style={styles.scheduleNote}>Capital restant dû sur la durée du prêt</Text>
      </Card>
    </Pressable>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 40 },
  kind: { color: C.textDim, fontSize: 13, fontWeight: '600' },
  value: { color: C.text, fontSize: 30, fontWeight: '700', marginTop: 6 },
  gain: { fontSize: 14, fontWeight: '600', marginTop: 4 },
  gainRef: { color: C.textFaint, fontWeight: '400' },
  estimateNote: { color: C.textFaint, fontSize: 12, marginTop: 4, lineHeight: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  rowLabel: { color: C.textDim, fontSize: 14 },
  rowValue: { color: C.text, fontSize: 14, fontWeight: '600' },
  equityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  equityLabel: { color: C.text, fontSize: 15, fontWeight: '600' },
  equityValue: { color: C.text, fontSize: 16, fontWeight: '700' },
  loanHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  loanName: { color: C.text, fontSize: 16, fontWeight: '600' },
  loanSub: { color: C.textDim, fontSize: 12, marginTop: 2 },
  chevron: { color: C.textFaint, fontSize: 20, marginLeft: 8 },
  progressWrap: { marginBottom: 12 },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  progressLabel: { color: C.textFaint, fontSize: 12 },
  loanStatsGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  stat: { width: '50%', paddingVertical: 6 },
  statLabel: { color: C.textFaint, fontSize: 12 },
  statValue: { color: C.text, fontSize: 15, fontWeight: '600', marginTop: 2 },
  statSub: { color: C.textFaint, fontSize: 11, marginTop: 1 },
  scheduleNote: { color: C.textFaint, fontSize: 11, textAlign: 'center' },
  phases: {
    marginBottom: 12,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  phaseRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  phaseLabel: { color: C.textDim, fontSize: 13 },
  phaseValue: { color: C.text, fontSize: 13, fontWeight: '600' },
  notes: { color: C.textDim, fontSize: 14, lineHeight: 20 },
});
