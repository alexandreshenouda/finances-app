/** Création / édition d'une ligne (fonds, action, crypto…) d'un compte manuel. */
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { Button, Card, Chips, Field } from '@/components/ui';
import { C } from '@/constants/theme';
import { confirmAction } from '@/lib/confirm';
import { todayKey } from '@/lib/format';
import { accountCurrentValue } from '@/lib/portfolio';
import { useStore } from '@/lib/store';
import type { PriceSource } from '@/lib/types';

const SOURCES: PriceSource[] = ['manual', 'yahoo', 'coingecko'];
const SOURCE_LABELS: Record<string, string> = {
  manual: 'Cours manuel',
  yahoo: 'Bourse (Yahoo)',
  coingecko: 'Crypto (CoinGecko)',
};

function parseNum(s: string): number | undefined {
  if (!s.trim()) return undefined;
  const v = parseFloat(s.replace(',', '.'));
  return Number.isFinite(v) ? v : undefined;
}

export default function HoldingForm() {
  const { accountId, holdingId } = useLocalSearchParams<{ accountId: string; holdingId?: string }>();
  const router = useRouter();
  const existing = useStore((s) => s.holdings.find((h) => h.id === holdingId));
  const upsertHolding = useStore((s) => s.upsertHolding);
  const deleteHolding = useStore((s) => s.deleteHolding);

  const [name, setName] = useState(existing?.name ?? '');
  const [source, setSource] = useState<PriceSource>(existing?.priceSource ?? 'yahoo');
  const [symbol, setSymbol] = useState(existing?.symbol ?? '');
  const [isin, setIsin] = useState(existing?.isin ?? '');
  const [quantity, setQuantity] = useState(existing?.quantity?.toString() ?? '');
  const [unitPrice, setUnitPrice] = useState(existing?.unitPrice?.toString() ?? '');
  const [buyPrice, setBuyPrice] = useState(existing?.buyPrice?.toString() ?? '');
  const [feesPct, setFeesPct] = useState(existing?.feesPct?.toString() ?? '');

  const refreshAccountSnapshot = () => {
    const state = useStore.getState();
    const account = state.accounts.find((a) => a.id === accountId);
    if (!account) return;
    const value = accountCurrentValue(account, state.holdings, state.snapshots);
    state.recordSnapshot(account.id, value, 'manual', todayKey());
  };

  const save = () => {
    const qty = parseNum(quantity);
    if (!name.trim() || qty === undefined) return;
    upsertHolding({
      id: existing?.id,
      accountId: accountId!,
      name: name.trim(),
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
    confirmAction('Supprimer la ligne', `« ${existing?.name} » sera supprimée.`, () => {
      deleteHolding(existing!.id);
      refreshAccountSnapshot();
      router.back();
    });

  const symbolHint =
    source === 'yahoo'
      ? 'Ticker Yahoo Finance : WPEA.PA, CW8.PA, AAPL… Le cours sera converti en € si besoin.'
      : source === 'coingecko'
        ? 'Identifiant CoinGecko : bitcoin, ethereum, solana… (voir coingecko.com)'
        : 'Sans symbole : saisissez le cours unitaire à la main et mettez-le à jour de temps en temps.';

  return (
    <>
      <Stack.Screen options={{ title: existing ? 'Modifier la ligne' : 'Nouvelle ligne' }} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Card>
          <Field label="Nom" value={name} onChangeText={setName} placeholder="ex : iShares MSCI World (WPEA)" />
          <Text style={styles.label}>Source du cours</Text>
          <Chips options={SOURCES} value={source} onChange={setSource} labels={SOURCE_LABELS} />
          {source !== 'manual' && (
            <Field
              label={source === 'yahoo' ? 'Ticker' : 'Id CoinGecko'}
              value={symbol}
              onChangeText={setSymbol}
              autoCapitalize={source === 'yahoo' ? 'characters' : 'none'}
              placeholder={source === 'yahoo' ? 'WPEA.PA' : 'bitcoin'}
              hint={symbolHint}
            />
          )}
          <Field label="Quantité / nombre de parts" value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" placeholder="ex : 12,5" />
          <Field
            label={`Cours unitaire en € ${source === 'manual' ? '' : '(optionnel, mis à jour automatiquement)'}`}
            value={unitPrice}
            onChangeText={setUnitPrice}
            keyboardType="decimal-pad"
            placeholder="ex : 105,3"
            hint={source === 'manual' ? symbolHint : undefined}
          />
          <Field label="Prix de revient unitaire — PRU (optionnel)" value={buyPrice} onChangeText={setBuyPrice} keyboardType="decimal-pad" placeholder="ex : 92" hint="Sert à afficher la plus/moins-value latente." />
          <Field label="Frais courants du fonds en % (optionnel)" value={feesPct} onChangeText={setFeesPct} keyboardType="decimal-pad" placeholder="ex : 0,38" />
          <Field label="ISIN (optionnel)" value={isin} onChangeText={setIsin} autoCapitalize="characters" placeholder="ex : IE0002XZSHO1" />
        </Card>
        <Button title="Enregistrer" onPress={save} disabled={!name.trim() || parseNum(quantity) === undefined} />
        {existing && <Button title="Supprimer la ligne" variant="danger" onPress={onDelete} />}
        <Button title="Annuler" variant="secondary" onPress={() => router.back()} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 40 },
  label: { color: C.textDim, fontSize: 13, marginBottom: 6 },
});
