/** Onglet Analyse : regroupe les rubriques Diversification et IA (anciennement deux
 *  onglets). Les liens « analyser cette ligne » arrivent ici avec `section: 'ai'` et
 *  le titre à analyser en paramètres. */
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { DiversificationSection } from '@/components/sections/DiversificationSection';
import { SectionSwitcher } from '@/components/sections/SectionSwitcher';
import { StockCounselView } from '@/components/StockCounselView';
import { C, CONTENT } from '@/constants/theme';
import { useStore } from '@/lib/store';

type Section = 'diversification' | 'ai';

export default function Analyse() {
  const { t } = useTranslation();
  useStore((s) => s.privacyMode); // re-render au changement de mode confidentialité (masquage dans format.ts)
  const showDiversification = useStore((s) => s.showDiversificationTab);
  const showAi = useStore((s) => s.showAiTab);
  const params = useLocalSearchParams<{
    section?: string;
    symbol?: string;
    isin?: string;
    name?: string;
    holdingId?: string;
  }>();
  const [selected, setSelected] = useState<Section>(params.section === 'ai' ? 'ai' : 'diversification');
  // La vue IA reste montée une fois ouverte : changer de rubrique ne perd pas l'analyse en cours.
  const [aiOpened, setAiOpened] = useState(false);

  // Navigation vers un titre précis (depuis une ligne détenue) : bascule sur la rubrique IA.
  useEffect(() => {
    if (params.section === 'ai') setSelected('ai');
  }, [params.section, params.symbol, params.holdingId]);

  const sections: Section[] = [];
  if (showDiversification) sections.push('diversification');
  if (showAi) sections.push('ai');
  const section = sections.includes(selected) ? selected : sections[0];

  useEffect(() => {
    if (section === 'ai') setAiOpened(true);
  }, [section]);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <SectionSwitcher
        options={sections}
        value={section}
        onChange={setSelected}
        labels={{ diversification: t('tabs.diversification'), ai: t('tabs.ai') }}
      />
      {section === 'diversification' && <DiversificationSection />}
      {showAi && (aiOpened || section === 'ai') && (
        <ScrollView
          style={{ flex: 1, backgroundColor: C.bg, display: section === 'ai' ? 'flex' : 'none' }}
          contentContainerStyle={{ padding: 16, paddingBottom: 48, ...CONTENT }}
          keyboardShouldPersistTaps="handled"
        >
          <StockCounselView
            initialSymbol={params.symbol}
            initialIsin={params.isin}
            initialName={params.name}
            holdingId={params.holdingId}
          />
        </ScrollView>
      )}
    </View>
  );
}
