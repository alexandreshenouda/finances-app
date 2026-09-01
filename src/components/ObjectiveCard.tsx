/** Carte d'un objectif : catégorie, progression (%), barre tricolore, mensualité à épargner. */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card, ProgressBar, objectiveProgressColor } from '@/components/ui';
import { C, useStyles } from '@/constants/theme';
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
    name: { color: C.text, fontSize: 16, fontWeight: '600' },
    sub: { color: C.textDim, fontSize: 12, marginTop: 2 },
    chevron: { color: C.textFaint, fontSize: 20, marginLeft: 8 },
    progressWrap: {},
    progressLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
    progressLabel: { color: C.textFaint, fontSize: 12 },
    hint: { color: C.textFaint, fontSize: 12, marginTop: 8 },
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
  const progress = objectiveProgress(objective, { accounts, holdings, snapshots, rates, objectives });
  const color = objectiveProgressColor(progress.pct, objective.category);
  const title = objective.category === 'epargne_precaution' ? OBJECTIVE_CATEGORY_LABELS.epargne_precaution : objective.name || OBJECTIVE_CATEGORY_LABELS[objective.category];

  return (
    <Pressable onPress={onPress}>
      <Card>
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{title}</Text>
            <Text style={styles.sub}>{OBJECTIVE_CATEGORY_LABELS[objective.category]}</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
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
            À épargner {formatMoney(progress.monthlyContribution)}/mois
            {progress.monthsRemaining !== undefined ? ` sur ${formatDuration(progress.monthsRemaining)}` : ''}
          </Text>
        )}
      </Card>
    </Pressable>
  );
}
