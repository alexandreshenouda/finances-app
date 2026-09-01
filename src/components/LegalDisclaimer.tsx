/** Avertissement réglementaire, toujours visible (non masquable) au-dessus des suggestions
 * de répartition : ce ne sont ni un conseil en investissement ni une recommandation
 * personnalisée au sens de la réglementation. */
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { C, useStyles } from '@/constants/theme';

function makeStyles() {
  return StyleSheet.create({
    wrap: {
      backgroundColor: C.cardAlt,
      borderLeftWidth: 3,
      borderLeftColor: C.warning,
      borderRadius: 8,
      padding: 12,
      marginBottom: 16,
    },
    title: { color: C.warning, fontSize: 12, fontWeight: '700', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
    text: { color: C.textDim, fontSize: 12, lineHeight: 17 },
  });
}

export function LegalDisclaimer() {
  const styles = useStyles(makeStyles);
  const { t } = useTranslation();
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{t('diversification.avertissement')}</Text>
      <Text style={styles.text}>{t('diversification.disclaimer')}</Text>
    </View>
  );
}
