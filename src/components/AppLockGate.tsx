/**
 * Écran de verrouillage : quand `store.appLock` est actif, masque toute l'app au lancement
 * et au retour d'arrière-plan (au-delà de `APP_LOCK_GRACE_MS`) tant que l'utilisateur ne
 * s'est pas authentifié par biométrie ou par le code de l'appareil. Natif uniquement : le
 * web / Electron n'a pas d'API équivalente, le réglage n'y est pas proposé.
 */
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui';
import { C, FONT, useStyles } from '@/constants/theme';
import { shouldRelock, unlocksApp } from '@/lib/appLock';
import { useStore } from '@/lib/store';
import * as LocalAuthentication from 'expo-local-authentication';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Modal, Platform, StyleSheet, Text, View } from 'react-native';

function makeStyles() {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
    text: { color: C.textDim, fontSize: FONT.md, textAlign: 'center' },
    button: { alignSelf: 'stretch', maxWidth: 320, width: '100%' },
  });
}

export function AppLockGate() {
  const styles = useStyles(makeStyles);
  const { t } = useTranslation();
  const hydrated = useStore((s) => s.hydrated);
  const appLock = useStore((s) => s.appLock);
  // Verrouillé d'emblée : rien ne doit s'afficher avant de savoir si le réglage est actif.
  const [locked, setLocked] = useState(true);
  const [busy, setBusy] = useState(false);
  const backgroundedAt = useRef<number | undefined>(undefined);
  const prompting = useRef(false);

  const authenticate = useCallback(async () => {
    if (prompting.current) return;
    prompting.current = true;
    setBusy(true);
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: t('lock.invite'),
        cancelLabel: t('common.cancel'),
      });
      if (unlocksApp(result)) setLocked(false);
    } catch {
      // Module indisponible : on reste verrouillé, le bouton permet de réessayer.
    } finally {
      prompting.current = false;
      setBusy(false);
    }
  }, [t]);

  // Au lancement, une fois le réglage relu depuis le stockage.
  const started = useRef(false);
  useEffect(() => {
    if (!hydrated || started.current) return;
    started.current = true;
    if (appLock) authenticate();
    else setLocked(false);
  }, [hydrated, appLock, authenticate]);

  // Au retour d'arrière-plan.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        backgroundedAt.current = Date.now();
      } else if (state === 'active') {
        const relock = useStore.getState().appLock && shouldRelock(backgroundedAt.current, Date.now());
        backgroundedAt.current = undefined;
        if (relock) {
          setLocked(true);
          authenticate();
        }
      }
    });
    return () => sub.remove();
  }, [authenticate]);

  if (Platform.OS === 'web' || !locked || (hydrated && !appLock)) return null;

  return (
    <Modal visible animationType="none" onRequestClose={() => {}} statusBarTranslucent>
      <View style={styles.screen} accessibilityViewIsModal>
        <Logo mark={44} text={30} />
        {hydrated && (
          <>
            <Text style={styles.text}>{t('lock.verrouillee')}</Text>
            <Button title={t('lock.deverrouiller')} onPress={authenticate} loading={busy} style={styles.button} />
          </>
        )}
      </View>
    </Modal>
  );
}
