/** Paramètres d'affichage : période par défaut des courbes et +/- value. */
import { ScrollView, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Card, PeriodChips, SectionTitle } from '@/components/ui';
import { C } from '@/constants/theme';
import { useStore } from '@/lib/store';

export default function DisplaySettings() {
  const { t } = useTranslation();
  const defaultPeriod = useStore((s) => s.defaultPeriod);
  const setDefaultPeriod = useStore((s) => s.setDefaultPeriod);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <SectionTitle>{t('settings.periode')}</SectionTitle>
      <Card>
        <Text style={styles.hint}>{t('settings.periode_description')}</Text>
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
