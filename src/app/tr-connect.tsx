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
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
          ? t('trConnect.import_avertissements', { warnings: snapshot.warnings.slice(0, 3).join(' · ') })
          : t('trConnect.import_ok', { accounts: accounts.length, positions: positionCount });
      notify(t('trConnect.connecte_titre'), msg);
      router.back();
    } catch (e: any) {
      if (!cancelledRef.current) notify(t('trConnect.connexion_impossible'), String(e?.message ?? e));
      setProcessId(null);
    } finally {
      setBusy(false);
    }
  };

  const resendApproval = async () => {
    if (!processId) return;
    try {
      await trResendApproval(processId);
      notify(t('trConnect.demande_renvoyee_titre'), t('trConnect.demande_renvoyee_texte'));
    } catch (e: any) {
      notify(t('trConnect.echec'), String(e?.message ?? e));
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
          <Text style={styles.warn}>{t('trConnect.avertissement')}</Text>
        </Card>

        {Platform.OS === 'web' && (
          <Card style={{ borderColor: C.negative }}>
            <Text style={styles.err}>{t('trConnect.indisponible_web')}</Text>
          </Card>
        )}

        <Card>
          <Field
            label={t('trConnect.telephone')}
            value={phone}
            onChangeText={setPhone}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="phone-pad"
            placeholder="+33612345678"
            editable={!processId && !busy}
          />
          <Field
            label={t('trConnect.pin')}
            value={pin}
            onChangeText={setPin}
            secureTextEntry
            keyboardType="number-pad"
            placeholder="••••"
            editable={!processId && !busy}
            hint={t('trConnect.pin_hint')}
          />
        </Card>

        {!processId ? (
          <Button
            title={t('trConnect.se_connecter')}
            onPress={startLogin}
            loading={busy}
            disabled={!phone.trim() || !pin.trim()}
          />
        ) : (
          <Card>
            <Text style={styles.warn}>{t('trConnect.approuver_attente')}</Text>
            <Button title={t('trConnect.renvoyer_demande')} variant="secondary" onPress={resendApproval} />
          </Card>
        )}
        <Button title={t('common.cancel')} variant="secondary" onPress={cancel} />
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
