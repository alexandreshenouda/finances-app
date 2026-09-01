/** Liste des biens immobiliers : valeur estimée, plus-value, dette, temps restant. */
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button, Card, Empty, SectionTitle } from '@/components/ui';
import { C, useStyles } from '@/constants/theme';
import { formatDuration, formatEur, formatPct } from '@/lib/format';
import { houseIndexSeries } from '@/lib/prices/houseIndex';
import { loanStats, propertyDebtEur, propertyGainEur, realEstateTotals } from '@/lib/realestate';
import { useStore } from '@/lib/store';
import { PROPERTY_KIND_LABELS } from '@/lib/types';

function makeStyles() {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.bg },
    content: { padding: 16, paddingBottom: 40 },
    totalLabel: { color: C.textDim, fontSize: 14 },
    totalValue: { color: C.text, fontSize: 30, fontWeight: '700', marginTop: 2 },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
    totalSub: { color: C.textFaint, fontSize: 13 },
    cardHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    name: { color: C.text, fontSize: 16, fontWeight: '600' },
    sub: { color: C.textFaint, fontSize: 12, marginTop: 2 },
    chevron: { color: C.textFaint, fontSize: 20, marginLeft: 8 },
    valueRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
    value: { color: C.text, fontSize: 22, fontWeight: '700' },
    gain: { fontSize: 13, fontWeight: '600' },
    debtRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: C.border,
    },
    debtLabel: { color: C.textDim, fontSize: 13 },
    note: { color: C.textFaint, fontSize: 12, lineHeight: 17, paddingHorizontal: 4 },
  });
}

export default function RealEstate() {
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

      <Button title={t('realEstate.ajouter')} onPress={() => router.push('/property-form')} />

      {active.length === 0 && <Empty text={t('realEstate.aucun_detail')} />}

      {active.map((p) => {
        const gain = propertyGainEur(p, series, rates);
        const debt = propertyDebtEur(p.id, loans, rates);
        const propLoans = loans.filter((l) => l.propertyId === p.id);
        const remaining = propLoans.reduce((max, l) => Math.max(max, loanStats(l).remainingMonths), 0);
        const gainColor = gain.gainAbs >= 0 ? C.positive : C.negative;
        return (
          <Pressable
            key={p.id}
            onPress={() => router.push({ pathname: '/property/[id]', params: { id: p.id } })}
          >
            <Card>
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
                <Text style={styles.chevron}>›</Text>
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
          </Pressable>
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
