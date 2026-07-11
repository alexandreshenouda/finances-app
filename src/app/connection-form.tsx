/** Ajout d'une connexion exchange (Binance / Kraken) : clé API en lecture seule. */
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { Button, Card, Field } from '@/components/ui';
import { C } from '@/constants/theme';
import { notify } from '@/lib/confirm';
import { syncConnection } from '@/lib/connectors';
import { connectionSecretKey, setSecret } from '@/lib/secure';
import { useStore } from '@/lib/store';
import { PROVIDER_LABELS } from '@/lib/types';

export default function ConnectionForm() {
  const { provider } = useLocalSearchParams<{ provider: 'binance' | 'kraken' }>();
  const router = useRouter();
  const upsertConnection = useStore((s) => s.upsertConnection);
  const deleteConnection = useStore((s) => s.deleteConnection);

  const [label, setLabel] = useState(PROVIDER_LABELS[provider ?? 'binance']);
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [saving, setSaving] = useState(false);

  const help =
    provider === 'kraken'
      ? 'Créez une clé API sur kraken.com → Settings → API avec la seule permission « Query Funds ».'
      : 'Créez une clé API sur binance.com → Gestion API, en lecture seule (décochez trading et retraits).';

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
      notify('Connexion réussie', 'Comptes importés et synchronisés.');
      router.back();
    } catch (e: any) {
      // Première synchro échouée : on ne garde pas une connexion inutilisable.
      deleteConnection(conn.id);
      notify('Échec de la connexion', String(e?.message ?? e));
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
          <Field label="Libellé" value={label} onChangeText={setLabel} />
          <Field label="Clé API" value={apiKey} onChangeText={setApiKey} autoCapitalize="none" autoCorrect={false} />
          <Field
            label="Secret API"
            value={apiSecret}
            onChangeText={setApiSecret}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            hint="Stocké chiffré sur l'appareil, jamais transmis ailleurs qu'à l'API officielle."
          />
        </Card>
        <Button title="Connecter et synchroniser" onPress={save} loading={saving} disabled={!apiKey.trim() || !apiSecret.trim()} />
        <Button title="Annuler" variant="secondary" onPress={() => router.back()} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 40 },
  help: { color: C.textDim, fontSize: 13, marginBottom: 12, lineHeight: 18 },
});
