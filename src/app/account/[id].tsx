/** Détail d'un compte : courbe, lignes, frais, mise à jour de valeur. */
import { LineChart } from '@/components/LineChart';
import { Button, Card, Dot, Empty, PeriodChips, SectionTitle } from '@/components/ui';
import { C } from '@/constants/theme';
import { confirmAction } from '@/lib/confirm';
import { formatDate, formatEur, formatMoney, formatPct, formatQuantity } from '@/lib/format';
import { toEur } from '@/lib/fx';
import {
    accountCurrentValue,
    accountGain,
    accountShare,
    buildSeries,
    holdingCurrency,
    holdingPerfPct,
    holdingValueEur,
    lastSnapshot
} from '@/lib/portfolio';
import { useStore } from '@/lib/store';
import { ACCOUNT_TYPE_COLORS, ACCOUNT_TYPE_LABELS, type Period } from '@/lib/types';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

export default function AccountDetail() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const account = useStore((s) => s.accounts.find((a) => a.id === id));
  const allHoldings = useStore((s) => s.holdings);
  const snapshots = useStore((s) => s.snapshots);
  const rates = useStore((s) => s.fxRates);
  useStore((s) => s.privacyMode); // re-render au changement de mode confidentialité (masquage dans format.ts)
  const recordSnapshot = useStore((s) => s.recordSnapshot);
  const deleteAccount = useStore((s) => s.deleteAccount);

  const defaultPeriod = useStore((s) => s.defaultPeriod);
  const [periodOverride, setPeriodOverride] = useState<Period | null>(null);
  const period = periodOverride ?? defaultPeriod;
  const [manualValue, setManualValue] = useState('');

  const holdings = useMemo(() => allHoldings.filter((h) => h.accountId === id), [allHoldings, id]);
  const series = useMemo(
    () => (account ? buildSeries([account.id], snapshots, period) : []),
    [account, snapshots, period]
  );

  if (!account) {
    return <Empty text={t('accountDetail.introuvable')} />;
  }

  const value = accountCurrentValue(account, allHoldings, snapshots, rates);
  const gain = accountGain(account, allHoldings, rates);
  const share = accountShare(account);
  const last = lastSnapshot(account.id, snapshots);
  const isSynced = !!account.connectionId;
  const accountCurrency = account.currency ?? 'EUR';
  const fees = account.fees;
  const hasFees =
    fees && (fees.entryPct !== undefined || fees.managementPct !== undefined || fees.custodyAnnual !== undefined || fees.notes);

  const saveManualValue = () => {
    const v = parseFloat(manualValue.replace(',', '.'));
    if (!Number.isFinite(v)) return;
    // Saisie dans la devise du compte ; le snapshot (courbes) est toujours en EUR.
    if (holdings.length === 0 && account.cashBalance !== undefined) {
      useStore.getState().upsertAccount({ ...account, cashBalance: v });
    }
    recordSnapshot(account.id, toEur(v, accountCurrency, rates), 'manual');
    setManualValue('');
  };

  const onDelete = () =>
    confirmAction(
      t('accountDetail.supprimer_titre'),
      t('accountDetail.supprimer_confirm', { name: account.name }),
      () => {
        deleteAccount(account.id);
        router.back();
      }
    );

  return (
    <>
      <Stack.Screen options={{ title: account.name }} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Card>
          <View style={styles.headerRow}>
            <Dot color={ACCOUNT_TYPE_COLORS[account.type]} />
            <Text style={styles.typeLabel}>{ACCOUNT_TYPE_LABELS[account.type]}</Text>
            {account.institution ? <Text style={styles.institution}> · {account.institution}</Text> : null}
            {accountCurrency !== 'EUR' ? <Text style={styles.institution}> · {accountCurrency}</Text> : null}
          </View>
          <Text style={styles.value}>{formatEur(value)}</Text>
          {gain && (
            <Text style={[styles.gain, { color: gain.abs >= 0 ? C.positive : C.negative }]}>
              {gain.abs >= 0 ? '+' : ''}
              {formatEur(gain.abs)}
              {gain.pct !== undefined ? `  (${formatPct(gain.pct, true)})` : ''}
              <Text style={styles.gainLabel}>  {t('accountDetail.plus_value_latente')}</Text>
            </Text>
          )}
          {share < 1 && (
            <Text style={styles.ownership}>
              {t('accountDetail.votre_part', { pct: formatPct(account.ownershipPct!), amount: formatEur(value * share) })}
            </Text>
          )}
          {last && (
            <Text style={styles.lastUpdate}>
              {t('accountDetail.derniere_valeur', {
                date: formatDate(last.date),
                source: last.source === 'manual' ? t('accountDetail.source_saisie') : last.source === 'sync' ? t('accountDetail.source_synchro') : t('accountDetail.source_cours'),
              })}
            </Text>
          )}
          <View style={{ height: 12 }} />
          <PeriodChips value={period} onChange={setPeriodOverride} />
          <LineChart points={series} color={ACCOUNT_TYPE_COLORS[account.type]} />
        </Card>

        <SectionTitle>{t('accountDetail.lignes_titre')}</SectionTitle>
        <Card style={{ paddingVertical: 4 }}>
          {(account.cashBalance ?? 0) !== 0 && (
            <View style={[styles.holdingRow, holdings.length > 0 && styles.rowBorder]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.holdingName}>{t('accountDetail.liquidites')}</Text>
                {accountCurrency !== 'EUR' && (
                  <Text style={styles.holdingSub}>{formatMoney(account.cashBalance!, accountCurrency, true)}</Text>
                )}
              </View>
              <Text style={styles.holdingValue}>
                {formatEur(toEur(account.cashBalance!, accountCurrency, rates))}
              </Text>
            </View>
          )}
          {holdings.length === 0 && (account.cashBalance ?? 0) === 0 && (
            <Empty text={t('accountDetail.aucune_ligne')} />
          )}
          {holdings.map((h, i) => {
            const perf = holdingPerfPct(h);
            const hCur = holdingCurrency(h, account);
            return (
              <Pressable
                key={h.id}
                onPress={() =>
                  router.push({ pathname: '/holding-form', params: { accountId: account.id, holdingId: h.id } })
                }
                style={[styles.holdingRow, i < holdings.length - 1 && styles.rowBorder]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.holdingName}>{h.name}</Text>
                  <Text style={styles.holdingSub}>
                    {formatQuantity(h.quantity)} × {h.unitPrice !== undefined ? formatMoney(h.unitPrice, hCur, true) : '—'}
                    {h.feesPct !== undefined ? `  ·  ${t('accountDetail.frais', { pct: formatPct(h.feesPct, false, 2) })}` : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.holdingValue}>{formatEur(holdingValueEur(h, account, rates))}</Text>
                  {perf !== undefined && (
                    <Text style={{ color: perf >= 0 ? C.positive : C.negative, fontSize: 12, fontWeight: '600' }}>
                      {formatPct(perf, true)}
                    </Text>
                  )}
                </View>
              </Pressable>
            );
          })}
        </Card>
        {!isSynced && (
          <Button
            title={t('accountDetail.ajouter_ligne')}
            variant="secondary"
            onPress={() => router.push({ pathname: '/holding-form', params: { accountId: account.id } })}
          />
        )}
        {isSynced && <Text style={styles.syncNote}>{t('accountDetail.sync_note')}</Text>}

        {!isSynced && holdings.length === 0 && (
          <>
            <SectionTitle>{t('accountDetail.maj_valeur_titre')}</SectionTitle>
            <Card>
              <Text style={styles.manualHint}>
                {t('accountDetail.maj_valeur_hint', {
                  currency: accountCurrency,
                  converted: accountCurrency !== 'EUR' ? t('accountDetail.converti_eur') : '',
                })}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  value={manualValue}
                  onChangeText={setManualValue}
                  placeholder={t('accountDetail.maj_valeur_placeholder')}
                  placeholderTextColor={C.textFaint}
                  keyboardType="decimal-pad"
                  style={styles.manualInput}
                />
                <Button title={t('common.save')} onPress={saveManualValue} style={{ marginVertical: 0 }} />
              </View>
            </Card>
          </>
        )}

        {hasFees && (
          <>
            <SectionTitle>{t('accountDetail.frais_titre')}</SectionTitle>
            <Card>
              {fees!.entryPct !== undefined && <FeeRow label={t('forms.frais_entree')} value={formatPct(fees!.entryPct)} />}
              {fees!.managementPct !== undefined && <FeeRow label={t('forms.frais_gestion')} value={formatPct(fees!.managementPct)} />}
              {fees!.custodyAnnual !== undefined && <FeeRow label={t('accountDetail.frais_garde_an')} value={formatEur(fees!.custodyAnnual, true)} />}
              {fees!.notes ? <Text style={styles.feeNotes}>{fees!.notes}</Text> : null}
            </Card>
          </>
        )}

        <View style={{ height: 16 }} />
        <Button
          title={t('accountDetail.modifier')}
          variant="secondary"
          onPress={() => router.push({ pathname: '/account-form', params: { accountId: account.id } })}
        />
        <Button title={t('accountDetail.supprimer_bouton')} variant="danger" onPress={onDelete} />
      </ScrollView>
    </>
  );
}


