/** Carte d'un prêt : mensualité, progression, stats d'amortissement, paliers, courbe. */
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { LineChart } from '@/components/LineChart';
import { Card, Chevron, ProgressBar } from '@/components/ui';
import { C, FONT, TABULAR, useStyles } from '@/constants/theme';
import { formatDate, formatDuration, formatMoney, formatPct } from '@/lib/format';
import { loanPhases, loanSchedule, loanStats } from '@/lib/realestate';
import { ACCOUNT_TYPE_COLORS, type Currency, type Loan } from '@/lib/types';

function makeStyles() {
  return StyleSheet.create({
    loanHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    loanName: { color: C.text, fontSize: FONT.lg, fontWeight: '600' },
    loanSub: { color: C.textDim, fontSize: FONT.sm, marginTop: 2 },
    progressWrap: { marginBottom: 12 },
    progressLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
    progressLabel: { color: C.textFaint, fontSize: FONT.sm, ...TABULAR },
    loanStatsGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
    stat: { width: '50%', paddingVertical: 6 },
    statLabel: { color: C.textFaint, fontSize: FONT.sm },
    statValue: { color: C.text, fontSize: FONT.md, fontWeight: '600', marginTop: 2, ...TABULAR },
    statSub: { color: C.textFaint, fontSize: FONT.xs, marginTop: 1 },
    scheduleNote: { color: C.textFaint, fontSize: FONT.xs, textAlign: 'center' },
    phases: {
      marginBottom: 12,
      paddingTop: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: C.border,
    },
    phaseRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
    phaseLabel: { color: C.textDim, fontSize: FONT.sm },
    phaseValue: { color: C.text, fontSize: FONT.sm, fontWeight: '600', ...TABULAR },
  });
}

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
  const styles = useStyles(makeStyles);
  const { t } = useTranslation();
  const cur: Currency = loan.currency ?? 'EUR';
  const st = loanStats(loan);
  const schedule = useMemo(() => loanSchedule(loan), [loan]);
  const phases = useMemo(() => (st.stepped ? loanPhases(loan) : []), [loan, st.stepped]);
  const paidRatio = loan.principal > 0 ? Math.max(0, st.paidPrincipal / loan.principal) : 0;

  return (
      <Card onPress={onEdit}>
        <View style={styles.loanHead}>
          <View style={{ flex: 1 }}>
            <Text style={styles.loanName}>{loan.name}</Text>
            <Text style={styles.loanSub}>
              {context ? `${context}  ·  ` : ''}
              {loan.lender ? `${loan.lender}  ·  ` : ''}
              {formatPct(loan.annualRate, false, 2)}  ·  {t('loanCard.par_mois', { amount: formatMoney(st.monthlyWithInsurance, cur, true) })}
              {loan.insuranceMonthly ? ` ${t('loanCard.assurance_incluse')}` : ''}
              {st.stepped ? `  ·  ${t('loans.stepped')}` : ''}
            </Text>
          </View>
          <Chevron />
        </View>

        <View style={styles.progressWrap}>
          <ProgressBar ratio={paidRatio} color={color} />
          <View style={styles.progressLabels}>
            <Text style={styles.progressLabel}>{t('loanCard.rembourse', { amount: formatMoney(st.paidPrincipal, cur) })}</Text>
            <Text style={styles.progressLabel}>{formatPct(paidRatio * 100)}</Text>
          </View>
        </View>

        <View style={styles.loanStatsGrid}>
          <Stat label={t('loans.capital_restant_du')} value={formatMoney(st.remainingBalance, cur)} />
          <Stat label={t('loanCard.temps_restant')} value={st.remainingMonths > 0 ? formatDuration(st.remainingMonths) : t('loanCard.solde')} />
          <Stat label={t('loanCard.fin_pret')} value={formatDate(st.endDate)} />
          <Stat
            label={t('loanCard.cout_credit')}
            value={formatMoney(st.totalCost, cur)}
            sub={loan.insuranceMonthly ? t('loanCard.dont_assurance', { amount: formatMoney(st.insuranceTotal, cur) }) : undefined}
          />
        </View>

        {phases.length > 1 && (
          <View style={styles.phases}>
            {phases.map((ph, idx) => (
              <View key={idx} style={styles.phaseRow}>
                <Text style={styles.phaseLabel}>{t('loanForm.palier_titre', { n: idx + 1 })} · {formatDuration(ph.months)}</Text>
                <Text style={styles.phaseValue}>{t('loanCard.par_mois', { amount: formatMoney(ph.payment, cur, true) })}</Text>
              </View>
            ))}
          </View>
        )}

        <LineChart points={schedule} color={color} />
        <Text style={styles.scheduleNote}>{t('loanCard.courbe_note')}</Text>
      </Card>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </View>
  );
}
