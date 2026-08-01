/** Onglet Paramètres : menus vers les sous-écrans + effacement des données. */
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
  const router = useRouter();
  const connections = useStore((s) => s.connections);
  const resetAll = useStore((s) => s.resetAll);

  const onWipe = () =>
    confirmAction(
      'Effacer toutes les données',
      'Comptes, lignes, historique, biens immobiliers, crédits et connexions seront définitivement supprimés de l\'appareil. Pensez à exporter une sauvegarde avant.',
      async () => {
        // Purge aussi les identifiants chiffrés des connexions.
        for (const c of connections) {
          await deleteSecret(connectionSecretKey(c.id));
        }
        resetAll();
        notify('Données effacées', 'L\'application est repartie de zéro.');
      }
    );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <SectionTitle>Général</SectionTitle>
      <Card style={{ paddingVertical: 4 }}>
        <MenuRow
          label="Connexions"
          sub="Binance, Kraken, banques, Trade Republic"
          onPress={() => router.push('/connections')}
        />
        <MenuRow
          label="Sauvegarde"
          sub="Exporter / importer les données"
          onPress={() => router.push('/backup')}
        />
        <MenuRow
          label="Affichage"
          sub="Période affichée à l'ouverture"
          onPress={() => router.push('/display-settings')}
          last
        />
      </Card>

      <SectionTitle>Historique</SectionTitle>
      <Card style={{ paddingVertical: 4 }}>
        <MenuRow
          label="Effacer une zone du graphique"
          sub="Corriger des erreurs de saisie passées"
          onPress={() => router.push('/erase-history')}
          last
        />
      </Card>

      <SectionTitle>Avancé</SectionTitle>
      <Card style={{ paddingVertical: 4 }}>
        <MenuRow
          label="Développeur"
          sub="Journal de debug des connecteurs (Trade Republic…)"
          onPress={() => router.push('/dev-tools')}
          last
        />
      </Card>

      <SectionTitle>Zone dangereuse</SectionTitle>
      <Card>
        <Button title="Effacer toutes les données…" variant="danger" onPress={onWipe} />
        <Text style={styles.note}>
          Efface tout le contenu local de l'application (irréversible). Les réglages reviennent aux
          valeurs par défaut.
        </Text>
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
