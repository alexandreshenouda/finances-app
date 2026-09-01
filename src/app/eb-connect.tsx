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
import { useTranslation } from 'react-i18next';
import { Button, Card, Empty, Field, SectionTitle, SelectField } from '@/components/ui';
import { C, useStyles } from '@/constants/theme';
import { notify } from '@/lib/confirm';
import { loadCredentials, syncConnection } from '@/lib/connectors';
import {
  checkApplication,
  createSession,
  listBanks,
  startAuth,
  EB_APP_CALLBACK,
  EB_COUNTRIES,
  type Aspsp,
  type EnableBankingCredentials,
} from '@/lib/connectors/enablebanking';
import { formatDate, uid } from '@/lib/format';
import { connectionSecretKey, setSecret } from '@/lib/secure';
import { useStore } from '@/lib/store';

function makeStyles() {
  return StyleSheet.create({
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
}

export default function EbConnect() {
  const styles = useStyles(makeStyles);
  const { t } = useTranslation();
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
  const [country, setCountry] = useState('FR');
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
      const conn = existingConn ?? upsertConnection({ provider: 'enablebanking', label: t('ebConnect.label_defaut') });
      await saveCreds(conn.id, candidate);
      notify(t('ebConnect.app_verifiee_titre'), t('ebConnect.app_verifiee_texte', { name: app.name }));
    } catch (e: any) {
      notify(t('ebConnect.verification_impossible'), String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const loadBankList = async (forCountry: string) => {
    if (!creds) return;
    setBusy(true);
    try {
      setBanks(await listBanks(creds, forCountry));
    } catch (e: any) {
      notify(t('common.error'), String(e?.message ?? e));
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
        notify(t('ebConnect.autorisation_a_terminer_titre'), t('ebConnect.autorisation_a_terminer_texte'));
      }
    } catch (e: any) {
      notify(t('common.error'), String(e?.message ?? e));
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
      notify(t('ebConnect.code_introuvable_titre'), t('ebConnect.code_introuvable_texte'));
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
      notify(t('ebConnect.banque_connectee_titre'), t('ebConnect.banque_connectee_texte', { count: session.accounts.length, bank: bank.name }));
      router.back();
    } catch (e: any) {
      notify(t('common.error'), String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const filtered = (banks ?? [])
    .filter((b) => b.name.toLowerCase().includes(filter.toLowerCase()))
    .slice(0, 30);

  return (
    <>
      <Stack.Screen options={{ title: t('ebConnect.label_defaut') }} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        {!creds ? (
          <>
            <Card>
              <Text style={styles.help}>{t('ebConnect.intro')}</Text>
              <Field label={t('ebConnect.app_id')} value={appId} onChangeText={setAppId} autoCapitalize="none" autoCorrect={false} placeholder={t('ebConnect.app_id_placeholder')} />
              <Field
                label={t('ebConnect.redirect_url')}
                value={redirectUrl}
                onChangeText={setRedirectUrl}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder={t('ebConnect.redirect_url_placeholder')}
                hint={t('ebConnect.redirect_url_hint')}
              />
              <Field
                label={t('ebConnect.private_key')}
                value={pem}
                onChangeText={setPem}
                autoCapitalize="none"
                autoCorrect={false}
                multiline
                placeholder="-----BEGIN PRIVATE KEY-----…"
                hint={t('ebConnect.private_key_hint')}
              />
            </Card>
            <Button
              title={t('ebConnect.verifier_bouton')}
              onPress={registerApp}
              loading={busy}
              disabled={!appId.trim() || !pem.trim() || !redirectUrl.trim().toLowerCase().startsWith('https://')}
            />
          </>
        ) : (
          <>
            {creds.sessions.length > 0 && (
              <>
                <SectionTitle>{t('ebConnect.banques_connectees')}</SectionTitle>
                <Card>
                  {creds.sessions.map((s, i) => (
                    <View key={s.sessionId} style={[styles.sessionRow, i < creds.sessions.length - 1 && styles.rowBorder]}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.sessionName}>{s.aspspName}</Text>
                        <Text style={styles.sessionSub}>
                          {t('ebConnect.n_comptes', { count: s.accounts.length })}
                          {s.validUntil ? ` · ${t('ebConnect.consentement_jusqu', { date: formatDate(s.validUntil) })}` : ''}
                        </Text>
                      </View>
                    </View>
                  ))}
                </Card>
              </>
            )}

            <SectionTitle>{t('ebConnect.ajouter_banque')}</SectionTitle>
            <Card>
              <SelectField
                label={t('ebConnect.pays_banque')}
                value={country}
                onChange={(c) => {
                  setCountry(c);
                  setBanks(null);
                }}
                options={EB_COUNTRIES.map((c) => ({ value: c.code, label: c.label }))}
                hint={t('ebConnect.pays_hint')}
              />
              <Button
                title={banks ? t('ebConnect.recharger_liste') : t('ebConnect.charger_banques')}
                variant="secondary"
                onPress={() => loadBankList(country)}
                loading={busy}
              />
            </Card>
            {banks && (
              <Card>
                <Field label={t('ebConnect.rechercher')} value={filter} onChangeText={setFilter} placeholder={t('ebConnect.rechercher_placeholder')} />
                {filtered.length === 0 && <Empty text={t('ebConnect.aucune_banque')} />}
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
                <SectionTitle>{t('ebConnect.finaliser', { name: pendingBank.name })}</SectionTitle>
                <Card>
                  <Field
                    label={t('ebConnect.url_recue')}
                    value={manualRedirect}
                    onChangeText={setManualRedirect}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder={t('ebConnect.url_recue_placeholder')}
                    hint={t('ebConnect.url_recue_hint')}
                  />
                  <Button title={t('ebConnect.valider_code')} onPress={() => finishAuth(pendingBank, manualRedirect)} loading={busy} disabled={!manualRedirect.trim()} />
                </Card>
              </>
            )}
          </>
        )}
      </ScrollView>
    </>
  );
}
