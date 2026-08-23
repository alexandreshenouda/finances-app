/** Onglet Paramètres : menus vers les sous-écrans + effacement des données. */
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button, Card, SectionTitle } from '@/components/ui';
import { C } from '@/constants/theme';
import { confirmAction, notify } from '@/lib/confirm';
import { connectionSecretKey, deleteSecret } from '@/lib/secure';
import { useStore } from '@/lib/store';

function MenuRow({ label, sub, onPress, last }: { label: string; sub?: string; onPress: () => void; last?: boolean }) {
  return (
    <Pressable onPress={onPress} style={[styles.row, !last && styles.rowBorder]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

export default function Settings() {
  const { t } = useTranslation();
  const router = useRouter();
  const connections = useStore((s) => s.connections);
  const resetAll = useStore((s) => s.resetAll);

  const onWipe = () =>
    confirmAction(
      t('settings.effacer_titre'),
      t('settings.effacer_confirm'),
      async () => {
        // Purge aussi les identifiants chiffrés des connexions.
        for (const c of connections) {
          await deleteSecret(connectionSecretKey(c.id));
        }
        resetAll();
        notify(t('settings.effacees_titre'), t('settings.effacees_texte'));
      }
    );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <SectionTitle>{t('settings.general')}</SectionTitle>
      <Card style={{ paddingVertical: 4 }}>
        <MenuRow
          label={t('settings.connexions')}
          sub={t('settings.connexions_sub')}
          onPress={() => router.push('/connections')}
        />
        <MenuRow
          label={t('settings.sauvegarde')}
          sub={t('settings.sauvegarde_sub')}
          onPress={() => router.push('/backup')}
        />
        <MenuRow
          label={t('settings.affichage')}
          sub={t('settings.affichage_sub')}
          onPress={() => router.push('/display-settings')}
        />
        <MenuRow
          label={t('settings.langue')}
          sub="Français, English, Deutsch"
          onPress={() => router.push('/language-settings')}
          last
        />
      </Card>

      <SectionTitle>{t('settings.historique')}</SectionTitle>
      <Card style={{ paddingVertical: 4 }}>
        <MenuRow
          label={t('settings.effacer_zone')}
          sub={t('settings.effacer_zone_sub')}
          onPress={() => router.push('/erase-history')}
          last
        />
      </Card>

      <SectionTitle>{t('settings.avance')}</SectionTitle>
      <Card style={{ paddingVertical: 4 }}>
        <MenuRow
          label={t('settings.developpeur')}
          sub={t('settings.developpeur_sub')}
          onPress={() => router.push('/dev-tools')}
          last
        />
      </Card>

      <SectionTitle>{t('settings.zone_dangereuse')}</SectionTitle>
      <Card>
        <Button title={t('settings.effacer_bouton')} variant="danger" onPress={onWipe} />
        <Text style={styles.note}>{t('settings.effacer_note')}</Text>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 40 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  rowLabel: { color: C.text, fontSize: 15, fontWeight: '500' },
  rowSub: { color: C.textFaint, fontSize: 12, marginTop: 2 },
  chevron: { color: C.textFaint, fontSize: 20, marginLeft: 8 },
  note: { color: C.textFaint, fontSize: 12, marginTop: 8, lineHeight: 17 },
});
