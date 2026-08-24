import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Card, SectionTitle } from '@/components/ui';
import { C } from '@/constants/theme';
import { useStore } from '@/lib/store';
import { type Language } from '@/lib/i18n';

const LANGUAGE_OPTIONS: { lang: Language; label: string }[] = [
  { lang: 'fr', label: 'Français' },
  { lang: 'en', label: 'English' },
  { lang: 'de', label: 'Deutsch' },
];

export default function LanguageSettings() {
  const { t } = useTranslation();
  const language = useStore((s) => s.language);
  const setLanguage = useStore((s) => s.setLanguage);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <SectionTitle>{t('settings.langue')}</SectionTitle>
      <Card>
        <Text style={styles.hint}>{t('settings.langue_description')}</Text>
        <View style={styles.chipContainer}>
          {LANGUAGE_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.lang}
              onPress={() => setLanguage(option.lang)}
              style={[styles.chip, language === option.lang && styles.chipActive]}
            >
              <Text style={[styles.chipText, language === option.lang && styles.chipTextActive]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 40 },
  hint: { color: C.textDim, fontSize: 13, marginBottom: 12, lineHeight: 18 },
  chipContainer: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
  },
  chipActive: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  chipText: { color: C.text, fontSize: 14, fontWeight: '500' },
  chipTextActive: { color: C.onAccent },
});
