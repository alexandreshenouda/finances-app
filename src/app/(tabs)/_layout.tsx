import { Tabs } from 'expo-router';
import { useEffect, useState } from 'react';
import i18next from '@/lib/i18n';
import { Logo } from '@/components/Logo';
import { PrivacyToggle } from '@/components/PrivacyToggle';
import { TabIcon } from '@/components/TabIcons';
import { C } from '@/constants/theme';
import { useStore } from '@/lib/store';

export default function TabsLayout() {
  const language = useStore((s) => s.language);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setRefreshKey((x) => x + 1);
  }, [language]);

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
        name="accounts"
        options={{
          title: t('tabs.comptes'),
          tabBarLabel: t('tabs.comptes'),
          tabBarIcon: ({ color, focused }) => <TabIcon name="comptes" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="real-estate"
        options={{
          title: t('tabs.immobilier'),
          tabBarLabel: t('tabs.immobilier'),
          tabBarIcon: ({ color, focused }) => <TabIcon name="immobilier" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="loans"
        options={{
          title: t('tabs.emprunts'),
          tabBarLabel: t('tabs.emprunts'),
          tabBarIcon: ({ color, focused }) => <TabIcon name="emprunts" color={color} focused={focused} />,
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
