/** Création / édition d'un flux récurrent du budget : revenu, dépense ou versement
 *  d'épargne programmé. Ouvert avec `kind` (création) ou `itemId` (édition). */
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { Button, Card, Checkbox, Chips, Field } from '@/components/ui';
import { C, CONTENT, FONT, useStyles } from '@/constants/theme';
import { monthlyAmount } from '@/lib/budget';
import { confirmAction } from '@/lib/confirm';
import { formatEur } from '@/lib/format';
import { useStore } from '@/lib/store';
import {
  BUDGET_CATEGORIES,
  BUDGET_CATEGORY_LABELS,
  BUDGET_ESSENTIAL_DEFAULT,
  BUDGET_FREQUENCIES,
  BUDGET_FREQUENCY_LABELS,
  BUDGET_KIND_LABELS,
  BUDGET_KINDS,
  type BudgetCategory,
  type BudgetFrequency,
  type BudgetKind,
} from '@/lib/types';

function parseNum(s: string): number | undefined {
  if (!s.trim()) return undefined;
  const v = parseFloat(s.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(v) ? v : undefined;
}

function makeStyles() {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.bg },
    content: { padding: 16, paddingBottom: 40, ...CONTENT },
    label: { color: C.textDim, fontSize: FONT.sm, marginBottom: 6 },
    hint: { color: C.textFaint, fontSize: FONT.sm, lineHeight: 17, marginTop: 8 },
    preview: { color: C.text, fontSize: FONT.md },
  });
}

export default function BudgetForm() {
  const styles = useStyles(makeStyles);
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ itemId?: string; kind?: string }>();
  const existing = useStore((s) => s.budgetItems.find((b) => b.id === params.itemId));
  const upsert = useStore((s) => s.upsertBudgetItem);
  const remove = useStore((s) => s.deleteBudgetItem);
  useStore((s) => s.privacyMode); // re-render au changement de mode confidentialité (masquage dans format.ts)

  const initialKind: BudgetKind =
    existing?.kind ?? (BUDGET_KINDS.includes(params.kind as BudgetKind) ? (params.kind as BudgetKind) : 'expense');
  const [kind, setKind] = useState<BudgetKind>(initialKind);
  const [category, setCategory] = useState<BudgetCategory>(existing?.category ?? BUDGET_CATEGORIES[initialKind][0]);
  const [label, setLabel] = useState(existing?.label ?? '');
  const [amount, setAmount] = useState(existing?.amount?.toString() ?? '');
  const [frequency, setFrequency] = useState<BudgetFrequency>(existing?.frequency ?? 'monthly');
  const [essential, setEssential] = useState(
    existing ? !!existing.essential : BUDGET_ESSENTIAL_DEFAULT.includes(BUDGET_CATEGORIES[initialKind][0])
  );

  const changeKind = (k: BudgetKind) => {
    setKind(k);
    changeCategory(BUDGET_CATEGORIES[k][0]);
  };
  // Le caractère « vital » suit la catégorie par défaut ; la case reste modifiable ensuite.
  const changeCategory = (c: BudgetCategory) => {
    setCategory(c);
    setEssential(BUDGET_ESSENTIAL_DEFAULT.includes(c));
  };

  const amountNum = parseNum(amount);
  const valid = amountNum !== undefined && amountNum > 0;

  const save = () => {
    if (!valid) return;
    upsert({
      id: existing?.id,
      kind,
      category,
      // Sans libellé, la catégorie sert de nom (« Logement », « Salaire »…).
      label: label.trim() || BUDGET_CATEGORY_LABELS[category],
      amount: amountNum!,
      frequency,
      essential: kind === 'expense' ? essential : undefined,
    });
    router.back();
  };

  const onDelete = () =>
    confirmAction(t('budgetForm.supprimer_titre'), t('budgetForm.supprimer_confirm', { name: existing!.label }), () => {
      remove(existing!.id);
      router.back();
    });

  return (
    <>
      <Stack.Screen options={{ title: existing ? t('budgetForm.titre_edit') : t('budgetForm.titre_new') }} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card>
          <Text style={styles.label}>{t('budgetForm.nature')}</Text>
          <Chips options={BUDGET_KINDS} value={kind} onChange={changeKind} labels={BUDGET_KIND_LABELS} />
          <Text style={styles.label}>{t('budgetForm.categorie')}</Text>
          <Chips
            options={BUDGET_CATEGORIES[kind]}
            value={category}
            onChange={changeCategory}
            labels={BUDGET_CATEGORY_LABELS}
            style={{ marginBottom: 0 }}
          />
        </Card>

        <Card>
          <Field
            label={t('budgetForm.libelle')}
            value={label}
            onChangeText={setLabel}
            placeholder={BUDGET_CATEGORY_LABELS[category]}
            hint={t('budgetForm.libelle_hint')}
          />
          <Field
            label={t('budgetForm.montant')}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="0"
          />
          <Text style={styles.label}>{t('budgetForm.periodicite')}</Text>
          <Chips
            options={BUDGET_FREQUENCIES}
            value={frequency}
            onChange={setFrequency}
            labels={BUDGET_FREQUENCY_LABELS}
            style={{ marginBottom: frequency !== 'monthly' && valid ? 12 : 0 }}
          />
          {frequency !== 'monthly' && valid && (
            <Text style={styles.preview}>
              {t('budgetForm.soit_par_mois', { amount: formatEur(monthlyAmount({ amount: amountNum!, frequency }), true) })}
            </Text>
          )}
        </Card>

        {kind === 'expense' && (
          <Card>
            <Checkbox label={t('budgetForm.vitale')} value={essential} onChange={setEssential} />
            <Text style={styles.hint}>{t('budgetForm.vitale_hint')}</Text>
          </Card>
        )}
        {kind === 'saving' && (
          <Card>
            <Text style={[styles.hint, { marginTop: 0 }]}>{t('budgetForm.epargne_hint')}</Text>
          </Card>
        )}

        <Button title={t('common.save')} onPress={save} disabled={!valid} />
        {existing && <Button title={t('budgetForm.supprimer_bouton')} variant="danger" onPress={onDelete} />}
        <Button title={t('common.cancel')} variant="secondary" onPress={() => router.back()} />
      </ScrollView>
    </>
  );
}
