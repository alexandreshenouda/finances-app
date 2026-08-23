/** Ajout d'une connexion exchange (Binance / Kraken) : clé API en lecture seule. */
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button, Card, Field } from '@/components/ui';
import { C } from '@/constants/theme';
import { notify } from '@/lib/confirm';
import { syncConnection } from '@/lib/connectors';
import { connectionSecretKey, setSecret } from '@/lib/secure';
import { useStore } from '@/lib/store';
import { PROVIDER_LABELS } from '@/lib/types';

export default function ConnectionForm() {
  const { t } = useTranslation();
  const { provider } = useLocalSearchParams<{ provider: 'binance' | 'kraken' }>();
  const router = useRouter();
  const upsertConnection = useStore((s) => s.upsertConnection);
  const deleteConnection = useStore((s) => s.deleteConnection);

  const [label, setLabel] = useState(PROVIDER_LABELS[provider ?? 'binance']);
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [saving, setSaving] = useState(false);

  const help = provider === 'kraken' ? t('connectionForm.aide_kraken') : t('connectionForm.aide_binance');

  const save = async () => {
    if (!apiKey.trim() || !apiSecret.trim() || !provider) return;
    setSaving(true);
    const conn = upsertConnection({ provider, label: label.trim() || PROVIDER_LABELS[provider] });
    try {
      await setSecret(
        connectionSecretKey(conn.id),
        JSON.stringify({ apiKey: apiKey.trim(), apiSecret: apiSecret.trim() })
      );
      await syncConnection(conn.id);
      notify(t('connectionForm.succes_titre'), t('connectionForm.succes_texte'));
      router.back();
    } catch (e: any) {
      // Première synchro échouée : on ne garde pas une connexion inutilisable.
      deleteConnection(conn.id);
      notify(t('connectionForm.echec_titre'), String(e?.message ?? e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: PROVIDER_LABELS[provider ?? 'binance'] }} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Card>
          <Text style={styles.help}>{help}</Text>
          <Field label={t('connectionForm.libelle')} value={label} onChangeText={setLabel} />
          <Field label={t('connectionForm.cle_api')} value={apiKey} onChangeText={setApiKey} autoCapitalize="none" autoCorrect={false} />
          <Field
            label={t('connectionForm.secret_api')}
            value={apiSecret}
            onChangeText={setApiSecret}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            hint={t('connectionForm.secret_hint')}
          />
        </Card>
        <Button title={t('connectionForm.connecter')} onPress={save} loading={saving} disabled={!apiKey.trim() || !apiSecret.trim()} />
        <Button title={t('common.cancel')} variant="secondary" onPress={() => router.back()} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 40 },
  help: { color: C.textDim, fontSize: 13, marginBottom: 12, lineHeight: 18 },
});
