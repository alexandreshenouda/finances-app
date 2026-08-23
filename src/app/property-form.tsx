/** Création / édition d'un bien immobilier. */
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button, Card, Chips, Field, SectionTitle, SelectField } from '@/components/ui';
import { C } from '@/constants/theme';
import { todayKey } from '@/lib/format';
import { useStore } from '@/lib/store';
import {
  CURRENCIES,
  CURRENCY_LABELS,
  PROPERTY_KIND_LABELS,
  PROPERTY_KIND_ORDER,
  type Currency,
  type PropertyKind,
  type ValuationMode,
} from '@/lib/types';

function parseNum(s: string): number | undefined {
  if (!s.trim()) return undefined;
  const v = parseFloat(s.replace(',', '.'));
  return Number.isFinite(v) ? v : undefined;
}

/** Normalise une saisie de date en YYYY-MM-DD (renvoie undefined si invalide). */
function parseDate(s: string): string | undefined {
  const t = s.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return undefined;
  const d = new Date(`${t}T12:00:00`);
  return Number.isNaN(d.getTime()) ? undefined : t;
}

const VALUATION_MODES: ValuationMode[] = ['index', 'manual'];

export default function PropertyForm() {
  const { t } = useTranslation();
  const VALUATION_LABELS: Record<ValuationMode, string> = {
    index: t('propertyForm.valuation_auto'),
    manual: t('propertyForm.valuation_manuelle'),
  };
  const { propertyId } = useLocalSearchParams<{ propertyId?: string }>();
  const router = useRouter();
  const existing = useStore((s) => s.properties.find((p) => p.id === propertyId));
  const upsertProperty = useStore((s) => s.upsertProperty);

  const [name, setName] = useState(existing?.name ?? '');
  const [kind, setKind] = useState<PropertyKind>(existing?.kind ?? 'appartement');
  const [address, setAddress] = useState(existing?.address ?? '');
  const [currency, setCurrency] = useState<Currency>(existing?.currency ?? 'EUR');
  const [purchasePrice, setPurchasePrice] = useState(existing?.purchasePrice?.toString() ?? '');
  const [purchaseCosts, setPurchaseCosts] = useState(existing?.purchaseCosts?.toString() ?? '');
  const [purchaseDate, setPurchaseDate] = useState(existing?.purchaseDate ?? todayKey());
  const [surface, setSurface] = useState(existing?.surface?.toString() ?? '');
  const [ownershipPct, setOwnershipPct] = useState(existing?.ownershipPct?.toString() ?? '');
  const [valuationMode, setValuationMode] = useState<ValuationMode>(existing?.valuationMode ?? 'index');
  const [manualValue, setManualValue] = useState(existing?.manualValue?.toString() ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');

  const price = parseNum(purchasePrice);
  const date = parseDate(purchaseDate);
  const pct = parseNum(ownershipPct);
  const pctValid = pct === undefined || (pct > 0 && pct <= 100);
  const valid = name.trim().length > 0 && price !== undefined && date !== undefined && pctValid;

  const save = () => {
    if (!valid) return;
    upsertProperty({
      id: existing?.id,
      name: name.trim(),
      kind,
      address: address.trim() || undefined,
      currency: currency === 'EUR' ? undefined : currency,
      purchasePrice: price!,
      purchaseCosts: parseNum(purchaseCosts),
      purchaseDate: date!,
      surface: parseNum(surface),
      // Absent ou 100 % = détention pleine (on ne stocke rien).
      ownershipPct: pct === undefined || pct === 100 ? undefined : pct,
      valuationMode,
      manualValue: valuationMode === 'manual' ? parseNum(manualValue) : existing?.manualValue,
      notes: notes.trim() || undefined,
    });
    router.back();
  };

  return (
    <>
      <Stack.Screen options={{ title: existing ? t('propertyForm.titre_edit') : t('propertyForm.titre_new') }} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Card>
          <Field label={t('propertyForm.nom')} value={name} onChangeText={setName} placeholder={t('propertyForm.nom_placeholder')} />
          <Text style={styles.label}>{t('realEstate.type')}</Text>
          <Chips options={PROPERTY_KIND_ORDER} value={kind} onChange={setKind} labels={PROPERTY_KIND_LABELS} />
          <Field label={t('propertyForm.adresse')} value={address} onChangeText={setAddress} placeholder={t('propertyForm.adresse_placeholder')} />
          <SelectField
            label={t('propertyForm.devise')}
            value={currency}
            onChange={setCurrency}
            options={CURRENCIES.map((c) => ({ value: c, label: CURRENCY_LABELS[c] }))}
            hint={currency !== 'EUR' ? t('propertyForm.devise_hint') : undefined}
          />
        </Card>

        <SectionTitle>{t('propertyForm.acquisition')}</SectionTitle>
        <Card>
          <Field label={t('propertyForm.prix_achat', { currency })} value={purchasePrice} onChangeText={setPurchasePrice} keyboardType="decimal-pad" placeholder={t('propertyForm.prix_achat_placeholder')} />
          <Field label={t('propertyForm.frais_acquisition', { currency })} value={purchaseCosts} onChangeText={setPurchaseCosts} keyboardType="decimal-pad" placeholder={t('propertyForm.frais_acquisition_placeholder')} />
          <Field
            label={t('propertyForm.date_achat')}
            value={purchaseDate}
            onChangeText={setPurchaseDate}
            placeholder={t('propertyForm.date_placeholder')}
            autoCapitalize="none"
            hint={date === undefined ? t('propertyForm.date_hint') : undefined}
          />
          <Field label={t('propertyForm.surface')} value={surface} onChangeText={setSurface} keyboardType="decimal-pad" placeholder={t('propertyForm.surface_placeholder')} />
          <Field
            label={t('accountForm.quote_part')}
            value={ownershipPct}
            onChangeText={setOwnershipPct}
            keyboardType="decimal-pad"
            placeholder={t('accountForm.quote_part_placeholder')}
            hint={!pctValid ? t('accountForm.quote_part_erreur') : t('propertyForm.quote_part_hint')}
          />
        </Card>

        <SectionTitle>{t('propertyForm.estimation_titre')}</SectionTitle>
        <Card>
          <Text style={styles.label}>{t('propertyForm.estimation_mode')}</Text>
          <Chips options={VALUATION_MODES} value={valuationMode} onChange={setValuationMode} labels={VALUATION_LABELS} />
          {valuationMode === 'index' ? (
            <Text style={styles.hint}>{t('propertyForm.estimation_auto_texte')}</Text>
          ) : (
            <Field
              label={t('propertyForm.valeur_estimee', { currency })}
              value={manualValue}
              onChangeText={setManualValue}
              keyboardType="decimal-pad"
              placeholder={t('propertyForm.valeur_estimee_placeholder')}
              hint={t('propertyForm.valeur_estimee_hint')}
            />
          )}
        </Card>

        <Card>
          <Field label={t('propertyForm.notes')} value={notes} onChangeText={setNotes} placeholder={t('propertyForm.notes_placeholder')} multiline />
        </Card>

        <Button title={t('common.save')} onPress={save} disabled={!valid} />
        <Button title={t('common.cancel')} variant="secondary" onPress={() => router.back()} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 40 },
  label: { color: C.textDim, fontSize: 13, marginBottom: 6 },
  hint: { color: C.textFaint, fontSize: 12, lineHeight: 17 },
});
