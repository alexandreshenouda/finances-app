/** Liste des biens immobiliers : valeur estimée, plus-value, dette, temps restant. */
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Empty, SectionTitle } from '@/components/ui';
import { C } from '@/constants/theme';
import { formatDuration, formatEur, formatPct } from '@/lib/format';
import { houseIndexSeries } from '@/lib/prices/houseIndex';
import { loanStats, propertyDebtEur, propertyGainEur, realEstateTotals } from '@/lib/realestate';
import { useStore } from '@/lib/store';
import { PROPERTY_KIND_LABELS } from '@/lib/types';

export default function RealEstate() {
  const router = useRouter();
  const properties = useStore((s) => s.properties);
  const loans = useStore((s) => s.loans);
  const rates = useStore((s) => s.fxRates);
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
          <Text style={styles.totalLabel}>Patrimoine immobilier net</Text>
          <Text style={styles.totalValue}>{formatEur(totals.equity)}</Text>
          <View style={styles.totalRow}>
            <Text style={styles.totalSub}>Biens {formatEur(totals.gross)}</Text>
            <Text style={styles.totalSub}>Reste dû {formatEur(totals.debt)}</Text>
          </View>
        </Card>
      )}

      <Button title="+ Ajouter un bien" onPress={() => router.push('/property-form')} />

      {active.length === 0 && (
        <Empty text="Aucun bien immobilier. Ajoutez un bien pour suivre sa valeur estimée, sa plus-value et ses crédits." />
      )}

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
                    {p.ownershipPct !== undefined && p.ownershipPct < 100 ? `  ·  détenu à ${formatPct(p.ownershipPct)}` : ''}
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
                  <Text style={styles.debtLabel}>Reste dû {formatEur(debt)}</Text>
                  {remaining > 0 && <Text style={styles.debtLabel}>{formatDuration(remaining)} restant</Text>}
                </View>
              )}
            </Card>
          </Pressable>
        );
      })}

      {active.length > 0 && (
        <>
          <SectionTitle>À propos de l'estimation</SectionTitle>
          <Text style={styles.note}>
            Les valeurs en mode « auto » sont réévaluées via l'indice national des prix des
            logements anciens (INSEE) : c'est un ordre de grandeur, pas une expertise. Saisissez une
            valeur manuelle dans un bien pour une estimation plus fine.
          </Text>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