const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 40 },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  typeLabel: { color: C.textDim, fontSize: 13, fontWeight: '600' },
  institution: { color: C.textFaint, fontSize: 13 },
  value: { color: C.text, fontSize: 30, fontWeight: '700', marginTop: 6 },
  gain: { fontSize: 14, fontWeight: '600', marginTop: 4 },
  gainLabel: { color: C.textFaint, fontSize: 12, fontWeight: '400' },
  ownership: { color: C.textDim, fontSize: 13, fontWeight: '600', marginTop: 2 },
  lastUpdate: { color: C.textFaint, fontSize: 12, marginTop: 2 },
  holdingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  holdingName: { color: C.text, fontSize: 15, fontWeight: '500' },
  holdingSub: { color: C.textFaint, fontSize: 12, marginTop: 2 },
  holdingValue: { color: C.text, fontSize: 15, fontWeight: '600' },
  syncNote: { color: C.textFaint, fontSize: 12, paddingHorizontal: 4, marginTop: 4 },
  manualHint: { color: C.textDim, fontSize: 13, marginBottom: 10 },
  manualInput: {
    flex: 1,
    backgroundColor: C.cardAlt,
    borderRadius: 10,
    paddingHorizontal: 12,
    color: C.text,
    fontSize: 15,
  },
  feeRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  feeLabel: { color: C.textDim, fontSize: 14 },
  feeValue: { color: C.text, fontSize: 14, fontWeight: '600' },
  feeNotes: { color: C.textFaint, fontSize: 13, marginTop: 8 },
});
