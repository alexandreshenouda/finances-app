/** Création / édition d'un prêt : crédit immobilier rattaché à un bien, ou prêt conso.
 *  Ouvert depuis un bien (param `propertyId`) : rattachement fixé au bien.
 *  Ouvert depuis l'onglet Emprunts : rattachement au choix (bien ou conso).
 *  Deux modes : mensualité constante, ou prêt à paliers (mensualités échelonnées). */
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
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

type StepInput = { months: string; payment: string };

export default function LoanForm() {
  const { t } = useTranslation();
  const MODE_LABELS: Record<(typeof MODES)[number], string> = {
    constant: t('loanForm.mode_constant'),
    paliers: t('loanForm.mode_paliers'),
  };
  const { propertyId, loanId } = useLocalSearchParams<{ propertyId?: string; loanId?: string }>();
  const router = useRouter();
  const existing = useStore((s) => s.loans.find((l) => l.id === loanId));
  const properties = useStore((s) => s.properties);
  const property = properties.find((p) => p.id === (existing?.propertyId ?? propertyId));
  const upsertLoan = useStore((s) => s.upsertLoan);
  const deleteLoan = useStore((s) => s.deleteLoan);

  // Rattachement : fixé quand on vient d'un bien ; sinon au choix ('conso' = aucun bien).
  const attachFixed = propertyId !== undefined;
  const [attach, setAttach] = useState<string>(existing?.propertyId ?? propertyId ?? 'conso');

  const [name, setName] = useState(existing?.name ?? t('loanForm.nom_defaut'));
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
      propertyId: attach === 'conso' ? undefined : attach,
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
    confirmAction(t('loanForm.supprimer_titre'), t('loanForm.supprimer_confirm', { name: existing?.name }), () => {
      deleteLoan(existing!.id);
      router.back();
    });

  return (
    <>
      <Stack.Screen options={{ title: existing ? t('loanForm.titre_edit') : t('loanForm.titre_new') }} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Card>
          {!attachFixed && (
            <SelectField
              label={t('loanForm.rattachement')}
              value={attach}
              onChange={setAttach}
              options={[
                { value: 'conso', label: t('loanForm.rattachement_conso') },
                ...properties.filter((p) => !p.archived).map((p) => ({ value: p.id, label: p.name })),
              ]}
              hint={t('loanForm.rattachement_hint')}
            />
          )}
          <Field label={t('loanForm.nom')} value={name} onChangeText={setName} placeholder={t('loanForm.nom_placeholder')} />
          <Field label={t('loanForm.preteur')} value={lender} onChangeText={setLender} placeholder={t('loanForm.preteur_placeholder')} />
          <SelectField
            label={t('loanForm.devise')}
            value={currency}
            onChange={setCurrency}
            options={CURRENCIES.map((c) => ({ value: c, label: CURRENCY_LABELS[c] }))}
          />
          <Field label={t('loanForm.capital', { currency })} value={principal} onChangeText={setPrincipal} keyboardType="decimal-pad" placeholder={t('loanForm.capital_placeholder')} />
          <Field label={t('loanForm.taux')} value={annualRate} onChangeText={setAnnualRate} keyboardType="decimal-pad" placeholder={t('loanForm.taux_placeholder')} />
          <Field
            label={t('loanForm.premiere_echeance')}
            value={startDate}
            onChangeText={setStartDate}
            placeholder={t('propertyForm.date_placeholder')}
            autoCapitalize="none"
            hint={date === undefined ? t('loanForm.date_hint') : undefined}
          />
        </Card>

        <Card>
          <Text style={styles.label}>{t('loanForm.remboursement')}</Text>
          <Chips options={MODES} value={mode} onChange={setMode} labels={MODE_LABELS} />

          {mode === 'constant' ? (
            <View style={{ marginTop: 12 }}>
              <Field label={t('loanForm.duree_totale')} value={termMonths} onChangeText={setTermMonths} keyboardType="number-pad" placeholder={t('loanForm.duree_totale_placeholder')} hint={t('loanForm.duree_totale_hint')} />
              <Field
                label={t('loanForm.mensualite', { currency })}
                value={monthlyPayment}
                onChangeText={setMonthlyPayment}
                keyboardType="decimal-pad"
                placeholder={previewPayment !== undefined ? t('loanForm.mensualite_calculee', { value: previewPayment.toFixed(2) }) : t('loanForm.mensualite_placeholder')}
                hint={
                  previewPayment !== undefined
                    ? t('loanForm.mensualite_hint_calculee', { value: formatMoney(previewPayment, currency, true) })
                    : t('loanForm.mensualite_hint_auto')
                }
              />
            </View>
          ) : (
            <View style={{ marginTop: 12 }}>
              <Text style={styles.hint}>{t('loanForm.paliers_hint')}</Text>
              {steps.map((s, idx) => {
                const monthsN = parseNum(s.months);
                const pv = stepPreview[idx];
                const isAuto = !s.payment.trim();
                return (
                  <View key={idx} style={styles.stepCard}>
                    <View style={styles.stepHead}>
                      <Text style={styles.stepTitle}>{t('loanForm.palier_titre', { n: idx + 1 })}</Text>
                      {steps.length > 1 && (
                        <Pressable onPress={() => removeStep(idx)} hitSlop={8}>
                          <Text style={styles.stepRemove}>{t('loanForm.palier_retirer')}</Text>
                        </Pressable>
                      )}
                    </View>
                    <View style={styles.stepRow}>
                      <View style={{ flex: 1 }}>
                        <Field label={t('loanForm.palier_duree')} value={s.months} onChangeText={(v) => setStep(idx, 'months', v)} keyboardType="number-pad" placeholder={t('loanForm.palier_duree_placeholder')} />
                      </View>
                      <View style={{ width: 12 }} />
                      <View style={{ flex: 1 }}>
                        <Field label={t('loanForm.palier_mensualite', { currency })} value={s.payment} onChangeText={(v) => setStep(idx, 'payment', v)} keyboardType="decimal-pad" placeholder={t('loanForm.palier_auto')} />
                      </View>
                    </View>
                    {monthsN !== undefined && monthsN > 0 && pv !== undefined && (
                      <Text style={styles.stepHint}>
                        {t('loanForm.palier_preview', {
                          amount: formatMoney(pv, currency, true),
                          auto: isAuto ? t('loanForm.palier_preview_calculee') : '',
                          duration: formatDuration(Math.round(monthsN)),
                        })}
                      </Text>
                    )}
                  </View>
                );
              })}
              <Button title={t('loanForm.ajouter_palier')} variant="secondary" onPress={addStep} />
              <Text style={styles.hint}>
                {t('loanForm.duree_totale_resume', {
                  value: totalStepMonths > 0 ? t('loanForm.duree_totale_valeur', { months: totalStepMonths, duration: formatDuration(totalStepMonths) }) : '—',
                })}
              </Text>
            </View>
          )}
        </Card>

        <Card>
          <Field label={t('loanForm.assurance', { currency })} value={insuranceMonthly} onChangeText={setInsuranceMonthly} keyboardType="decimal-pad" placeholder={t('loanForm.assurance_placeholder')} />
          <Field label={t('propertyForm.notes')} value={notes} onChangeText={setNotes} placeholder={t('loanForm.notes_placeholder')} multiline />
        </Card>

        <Button title={t('common.save')} onPress={save} disabled={!valid} />
        {existing && <Button title={t('loanForm.supprimer_bouton')} variant="danger" onPress={onDelete} />}
        <Button title={t('common.cancel')} variant="secondary" onPress={() => router.back()} />
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
