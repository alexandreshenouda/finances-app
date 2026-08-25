/** Bandeau "clé Alpha Vantage manquante" — contrairement à LegalDisclaimer, celui-ci est
 * purement informatif et peut être fermé définitivement (tant que l'utilisateur ne
 * renseigne/retire pas de clé, voir `store.dismissedAlphaVantageHint`). */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { C } from '@/constants/theme';

export function AlphaVantageHint({ onPress, onDismiss }: { onPress: () => void; onDismiss: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={styles.wrap}>
      <Pressable onPress={onPress} style={{ flex: 1 }}>
        <Text style={styles.title}>{t('diversification.av_hint_titre')}</Text>
        <Text style={styles.text}>{t('diversification.av_hint_texte')}</Text>
      </Pressable>
      <Pressable onPress={onDismiss} hitSlop={10} style={styles.close}>
        <Text style={styles.closeText}>×</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: C.cardAlt,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  title: { color: C.text, fontSize: 13, fontWeight: '600', marginBottom: 4 },
  text: { color: C.textDim, fontSize: 12, lineHeight: 17 },
  close: { paddingHorizontal: 6, paddingVertical: 2, marginLeft: 8 },
  closeText: { color: C.textFaint, fontSize: 18, lineHeight: 20 },
});
