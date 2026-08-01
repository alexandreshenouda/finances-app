import { Tabs } from 'expo-router';
import { Logo } from '@/components/Logo';
import { PrivacyToggle } from '@/components/PrivacyToggle';
import { TabIcon } from '@/components/TabIcons';
import { C } from '@/constants/theme';

export default function TabsLayout() {
  return (
    <Tabs
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
          title: 'Synthèse',
          tabBarLabel: 'Synthèse',
          tabBarIcon: ({ color, focused }) => <TabIcon name="synthese" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="accounts"
        options={{
          title: 'Comptes',
          tabBarIcon: ({ color, focused }) => <TabIcon name="comptes" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="real-estate"
        options={{
          title: 'Immobilier',
          tabBarIcon: ({ color, focused }) => <TabIcon name="immobilier" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="loans"
        options={{
          title: 'Emprunts',
          tabBarIcon: ({ color, focused }) => <TabIcon name="emprunts" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Paramètres',
          tabBarIcon: ({ color, focused }) => <TabIcon name="parametres" color={color} focused={focused} />,
        }}
      />
    </Tabs>
  );
}
