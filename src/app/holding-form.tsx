/** Création / édition d'une ligne (fonds, action, crypto…) d'un compte manuel. */
import { Button, Card, Chips, Field, SelectField } from '@/components/ui';
import { C } from '@/constants/theme';
import { confirmAction, notify } from '@/lib/confirm';
import { todayKey } from '@/lib/format';
import { accountCurrentValue } from '@/lib/portfolio';
import { searchYahooSymbol } from '@/lib/prices/yahoo';
import { useStore } from '@/lib/store';
import { CURRENCIES, CURRENCY_LABELS, type Currency, type PriceSource } from '@/lib/types';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text } from 'react-native';

const SOURCES: PriceSource[] = ['manual', 'yahoo', 'coingecko'];

function parseNum(s: string): number | undefined {
  if (!s.trim()) return undefined;
  const v = parseFloat(s.replace(',', '.'));
  return Number.isFinite(v) ? v : undefined;
}

export default function HoldingForm() {
  const { t } = useTranslation();
  const SOURCE_LABELS: Record<string, string> = {
    manual: t('holdingForm.source_manuel'),
    yahoo: t('holdingForm.source_yahoo'),
    coingecko: t('holdingForm.source_coingecko'),
  };
  const { accountId, holdingId } = useLocalSearchParams<{ accountId: string; holdingId?: string }>();
  const router = useRouter();
  const existing = useStore((s) => s.holdings.find((h) => h.id === holdingId));
  const account = useStore((s) => s.accounts.find((a) => a.id === accountId));
  const upsertHolding = useStore((s) => s.upsertHolding);
  const deleteHolding = useStore((s) => s.deleteHolding);

  const accountCurrency: Currency = account?.currency ?? 'EUR';
  // '' = même devise que le compte (champ currency absent sur la ligne).
  const [currency, setCurrency] = useState<Currency | ''>(existing?.currency ?? '');
  const effectiveCurrency: Currency = currency === '' ? accountCurrency : currency;

  const [name, setName] = useState(existing?.name ?? '');
  const [source, setSource] = useState<PriceSource>(existing?.priceSource ?? 'yahoo');
  const [symbol, setSymbol] = useState(existing?.symbol ?? '');
  const [isin, setIsin] = useState(existing?.isin ?? '');
  const [quantity, setQuantity] = useState(existing?.quantity?.toString() ?? '');
  const [unitPrice, setUnitPrice] = useState(existing?.unitPrice?.toString() ?? '');
  const [buyPrice, setBuyPrice] = useState(existing?.buyPrice?.toString() ?? '');
  const [feesPct, setFeesPct] = useState(existing?.feesPct?.toString() ?? '');
  const [resolvingIsin, setResolvingIsin] = useState(false);

  const resolveTickerFromIsin = async () => {
    const query = isin.trim();
    if (!query) return;
    setResolvingIsin(true);
    try {
      const matches = await searchYahooSymbol(query);
      if (matches.length === 0) {
        notify(t('holdingForm.isin_resolve_titre'), t('holdingForm.isin_resolve_aucun', { isin: query }));
        return;
      }
      setSymbol(matches[0].symbol);
      if (matches.length > 1) {
        const others = matches
          .slice(1, 5)
          .map((m) => `${m.symbol} — ${m.name} (${m.exchange})`)
          .join('\n');
        notify(
          t('holdingForm.isin_resolve_titre'),
          t('holdingForm.isin_resolve_plusieurs', {
            symbol: matches[0].symbol,
            name: matches[0].name,
            exchange: matches[0].exchange,
            others,
          }),
        );
      }
    } catch (e: any) {
      notify(t('holdingForm.isin_resolve_titre'), e?.message ?? String(e));
    } finally {
      setResolvingIsin(false);
    }
  };

  const refreshAccountSnapshot = () => {
    const state = useStore.getState();
    const acc = state.accounts.find((a) => a.id === accountId);
    if (!acc) return;
    const value = accountCurrentValue(acc, state.holdings, state.snapshots, state.fxRates);
    state.recordSnapshot(acc.id, value, 'manual', todayKey());
  };

  const save = () => {
    const qty = parseNum(quantity);
    if (!name.trim() || qty === undefined) return;
    upsertHolding({
      id: existing?.id,
      accountId: accountId!,
      name: name.trim(),
      currency: currency === '' ? undefined : currency,
      priceSource: source,
      symbol: symbol.trim() || undefined,
      isin: isin.trim() || undefined,
      quantity: qty,
      unitPrice: parseNum(unitPrice) ?? existing?.unitPrice,
      unitPriceDate: parseNum(unitPrice) !== undefined ? new Date().toISOString() : existing?.unitPriceDate,
      buyPrice: parseNum(buyPrice),
      feesPct: parseNum(feesPct),
    });
    refreshAccountSnapshot();
    router.back();
  };

  const onDelete = () =>
    confirmAction(t('holdingForm.supprimer_titre'), t('holdingForm.supprimer_confirm', { name: existing?.name }), () => {
      deleteHolding(existing!.id);
      refreshAccountSnapshot();
      router.back();
    });

  const isSynced = !!account?.connectionId;
  const symbolHint =
    source === 'yahoo'
      ? t('holdingForm.hint_yahoo')
      : source === 'coingecko'
        ? t('holdingForm.hint_coingecko')
        : t('holdingForm.hint_manuel');

  return (
    <>
      <Stack.Screen options={{ title: existing ? (isSynced ? t('holdingForm.titre_detail', { defaultValue: 'Détail de la ligne' }) : t('holdingForm.titre_edit')) : t('holdingForm.titre_new') }} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Card>
          <Field label={t('forms.nom')} value={name} onChangeText={setName} placeholder={t('holdingForm.nom_placeholder')} editable={!isSynced} />
          <Text style={styles.label}>{t('holdingForm.source')}</Text>
          <Chips options={SOURCES} value={source} onChange={(v) => !isSynced && setSource(v)} labels={SOURCE_LABELS} />
          {source !== 'manual' && (
            <Field
              label={source === 'yahoo' ? t('holdingForm.ticker') : t('holdingForm.id_coingecko')}
              value={symbol}
              onChangeText={setSymbol}
              autoCapitalize={source === 'yahoo' ? 'characters' : 'none'}
              placeholder={source === 'yahoo' ? 'WPEA.PA' : 'bitcoin'}
              hint={symbolHint}
              editable={!isSynced}
            />
          )}
          <Field label={t('holdingForm.isin')} value={isin} onChangeText={setIsin} autoCapitalize="characters" placeholder={t('holdingForm.isin_placeholder')} editable={!isSynced} />
          {source === 'yahoo' && !isSynced && (
            <Button
              title={t('holdingForm.isin_resolve_bouton')}
              variant="secondary"
              loading={resolvingIsin}
              disabled={!isin.trim()}
              onPress={resolveTickerFromIsin}
            />
          )}
          <SelectField
            label={t('holdingForm.devise_ligne')}
            value={currency}
            onChange={setCurrency}
            options={[
              { value: '' as const, label: t('holdingForm.devise_du_compte', { currency: accountCurrency }) },
              ...CURRENCIES.map((c) => ({ value: c as Currency | '', label: CURRENCY_LABELS[c] })),
            ]}
            hint={effectiveCurrency !== 'EUR' ? t('holdingForm.devise_hint') : undefined}
            enabled={!isSynced}
          />
          <Field label={t('holdingForm.quantite')} value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" placeholder={t('holdingForm.quantite_placeholder')} editable={!isSynced} />
          <Field
            label={t('holdingForm.cours_unitaire', {
              currency: effectiveCurrency,
              auto: source === 'manual' ? '' : t('holdingForm.cours_auto'),
            })}
            value={unitPrice}
            onChangeText={setUnitPrice}
            keyboardType="decimal-pad"
            placeholder={t('holdingForm.cours_placeholder')}
            hint={source === 'manual' ? symbolHint : undefined}
            editable={!isSynced}
          />
          <Field label={t('holdingForm.pru', { currency: effectiveCurrency })} value={buyPrice} onChangeText={setBuyPrice} keyboardType="decimal-pad" placeholder={t('holdingForm.pru_placeholder')} hint={t('holdingForm.pru_hint')} editable={!isSynced} />
          <Field label={t('holdingForm.frais_courants')} value={feesPct} onChangeText={setFeesPct} keyboardType="decimal-pad" placeholder={t('holdingForm.frais_courants_placeholder')} editable={!isSynced} />
        </Card>
        {!isSynced && <Button title={t('common.save')} onPress={save} disabled={!name.trim() || parseNum(quantity) === undefined} />}
        {!isSynced && existing && <Button title={t('holdingForm.supprimer_bouton')} variant="danger" onPress={onDelete} />}
        <Button title={isSynced ? t('common.retour', { defaultValue: 'Retour' }) : t('common.cancel')} variant="secondary" onPress={() => router.back()} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 40 },
  label: { color: C.textDim, fontSize: 13, marginBottom: 6 },
});
