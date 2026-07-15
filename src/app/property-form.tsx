/** Création / édition d'un bien immobilier. */
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
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
const VALUATION_LABELS: Record<ValuationMode, string> = {
  index: 'Auto (indice)',
  manual: 'Valeur manuelle',
};

export default function PropertyForm() {
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
      <Stack.Screen options={{ title: existing ? 'Modifier le bien' : 'Nouveau bien' }} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Card>
          <Field label="Nom du bien" value={name} onChangeText={setName} placeholder="ex : Appartement Lyon 3e" />
          <Text style={styles.label}>Type de bien</Text>
          <Chips options={PROPERTY_KIND_ORDER} value={kind} onChange={setKind} labels={PROPERTY_KIND_LABELS} />
          <Field label="Adresse (optionnel)" value={address} onChangeText={setAddress} placeholder="ex : 12 rue de la Paix, Lyon" />
          <SelectField
            label="Devise du bien"
            value={currency}
            onChange={setCurrency}
            options={CURRENCIES.map((c) => ({ value: c, label: CURRENCY_LABELS[c] }))}
            hint={currency !== 'EUR' ? 'Montants saisis dans cette devise ; affichage converti en €.' : undefined}
          />
        </Card>

        <SectionTitle>Acquisition</SectionTitle>
        <Card>
          <Field label={`Prix d'achat en ${currency}`} value={purchasePrice} onChangeText={setPurchasePrice} keyboardType="decimal-pad" placeholder="ex : 250000" />
          <Field label={`Frais d'acquisition en ${currency} — notaire, agence (optionnel)`} value={purchaseCosts} onChangeText={setPurchaseCosts} keyboardType="decimal-pad" placeholder="ex : 20000" />
          <Field
            label="Date d'achat"
            value={purchaseDate}
            onChangeText={setPurchaseDate}
            placeholder="AAAA-MM-JJ"
            autoCapitalize="none"
            hint={date === undefined ? 'Format attendu : AAAA-MM-JJ (ex : 2019-06-15).' : undefined}
          />
          <Field label="Surface en m² (optionnel)" value={surface} onChangeText={setSurface} keyboardType="decimal-pad" placeholder="ex : 65" />
          <Field
            label="Quote-part détenue en % (optionnel)"
            value={ownershipPct}
            onChangeText={setOwnershipPct}
            keyboardType="decimal-pad"
            placeholder="ex : 50 (SCI / indivision)"
            hint={
              !pctValid
                ? 'Saisissez un pourcentage entre 0 et 100.'
                : 'Laissez vide pour une détention pleine (100 %). En SCI ou indivision, la valeur et la dette sont pondérées par cette part dans le patrimoine.'
            }
          />
        </Card>

        <SectionTitle>Estimation de la valeur</SectionTitle>
        <Card>
          <Text style={styles.label}>Mode d'estimation</Text>
          <Chips options={VALUATION_MODES} value={valuationMode} onChange={setValuationMode} labels={VALUATION_LABELS} />
          {valuationMode === 'index' ? (
            <Text style={styles.hint}>
              La valeur est réévaluée automatiquement depuis le prix d'achat via l'indice national
              des prix des logements anciens (INSEE). Basculez en « Valeur manuelle » pour saisir
              votre propre estimation.
            </Text>
          ) : (
            <Field
              label={`Valeur estimée actuelle en ${currency}`}
              value={manualValue}
              onChangeText={setManualValue}
              keyboardType="decimal-pad"
              placeholder="ex : 290000"
              hint="Par ex. l'estimation d'un agent ou de DVF. Prime sur l'indice."
            />
          )}
        </Card>

        <Card>
          <Field label="Notes (optionnel)" value={notes} onChangeText={setNotes} placeholder="ex : locataire jusqu'en 2027" multiline />
        </Card>

        <Button title="Enregistrer" onPress={save} disabled={!valid} />
        <Button title="Annuler" variant="secondary" onPress={() => router.back()} />
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
