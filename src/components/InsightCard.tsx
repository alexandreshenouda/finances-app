/** Carte d'une suggestion de diversification : pastille colorée par sévérité + texte. */
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Card, Dot } from '@/components/ui';
import { C } from '@/constants/theme';
import type { Insight } from '@/lib/diversification';

const SEVERITY_COLOR: Record<Insight['severity'], string> = {
  warning: C.warning,
  info: C.accent,
  positive: C.positive,
};

export function InsightCard({ insight }: { insight: Insight }) {
  const { t } = useTranslation();
  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <Dot color={SEVERITY_COLOR[insight.severity]} size={8} />
        <Text style={styles.text}>{t(insight.key, insight.params)}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: 12 },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  text: { flex: 1, color: C.text, fontSize: 14, lineHeight: 20 },
});
