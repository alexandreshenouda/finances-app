import { ThemedDialogContainer } from '@/components/ThemedDialog';
import { C } from '@/constants/theme';
import i18next from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const language = useStore((s) => s.language);
  const currentTheme = useStore((s) => s.theme);
  const [refreshKey, setRefreshKey] = useState(0);
  const isFirstRender = useRef(true);

  useEffect(() => {
    (async () => {
      await i18next.changeLanguage(useStore.getState().language);
      await SplashScreen.hideAsync();
    })();
  }, []);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setRefreshKey((x) => x + 1);
  }, [language, currentTheme]);

  const navTheme = useMemo(
    () => ({
      ...DarkTheme,
      colors: {
        ...DarkTheme.colors,
        background: C.bg,
        card: C.bg,
        text: C.text,
        border: C.border,
        primary: C.accent,
      },
    }),
    [currentTheme]
  );

  const t = (key: string) => i18next.t(key);

  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style="light" />
      <Stack
        key={refreshKey}
        screenOptions={{
          headerStyle: { backgroundColor: C.bg },
          headerTintColor: C.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: C.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="account/[id]" options={{ title: t('accounts.title') }} />
        <Stack.Screen name="account-form" options={{ title: t('accountForm.titre_new'), presentation: 'modal' }} />
        <Stack.Screen name="holding-form" options={{ title: t('holdingForm.titre_new'), presentation: 'modal' }} />
        <Stack.Screen name="property/[id]" options={{ title: t('realEstate.title') }} />
        <Stack.Screen name="property-form" options={{ title: t('propertyForm.titre_new'), presentation: 'modal' }} />
        <Stack.Screen name="loan-form" options={{ title: t('loanForm.titre_new'), presentation: 'modal' }} />
        <Stack.Screen name="objective-form" options={{ title: t('objectiveForm.titre_new'), presentation: 'modal' }} />
        <Stack.Screen name="connections" options={{ title: t('connections.title') }} />
        <Stack.Screen name="backup" options={{ title: t('backup.title') }} />
        <Stack.Screen name="display-settings" options={{ title: t('settings.affichage') }} />
        <Stack.Screen name="language-settings" options={{ title: t('settings.langue') }} />
        <Stack.Screen name="erase-history" options={{ title: t('settings.effacer_zone') }} />
        <Stack.Screen name="connection-form" options={{ title: t('connections.nouvelle'), presentation: 'modal' }} />
        <Stack.Screen name="eb-connect" options={{ title: t('ebConnect.label_defaut') }} />
        <Stack.Screen name="tr-connect" options={{ title: 'Trade Republic' }} />
        <Stack.Screen name="holding-detail" options={{ title: t('holdingDetail.titre'), presentation: 'modal' }} />
      </Stack>
      <ThemedDialogContainer />
    </ThemeProvider>
  );
}
