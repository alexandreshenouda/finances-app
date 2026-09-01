/** Carte d'une suggestion de diversification : pastille colorée par sévérité + texte. */
import { Card, Dot } from '@/components/ui';
import { C, useStyles } from '@/constants/theme';
import type { Insight } from '@/lib/diversification';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

function makeStyles() {
  return StyleSheet.create({
    card: { paddingVertical: 12 },
    row: { flexDirection: 'row', alignItems: 'flex-start' },
    text: { flex: 1, color: C.text, fontSize: 14, lineHeight: 20 },
  });
}

export function InsightCard({ insight }: { insight: Insight }) {
  const styles = useStyles(makeStyles);
  const { t } = useTranslation();
  const severityColors: Record<Insight['severity'], string> = {
    warning: C.warning,
    info: C.accent,
    positive: C.positive,
  };
  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <Dot color={severityColors[insight.severity]} size={8} />
        <Text style={styles.text}>{t(insight.key, insight.params)}</Text>
      </View>
    </Card>
  );
}
