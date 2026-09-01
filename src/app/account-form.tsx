/** Création / édition manuelle d'un compte. */
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button, Card, Chips, Field, SectionTitle, SelectField } from '@/components/ui';
import { C, useStyles } from '@/constants/theme';
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

function makeStyles() {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.bg },
    content: { padding: 16, paddingBottom: 40 },
    label: { color: C.textDim, fontSize: 13, marginBottom: 6 },
  });
}

export default function AccountForm() {
  const styles = useStyles(makeStyles);
  const { t } = useTranslation();
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
  const [ownershipPct, setOwnershipPct] = useState(existing?.ownershipPct?.toString() ?? '');
  const [entryPct, setEntryPct] = useState(existing?.fees?.entryPct?.toString() ?? '');
  const [managementPct, setManagementPct] = useState(existing?.fees?.managementPct?.toString() ?? '');
  const [custody, setCustody] = useState(existing?.fees?.custodyAnnual?.toString() ?? '');
  const [feeNotes, setFeeNotes] = useState(existing?.fees?.notes ?? '');

  const pct = parseNum(ownershipPct);
  const pctValid = type !== 'immobilier' || pct === undefined || (pct > 0 && pct <= 100);

  const save = () => {
    if (!name.trim() || !pctValid) return;
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
      // Quote-part réservée aux comptes immobiliers ; 100 % ou vide = détention pleine.
      ownershipPct: type === 'immobilier' && pct !== undefined && pct !== 100 ? pct : undefined,
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
      <Stack.Screen options={{ title: existing ? t('accountForm.titre_edit') : t('accountForm.titre_new') }} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Card>
          <Field label={t('accountForm.nom')} value={name} onChangeText={setName} placeholder={t('accountForm.nom_placeholder')} />
          <Text style={styles.label}>{t('accountForm.type')}</Text>
          <Chips options={ACCOUNT_TYPE_ORDER} value={type} onChange={setType} labels={ACCOUNT_TYPE_LABELS} />
          <Field label={t('accountForm.etablissement')} value={institution} onChangeText={setInstitution} placeholder={t('accountForm.etablissement_placeholder')} />
          <SelectField
            label={t('accountForm.devise')}
            value={currency}
            onChange={setCurrency}
            options={CURRENCIES.map((c) => ({ value: c, label: CURRENCY_LABELS[c] }))}
            hint={currency !== 'EUR' ? t('accountForm.devise_hint') : undefined}
          />
          <Field
            label={t('accountForm.liquidites', { currency })}
            value={cash}
            onChangeText={setCash}
            keyboardType="decimal-pad"
            placeholder={t('accountForm.liquidites_placeholder')}
            hint={t('accountForm.liquidites_hint')}
          />
          {type === 'immobilier' && (
            <Field
              label={t('accountForm.quote_part')}
              value={ownershipPct}
              onChangeText={setOwnershipPct}
              keyboardType="decimal-pad"
              placeholder={t('accountForm.quote_part_placeholder')}
              hint={!pctValid ? t('accountForm.quote_part_erreur') : t('accountForm.quote_part_hint')}
            />
          )}
        </Card>

        <SectionTitle>{t('accountForm.frais_titre')}</SectionTitle>
        <Card>
          <Field label={t('forms.frais_entree')} value={entryPct} onChangeText={setEntryPct} keyboardType="decimal-pad" placeholder={t('accountForm.frais_entree_placeholder')} />
          <Field label={t('forms.frais_gestion')} value={managementPct} onChangeText={setManagementPct} keyboardType="decimal-pad" placeholder={t('accountForm.frais_gestion_placeholder')} />
          <Field label={t('forms.frais_garde')} value={custody} onChangeText={setCustody} keyboardType="decimal-pad" placeholder={t('accountForm.frais_garde_placeholder')} />
          <Field label={t('accountForm.frais_notes')} value={feeNotes} onChangeText={setFeeNotes} placeholder={t('accountForm.frais_notes_placeholder')} />
        </Card>

        <Button title={t('common.save')} onPress={save} disabled={!name.trim() || !pctValid} />
        <Button title={t('common.cancel')} variant="secondary" onPress={() => router.back()} />
      </ScrollView>
    </>
  );
}
