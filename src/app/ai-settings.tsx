/**
 * Paramètres Intelligence Artificielle (Google Gemini) :
 * - Clé API stockée chiffrée sur l'appareil via `src/lib/secure.ts` (Keychain/Keystore `expo-secure-store`),
 *   au même titre que les clés Binance, Kraken, Trade Republic et Enable Banking.
 * - Sélection du modèle Gemini par défaut et synchronisation des modèles disponibles.
 * - Personnalisation optionnelle du pré-prompt système du comité d'investissement.
 */
import { Button, Card, Field, SectionTitle, SelectField } from '@/components/ui';
import { C, useStyles } from '@/constants/theme';
import {
  DEFAULT_GEMINI_MODELS,
  DEFAULT_INVESTMENT_COUNSELOR_PREPROMPT,
  deleteGeminiApiKey,
  fetchAvailableGeminiModels,
  getGeminiApiKey,
  setGeminiApiKey,
  type GeminiModelOption,
} from '@/lib/aiCounsel';
import { confirmAction, notify } from '@/lib/confirm';
import { useStore } from '@/lib/store';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

function makeStyles() {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.bg },
    content: { padding: 16, paddingBottom: 40 },
    help: { color: C.textDim, fontSize: 13, marginBottom: 12, lineHeight: 19 },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: C.cardAlt,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
    },
    statusDot: { width: 9, height: 9, borderRadius: 4.5 },
    statusText: { color: C.text, fontSize: 13, fontWeight: '600', flex: 1 },
    note: { color: C.textFaint, fontSize: 12, marginTop: 6, marginBottom: 10, lineHeight: 17 },
    disclaimerWrap: {
      backgroundColor: C.cardAlt,
      borderLeftWidth: 3,
      borderLeftColor: C.warning,
      borderRadius: 8,
      padding: 12,
      marginBottom: 10,
    },
    disclaimerTitle: {
      color: C.warning,
      fontSize: 12,
      fontWeight: '700',
      marginBottom: 4,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    disclaimerText: { color: C.textDim, fontSize: 12, lineHeight: 17 },
    privacyWrap: {
      backgroundColor: C.cardAlt,
      borderLeftWidth: 3,
      borderLeftColor: C.accent,
      borderRadius: 8,
      padding: 12,
      marginBottom: 12,
    },
    privacyTitle: {
      color: C.accent,
      fontSize: 12,
      fontWeight: '700',
      marginBottom: 4,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    privacyText: { color: C.textDim, fontSize: 12, lineHeight: 17 },
    prepromptInput: {
      backgroundColor: C.cardAlt,
      color: C.text,
      borderRadius: 10,
      padding: 12,
      fontSize: 12,
      fontFamily: 'monospace',
      minHeight: 220,
      textAlignVertical: 'top',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
      marginBottom: 12,
    },
  });
}

