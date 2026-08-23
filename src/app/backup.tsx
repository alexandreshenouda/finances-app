/** Sauvegarde : export / import des données (fichier ou presse-papiers). */
import * as Clipboard from 'expo-clipboard';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button, Card, SectionTitle } from '@/components/ui';
import { C } from '@/constants/theme';
import { confirmAction, notify } from '@/lib/confirm';
import { todayKey } from '@/lib/format';
import { exportData, useStore, type AppData } from '@/lib/store';

export default function Backup() {
  const { t } = useTranslation();
  const importData = useStore((s) => s.importData);

  const onExport = async () => {
    await Clipboard.setStringAsync(JSON.stringify(exportData(), null, 2));
    notify(t('backup.export_titre'), t('backup.export_presse_papiers'));
  };

  /** Import commun : accepte les exports V1 (sans devise) comme V2 — champs currency optionnels. */
  const applyImport = (text: string, sourceLabel: string) => {
    try {
      const data = JSON.parse(text) as AppData;
      if (!Array.isArray(data.accounts)) throw new Error('format invalide');
      confirmAction(t('backup.importer_titre'), t('backup.importer_confirm', { count: data.accounts.length, source: sourceLabel }), () =>
        importData(data)
      );
    } catch {
      notify(t('backup.import_impossible_titre'), t('backup.import_impossible_texte', { source: sourceLabel }));
    }
  };

  const onImport = async () => {
    applyImport(await Clipboard.getStringAsync(), t('backup.source_presse_papiers'));
  };

  const onExportFile = async () => {
    try {
      const file = new File(Paths.cache, `patrimoine-${todayKey()}.json`);
      file.write(JSON.stringify(exportData(), null, 2));
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'application/json',
          dialogTitle: t('backup.partage_titre'),
        });
      } else {
        notify(t('backup.export_titre'), t('backup.fichier_ecrit', { uri: file.uri }));
      }
    } catch (e: any) {
      notify(t('backup.export_impossible_titre'), String(e?.message ?? e));
    }
  };

  const onImportFile = async () => {
    try {
      const picked = await File.pickFileAsync({ mimeTypes: 'application/json' });
      if (picked.canceled || !picked.result) return;
      applyImport(picked.result.textSync(), t('backup.source_fichier', { name: picked.result.name }));
    } catch (e: any) {
      notify(t('backup.import_impossible_titre_court'), String(e?.message ?? e));
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <SectionTitle>{t('backup.title')}</SectionTitle>
      <Card>
        {Platform.OS !== 'web' && (
          <>
            <Button title={t('backup.exporter_fichier')} variant="secondary" onPress={onExportFile} />
            <Button title={t('backup.importer_fichier')} variant="secondary" onPress={onImportFile} />
          </>
        )}
        <Button title={t('backup.exporter_presse_papiers')} variant="secondary" onPress={onExport} />
        <Button title={t('backup.importer_presse_papiers')} variant="secondary" onPress={onImport} />
        <Text style={styles.note}>{t('backup.note')}</Text>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 40 },
  note: { color: C.textFaint, fontSize: 12, marginTop: 8, lineHeight: 17 },
});
