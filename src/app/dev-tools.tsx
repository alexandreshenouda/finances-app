/**
 * Outils développeur : active la journalisation du trafic brut des
 * connecteurs (Trade Republic notamment) et affiche/efface ce journal.
 * Stockage dédié via `debugLog.ts`, jamais inclus dans les sauvegardes.
 */
import * as Clipboard from 'expo-clipboard';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Checkbox, SectionTitle } from '@/components/ui';
import { C } from '@/constants/theme';
import { confirmAction, notify } from '@/lib/confirm';
import { useDebugLogStore, type LogEntry } from '@/lib/debugLog';
import { todayKey } from '@/lib/format';

function formatEntries(entries: LogEntry[]): string {
  return entries
    .map((e) => `[${e.ts}] ${e.level.toUpperCase()} ${e.tag} — ${e.message}${e.detail ? `\n${e.detail}` : ''}`)
    .join('\n\n');
}

export default function DevTools() {
  const enabled = useDebugLogStore((s) => s.enabled);
  const setEnabled = useDebugLogStore((s) => s.setEnabled);
  const entries = useDebugLogStore((s) => s.entries);
  const clear = useDebugLogStore((s) => s.clear);

  const onClear = () =>
    confirmAction('Vider les journaux', 'Toutes les entrées du journal de debug seront supprimées.', clear);

  const onCopy = async () => {
    await Clipboard.setStringAsync(formatEntries(entries));
    notify('Copié', 'Le journal (le plus récent en premier) a été copié dans le presse-papiers.');
  };

  const onShareFile = async () => {
    try {
      const file = new File(Paths.cache, `debug-log-${todayKey()}.txt`);
      file.write(formatEntries(entries));
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, { mimeType: 'text/plain', dialogTitle: 'Partager le journal de debug' });
      } else {
        notify('Fichier créé', `Fichier écrit : ${file.uri}`);
      }
    } catch (e: any) {
      notify('Partage impossible', String(e?.message ?? e));
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <SectionTitle>Mode développeur</SectionTitle>
      <Card>
        <Checkbox label="Journaliser le trafic des connecteurs" value={enabled} onChange={setEnabled} />
        <Text style={styles.hint}>
          Une fois activé, les requêtes/réponses brutes des connecteurs (notamment Trade Republic)
          sont enregistrées ci-dessous, sur l'appareil uniquement. Pensez à désactiver quand vous
          n'êtes plus en train de diagnostiquer un problème.
        </Text>
      </Card>

      <SectionTitle>Journal ({entries.length})</SectionTitle>
      <Card>
        {entries.length === 0 ? (
          <Text style={styles.hint}>Aucune entrée.</Text>
        ) : (
          entries.map((e, i) => (
            <View key={e.id} style={[styles.row, i < entries.length - 1 && styles.rowBorder]}>
              <Text style={styles.rowHead}>
                <Text style={{ color: C.textFaint }}>{new Date(e.ts).toLocaleTimeString('fr-FR')} · </Text>
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
          <Button title="Copier le journal (presse-papiers)" variant="secondary" onPress={onCopy} />
          {Platform.OS !== 'web' && (
            <Button title="Partager le journal…" variant="secondary" onPress={onShareFile} />
          )}
          <Button title="Vider les journaux" variant="danger" onPress={onClear} />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 40 },
  hint: { color: C.textDim, fontSize: 13, lineHeight: 18 },
  row: { paddingVertical: 10 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  rowHead: { fontSize: 12, fontWeight: '600' },
  message: { color: C.text, fontSize: 13, marginTop: 2 },
  detail: { color: C.textFaint, fontSize: 11, marginTop: 4, lineHeight: 15 },
});
