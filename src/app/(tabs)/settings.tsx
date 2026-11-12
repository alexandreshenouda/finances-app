/** Onglet Paramètres : menus vers les sous-écrans + effacement des données. */
import { TabIcon } from '@/components/TabIcons';
import { Button, Card, ListCard, ListRow, SectionTitle } from '@/components/ui';
import { C, CONTENT, FONT, useStyles } from '@/constants/theme';
import { confirmAction, notify } from '@/lib/confirm';
import { classifyHoldings } from '@/lib/prices/classification';
import { connectionSecretKey, deleteSecret, GEMINI_SECRET_KEY } from '@/lib/secure';
import { useStore } from '@/lib/store';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text } from 'react-native';

function makeStyles() {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.bg },
    content: { padding: 16, paddingBottom: 40, ...CONTENT },
    note: { color: C.textFaint, fontSize: FONT.sm, marginTop: 8, lineHeight: 17 },
    classifyMessage: { color: C.textDim, fontSize: FONT.sm, marginTop: 8, lineHeight: 17 },
  });
}

export default function Settings() {
  const styles = useStyles(makeStyles);
  const { t } = useTranslation();
  const router = useRouter();
  const connections = useStore((s) => s.connections);
  const resetAll = useStore((s) => s.resetAll);
  const [classifying, setClassifying] = useState(false);
  const [classifyMessage, setClassifyMessage] = useState<string | null>(null);

  const onReclassifyAll = async () => {
    setClassifying(true);
    setClassifyMessage(null);
    try {
      const result = await classifyHoldings({ forceAll: true });
      const msg =
        result.errors.length > 0
          ? t('diversification.classer_partiel', {
              count: result.classified,
              issues: result.errors.slice(0, 3).join(' · '),
            })
          : t('diversification.classer_ok', { count: result.classified });
      setClassifyMessage(msg);
      notify(t('settings.reclassifier_titre'), msg);
    } catch (e: any) {
      const err = String(e?.message ?? e);
      setClassifyMessage(err);
      notify(t('common.error'), err);
    } finally {
      setClassifying(false);
    }
  };

  const onWipe = () =>
    confirmAction(
      t('settings.effacer_titre'),
      t('settings.effacer_confirm'),
      async () => {
        // Purge aussi les identifiants chiffrés des connexions et la clé API Gemini.
        for (const c of connections) {
          await deleteSecret(connectionSecretKey(c.id));
        }
        await deleteSecret(GEMINI_SECRET_KEY);
        resetAll();
        notify(t('settings.effacees_titre'), t('settings.effacees_texte'));
      }
    );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <SectionTitle>{t('settings.general')}</SectionTitle>
      <ListCard>
        <ListRow
          title={t('settings.connexions')}
          left={<TabIcon name="connexions" color={C.textDim} size={22} />}
          subtitle={t('settings.connexions_sub')}
          onPress={() => router.push('/connections')}
        />
        <ListRow
          title={t('settings.ai_settings')}
          left={<TabIcon name="ai" color={C.textDim} size={22} />}
          subtitle={t('settings.ai_settings_sub')}
          onPress={() => router.push('/ai-settings')}
        />
        <ListRow
          title={t('settings.sauvegarde')}
          left={<TabIcon name="sauvegarde" color={C.textDim} size={22} />}
          subtitle={t('settings.sauvegarde_sub')}
          onPress={() => router.push('/backup')}
        />
        <ListRow
          title={t('settings.affichage')}
          left={<TabIcon name="affichage" color={C.textDim} size={22} />}
          subtitle={t('settings.affichage_sub')}
          onPress={() => router.push('/display-settings')}
        />
        <ListRow
          title={t('settings.langue')}
          left={<TabIcon name="langue" color={C.textDim} size={22} />}
          subtitle="Français, English, Deutsch"
          onPress={() => router.push('/language-settings')}
          last
        />
      </ListCard>

      <SectionTitle>{t('settings.historique')}</SectionTitle>
      <ListCard>
        <ListRow
          title={t('settings.effacer_zone')}
          left={<TabIcon name="historique" color={C.textDim} size={22} />}
          subtitle={t('settings.effacer_zone_sub')}
          onPress={() => router.push('/erase-history')}
          last
        />
      </ListCard>

      <SectionTitle>{t('settings.avance')}</SectionTitle>
      <ListCard>
        <ListRow
          title={t('settings.developpeur')}
          left={<TabIcon name="developpeur" color={C.textDim} size={22} />}
          subtitle={t('settings.developpeur_sub')}
          onPress={() => router.push('/dev-tools')}
          last
        />
      </ListCard>
      <Card>
        <Button
          title={t('settings.reclassifier_bouton')}
          variant="secondary"
          loading={classifying}
          onPress={onReclassifyAll}
        />
        {classifyMessage ? (
          <Text style={styles.classifyMessage}>{classifyMessage}</Text>
        ) : (
          <Text style={styles.note}>{t('settings.reclassifier_note')}</Text>
        )}
      </Card>

      <SectionTitle>{t('settings.zone_dangereuse')}</SectionTitle>
      <Card>
        <Button title={t('settings.effacer_bouton')} variant="danger" onPress={onWipe} />
        <Text style={styles.note}>{t('settings.effacer_note')}</Text>
      </Card>
    </ScrollView>
  );
}
