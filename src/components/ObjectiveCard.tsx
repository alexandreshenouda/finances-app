/** Carte d'un objectif : catégorie, progression (%), barre tricolore, mensualité à épargner. */
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { Card, Chevron, ProgressBar, objectiveProgressColor } from '@/components/ui';
import { C, FONT, TABULAR, useStyles } from '@/constants/theme';
import { formatDuration, formatMoney, formatPct } from '@/lib/format';
import { objectiveProgress } from '@/lib/objectives';
import {
  OBJECTIVE_CATEGORY_LABELS,
  type Account,
  type FxRates,
  type Holding,
  type Objective,
  type Snapshot,
} from '@/lib/types';

function makeStyles() {
  return StyleSheet.create({
    head: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    name: { color: C.text, fontSize: FONT.lg, fontWeight: '600' },
    sub: { color: C.textDim, fontSize: FONT.sm, marginTop: 2 },
    progressWrap: {},
    progressLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
    progressLabel: { color: C.textFaint, fontSize: FONT.sm, ...TABULAR },
    hint: { color: C.textFaint, fontSize: FONT.sm, marginTop: 8 },
  });
}

export function ObjectiveCard({
  objective,
  objectives,
  accounts,
  holdings,
  snapshots,
  rates,
  onPress,
}: {
  objective: Objective;
  /** Liste complète des objectifs, pour exclure l'épargne de précaution des autres calculs. */
  objectives: Objective[];
  accounts: Account[];
  holdings: Holding[];
  snapshots: Snapshot[];
  rates: FxRates;
  onPress: () => void;
}) {
  const styles = useStyles(makeStyles);
  const { t } = useTranslation();
  const progress = objectiveProgress(objective, { accounts, holdings, snapshots, rates, objectives });
  const color = objectiveProgressColor(progress.pct, objective.category);
  const title = objective.category === 'epargne_precaution' ? OBJECTIVE_CATEGORY_LABELS.epargne_precaution : objective.name || OBJECTIVE_CATEGORY_LABELS[objective.category];

  return (
      <Card onPress={onPress}>
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{title}</Text>
            <Text style={styles.sub}>{OBJECTIVE_CATEGORY_LABELS[objective.category]}</Text>
          </View>
          <Chevron />
        </View>

        <View style={styles.progressWrap}>
          <ProgressBar ratio={progress.pct / 100} color={color} />
          <View style={styles.progressLabels}>
            <Text style={styles.progressLabel}>
              {formatMoney(progress.current)} / {formatMoney(progress.target)}
            </Text>
            <Text style={[styles.progressLabel, { color }]}>{formatPct(progress.pct)}</Text>
          </View>
        </View>

        {progress.monthlyContribution !== undefined && (
          <Text style={styles.hint}>
            {progress.monthsRemaining !== undefined
              ? t('objectives.a_epargner_sur', {
                  amount: formatMoney(progress.monthlyContribution),
                  duration: formatDuration(progress.monthsRemaining),
                })
              : t('objectives.a_epargner', { amount: formatMoney(progress.monthlyContribution) })}
          </Text>
        )}
      </Card>
  );
}
