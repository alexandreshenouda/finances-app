/** Rubrique Immobilier (onglet Patrimoine) : biens, valeur estimée, plus-value, dette, temps restant. */
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { TabIcon } from '@/components/TabIcons';
import { Button, Card, Chevron, EmptyState, SectionTitle } from '@/components/ui';
import { C, CONTENT, FONT, TABULAR, useStyles } from '@/constants/theme';
import { formatDuration, formatEur, formatPct } from '@/lib/format';
import { houseIndexSeries } from '@/lib/prices/houseIndex';
import { loanStats, propertyDebtEur, propertyGainEur, realEstateTotals } from '@/lib/realestate';
import { useStore } from '@/lib/store';
import { PROPERTY_KIND_LABELS } from '@/lib/types';

function makeStyles() {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.bg },
    content: { padding: 16, paddingBottom: 40, ...CONTENT },
    totalLabel: { color: C.textDim, fontSize: FONT.md },
    totalValue: { color: C.text, fontSize: FONT.hero, fontWeight: '700', marginTop: 2, ...TABULAR },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
    totalSub: { color: C.textFaint, fontSize: FONT.sm },
    cardHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    name: { color: C.text, fontSize: FONT.lg, fontWeight: '600' },
    sub: { color: C.textFaint, fontSize: FONT.sm, marginTop: 2 },
    valueRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
    value: { color: C.text, fontSize: FONT.xl, fontWeight: '700', ...TABULAR },
    gain: { fontSize: FONT.sm, fontWeight: '600', ...TABULAR },
    debtRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: C.border,
    },
    debtLabel: { color: C.textDim, fontSize: FONT.sm },
    note: { color: C.textFaint, fontSize: FONT.sm, lineHeight: 17, paddingHorizontal: 4 },
  });
}

export function RealEstateSection() {
  const styles = useStyles(makeStyles);
  const { t } = useTranslation();
  const router = useRouter();
  const properties = useStore((s) => s.properties);
  const loans = useStore((s) => s.loans);
  const rates = useStore((s) => s.fxRates);
  useStore((s) => s.privacyMode); // re-render au changement de mode confidentialité (masquage dans format.ts)
  const houseIndex = useStore((s) => s.houseIndex);
  const series = useMemo(() => houseIndexSeries(), [houseIndex]);

  const active = useMemo(() => properties.filter((p) => !p.archived), [properties]);
  const totals = useMemo(
    () => realEstateTotals(properties, loans, series, rates),
    [properties, loans, series, rates]
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {active.length > 0 && (
        <Card>
          <Text style={styles.totalLabel}>{t('realEstate.patrimoine_net')}</Text>
          <Text style={styles.totalValue}>{formatEur(totals.equity)}</Text>
          <View style={styles.totalRow}>
            <Text style={styles.totalSub}>{t('realEstate.biens')} {formatEur(totals.gross)}</Text>
            <Text style={styles.totalSub}>{t('realEstate.reste_du')} {formatEur(totals.debt)}</Text>
          </View>
        </Card>
      )}

      {active.length === 0 ? (
        <EmptyState
          icon={<TabIcon name="immobilier" color={C.textDim} size={30} />}
          text={t('realEstate.aucun_detail')}
          actionLabel={t('realEstate.ajouter')}
          onAction={() => router.push('/property-form')}
        />
      ) : (
        <Button title={t('realEstate.ajouter')} onPress={() => router.push('/property-form')} />
      )}

      {active.map((p) => {
        const gain = propertyGainEur(p, series, rates);
        const debt = propertyDebtEur(p.id, loans, rates);
        const propLoans = loans.filter((l) => l.propertyId === p.id);
        const remaining = propLoans.reduce((max, l) => Math.max(max, loanStats(l).remainingMonths), 0);
        const gainColor = gain.gainAbs >= 0 ? C.positive : C.negative;
        return (
            <Card key={p.id} onPress={() => router.push({ pathname: '/property/[id]', params: { id: p.id } })}>
              <View style={styles.cardHead}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{p.name}</Text>
                  <Text style={styles.sub}>
                    {PROPERTY_KIND_LABELS[p.kind]}
                    {p.address ? `  ·  ${p.address}` : ''}
                    {p.ownershipPct !== undefined && p.ownershipPct < 100
                      ? `  ·  ${t('accounts.detenu_a', { pct: formatPct(p.ownershipPct) })}`
                      : ''}
                  </Text>
                </View>
                <Chevron />
              </View>
              <View style={styles.valueRow}>
                <Text style={styles.value}>{formatEur(gain.value)}</Text>
                <Text style={[styles.gain, { color: gainColor }]}>
                  {gain.gainAbs >= 0 ? '+' : ''}
                  {formatEur(gain.gainAbs)} ({formatPct(gain.gainPct, true)})
                </Text>
              </View>
              {debt > 0 && (
                <View style={styles.debtRow}>
                  <Text style={styles.debtLabel}>{t('realEstate.reste_du')} {formatEur(debt)}</Text>
                  {remaining > 0 && (
                    <Text style={styles.debtLabel}>{t('realEstate.restant', { duration: formatDuration(remaining) })}</Text>
                  )}
                </View>
              )}
            </Card>
        );
      })}

      {active.length > 0 && (
        <>
          <SectionTitle>{t('realEstate.a_propos_titre')}</SectionTitle>
          <Text style={styles.note}>{t('realEstate.a_propos_texte')}</Text>
        </>
      )}
    </ScrollView>
  );
}
