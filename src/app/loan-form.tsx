/** Création / édition d'un crédit immobilier rattaché à un bien.
 *  Deux modes : mensualité constante, ou prêt à paliers (mensualités échelonnées). */
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Chips, Field, SelectField } from '@/components/ui';
import { C } from '@/constants/theme';
import { confirmAction } from '@/lib/confirm';
import { formatDuration, formatMoney, todayKey } from '@/lib/format';
import { loanMonthlyPayment, loanStepPayments } from '@/lib/realestate';
import { useStore } from '@/lib/store';
import { CURRENCIES, CURRENCY_LABELS, type Currency, type Loan, type LoanStep } from '@/lib/types';

function parseNum(s: string): number | undefined {
  if (!s.trim()) return undefined;
  const v = parseFloat(s.replace(',', '.'));
  return Number.isFinite(v) ? v : undefined;
}

function parseDate(s: string): string | undefined {
  const t = s.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return undefined;
  const d = new Date(`${t}T12:00:00`);
  return Number.isNaN(d.getTime()) ? undefined : t;
}

const MODES = ['constant', 'paliers'] as const;
const MODE_LABELS: Record<(typeof MODES)[number], string> = {
  constant: 'Mensualité constante',
  paliers: 'Paliers',
};

type StepInput = { months: string; payment: string };

