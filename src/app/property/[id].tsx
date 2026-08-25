/** Détail d'un bien : valeur estimée, plus-value, courbe, crédits & amortissement. */
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { LineChart } from '@/components/LineChart';
import { LoanCard } from '@/components/LoanCard';
import { Button, Card, Empty, PeriodChips, SectionTitle } from '@/components/ui';
import { C } from '@/constants/theme';
import { confirmAction } from '@/lib/confirm';
import { formatDate, formatEur, formatPct } from '@/lib/format';
import { houseIndexSeries } from '@/lib/prices/houseIndex';
import { fetchLocalEstimate } from '@/lib/prices/localValuation';
import { buildPropertyValueSeries, ownershipShare, propertyDebtEur, propertyGainEur } from '@/lib/realestate';
import { useStore } from '@/lib/store';
import { ACCOUNT_TYPE_COLORS, PROPERTY_KIND_LABELS, type Currency, type Period } from '@/lib/types';

const IMMO = ACCOUNT_TYPE_COLORS.immobilier;

export default function PropertyDetail() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const property = useStore((s) => s.properties.find((p) => p.id === id));
  const allLoans = useStore((s) => s.loans);
  const rates = useStore((s) => s.fxRates);
  useStore((s) => s.privacyMode); // re-render au changement de mode confidentialité (masquage dans format.ts)
  const houseIndex = useStore((s) => s.houseIndex);
  const deleteProperty = useStore((s) => s.deleteProperty);
  const upsertProperty = useStore((s) => s.upsertProperty);

  const defaultPeriod = useStore((s) => s.defaultPeriod);
  const [periodOverride, setPeriodOverride] = useState<Period | null>(null);
  const period = periodOverride ?? defaultPeriod;
  const [localRefreshing, setLocalRefreshing] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const series = useMemo(() => houseIndexSeries(), [houseIndex]);
  const loans = useMemo(() => allLoans.filter((l) => l.propertyId === id), [allLoans, id]);
  const valueSeries = useMemo(
    () => (property ? buildPropertyValueSeries(property, series, rates, period) : []),
    [property, series, rates, period]
  );

  if (!property) return <Empty text={t('propertyDetail.introuvable')} />;

  const gain = propertyGainEur(property, series, rates);
  const debt = propertyDebtEur(property.id, allLoans, rates);
  const equity = gain.value - debt;
  const share = ownershipShare(property);
  const partial = share < 1;
  const cur: Currency = property.currency ?? 'EUR';
  const gainColor = gain.gainAbs >= 0 ? C.positive : C.negative;

  const onDelete = () =>
    confirmAction(t('propertyDetail.supprimer_titre'), t('propertyDetail.supprimer_confirm', { name: property.name }), () => {
      deleteProperty(property.id);
      router.back();
    });

  const onRefreshLocalEstimate = async () => {
    if (!property.geo) return;
    setLocalRefreshing(true);
    setLocalError(null);
    try {
      const est = await fetchLocalEstimate(property.geo, property.kind);
      if (!est.ok) {
        setLocalError(est.error);
        return;
      }
      upsertProperty({
        id: property.id,
        name: property.name,
        kind: property.kind,
        purchasePrice: property.purchasePrice,
        purchaseDate: property.purchaseDate,
        localEstimate: est.estimate,
      });
    } finally {
      setLocalRefreshing(false);
    }
  };

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
            <Text style={styles.gainRef}>  {t('propertyDetail.vs_prix_achat')}</Text>
          </Text>
          <View style={{ height: 12 }} />
          <PeriodChips value={period} onChange={setPeriodOverride} />
          <LineChart points={valueSeries} color={IMMO} />
          <Text style={styles.estimateNote}>
            {property.valuationMode === 'manual'
              ? t('propertyDetail.estimation_manuelle')
              : property.valuationMode === 'local' && property.localEstimate
                ? t(
                  property.localEstimate.scope === 'departement'
                    ? 'propertyDetail.estimation_local_departement'
                    : 'propertyDetail.estimation_local',
                  { n: property.localEstimate.sampleSize }
                )
                : property.valuationMode === 'local'
                  ? t('propertyDetail.estimation_local_manquante')
                  : t('propertyDetail.estimation_auto')}
          </Text>
          {property.valuationMode === 'local' && property.geo && (
            <>
              <Button
                title={t('propertyDetail.actualiser_estimation')}
                variant="secondary"
                loading={localRefreshing}
                onPress={onRefreshLocalEstimate}
                style={styles.refreshButton}
              />
              {localError && <Text style={[styles.estimateNote, styles.errorText]}>{localError}</Text>}
            </>
          )}
        </Card>

        <SectionTitle>{t('propertyDetail.bilan')}</SectionTitle>
        <Card>
          <Row label={t('propertyDetail.valeur_estimee')} value={formatEur(gain.value)} />
          <Row label={t('propertyDetail.prix_achat')} value={formatEur(gain.purchase)} />
          {property.purchaseCosts !== undefined && <Row label={t('propertyDetail.prix_revient')} value={formatEur(gain.cost)} />}
          {property.surface !== undefined && property.surface > 0 && (
            <Row label={t('propertyDetail.prix_m2')} value={formatEur(gain.value / property.surface)} />
          )}
          <Row label={t('propertyDetail.achete_le')} value={formatDate(property.purchaseDate)} />
          {partial && <Row label={t('accountForm.quote_part')} value={formatPct(property.ownershipPct!)} />}
          {debt > 0 && <Row label={t('loans.capital_restant_du')} value={formatEur(debt)} />}
          <View style={styles.equityRow}>
            <Text style={styles.equityLabel}>{t('propertyDetail.valeur_nette')}</Text>
            <Text style={styles.equityValue}>{formatEur(equity)}</Text>
          </View>
          {partial && (
            <View style={styles.row}>
              <Text style={styles.rowLabel}>{t('propertyDetail.votre_part_nette', { pct: formatPct(property.ownershipPct!) })}</Text>
              <Text style={styles.rowValue}>{formatEur(equity * share)}</Text>
            </View>
          )}
        </Card>

        <SectionTitle>{t('propertyDetail.credits')}</SectionTitle>
        {loans.length === 0 && <Empty text={t('propertyDetail.aucun_credit')} />}
        {loans.map((loan) => (
          <LoanCard key={loan.id} loan={loan} onEdit={() => router.push({ pathname: '/loan-form', params: { propertyId: property.id, loanId: loan.id } })} />
        ))}
        <Button
          title={t('propertyDetail.ajouter_credit')}
          variant="secondary"
          onPress={() => router.push({ pathname: '/loan-form', params: { propertyId: property.id } })}
        />

        {property.notes ? (
          <>
            <SectionTitle>{t('forms.notes')}</SectionTitle>
            <Card>
              <Text style={styles.notes}>{property.notes}</Text>
            </Card>
          </>
        ) : null}

        <View style={{ height: 16 }} />
        <Button title={t('propertyDetail.modifier')} variant="secondary" onPress={() => router.push({ pathname: '/property-form', params: { propertyId: property.id } })} />
        <Button title={t('propertyDetail.supprimer_bouton')} variant="danger" onPress={onDelete} />
      </ScrollView>
    </>
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 40 },
  kind: { color: C.textDim, fontSize: 13, fontWeight: '600' },
  value: { color: C.text, fontSize: 30, fontWeight: '700', marginTop: 6 },
  gain: { fontSize: 14, fontWeight: '600', marginTop: 4 },
  gainRef: { color: C.textFaint, fontWeight: '400' },
  estimateNote: { color: C.textFaint, fontSize: 12, marginTop: 4, lineHeight: 16 },
  refreshButton: { marginTop: 10 },
  errorText: { color: C.negative },
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
  notes: { color: C.textDim, fontSize: 14, lineHeight: 20 },
});
