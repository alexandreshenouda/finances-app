/**
 * Outils développeur : active la journalisation du trafic brut des
 * connecteurs (Trade Republic notamment) et affiche/efface ce journal.
 * Stockage dédié via `debugLog.ts`, jamais inclus dans les sauvegardes.
 */
import * as Clipboard from 'expo-clipboard';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button, Card, Checkbox, SectionTitle } from '@/components/ui';
import { C, useStyles } from '@/constants/theme';
import { confirmAction, notify } from '@/lib/confirm';
import { useDebugLogStore, type LogEntry } from '@/lib/debugLog';
import { todayKey } from '@/lib/format';

function formatEntries(entries: LogEntry[]): string {
  return entries
    .map((e) => `[${e.ts}] ${e.level.toUpperCase()} ${e.tag} — ${e.message}${e.detail ? `\n${e.detail}` : ''}`)
    .join('\n\n');
}

function makeStyles() {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.bg },
    content: { padding: 16, paddingBottom: 40 },
    hint: { color: C.textDim, fontSize: 13, lineHeight: 18 },
    row: { paddingVertical: 10 },
    rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
    rowHead: { fontSize: 12, fontWeight: '600' },
    message: { color: C.text, fontSize: 13, marginTop: 2 },
    detail: { color: C.textFaint, fontSize: 11, marginTop: 4, lineHeight: 15 },
  });
}

export default function DevTools() {
  const styles = useStyles(makeStyles);
  const { t, i18n } = useTranslation();
  const enabled = useDebugLogStore((s) => s.enabled);
  const setEnabled = useDebugLogStore((s) => s.setEnabled);
  const entries = useDebugLogStore((s) => s.entries);
  const clear = useDebugLogStore((s) => s.clear);

  const onClear = () => confirmAction(t('devTools.vider_titre'), t('devTools.vider_confirm'), clear);

  const onCopy = async () => {
    await Clipboard.setStringAsync(formatEntries(entries));
    notify(t('devTools.copie_titre'), t('devTools.copie_texte'));
  };

  const onShareFile = async () => {
    try {
      const file = new File(Paths.cache, `debug-log-${todayKey()}.txt`);
      file.write(formatEntries(entries));
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, { mimeType: 'text/plain', dialogTitle: t('devTools.partage_titre') });
      } else {
        notify(t('devTools.fichier_cree_titre'), t('backup.fichier_ecrit', { uri: file.uri }));
      }
    } catch (e: any) {
      notify(t('devTools.partage_impossible'), String(e?.message ?? e));
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <SectionTitle>{t('devTools.titre')}</SectionTitle>
      <Card>
        <Checkbox label={t('devTools.journaliser')} value={enabled} onChange={setEnabled} />
        <Text style={styles.hint}>{t('devTools.journaliser_hint')}</Text>
      </Card>

      <SectionTitle>{t('devTools.journal', { count: entries.length })}</SectionTitle>
      <Card>
        {entries.length === 0 ? (
          <Text style={styles.hint}>{t('devTools.aucune_entree')}</Text>
        ) : (
          entries.map((e, i) => (
            <View key={e.id} style={[styles.row, i < entries.length - 1 && styles.rowBorder]}>
              <Text style={styles.rowHead}>
                <Text style={{ color: C.textFaint }}>{new Date(e.ts).toLocaleTimeString(i18n.language)} · </Text>
                <Text style={{ color: C.accent }}>{e.tag}</Text>
              </Text>
              <Text style={[styles.message, e.level === 'error' && { color: C.negative }]}>{e.message}</Text>
              {e.detail ? <Text style={styles.detail}>{e.detail}</Text> : null}
            </View>
          ))
        )}
      </Card>
      {entries.length > 0 && (
        <>
          <Button title={t('devTools.copier_journal')} variant="secondary" onPress={onCopy} />
          {Platform.OS !== 'web' && (
            <Button title={t('devTools.partager_journal')} variant="secondary" onPress={onShareFile} />
          )}
          <Button title={t('devTools.vider_journaux')} variant="danger" onPress={onClear} />
        </>
      )}
    </ScrollView>
  );
}
