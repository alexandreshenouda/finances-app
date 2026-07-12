/**
 * Connexion Trade Republic (API non officielle). Flux : téléphone + PIN →
 * code 2FA → récupération de l'instantané du portefeuille via WebSocket.
 * Le numéro et le PIN sont stockés chiffrés pour préremplir les reconnexions,
 * mais une validation 2FA reste nécessaire à chaque synchronisation.
 */
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { Button, Card, Field } from '@/components/ui';
import { C } from '@/constants/theme';
import { notify } from '@/lib/confirm';
import { loadCredentials, persistExternalAccounts } from '@/lib/connectors';
import {
  trBuildAccount,
  trCompleteLogin,
  trFetchPortfolio,
  trInitiateLogin,
  trResendCode,
} from '@/lib/connectors/traderepublic';
import { connectionSecretKey, setSecret } from '@/lib/secure';
import { useStore } from '@/lib/store';

interface TrCredentials {
  phoneNumber: string;
  pin: string;
}

export default function TrConnect() {
  const { connectionId } = useLocalSearchParams<{ connectionId?: string }>();
  const router = useRouter();
  const upsertConnection = useStore((s) => s.upsertConnection);
  const connections = useStore((s) => s.connections);

  const existingConn = connections.find(
    (c) => c.provider === 'traderepublic' && (connectionId ? c.id === connectionId : true)
  );

  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [code, setCode] = useState('');
  const [processId, setProcessId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (existingConn) {
      loadCredentials<TrCredentials>(existingConn.id).then((c) => {
        if (c) {
          setPhone(c.phoneNumber);
          setPin(c.pin);
        }
      });
    }
  }, [existingConn?.id]);

  /** Étape 1 : demander le code 2FA. */
  const requestCode = async () => {
    setBusy(true);
    try {
      const handle = await trInitiateLogin(phone, pin);
      setProcessId(handle.processId);
      notify('Code envoyé', 'Saisissez le code reçu dans l\'app Trade Republic ou par SMS.');
    } catch (e: any) {
      notify('Connexion impossible', String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const resendCode = async () => {
    if (!processId) return;
    try {
      await trResendCode(processId);
      notify('Code renvoyé', 'Un nouveau code vient d\'être envoyé.');
    } catch (e: any) {
      notify('Échec', String(e?.message ?? e));
    }
  };

  /** Étape 2 : valider le code, récupérer le portefeuille, enregistrer le compte. */
  const validateAndSync = async () => {
    if (!processId) return;
    setBusy(true);
    try {
      await trCompleteLogin(processId, code);
      const snapshot = await trFetchPortfolio();

      // Connexion créée après un login réussi seulement.
      const conn =
        existingConn ?? upsertConnection({ provider: 'traderepublic', label: 'Trade Republic' });
      await setSecret(
        connectionSecretKey(conn.id),
        JSON.stringify({ phoneNumber: phone.trim(), pin: pin.trim() } satisfies TrCredentials)
      );
      persistExternalAccounts(conn, {
        accounts: [trBuildAccount(snapshot)],
        warnings: snapshot.warnings,
      });

      setProcessId(null);
      setCode('');
      const msg =
        snapshot.warnings.length > 0
          ? `Compte importé. Remarques : ${snapshot.warnings.slice(0, 3).join(' · ')}`
          : `Compte importé : ${snapshot.holdings.length} position(s).`;
      notify('Trade Republic connecté', msg);
      router.back();
    } catch (e: any) {
      notify('Échec', String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Trade Republic' }} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Card style={{ borderColor: C.warning }}>
          <Text style={styles.warn}>
            Connecteur non officiel (rétro-ingénierie). Il peut cesser de fonctionner à tout moment
            et ne fonctionne que dans l'app Android. Une validation 2FA est requise à chaque
            synchronisation. Utilisez-le en connaissance de cause.
          </Text>
        </Card>

        {Platform.OS === 'web' && (
          <Card style={{ borderColor: C.negative }}>
            <Text style={styles.err}>
              Indisponible dans le navigateur (CORS et cookies de session). Ouvrez l'app Android.
            </Text>
          </Card>
        )}

        <Card>
          <Field
            label="Numéro de téléphone (format international)"
            value={phone}
            onChangeText={setPhone}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="phone-pad"
            placeholder="+33612345678"
            editable={!processId}
          />
          <Field
            label="Code PIN Trade Republic"
            value={pin}
            onChangeText={setPin}
            secureTextEntry
            keyboardType="number-pad"
            placeholder="••••"
            editable={!processId}
            hint="Numéro et PIN stockés chiffrés sur l'appareil (Android Keystore)."
          />
        </Card>

        {!processId ? (
          <Button
            title="Recevoir le code 2FA"
            onPress={requestCode}
            loading={busy}
            disabled={!phone.trim() || !pin.trim()}
          />
        ) : (
          <Card>
            <Field
              label="Code de vérification (2FA)"
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              placeholder="1234"
              hint="Reçu dans l'app Trade Republic ou par SMS."
            />
            <Button title="Valider et importer" onPress={validateAndSync} loading={busy} disabled={!code.trim()} />
            <Button title="Renvoyer un code" variant="secondary" onPress={resendCode} />
          </Card>
        )}
        <Button title="Annuler" variant="secondary" onPress={() => router.back()} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 40 },
  warn: { color: C.warning, fontSize: 13, lineHeight: 18 },
  err: { color: C.negative, fontSize: 13, lineHeight: 18 },
});
