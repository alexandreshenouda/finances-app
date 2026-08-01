/**
 * Connexion Trade Republic (API non officielle). Flux : téléphone + PIN →
 * approbation push dans l'app Trade Republic → récupération de l'instantané
 * du portefeuille via WebSocket. Le numéro et le PIN sont stockés chiffrés
 * pour préremplir les reconnexions, mais une approbation reste nécessaire à
 * chaque synchronisation.
 */
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { Button, Card, Field } from '@/components/ui';
import { C } from '@/constants/theme';
import { notify } from '@/lib/confirm';
import { loadCredentials, persistExternalAccounts } from '@/lib/connectors';
import {
  trAwaitApproval,
  trBuildAccounts,
  trFetchPortfolio,
  trInitiateLogin,
  trResendApproval,
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
  const [processId, setProcessId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cancelledRef = useRef(false);

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

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  /** Démarre le login, attend l'approbation push, puis synchronise le portefeuille. */
  const startLogin = async () => {
    cancelledRef.current = false;
    setBusy(true);
    try {
      const handle = await trInitiateLogin(phone, pin);
      setProcessId(handle.processId);
      await trAwaitApproval(handle.processId, { shouldAbort: () => cancelledRef.current });
      if (cancelledRef.current) return;

      const snapshot = await trFetchPortfolio();

      // Connexion créée après un login réussi seulement.
      const conn =
        existingConn ?? upsertConnection({ provider: 'traderepublic', label: 'Trade Republic' });
      await setSecret(
        connectionSecretKey(conn.id),
        JSON.stringify({ phoneNumber: phone.trim(), pin: pin.trim() } satisfies TrCredentials)
      );
      const accounts = trBuildAccounts(snapshot);
      persistExternalAccounts(conn, { accounts, warnings: snapshot.warnings });

      setProcessId(null);
      const positionCount = accounts.reduce((n, a) => n + a.holdings.length, 0);
      const msg =
        snapshot.warnings.length > 0
          ? `Import terminé. Remarques : ${snapshot.warnings.slice(0, 3).join(' · ')}`
          : `${accounts.length} compte(s) importé(s) : ${positionCount} position(s).`;
      notify('Trade Republic connecté', msg);
      router.back();
    } catch (e: any) {
      if (!cancelledRef.current) notify('Connexion impossible', String(e?.message ?? e));
      setProcessId(null);
    } finally {
      setBusy(false);
    }
  };

  const resendApproval = async () => {
    if (!processId) return;
    try {
      await trResendApproval(processId);
      notify('Demande renvoyée', "Une nouvelle demande d'approbation vient d'être envoyée.");
    } catch (e: any) {
      notify('Échec', String(e?.message ?? e));
    }
  };

  const cancel = () => {
    if (processId || busy) {
      cancelledRef.current = true;
      setProcessId(null);
      setBusy(false);
    } else {
      router.back();
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Trade Republic' }} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Card style={{ borderColor: C.warning }}>
          <Text style={styles.warn}>
            Connecteur non officiel (rétro-ingénierie). Il peut cesser de fonctionner à tout moment
            et ne fonctionne que dans l'app Android. Une approbation dans l'app Trade Republic est
            requise à chaque synchronisation. Utilisez-le en connaissance de cause.
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
            editable={!processId && !busy}
          />
          <Field
            label="Code PIN Trade Republic"
            value={pin}
            onChangeText={setPin}
            secureTextEntry
            keyboardType="number-pad"
            placeholder="••••"
            editable={!processId && !busy}
            hint="Numéro et PIN stockés chiffrés sur l'appareil (Android Keystore)."
          />
        </Card>

        {!processId ? (
          <Button
            title="Se connecter"
            onPress={startLogin}
            loading={busy}
            disabled={!phone.trim() || !pin.trim()}
          />
        ) : (
          <Card>
            <Text style={styles.warn}>
              Ouvrez l'app Trade Republic (ou vérifiez vos SMS) et approuvez la connexion en cours…
            </Text>
            <Button title="Renvoyer la demande" variant="secondary" onPress={resendApproval} />
          </Card>
        )}
        <Button title="Annuler" variant="secondary" onPress={cancel} />
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
