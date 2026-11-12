import { Logo } from '@/components/Logo';
import { PrivacyToggle } from '@/components/PrivacyToggle';
import { TabIcon } from '@/components/TabIcons';
import { C } from '@/constants/theme';
import i18next from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { Tabs } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

/** Barre de navigation : 5 onglets au maximum (Synthèse, Patrimoine, Budget, Analyse,
 *  Paramètres). Toute nouvelle rubrique se range dans un onglet existant via un
 *  `SectionSwitcher` plutôt que d'ajouter un 6ᵉ onglet. */
export default function TabsLayout() {
  const language = useStore((s) => s.language);
  const theme = useStore((s) => s.theme);
  const showDiversificationTab = useStore((s) => s.showDiversificationTab);
  const showAiTab = useStore((s) => s.showAiTab);
  const [refreshKey, setRefreshKey] = useState(0);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setRefreshKey((x) => x + 1);
  }, [language, theme]);

  const t = (key: string) => i18next.t(key);

  return (
    <Tabs
      key={refreshKey}
      screenOptions={{
        headerStyle: { backgroundColor: C.bg },
        headerTintColor: C.text,
        headerShadowVisible: false,
        headerRight: () => <PrivacyToggle />,
        tabBarStyle: { backgroundColor: C.bg, borderTopColor: C.border },
        tabBarActiveTintColor: C.accent,
        tabBarInactiveTintColor: C.textFaint,
        sceneStyle: { backgroundColor: C.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          headerTitle: () => <Logo />,
          title: t('tabs.synthese'),
          tabBarLabel: t('tabs.synthese'),
          tabBarIcon: ({ color, focused }) => <TabIcon name="synthese" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="patrimoine"
        options={{
          title: t('tabs.patrimoine'),
          tabBarLabel: t('tabs.patrimoine'),
          tabBarIcon: ({ color, focused }) => <TabIcon name="comptes" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="budget"
        options={{
          title: t('tabs.budget'),
          tabBarLabel: t('tabs.budget'),
          tabBarIcon: ({ color, focused }) => <TabIcon name="budget" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="analyse"
        options={{
          href: showDiversificationTab || showAiTab ? undefined : null,
          title: t('tabs.analyse'),
          tabBarLabel: t('tabs.analyse'),
          tabBarIcon: ({ color, focused }) => <TabIcon name="diversification" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('tabs.parametres'),
          tabBarLabel: t('tabs.parametres'),
          tabBarIcon: ({ color, focused }) => <TabIcon name="parametres" color={color} focused={focused} />,
        }}
      />
    </Tabs>
  );
}