export default function AiSettingsScreen() {
  const styles = useStyles(makeStyles);
  const { t } = useTranslation();
  const router = useRouter();

  const aiModel = useStore((s) => s.aiModel);
  const setAiModel = useStore((s) => s.setAiModel);
  const aiCustomPreprompt = useStore((s) => s.aiCustomPreprompt);
  const setAiCustomPreprompt = useStore((s) => s.setAiCustomPreprompt);

  const [apiKeyInput, setApiKeyInput] = useState('');
  const [hasStoredKey, setHasStoredKey] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [liveModels, setLiveModels] = useState<GeminiModelOption[]>([]);
  const [modelStatus, setModelStatus] = useState<string | null>(null);
  const [prepromptDraft, setPrepromptDraft] = useState(
    aiCustomPreprompt || DEFAULT_INVESTMENT_COUNSELOR_PREPROMPT
  );

  const loadKeyState = useCallback(async () => {
    const key = await getGeminiApiKey();
    setHasStoredKey(Boolean(key));
    setApiKeyInput(key);
  }, []);

  useEffect(() => {
    loadKeyState();
  }, [loadKeyState]);

  const allModels = useMemo(() => {
    return [
      ...DEFAULT_GEMINI_MODELS,
      ...liveModels.filter((lm) => !DEFAULT_GEMINI_MODELS.some((dm) => dm.id === lm.id)),
    ];
  }, [liveModels]);

  const handleSaveKey = async () => {
    const trimmed = apiKeyInput.trim();
    if (!trimmed) return;
    setSavingKey(true);
    try {
      await setGeminiApiKey(trimmed);
      setHasStoredKey(true);
      notify(t('ai.cle_enregistree_titre'), t('ai.cle_enregistree_texte'));
    } catch (e: any) {
      notify(t('common.error'), String(e?.message ?? e));
    } finally {
      setSavingKey(false);
    }
  };

  const handleDeleteKey = () => {
    confirmAction(
      t('ai.supprimer_cle'),
      t('connections.gemini_supprimer_confirm'),
      async () => {
        await deleteGeminiApiKey();
        setApiKeyInput('');
        setHasStoredKey(false);
        setModelStatus(null);
        notify(t('ai.cle_supprimee_titre'), t('ai.cle_supprimee_texte'));
      }
    );
  };

  const handleSyncModels = async () => {
    const keyToUse = apiKeyInput.trim() || (await getGeminiApiKey());
    if (!keyToUse) {
      setModelStatus(t('ai.cle_api_manquante'));
      return;
    }
    setFetchingModels(true);
    setModelStatus(null);
    try {
      const discovered = await fetchAvailableGeminiModels(keyToUse);
      setLiveModels(discovered);
      setModelStatus(t('ai.modeles_charges', { count: discovered.length }));
    } catch (err: any) {
      setModelStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setFetchingModels(false);
    }
  };

  const handleSavePreprompt = () => {
    setAiCustomPreprompt(
      prepromptDraft.trim() === DEFAULT_INVESTMENT_COUNSELOR_PREPROMPT.trim()
        ? undefined
        : prepromptDraft
    );
    notify(t('common.save'), t('ai.preprompt_titre'));
  };

  return (
    <>
      <Stack.Screen options={{ title: t('settings.ai_settings') }} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <View style={styles.disclaimerWrap}>
          <Text style={styles.disclaimerTitle}>{t('ai.avertissement_titre')}</Text>
          <Text style={styles.disclaimerText}>{t('ai.avertissement_legal')}</Text>
        </View>
        <View style={styles.privacyWrap}>
          <Text style={styles.privacyTitle}>{t('ai.confidentialite_ia_titre')}</Text>
          <Text style={styles.privacyText}>{t('ai.confidentialite_ia_texte')}</Text>
        </View>

        <SectionTitle>{t('ai.reglages_titre')}</SectionTitle>
        <Card>
          <Text style={styles.help}>{t('ai.reglages_desc')}</Text>

          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: hasStoredKey ? C.positive : C.warning },
              ]}
            />
            <Text style={styles.statusText}>
              {hasStoredKey ? t('ai.statut_cle_active') : t('ai.statut_cle_absente')}
            </Text>
          </View>

          <Field
            label={t('ai.cle_api_label')}
            value={apiKeyInput}
            onChangeText={setApiKeyInput}
            placeholder={t('ai.cle_api_placeholder')}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            hint={t('ai.cle_api_hint')}
          />

          <Button
            title={t('common.save')}
            onPress={handleSaveKey}
            loading={savingKey}
            disabled={!apiKeyInput.trim()}
          />
          {hasStoredKey && (
            <Button
              title={t('ai.supprimer_cle')}
              variant="danger"
              onPress={handleDeleteKey}
            />
          )}
        </Card>

        <SectionTitle>{t('ai.modele_gemini')}</SectionTitle>
        <Card>
          <SelectField<string>
            label={t('ai.modele_gemini')}
            value={aiModel}
            options={allModels.map((m) => ({ value: m.id, label: m.label }))}
            onChange={setAiModel}
          />

          <Field
            label={t('ai.modele_personnalise')}
            value={aiModel}
            onChangeText={setAiModel}
            placeholder="gemini-3.6-flash"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Button
            title={fetchingModels ? t('ai.sync_en_cours') : t('ai.sync_modeles')}
            variant="secondary"
            onPress={handleSyncModels}
            loading={fetchingModels}
          />
          {modelStatus ? <Text style={styles.note}>{modelStatus}</Text> : null}
        </Card>

        <SectionTitle>{t('ai.preprompt_titre')}</SectionTitle>
        <Card>
          <Text style={styles.help}>{t('ai.preprompt_desc')}</Text>
          <TextInput
            value={prepromptDraft}
            onChangeText={setPrepromptDraft}
            multiline
            style={styles.prepromptInput}
          />
          <Button title={t('common.save')} onPress={handleSavePreprompt} />
          <Button
            title={t('ai.preprompt_reinitialiser')}
            variant="secondary"
            onPress={() => {
              setPrepromptDraft(DEFAULT_INVESTMENT_COUNSELOR_PREPROMPT);
              setAiCustomPreprompt(undefined);
            }}
          />
        </Card>

        <Button title={t('common.retour')} variant="secondary" onPress={() => router.back()} />
      </ScrollView>
    </>
  );
}
