/** Onglet Patrimoine : regroupe les rubriques Comptes, Immobilier et Emprunts
 *  (anciennement trois onglets) derrière un sélecteur. */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { AccountsSection } from '@/components/sections/AccountsSection';
import { LoansSection } from '@/components/sections/LoansSection';
import { RealEstateSection } from '@/components/sections/RealEstateSection';
import { SectionSwitcher } from '@/components/sections/SectionSwitcher';
import { FadeInView } from '@/components/ui';
import { C } from '@/constants/theme';
import { useStore } from '@/lib/store';

type Section = 'comptes' | 'immobilier' | 'emprunts';

export default function Patrimoine() {
  const { t } = useTranslation();
  const showImmobilier = useStore((s) => s.showImmobilierTab);
  const showEmprunts = useStore((s) => s.showEmpruntsTab);
  const [selected, setSelected] = useState<Section>('comptes');

  const sections: Section[] = ['comptes'];
  if (showImmobilier) sections.push('immobilier');
  if (showEmprunts) sections.push('emprunts');
  // Une rubrique masquée dans les réglages pendant qu'elle est affichée retombe sur Comptes.
  const section = sections.includes(selected) ? selected : 'comptes';

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <SectionSwitcher
        options={sections}
        value={section}
        onChange={setSelected}
        labels={{ comptes: t('tabs.comptes'), immobilier: t('tabs.immobilier'), emprunts: t('tabs.emprunts') }}
      />
      <FadeInView key={section} style={{ flex: 1 }}>
        {section === 'comptes' && <AccountsSection />}
        {section === 'immobilier' && <RealEstateSection />}
        {section === 'emprunts' && <LoansSection />}
      </FadeInView>
    </View>
  );
}
