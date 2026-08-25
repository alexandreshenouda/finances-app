/** Connexions externes (Binance, Kraken, Enable Banking, Trade Republic, Alpha Vantage). */
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button, Card, Empty, Field, SectionTitle } from '@/components/ui';
import { C } from '@/constants/theme';
import { confirmAction, notify } from '@/lib/confirm';
import { syncConnection } from '@/lib/connectors';
import { formatDate } from '@/lib/format';
import { ALPHA_VANTAGE_SECRET_KEY, connectionSecretKey, deleteSecret, getSecret, setSecret } from '@/lib/secure';
import { useStore } from '@/lib/store';
import { PROVIDER_LABELS } from '@/lib/types';

export default function Connections() {
  const { t } = useTranslation();
  const router = useRouter();
  const connections = useStore((s) => s.connections);
  const deleteConnection = useStore((s) => s.deleteConnection);
  const [syncing, setSyncing] = useState<string | null>(null);

  const [avKey, setAvKey] = useState('');
  const [avHasKey, setAvHasKey] = useState(false);
  const [avSaving, setAvSaving] = useState(false);

  useEffect(() => {
    getSecret(ALPHA_VANTAGE_SECRET_KEY).then((v) => {
      if (v) {
        setAvKey(v);
        setAvHasKey(true);
      }
    });
  }, []);

  const onSaveAvKey = async () => {
    setAvSaving(true);
    try {
      await setSecret(ALPHA_VANTAGE_SECRET_KEY, avKey.trim());
      setAvHasKey(true);
      notify(t('connections.av_enregistree_titre'), t('connections.av_enregistree_texte'));
    } finally {
      setAvSaving(false);
    }
  };

  const onDeleteAvKey = () =>
    confirmAction(t('connections.av_supprimer_titre'), t('connections.av_supprimer_confirm'), async () => {
      await deleteSecret(ALPHA_VANTAGE_SECRET_KEY);
      setAvKey('');
      setAvHasKey(false);
    });

  const onSync = async (id: string) => {
    setSyncing(id);
    try {
      const r = await syncConnection(id);
      notify(t('connections.sync_terminee_titre'), r.warnings.length > 0 ? r.warnings.join('\n') : t('connections.comptes_a_jour'));
    } catch (e: any) {
      notify(t('connections.sync_erreur_titre'), String(e?.message ?? e));
    } finally {
      setSyncing(null);
    }
  };

  const onDelete = (id: string, label: string) =>
    confirmAction(t('connections.supprimer_titre'), t('connections.supprimer_confirm', { label }), async () => {
      await deleteSecret(connectionSecretKey(id));
      deleteConnection(id);
    });

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {Platform.OS === 'web' && (
        <Card style={{ borderColor: C.warning }}>
          <Text style={styles.webWarn}>{t('connections.web_warning')}</Text>
        </Card>
      )}

      <SectionTitle>{t('connections.actives')}</SectionTitle>
      {connections.length === 0 && <Empty text={t('connections.aucune')} />}
      {connections.map((c) => (
        <Card key={c.id}>
          <Text style={styles.connLabel}>{c.label}</Text>
          <Text style={styles.connSub}>
            {PROVIDER_LABELS[c.provider]}
            {c.lastSync ? `  ·  ${t('connections.derniere_synchro', { date: formatDate(c.lastSync) })}` : `  ·  ${t('connections.jamais_synchronise')}`}
          </Text>
          {c.lastError && <Text style={styles.connError}>{c.lastError}</Text>}
          <View style={styles.connButtons}>
            {c.provider === 'traderepublic' ? (
              // 2FA requise : la « synchro » repasse par l'écran interactif.
              <Button title={t('connections.reconnecter')} onPress={() => router.push({ pathname: '/tr-connect', params: { connectionId: c.id } })} style={{ flex: 1 }} />
            ) : (
              <Button title={t('forms.connexion')} onPress={() => onSync(c.id)} loading={syncing === c.id} style={{ flex: 1 }} />
            )}
            {c.provider === 'enablebanking' && (
              <Button title={t('connections.banques')} variant="secondary" onPress={() => router.push({ pathname: '/eb-connect', params: { connectionId: c.id } })} style={{ flex: 1 }} />
            )}
            <Button title={t('common.delete')} variant="danger" onPress={() => onDelete(c.id, c.label)} style={{ flex: 1 }} />
          </View>
        </Card>
      ))}

      <SectionTitle>{t('connections.ajouter_titre')}</SectionTitle>
      <Card>
        <Text style={styles.addHint}>{t('connections.ajouter_hint')}</Text>
        <Button title={t('connections.binance_bouton')} variant="secondary" onPress={() => router.push({ pathname: '/connection-form', params: { provider: 'binance' } })} />
        <Button title={t('connections.kraken_bouton')} variant="secondary" onPress={() => router.push({ pathname: '/connection-form', params: { provider: 'kraken' } })} />
        <Button title={t('connections.tr_bouton')} variant="secondary" onPress={() => router.push('/tr-connect')} />
        <Button title={t('connections.eb_bouton')} variant="secondary" onPress={() => router.push('/eb-connect')} />
        <Text style={styles.addNote}>{t('connections.ajouter_note')}</Text>
      </Card>

      <SectionTitle>{t('connections.av_titre')}</SectionTitle>
      <Card>
        <Text style={styles.addHint}>{t('connections.av_hint')}</Text>
        <Field
          label={t('connections.av_cle')}
          value={avKey}
          onChangeText={setAvKey}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />
        <View style={styles.connButtons}>
          <Button title={t('common.save')} onPress={onSaveAvKey} loading={avSaving} disabled={!avKey.trim()} style={{ flex: 1 }} />
          {avHasKey && <Button title={t('common.delete')} variant="danger" onPress={onDeleteAvKey} style={{ flex: 1 }} />}
        </View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 40 },
  webWarn: { color: C.warning, fontSize: 13, lineHeight: 18 },
  connLabel: { color: C.text, fontSize: 16, fontWeight: '600' },
  connSub: { color: C.textDim, fontSize: 13, marginTop: 2 },
  connError: { color: C.negative, fontSize: 12, marginTop: 6 },
  connButtons: { flexDirection: 'row', gap: 8, marginTop: 12 },
  addHint: { color: C.textDim, fontSize: 13, marginBottom: 10, lineHeight: 18 },
  addNote: { color: C.textFaint, fontSize: 12, marginTop: 8, lineHeight: 17 },
});
