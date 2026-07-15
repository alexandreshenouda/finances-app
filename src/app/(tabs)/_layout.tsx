import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { C } from '@/constants/theme';

function TabIcon({ glyph, focused }: { glyph: string; focused: boolean }) {
  return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>{glyph}</Text>;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: C.bg },
        headerTintColor: C.text,
        headerShadowVisible: false,
        tabBarStyle: { backgroundColor: C.bg, borderTopColor: C.border },
        tabBarActiveTintColor: C.accent,
        tabBarInactiveTintColor: C.textFaint,
        sceneStyle: { backgroundColor: C.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Patrimoine',
          tabBarLabel: 'Synthèse',
          tabBarIcon: ({ focused }) => <TabIcon glyph="📈" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="accounts"
        options={{
          title: 'Comptes',
          tabBarIcon: ({ focused }) => <TabIcon glyph="💼" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="real-estate"
        options={{
          title: 'Immobilier',
          tabBarIcon: ({ focused }) => <TabIcon glyph="🏠" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="connections"
        options={{
          title: 'Connexions',
          tabBarIcon: ({ focused }) => <TabIcon glyph="🔗" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
