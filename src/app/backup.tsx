/** Sauvegarde : export / import des données (fichier ou presse-papiers). */
import * as Clipboard from 'expo-clipboard';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { Button, Card, SectionTitle } from '@/components/ui';
import { C } from '@/constants/theme';
import { confirmAction, notify } from '@/lib/confirm';
import { todayKey } from '@/lib/format';
import { exportData, useStore, type AppData } from '@/lib/store';

export default function Backup() {
  const importData = useStore((s) => s.importData);

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
          dialogTitle: 'Exporter les données Finances',
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
        <Text style={styles.note}>
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
  note: { color: C.textFaint, fontSize: 12, marginTop: 8, lineHeight: 17 },
});