export default function LoanForm() {
  const { propertyId, loanId } = useLocalSearchParams<{ propertyId: string; loanId?: string }>();
  const router = useRouter();
  const existing = useStore((s) => s.loans.find((l) => l.id === loanId));
  const property = useStore((s) => s.properties.find((p) => p.id === (existing?.propertyId ?? propertyId)));
  const upsertLoan = useStore((s) => s.upsertLoan);
  const deleteLoan = useStore((s) => s.deleteLoan);

  const [name, setName] = useState(existing?.name ?? 'Prêt principal');
  const [lender, setLender] = useState(existing?.lender ?? '');
  const [currency, setCurrency] = useState<Currency>(existing?.currency ?? property?.currency ?? 'EUR');
  const [principal, setPrincipal] = useState(existing?.principal?.toString() ?? '');
  const [annualRate, setAnnualRate] = useState(existing?.annualRate?.toString() ?? '');
  const [startDate, setStartDate] = useState(existing?.startDate ?? todayKey());
  const [insuranceMonthly, setInsuranceMonthly] = useState(existing?.insuranceMonthly?.toString() ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');

  // Mode « constant »
  const [termMonths, setTermMonths] = useState(existing?.termMonths?.toString() ?? '');
  const [monthlyPayment, setMonthlyPayment] = useState(existing?.monthlyPayment?.toString() ?? '');

  // Mode « paliers »
  const [mode, setMode] = useState<(typeof MODES)[number]>(existing?.steps?.length ? 'paliers' : 'constant');
  const [steps, setSteps] = useState<StepInput[]>(
    existing?.steps?.length
      ? existing.steps.map((s) => ({ months: s.months.toString(), payment: s.monthlyPayment?.toString() ?? '' }))
      : [
          { months: '', payment: '' },
          { months: '', payment: '' },
        ]
  );

  const setStep = (idx: number, key: keyof StepInput, val: string) =>
    setSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, [key]: val } : s)));
  const addStep = () => setSteps((prev) => [...prev, { months: '', payment: '' }]);
  const removeStep = (idx: number) => setSteps((prev) => prev.filter((_, i) => i !== idx));

  const principalNum = parseNum(principal);
  const rateNum = parseNum(annualRate);
  const termNum = parseNum(termMonths);
  const date = parseDate(startDate);

  // Paliers saisis (validés = durée > 0) et durée totale du prêt.
  const parsedSteps: LoanStep[] = steps
    .map((s) => {
      const months = Math.round(parseNum(s.months) ?? 0);
      const pay = parseNum(s.payment);
      return pay === undefined ? { months } : { months, monthlyPayment: pay };
    })
    .filter((s) => s.months > 0);
  const totalStepMonths = parsedSteps.reduce((sum, s) => sum + s.months, 0);

  const baseValid =
    name.trim().length > 0 &&
    principalNum !== undefined &&
    principalNum > 0 &&
    rateNum !== undefined &&
    date !== undefined;
  const valid = baseValid && (mode === 'paliers' ? parsedSteps.length > 0 && totalStepMonths > 0 : termNum !== undefined && termNum > 0);

  // Aperçu de la mensualité calculée (mode constant, champ vide).
  const previewPayment =
    mode === 'constant' && baseValid && termNum !== undefined && termNum > 0 && !parseNum(monthlyPayment)
      ? loanMonthlyPayment({ annualRate: rateNum!, termMonths: Math.round(termNum), principal: principalNum! } as Loan)
      : undefined;

  // Aperçu par palier (index aligné sur `steps`, y compris lignes vides).
  const stepPreview =
    mode === 'paliers' && principalNum !== undefined && rateNum !== undefined
      ? loanStepPayments({
          principal: principalNum,
          annualRate: rateNum,
          termMonths: totalStepMonths,
          startDate: date ?? todayKey(),
          steps: steps.map((s) => {
            const months = Math.max(0, Math.round(parseNum(s.months) ?? 0));
            const pay = parseNum(s.payment);
            return pay === undefined ? { months } : { months, monthlyPayment: pay };
          }),
        } as Loan)
      : [];

  const save = () => {
    if (!valid) return;
    const common = {
      id: existing?.id,
      propertyId: existing?.propertyId ?? propertyId!,
      name: name.trim(),
      lender: lender.trim() || undefined,
      currency: currency === 'EUR' ? undefined : currency,
      principal: principalNum!,
      annualRate: rateNum!,
      startDate: date!,
      insuranceMonthly: parseNum(insuranceMonthly),
      notes: notes.trim() || undefined,
    };
    if (mode === 'paliers') {
      upsertLoan({ ...common, termMonths: totalStepMonths, monthlyPayment: undefined, steps: parsedSteps });
    } else {
      upsertLoan({ ...common, termMonths: Math.round(termNum!), monthlyPayment: parseNum(monthlyPayment), steps: undefined });
    }
    router.back();
  };

  const onDelete = () =>
    confirmAction('Supprimer le crédit', `« ${existing?.name} » sera supprimé.`, () => {
      deleteLoan(existing!.id);
      router.back();
    });

  return (
    <>
      <Stack.Screen options={{ title: existing ? 'Modifier le crédit' : 'Nouveau crédit' }} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Card>
          <Field label="Nom du prêt" value={name} onChangeText={setName} placeholder="ex : Prêt principal" />
          <Field label="Prêteur / banque (optionnel)" value={lender} onChangeText={setLender} placeholder="ex : Crédit Agricole" />
          <SelectField
            label="Devise du prêt"
            value={currency}
            onChange={setCurrency}
            options={CURRENCIES.map((c) => ({ value: c, label: CURRENCY_LABELS[c] }))}
          />
          <Field label={`Capital emprunté en ${currency}`} value={principal} onChangeText={setPrincipal} keyboardType="decimal-pad" placeholder="ex : 200000" />
          <Field label="Taux nominal annuel (%)" value={annualRate} onChangeText={setAnnualRate} keyboardType="decimal-pad" placeholder="ex : 3,2" />
          <Field
            label="Date de la 1re échéance"
            value={startDate}
            onChangeText={setStartDate}
            placeholder="AAAA-MM-JJ"
            autoCapitalize="none"
            hint={date === undefined ? 'Format attendu : AAAA-MM-JJ.' : undefined}
          />
        </Card>

        <Card>
          <Text style={styles.label}>Remboursement</Text>
          <Chips options={MODES} value={mode} onChange={setMode} labels={MODE_LABELS} />

          {mode === 'constant' ? (
            <View style={{ marginTop: 12 }}>
              <Field label="Durée totale (mois)" value={termMonths} onChangeText={setTermMonths} keyboardType="number-pad" placeholder="ex : 240" hint="240 mois = 20 ans, 300 = 25 ans." />
              <Field
                label={`Mensualité hors assurance en ${currency} (optionnel)`}
                value={monthlyPayment}
                onChangeText={setMonthlyPayment}
                keyboardType="decimal-pad"
                placeholder={previewPayment !== undefined ? `calculée : ${previewPayment.toFixed(2)}` : 'ex : 1133'}
                hint={
                  previewPayment !== undefined
                    ? `Laissez vide pour utiliser la mensualité calculée : ${formatMoney(previewPayment, currency, true)}.`
                    : 'Laissez vide pour la calculer automatiquement à partir du capital, du taux et de la durée.'
                }
              />
            </View>
          ) : (
            <View style={{ marginTop: 12 }}>
              <Text style={styles.hint}>
                Un palier = une mensualité constante sur une durée. Laissez la mensualité vide
                pour qu'elle soit calculée (utile pour le dernier palier, ajusté afin de solder le prêt).
                Mettez 0 pour un différé total.
              </Text>
              {steps.map((s, idx) => {
                const monthsN = parseNum(s.months);
                const pv = stepPreview[idx];
                const isAuto = !s.payment.trim();
                return (
                  <View key={idx} style={styles.stepCard}>
                    <View style={styles.stepHead}>
                      <Text style={styles.stepTitle}>Palier {idx + 1}</Text>
                      {steps.length > 1 && (
                        <Pressable onPress={() => removeStep(idx)} hitSlop={8}>
                          <Text style={styles.stepRemove}>Retirer</Text>
                        </Pressable>
                      )}
                    </View>
                    <View style={styles.stepRow}>
                      <View style={{ flex: 1 }}>
                        <Field label="Durée (mois)" value={s.months} onChangeText={(v) => setStep(idx, 'months', v)} keyboardType="number-pad" placeholder="ex : 24" />
                      </View>
                      <View style={{ width: 12 }} />
                      <View style={{ flex: 1 }}>
                        <Field label={`Mensualité ${currency}`} value={s.payment} onChangeText={(v) => setStep(idx, 'payment', v)} keyboardType="decimal-pad" placeholder="auto" />
                      </View>
                    </View>
                    {monthsN !== undefined && monthsN > 0 && pv !== undefined && (
                      <Text style={styles.stepHint}>
                        {formatMoney(pv, currency, true)}/mois{isAuto ? ' (calculée)' : ''} · {formatDuration(Math.round(monthsN))}
                      </Text>
                    )}
                  </View>
                );
              })}
              <Button title="＋ Ajouter un palier" variant="secondary" onPress={addStep} />
              <Text style={styles.hint}>
                Durée totale : {totalStepMonths > 0 ? `${totalStepMonths} mois (${formatDuration(totalStepMonths)})` : '—'}.
              </Text>
            </View>
          )}
        </Card>

        <Card>
          <Field label={`Assurance emprunteur / mois en ${currency} (optionnel)`} value={insuranceMonthly} onChangeText={setInsuranceMonthly} keyboardType="decimal-pad" placeholder="ex : 30" />
          <Field label="Notes (optionnel)" value={notes} onChangeText={setNotes} placeholder="ex : taux renégocié en 2024" multiline />
        </Card>

        <Button title="Enregistrer" onPress={save} disabled={!valid} />
        {existing && <Button title="Supprimer le crédit" variant="danger" onPress={onDelete} />}
        <Button title="Annuler" variant="secondary" onPress={() => router.back()} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 40 },
  label: { color: C.textDim, fontSize: 13, marginBottom: 6 },
  hint: { color: C.textFaint, fontSize: 12, lineHeight: 17, marginBottom: 8 },
  stepCard: {
    backgroundColor: C.cardAlt,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  stepHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  stepTitle: { color: C.textDim, fontSize: 13, fontWeight: '600' },
  stepRemove: { color: C.negative, fontSize: 13 },
  stepRow: { flexDirection: 'row' },
  stepHint: { color: C.textFaint, fontSize: 12 },
});
