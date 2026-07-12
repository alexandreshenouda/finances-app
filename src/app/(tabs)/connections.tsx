/** Connexions externes (Binance, Kraken, Enable Banking) + sauvegarde des données. */
import * as Clipboard from 'expo-clipboard';
import { File, Paths } from 'expo-file-system';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Empty, SectionTitle } from '@/components/ui';
import { C } from '@/constants/theme';
import { confirmAction, notify } from '@/lib/confirm';
import { syncConnection } from '@/lib/connectors';
import { formatDate, todayKey } from '@/lib/format';
import { connectionSecretKey, deleteSecret } from '@/lib/secure';
import { exportData, useStore, type AppData } from '@/lib/store';
import { PROVIDER_LABELS } from '@/lib/types';

export default function Connections() {
  const router = useRouter();
  const connections = useStore((s) => s.connections);
  const deleteConnection = useStore((s) => s.deleteConnection);
  const importData = useStore((s) => s.importData);
  const [syncing, setSyncing] = useState<string | null>(null);

  const onSync = async (id: string) => {
    setSyncing(id);
    try {
      const r = await syncConnection(id);
      notify('Synchronisation terminée', r.warnings.length > 0 ? r.warnings.join('\n') : 'Comptes à jour.');
    } catch (e: any) {
      notify('Erreur de synchronisation', String(e?.message ?? e));
    } finally {
      setSyncing(null);
    }
  };

  const onDelete = (id: string, label: string) =>
    confirmAction('Supprimer la connexion', `« ${label} » : les identifiants seront effacés, les comptes et l'historique conservés.`, async () => {
      await deleteSecret(connectionSecretKey(id));
      deleteConnection(id);
    });

  const onExport = async () => {
    await Clipboard.setStringAsync(JSON.stringify(exportData(), null, 2));
    notify('Export', 'Données copiées dans le presse-papiers (sans les identifiants). Collez-les dans un fichier pour les sauvegarder.');
  };

  /** Import commun : accepte les exports V1 (sans devise) comme V2 — champs currency optionnels. */
  const applyImport = (text: string, sourceLabel: string) => {
    try {
      const data = JSON.parse(text) as AppData;
      if (!Array.isArray(data.accounts)) throw new Error('format invalide');
      confirmAction('Importer', `Remplacer les données actuelles par ${data.accounts.length} compte(s) ${sourceLabel} ?`, () =>
        importData(data)
      );
    } catch {
      notify('Import impossible', `${sourceLabel} ne contient pas un export valide.`);
    }
  };

  const onImport = async () => {
    applyImport(await Clipboard.getStringAsync(), 'du presse-papiers');
  };

  const onExportFile = async () => {
    try {
      const file = new File(Paths.cache, `patrimoine-${todayKey()}.json`);
      file.write(JSON.stringify(exportData(), null, 2));
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'application/json',
          dialogTitle: 'Exporter les données Patrimoine',
        });
      } else {
        notify('Export', `Fichier écrit : ${file.uri}`);
      }
    } catch (e: any) {
      notify('Export impossible', String(e?.message ?? e));
    }
  };

  const onImportFile = async () => {
    try {
      const picked = await File.pickFileAsync({ mimeTypes: 'application/json' });
      if (picked.canceled || !picked.result) return;
      applyImport(picked.result.textSync(), `du fichier ${picked.result.name}`);
    } catch (e: any) {
      notify('Import impossible', String(e?.message ?? e));
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {Platform.OS === 'web' && (
        <Card style={{ borderColor: C.warning }}>
          <Text style={styles.webWarn}>
            Dans un navigateur, les API de Binance, Kraken, Yahoo et Enable Banking sont bloquées (CORS).
            La synchronisation fonctionne dans l'app Android ; ici, utilisez le suivi manuel et CoinGecko.
          </Text>
        </Card>
      )}

      <SectionTitle>Connexions actives</SectionTitle>
      {connections.length === 0 && <Empty text="Aucune connexion. Ajoutez-en une ci-dessous : les identifiants restent stockés sur l'appareil." />}
      {connections.map((c) => (
        <Card key={c.id}>
          <Text style={styles.connLabel}>{c.label}</Text>
          <Text style={styles.connSub}>
            {PROVIDER_LABELS[c.provider]}
            {c.lastSync ? `  ·  dernière synchro : ${formatDate(c.lastSync)}` : '  ·  jamais synchronisé'}
          </Text>
          {c.lastError && <Text style={styles.connError}>{c.lastError}</Text>}
          <View style={styles.connButtons}>
            <Button title="Synchroniser" onPress={() => onSync(c.id)} loading={syncing === c.id} style={{ flex: 1 }} />
            {c.provider === 'enablebanking' && (
              <Button title="Banques" variant="secondary" onPress={() => router.push({ pathname: '/eb-connect', params: { connectionId: c.id } })} style={{ flex: 1 }} />
            )}
            <Button title="Supprimer" variant="danger" onPress={() => onDelete(c.id, c.label)} style={{ flex: 1 }} />
          </View>
        </Card>
      ))}

      <SectionTitle>Ajouter une connexion</SectionTitle>
      <Card>
        <Text style={styles.addHint}>
          Clés API en lecture seule uniquement. Elles sont chiffrées dans le stockage sécurisé de
          l'appareil (Android Keystore) et ne quittent jamais l'appareil.
        </Text>
        <Button title="Binance (clé API lecture seule)" variant="secondary" onPress={() => router.push({ pathname: '/connection-form', params: { provider: 'binance' } })} />
        <Button title="Kraken (clé API lecture seule)" variant="secondary" onPress={() => router.push({ pathname: '/connection-form', params: { provider: 'kraken' } })} />
        <Button title="Banques françaises via Enable Banking" variant="secondary" onPress={() => router.push('/eb-connect')} />
        <Text style={styles.addNote}>
          Enable Banking (gratuit, usage personnel) couvre les comptes courants des banques françaises
          via DSP2. Les PEA, CTO et assurances vie ne sont pas couverts par les API bancaires : suivez-les
          en manuel avec cours automatiques.
        </Text>
      </Card>

      <SectionTitle>Sauvegarde</SectionTitle>
      <Card>
        {Platform.OS !== 'web' && (
          <>
            <Button title="Exporter vers un fichier…" variant="secondary" onPress={onExportFile} />
            <Button title="Importer depuis un fichier…" variant="secondary" onPress={onImportFile} />
          </>
        )}
        <Button title="Exporter les données (presse-papiers)" variant="secondary" onPress={onExport} />
        <Button title="Importer depuis le presse-papiers" variant="secondary" onPress={onImport} />
        <Text style={styles.addNote}>
          Les exports contiennent comptes, lignes et historique (jamais les identifiants). Les
          anciens exports restent importables.
        </Text>
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
