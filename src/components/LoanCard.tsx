/** Carte d'un prêt : mensualité, progression, stats d'amortissement, paliers, courbe. */
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LineChart } from '@/components/LineChart';
import { Card, ProgressBar } from '@/components/ui';
import { C } from '@/constants/theme';
import { formatDate, formatDuration, formatMoney, formatPct } from '@/lib/format';
import { loanPhases, loanSchedule, loanStats } from '@/lib/realestate';
import { ACCOUNT_TYPE_COLORS, type Currency, type Loan } from '@/lib/types';

export function LoanCard({
  loan,
  onEdit,
  color = ACCOUNT_TYPE_COLORS.immobilier,
  context,
}: {
  loan: Loan;
  onEdit: () => void;
  /** Couleur d'accent de la carte (immobilier par défaut). */
  color?: string;
  /** Ligne de contexte optionnelle (ex : nom du bien financé). */
  context?: string;
}) {
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
              {context ? `${context}  ·  ` : ''}
              {loan.lender ? `${loan.lender}  ·  ` : ''}
              {formatPct(loan.annualRate, false, 2)}  ·  {formatMoney(st.monthlyWithInsurance, cur, true)}/mois
              {loan.insuranceMonthly ? ' (assur. incl.)' : ''}
              {st.stepped ? '  ·  paliers' : ''}
            </Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </View>

        <View style={styles.progressWrap}>
          <ProgressBar ratio={paidRatio} color={color} />
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

        <LineChart points={schedule} color={color} />
        <Text style={styles.scheduleNote}>Capital restant dû sur la durée du prêt</Text>
      </Card>
    </Pressable>
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
});
