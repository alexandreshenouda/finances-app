/** Paramètres d'affichage : période par défaut des courbes et +/- value. */
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Card, Checkbox, PeriodChips, SectionTitle } from '@/components/ui';
import { C } from '@/constants/theme';
import { useStore } from '@/lib/store';

export default function DisplaySettings() {
  const { t } = useTranslation();
  const defaultPeriod = useStore((s) => s.defaultPeriod);
  const setDefaultPeriod = useStore((s) => s.setDefaultPeriod);
  const showImmobilierTab = useStore((s) => s.showImmobilierTab);
  const setShowImmobilierTab = useStore((s) => s.setShowImmobilierTab);
  const showEmpruntsTab = useStore((s) => s.showEmpruntsTab);
  const setShowEmpruntsTab = useStore((s) => s.setShowEmpruntsTab);
  const showDiversificationTab = useStore((s) => s.showDiversificationTab);
  const setShowDiversificationTab = useStore((s) => s.setShowDiversificationTab);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <SectionTitle>{t('settings.periode')}</SectionTitle>
      <Card>
        <Text style={styles.hint}>{t('settings.periode_description')}</Text>
        <PeriodChips value={defaultPeriod} onChange={setDefaultPeriod} />
      </Card>

      <SectionTitle>{t('settings.onglets')}</SectionTitle>
      <Card>
        <Text style={styles.hint}>{t('settings.onglets_description')}</Text>
        <Checkbox label={t('tabs.immobilier')} value={showImmobilierTab} onChange={setShowImmobilierTab} />
        <View style={styles.checkboxSpacer}>
          <Checkbox label={t('tabs.emprunts')} value={showEmpruntsTab} onChange={setShowEmpruntsTab} />
        </View>
        <View style={styles.checkboxSpacer}>
          <Checkbox
            label={t('tabs.diversification')}
            value={showDiversificationTab}
            onChange={setShowDiversificationTab}
          />
        </View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 40 },
  hint: { color: C.textDim, fontSize: 13, marginBottom: 12, lineHeight: 18 },
  checkboxSpacer: { marginTop: 10 },
});
