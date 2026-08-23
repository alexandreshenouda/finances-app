/** Création / édition d'un objectif financier : épargne de précaution, projet à long
 *  ou court terme. La catégorie « épargne de précaution » est limitée à une instance
 *  (retirée du sélecteur une fois définie, sauf en édition de celle-ci). */
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button, Card, Chips, Field, Slider } from '@/components/ui';
import { C } from '@/constants/theme';
import { confirmAction } from '@/lib/confirm';
import { formatDuration, formatMoney, formatPct } from '@/lib/format';
import { objectiveProgress } from '@/lib/objectives';
import { useStore } from '@/lib/store';
import {
  OBJECTIVE_CATEGORY_LABELS,
  OBJECTIVE_CATEGORY_ORDER,
  type Objective,
  type ObjectiveCategory,
} from '@/lib/types';

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

const SECURITY_MONTHS_WARNING = 8;

export default function ObjectiveForm() {
  const { t } = useTranslation();
  const { objectiveId } = useLocalSearchParams<{ objectiveId?: string }>();
  const router = useRouter();
  const objectives = useStore((s) => s.objectives);
  const accounts = useStore((s) => s.accounts);
  const holdings = useStore((s) => s.holdings);
  const snapshots = useStore((s) => s.snapshots);
  const rates = useStore((s) => s.fxRates);
  const upsertObjective = useStore((s) => s.upsertObjective);
  const deleteObjective = useStore((s) => s.deleteObjective);
  const existing = objectives.find((o) => o.id === objectiveId);

  const hasOtherEpargne = objectives.some((o) => o.category === 'epargne_precaution' && o.id !== existing?.id);
  const availableCategories = OBJECTIVE_CATEGORY_ORDER.filter((c) => c !== 'epargne_precaution' || !hasOtherEpargne);

  const [category, setCategory] = useState<ObjectiveCategory>(existing?.category ?? availableCategories[0]);

  // epargne_precaution
  const [securityMonths, setSecurityMonths] = useState(existing?.securityMonths ?? 3);
  const [monthlyExpenses, setMonthlyExpenses] = useState(existing?.monthlyExpenses?.toString() ?? '');

  // projet_long_terme / projet_court_terme
  const [name, setName] = useState(existing?.name ?? '');
  const [targetAmount, setTargetAmount] = useState(existing?.targetAmount?.toString() ?? '');
  const [bufferAmount, setBufferAmount] = useState(existing?.bufferAmount?.toString() ?? '');
  const [deadline, setDeadline] = useState(existing?.deadline ?? '');

  const monthlyExpensesNum = parseNum(monthlyExpenses);
  const targetAmountNum = parseNum(targetAmount);
  const bufferAmountNum = parseNum(bufferAmount);
  const deadlineDate = deadline.trim() ? parseDate(deadline) : undefined;

  const valid =
    category === 'epargne_precaution'
      ? monthlyExpensesNum !== undefined && monthlyExpensesNum > 0
      : name.trim().length > 0 &&
        targetAmountNum !== undefined &&
        targetAmountNum > 0 &&
        (!deadline.trim() || deadlineDate !== undefined);

  // Aperçu en direct de la progression avec l'objectif en cours de saisie.
  const draft: Objective = useMemo(
    () => ({
      id: existing?.id ?? 'draft',
      category,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      securityMonths: category === 'epargne_precaution' ? securityMonths : undefined,
      monthlyExpenses: category === 'epargne_precaution' ? monthlyExpensesNum : undefined,
      name: name.trim() || undefined,
      targetAmount: targetAmountNum,
      bufferAmount: category === 'projet_long_terme' ? bufferAmountNum : undefined,
      deadline: deadlineDate,
    }),
    [existing, category, securityMonths, monthlyExpensesNum, name, targetAmountNum, bufferAmountNum, deadlineDate]
  );

  const otherObjectives = objectives.filter((o) => o.id !== draft.id);
  const preview = objectiveProgress(draft, {
    accounts,
    holdings,
    snapshots,
    rates,
    objectives: [...otherObjectives, draft],
  });

  const sliderColor = securityMonths > SECURITY_MONTHS_WARNING ? C.negative : C.accent;

  const save = () => {
    if (!valid) return;
    if (category === 'epargne_precaution') {
      upsertObjective({ id: existing?.id, category, securityMonths, monthlyExpenses: monthlyExpensesNum! });
    } else {
      upsertObjective({
        id: existing?.id,
        category,
        name: name.trim(),
        targetAmount: targetAmountNum!,
        bufferAmount: category === 'projet_long_terme' ? bufferAmountNum : undefined,
        deadline: deadlineDate,
      });
    }
    router.back();
  };

  const onDelete = () =>
    confirmAction(
      t('objectiveForm.supprimer_titre'),
      t('objectiveForm.supprimer_confirm', { name: existing?.name || OBJECTIVE_CATEGORY_LABELS[existing!.category] }),
      () => {
        deleteObjective(existing!.id);
        router.back();
      }
    );

  return (
    <>
      <Stack.Screen options={{ title: existing ? t('objectiveForm.titre_edit') : t('objectiveForm.titre_new') }} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Card>
          <Text style={styles.label}>{t('objectiveForm.categorie')}</Text>
          <Chips options={availableCategories} value={category} onChange={setCategory} labels={OBJECTIVE_CATEGORY_LABELS} />
        </Card>

        {category === 'epargne_precaution' ? (
          <Card>
            <Text style={styles.label}>{t('objectiveForm.duree_securite', { months: securityMonths })}</Text>
            <Slider value={securityMonths} min={1} max={24} step={1} onChange={setSecurityMonths} color={sliderColor} />
            {securityMonths > SECURITY_MONTHS_WARNING && (
              <Text style={styles.warning}>{t('objectiveForm.duree_warning')}</Text>
            )}
            <Field
              label={t('objectiveForm.depenses_mensuelles')}
              value={monthlyExpenses}
              onChangeText={setMonthlyExpenses}
              keyboardType="decimal-pad"
              placeholder={t('objectiveForm.depenses_placeholder')}
              hint={t('objectiveForm.depenses_hint')}
            />
          </Card>
        ) : (
          <Card>
            <Field label={t('objectiveForm.nom_projet')} value={name} onChangeText={setName} placeholder={t('objectiveForm.nom_projet_placeholder')} />
            <Field
              label={t('objectiveForm.montant_necessaire')}
              value={targetAmount}
              onChangeText={setTargetAmount}
              keyboardType="decimal-pad"
              placeholder={t('objectiveForm.montant_placeholder')}
            />
            {category === 'projet_long_terme' && (
              <Field
                label={t('objectiveForm.montant_reserve')}
                value={bufferAmount}
                onChangeText={setBufferAmount}
                keyboardType="decimal-pad"
                placeholder={t('objectiveForm.montant_reserve_placeholder')}
                hint={t('objectiveForm.montant_reserve_hint')}
              />
            )}
            <Field
              label={t('objectiveForm.echeance')}
              value={deadline}
              onChangeText={setDeadline}
              placeholder={t('propertyForm.date_placeholder')}
              autoCapitalize="none"
              hint={deadline.trim() && deadlineDate === undefined ? t('loanForm.date_hint') : undefined}
            />
          </Card>
        )}

        <Card>
          <Text style={styles.label}>{t('objectiveForm.apercu')}</Text>
          <Text style={styles.previewLine}>
            {formatMoney(preview.current)} / {formatMoney(preview.target)} · {formatPct(preview.pct)}
          </Text>
          {preview.monthlyContribution !== undefined && (
            <Text style={styles.previewLine}>
              {t('objectiveForm.a_epargner', {
                amount: formatMoney(preview.monthlyContribution),
                duration: preview.monthsRemaining !== undefined ? t('objectiveForm.sur_duree', { duration: formatDuration(preview.monthsRemaining) }) : '',
              })}
            </Text>
          )}
        </Card>

        <Button title={t('common.save')} onPress={save} disabled={!valid} />
        {existing && <Button title={t('objectiveForm.supprimer_bouton')} variant="danger" onPress={onDelete} />}
        <Button title={t('common.cancel')} variant="secondary" onPress={() => router.back()} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 40 },
  label: { color: C.textDim, fontSize: 13, marginBottom: 6 },
  warning: { color: C.negative, fontSize: 12, lineHeight: 17, marginTop: 4, marginBottom: 8 },
  previewLine: { color: C.text, fontSize: 14, marginTop: 4 },
});
