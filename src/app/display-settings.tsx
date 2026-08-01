/** Paramètres d'affichage : période par défaut des courbes et +/- value. */
import { ScrollView, StyleSheet, Text } from 'react-native';
import { Card, PeriodChips, SectionTitle } from '@/components/ui';
import { C } from '@/constants/theme';
import { useStore } from '@/lib/store';

export default function DisplaySettings() {
  const defaultPeriod = useStore((s) => s.defaultPeriod);
  const setDefaultPeriod = useStore((s) => s.setDefaultPeriod);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <SectionTitle>Période par défaut</SectionTitle>
      <Card>
        <Text style={styles.hint}>
          Période affichée à l'ouverture de l'application, pour les courbes et le calcul de la
          variation (+/- value) de la Synthèse et des écrans de détail.
        </Text>
        <PeriodChips value={defaultPeriod} onChange={setDefaultPeriod} />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 40 },
  hint: { color: C.textDim, fontSize: 13, marginBottom: 12, lineHeight: 18 },
});
