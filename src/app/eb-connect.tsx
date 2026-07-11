/**
 * Connexion aux banques françaises via Enable Banking (usage personnel gratuit).
 * Étapes : 1) enregistrer l'application (ID + clé privée) → 2) choisir sa banque
 * → 3) autoriser chez la banque → 4) la session est créée et les comptes importés.
 */
import * as Linking from 'expo-linking';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Empty, Field, SectionTitle } from '@/components/ui';
import { C } from '@/constants/theme';
import { notify } from '@/lib/confirm';
import { loadCredentials, syncConnection } from '@/lib/connectors';
import {
  checkApplication,
  createSession,
  listBanks,
  startAuth,
  EB_APP_CALLBACK,
  type Aspsp,
  type EnableBankingCredentials,
} from '@/lib/connectors/enablebanking';
import { formatDate, uid } from '@/lib/format';
import { connectionSecretKey, setSecret } from '@/lib/secure';
import { useStore } from '@/lib/store';

export default function EbConnect() {
  const { connectionId } = useLocalSearchParams<{ connectionId?: string }>();
  const router = useRouter();
  const upsertConnection = useStore((s) => s.upsertConnection);
  const connections = useStore((s) => s.connections);

  const existingConn = connections.find(
    (c) => c.provider === 'enablebanking' && (connectionId ? c.id === connectionId : true)
  );

  const [creds, setCreds] = useState<EnableBankingCredentials | null>(null);
  const [appId, setAppId] = useState('');
  const [pem, setPem] = useState('');
  const [redirectUrl, setRedirectUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [banks, setBanks] = useState<Aspsp[] | null>(null);
  const [filter, setFilter] = useState('');
  const [pendingBank, setPendingBank] = useState<Aspsp | null>(null);
  const [manualRedirect, setManualRedirect] = useState('');

  useEffect(() => {
    if (existingConn) {
      loadCredentials<EnableBankingCredentials>(existingConn.id).then((c) => {
        if (c) setCreds(c);
      });
    }
  }, [existingConn?.id]);

  const saveCreds = async (connId: string, next: EnableBankingCredentials) => {
    await setSecret(connectionSecretKey(connId), JSON.stringify(next));
    setCreds(next);
  };

  /** Étape 1 : vérifier l'application et créer la connexion. */
  const registerApp = async () => {
    setBusy(true);
    try {
      const candidate: EnableBankingCredentials = {
        applicationId: appId.trim(),
        privateKeyPem: pem.trim(),
        redirectUrl: redirectUrl.trim(),
        sessions: [],
      };
      const app = await checkApplication(candidate);
      const conn = existingConn ?? upsertConnection({ provider: 'enablebanking', label: 'Banques (Enable Banking)' });
      await saveCreds(conn.id, candidate);
      notify('Application vérifiée', `« ${app.name} » est prête. Choisissez maintenant votre banque.`);
    } catch (e: any) {
      notify('Vérification impossible', String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const loadBankList = async () => {
    if (!creds) return;
    setBusy(true);
    try {
      setBanks(await listBanks(creds));
    } catch (e: any) {
      notify('Erreur', String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  /** Étape 3 : autorisation chez la banque puis création de session. */
  const authorize = async (bank: Aspsp) => {
    if (!creds || !existingConn) return;
    setBusy(true);
    setPendingBank(bank);
    try {
      const url = await startAuth(creds, bank, uid());
      // La banque redirige vers la page https de rebond, qui renvoie vers
      // patrimoine://eb-callback ; à défaut, collage manuel de l'URL ci-dessous.
      const result = await WebBrowser.openAuthSessionAsync(url, EB_APP_CALLBACK);
      if (result.type === 'success' && result.url) {
        await finishAuth(bank, result.url);
      } else {
        notify(
          'Autorisation à terminer',
          "Si vous avez validé chez la banque mais que l'app n'a pas récupéré le retour, collez l'URL de redirection ci-dessous."
        );
      }
    } catch (e: any) {
      notify('Erreur', String(e?.message ?? e));
      setPendingBank(null);
    } finally {
      setBusy(false);
    }
  };

  /** Étape 4 : échanger le code contre une session et synchroniser. */
  const finishAuth = async (bank: Aspsp, redirectedUrl: string) => {
    if (!creds || !existingConn) return;
    const parsed = Linking.parse(redirectedUrl);
    const code = (parsed.queryParams?.code as string) ?? '';
    if (!code) {
      notify('Code introuvable', "L'URL de redirection ne contient pas de paramètre « code ».");
      return;
    }
    setBusy(true);
    try {
      const session = await createSession(creds, code, bank.name);
      const next = { ...creds, sessions: [...creds.sessions, session] };
      await saveCreds(existingConn.id, next);
      setPendingBank(null);
      setManualRedirect('');
      await syncConnection(existingConn.id);
      notify('Banque connectée', `${session.accounts.length} compte(s) importé(s) depuis ${bank.name}.`);
      router.back();
    } catch (e: any) {
      notify('Erreur', String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const filtered = (banks ?? [])
    .filter((b) => b.name.toLowerCase().includes(filter.toLowerCase()))
    .slice(0, 30);

  return (
    <>
      <Stack.Screen options={{ title: 'Banques françaises' }} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        {!creds ? (
          <>
            <Card>
              <Text style={styles.help}>
                Enable Banking donne un accès gratuit (usage personnel, « restricted production ») aux
                comptes de paiement de vos banques via DSP2.{'\n\n'}
                1. Créez un compte sur enablebanking.com puis une application (environnement
                Production).{'\n'}
                2. Enable Banking n'accepte que des URL de redirection https : enregistrez-y
                l'adresse de votre page de rebond (fichier docs/eb-callback.html du projet,
                déployé via GitHub Pages), ou n'importe quelle URL https à défaut — vous
                collerez alors l'URL de retour à la main après validation chez la banque.{'\n'}
                3. Collez ici l'Application ID, la clé privée PEM et cette même URL https.
              </Text>
              <Field label="Application ID" value={appId} onChangeText={setAppId} autoCapitalize="none" autoCorrect={false} placeholder="ex : 8a7b6c5d-…" />
              <Field
                label="URL de redirection (https)"
                value={redirectUrl}
                onChangeText={setRedirectUrl}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="ex : https://votre-pseudo.github.io/eb-callback.html"
                hint="Doit être identique à l'URL enregistrée dans l'application Enable Banking."
              />
              <Field
                label="Clé privée (PEM)"
                value={pem}
                onChangeText={setPem}
                autoCapitalize="none"
                autoCorrect={false}
                multiline
                placeholder="-----BEGIN PRIVATE KEY-----…"
                hint="Stockée chiffrée sur l'appareil (Android Keystore). Elle ne sert qu'à signer les requêtes vers api.enablebanking.com."
              />
            </Card>
            <Button
              title="Vérifier et enregistrer"
              onPress={registerApp}
              loading={busy}
              disabled={!appId.trim() || !pem.trim() || !redirectUrl.trim().toLowerCase().startsWith('https://')}
            />
          </>
        ) : (
          <>
            {creds.sessions.length > 0 && (
              <>
                <SectionTitle>Banques connectées</SectionTitle>
                <Card>
                  {creds.sessions.map((s, i) => (
                    <View key={s.sessionId} style={[styles.sessionRow, i < creds.sessions.length - 1 && styles.rowBorder]}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.sessionName}>{s.aspspName}</Text>
                        <Text style={styles.sessionSub}>
                          {s.accounts.length} compte(s)
                          {s.validUntil ? ` · consentement jusqu'au ${formatDate(s.validUntil)}` : ''}
                        </Text>
                      </View>
                    </View>
                  ))}
                </Card>
              </>
            )}

            <SectionTitle>Ajouter une banque</SectionTitle>
            {!banks ? (
              <Button title="Charger la liste des banques (FR)" onPress={loadBankList} loading={busy} />
            ) : (
              <Card>
                <Field label="Rechercher" value={filter} onChangeText={setFilter} placeholder="ex : Boursorama, Crédit Agricole…" />
                {filtered.length === 0 && <Empty text="Aucune banque trouvée." />}
                {filtered.map((b) => (
                  <Pressable key={b.name} onPress={() => authorize(b)} style={styles.bankRow} disabled={busy}>
                    <Text style={styles.bankName}>{b.name}</Text>
                    <Text style={styles.chevron}>›</Text>
                  </Pressable>
                ))}
              </Card>
            )}

            {pendingBank && (
              <>
                <SectionTitle>Finaliser {pendingBank.name}</SectionTitle>
                <Card>
                  <Field
                    label="URL de redirection reçue"
                    value={manualRedirect}
                    onChangeText={setManualRedirect}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="https://…?code=… (URL complète après validation)"
                    hint="Si le retour automatique n'a pas fonctionné : copiez l'URL complète de la page atteinte après validation chez la banque (elle contient ?code=…) et collez-la ici."
                  />
                  <Button title="Valider le code" onPress={() => finishAuth(pendingBank, manualRedirect)} loading={busy} disabled={!manualRedirect.trim()} />
                </Card>
              </>
            )}
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 40 },
  help: { color: C.textDim, fontSize: 13, lineHeight: 19, marginBottom: 12 },
  sessionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  sessionName: { color: C.text, fontSize: 15, fontWeight: '500' },
  sessionSub: { color: C.textFaint, fontSize: 12, marginTop: 2 },
  bankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  bankName: { color: C.text, fontSize: 14, flex: 1 },
  chevron: { color: C.textFaint, fontSize: 18 },
});
