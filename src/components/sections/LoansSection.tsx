/** Rubrique Emprunts (onglet Patrimoine) : tous les prêts (immobiliers et conso), création et édition. */
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { LoanCard } from '@/components/LoanCard';
import { TabIcon } from '@/components/TabIcons';
import { Button, Card, EmptyState, SectionTitle } from '@/components/ui';
import { C, CONTENT, FONT, TABULAR, useStyles } from '@/constants/theme';
import { formatEur } from '@/lib/format';
import { toEur } from '@/lib/fx';
import { loanStats } from '@/lib/realestate';
import { useStore } from '@/lib/store';
import { type Loan } from '@/lib/types';

function makeStyles() {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.bg },
    content: { padding: 16, paddingBottom: 40, ...CONTENT },
    totalLabel: { color: C.textDim, fontSize: FONT.md },
    totalValue: { color: C.text, fontSize: FONT.hero, fontWeight: '700', marginTop: 2, ...TABULAR },
    totalSub: { color: C.textFaint, fontSize: FONT.sm, marginTop: 4 },
  });
}

export function LoansSection() {
  const styles = useStyles(makeStyles);
  const { t } = useTranslation();
  const router = useRouter();
  const loans = useStore((s) => s.loans);
  const properties = useStore((s) => s.properties);
  const rates = useStore((s) => s.fxRates);
  useStore((s) => s.privacyMode); // re-render au changement de mode confidentialité (masquage dans format.ts)

  const immoLoans = loans.filter((l) => l.propertyId);
  const consoLoans = loans.filter((l) => !l.propertyId);

  const totals = useMemo(() => {
    let debt = 0;
    let monthly = 0;
    for (const l of loans) {
      const st = loanStats(l);
      debt += toEur(st.remainingBalance, l.currency ?? 'EUR', rates);
      if (st.remainingMonths > 0) monthly += toEur(st.monthlyWithInsurance, l.currency ?? 'EUR', rates);
    }
    return { debt, monthly };
  }, [loans, rates]);

  const propertyName = (l: Loan) => properties.find((p) => p.id === l.propertyId)?.name ?? t('loans.bien_supprime');
  const editLoan = (l: Loan) => router.push({ pathname: '/loan-form', params: { loanId: l.id } });

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {loans.length > 0 && (
        <Card>
          <Text style={styles.totalLabel}>{t('loans.capital_restant_du')}</Text>
          <Text style={styles.totalValue}>{formatEur(totals.debt)}</Text>
          {totals.monthly > 0 && (
            <Text style={styles.totalSub}>
              {t('loans.mensualites_en_cours', { amount: formatEur(totals.monthly, true) })}
            </Text>
          )}
        </Card>
      )}

      {loans.length === 0 ? (
        <EmptyState
          icon={<TabIcon name="emprunts" color={C.textDim} size={30} />}
          text={t('loans.aucun_detail')}
          actionLabel={t('loans.ajouter')}
          onAction={() => router.push('/loan-form')}
        />
      ) : (
        <Button title={t('loans.ajouter')} onPress={() => router.push('/loan-form')} />
      )}

      {immoLoans.length > 0 && (
        <>
          <SectionTitle>{t('loans.prets_immobiliers')}</SectionTitle>
          {immoLoans.map((l) => (
            <LoanCard key={l.id} loan={l} onEdit={() => editLoan(l)} context={propertyName(l)} />
          ))}
        </>
      )}

      {consoLoans.length > 0 && (
        <>
          <SectionTitle>{t('loans.prets_conso')}</SectionTitle>
          {consoLoans.map((l) => (
            <LoanCard key={l.id} loan={l} onEdit={() => editLoan(l)} color={C.accent} context={t('loans.pret_conso')} />
          ))}
        </>
      )}

    </ScrollView>
  );
}
