import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { C } from '@/constants/theme';

SplashScreen.preventAutoHideAsync();

const theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: C.bg,
    card: C.bg,
    text: C.text,
    border: C.border,
    primary: C.accent,
  },
};

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <ThemeProvider value={theme}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: C.bg },
          headerTintColor: C.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: C.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="account/[id]" options={{ title: 'Compte' }} />
        <Stack.Screen name="account-form" options={{ title: 'Compte', presentation: 'modal' }} />
        <Stack.Screen name="holding-form" options={{ title: 'Ligne', presentation: 'modal' }} />
        <Stack.Screen name="connection-form" options={{ title: 'Connexion', presentation: 'modal' }} />
        <Stack.Screen name="eb-connect" options={{ title: 'Enable Banking' }} />
      </Stack>
    </ThemeProvider>
  );
}
