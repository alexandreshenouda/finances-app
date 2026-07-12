/** Création / édition manuelle d'un compte. */
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { Button, Card, Chips, Field, SectionTitle, SelectField } from '@/components/ui';
import { C } from '@/constants/theme';
import { toEur } from '@/lib/fx';
import { todayKey } from '@/lib/format';
import { useStore } from '@/lib/store';
import {
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_TYPE_ORDER,
  CURRENCIES,
  CURRENCY_LABELS,
  type AccountType,
  type Currency,
} from '@/lib/types';

function parseNum(s: string): number | undefined {
  if (!s.trim()) return undefined;
  const v = parseFloat(s.replace(',', '.'));
  return Number.isFinite(v) ? v : undefined;
}

export default function AccountForm() {
  const { accountId } = useLocalSearchParams<{ accountId?: string }>();
  const router = useRouter();
  const existing = useStore((s) => s.accounts.find((a) => a.id === accountId));
  const upsertAccount = useStore((s) => s.upsertAccount);
  const recordSnapshot = useStore((s) => s.recordSnapshot);

  const [name, setName] = useState(existing?.name ?? '');
  const [type, setType] = useState<AccountType>(existing?.type ?? 'pea');
  const [currency, setCurrency] = useState<Currency>(existing?.currency ?? 'EUR');
  const [institution, setInstitution] = useState(existing?.institution ?? '');
  const [cash, setCash] = useState(existing?.cashBalance?.toString() ?? '');
  const [entryPct, setEntryPct] = useState(existing?.fees?.entryPct?.toString() ?? '');
  const [managementPct, setManagementPct] = useState(existing?.fees?.managementPct?.toString() ?? '');
  const [custody, setCustody] = useState(existing?.fees?.custodyAnnual?.toString() ?? '');
  const [feeNotes, setFeeNotes] = useState(existing?.fees?.notes ?? '');

  const save = () => {
    if (!name.trim()) return;
    const fees = {
      entryPct: parseNum(entryPct),
      managementPct: parseNum(managementPct),
      custodyAnnual: parseNum(custody),
      notes: feeNotes.trim() || undefined,
    };
    const hasFees = Object.values(fees).some((v) => v !== undefined);
    const account = upsertAccount({
      id: existing?.id,
      name: name.trim(),
      type,
      currency: currency === 'EUR' ? undefined : currency,
      institution: institution.trim() || undefined,
      cashBalance: parseNum(cash),
      fees: hasFees ? fees : undefined,
    });
    // Premier point de courbe (en EUR) pour un nouveau compte avec solde initial.
    if (!existing && parseNum(cash) !== undefined) {
      const rates = useStore.getState().fxRates;
      recordSnapshot(account.id, toEur(parseNum(cash)!, currency, rates), 'manual', todayKey());
    }
    router.back();
  };

  return (
    <>
      <Stack.Screen options={{ title: existing ? 'Modifier le compte' : 'Nouveau compte' }} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Card>
          <Field label="Nom du compte" value={name} onChangeText={setName} placeholder="ex : PEA Boursorama" />
          <Text style={styles.label}>Type de compte</Text>
          <Chips options={ACCOUNT_TYPE_ORDER} value={type} onChange={setType} labels={ACCOUNT_TYPE_LABELS} />
          <Field label="Établissement (optionnel)" value={institution} onChangeText={setInstitution} placeholder="ex : Boursorama" />
          <SelectField
            label="Devise du compte"
            value={currency}
            onChange={setCurrency}
            options={CURRENCIES.map((c) => ({ value: c, label: CURRENCY_LABELS[c] }))}
            hint={currency !== 'EUR' ? 'Les montants saisis sont dans cette devise ; l\'affichage est converti en € automatiquement.' : undefined}
          />
          <Field
            label={`Liquidités / solde espèces en ${currency} (optionnel)`}
            value={cash}
            onChangeText={setCash}
            keyboardType="decimal-pad"
            placeholder="ex : 1500"
            hint="Pour un compte sans lignes (livret, fonds euros…), ce montant sert de valeur du compte."
          />
        </Card>

        <SectionTitle>Frais (optionnel)</SectionTitle>
        <Card>
          <Field label="Frais d'entrée / versement (%)" value={entryPct} onChangeText={setEntryPct} keyboardType="decimal-pad" placeholder="ex : 0,5" />
          <Field label="Frais de gestion annuels (%)" value={managementPct} onChangeText={setManagementPct} keyboardType="decimal-pad" placeholder="ex : 0,75" />
          <Field label="Droits de garde / frais fixes annuels (€)" value={custody} onChangeText={setCustody} keyboardType="decimal-pad" placeholder="ex : 24" />
          <Field label="Notes sur les frais" value={feeNotes} onChangeText={setFeeNotes} placeholder="ex : 0 % sur les ETF partenaires" />
        </Card>

        <Button title="Enregistrer" onPress={save} disabled={!name.trim()} />
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
