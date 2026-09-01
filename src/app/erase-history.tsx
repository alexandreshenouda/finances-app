/** Effacer une zone du graphique : supprime des points d'historique (snapshots)
 *  avant une date, ou entre deux dates — pour lisser les erreurs de saisie. */
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button, Card, Chips, Field, SectionTitle, SelectField } from '@/components/ui';
import { C, useStyles } from '@/constants/theme';
import { confirmAction, notify } from '@/lib/confirm';
import { formatDate } from '@/lib/format';
import { useStore } from '@/lib/store';

const MODES = ['avant', 'entre'] as const;

/** Date valide au format AAAA-MM-JJ, sinon undefined. */
function parseDay(s: string): string | undefined {
  const t = s.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t) || Number.isNaN(Date.parse(t))) return undefined;
  return t;
}

function makeStyles() {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.bg },
    content: { padding: 16, paddingBottom: 40 },
    hint: { color: C.textDim, fontSize: 13, marginBottom: 12, lineHeight: 18 },
    label: { color: C.textDim, fontSize: 13, marginBottom: 6 },
    preview: { color: C.textFaint, fontSize: 13, marginTop: 4, marginBottom: 8 },
  });
}

export default function EraseHistory() {
  const styles = useStyles(makeStyles);
  const { t } = useTranslation();
  const MODE_LABELS: Record<(typeof MODES)[number], string> = {
    avant: t('eraseHistory.mode_avant'),
    entre: t('eraseHistory.mode_entre'),
  };
  const accounts = useStore((s) => s.accounts);
  const snapshots = useStore((s) => s.snapshots);
  const deleteSnapshotsByIds = useStore((s) => s.deleteSnapshotsByIds);

  const [mode, setMode] = useState<(typeof MODES)[number]>('avant');
  const [scope, setScope] = useState<string>('all');
  const [before, setBefore] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const beforeDay = parseDay(before);
  const fromDay = parseDay(from);
  const toDay = parseDay(to);

  const valid =
    mode === 'avant' ? beforeDay !== undefined : fromDay !== undefined && toDay !== undefined && fromDay <= toDay;

  // Points concernés (les dates AAAA-MM-JJ se comparent en ordre lexicographique).
  const matches = useMemo(() => {
    if (!valid) return [];
    return snapshots.filter((sn) => {
      if (scope !== 'all' && sn.accountId !== scope) return false;
      return mode === 'avant' ? sn.date < beforeDay! : sn.date >= fromDay! && sn.date <= toDay!;
    });
  }, [valid, snapshots, scope, mode, beforeDay, fromDay, toDay]);

  const scopeLabel = scope === 'all' ? t('eraseHistory.tous_comptes') : t('eraseHistory.compte_nomme', { name: accounts.find((a) => a.id === scope)?.name });

  const onErase = () =>
    confirmAction(
      t('eraseHistory.effacer_titre'),
      mode === 'avant'
        ? t('eraseHistory.confirm_avant', { count: matches.length, date: formatDate(beforeDay!), scope: scopeLabel })
        : t('eraseHistory.confirm_entre', { count: matches.length, from: formatDate(fromDay!), to: formatDate(toDay!), scope: scopeLabel }),
      () => {
        deleteSnapshotsByIds(matches.map((sn) => sn.id));
        notify(t('eraseHistory.effacee_titre'), t('eraseHistory.effacee_texte', { count: matches.length }));
        setBefore('');
        setFrom('');
        setTo('');
      }
    );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <SectionTitle>{t('eraseHistory.zone_titre')}</SectionTitle>
      <Card>
        <Text style={styles.hint}>{t('eraseHistory.zone_hint')}</Text>
        <Text style={styles.label}>{t('eraseHistory.mode')}</Text>
        <Chips options={MODES} value={mode} onChange={setMode} labels={MODE_LABELS} />
        <SelectField
          label={t('eraseHistory.portee')}
          value={scope}
          onChange={setScope}
          options={[
            { value: 'all', label: t('eraseHistory.tous_comptes_option') },
            ...accounts.map((a) => ({ value: a.id, label: a.name })),
          ]}
        />
        {mode === 'avant' ? (
          <Field
            label={t('eraseHistory.avant_le')}
            value={before}
            onChangeText={setBefore}
            placeholder={t('propertyForm.date_placeholder')}
            autoCapitalize="none"
            hint={before.trim() && beforeDay === undefined ? t('loanForm.date_hint') : t('eraseHistory.avant_hint')}
          />
        ) : (
          <>
            <Field
              label={t('eraseHistory.du')}
              value={from}
              onChangeText={setFrom}
              placeholder={t('propertyForm.date_placeholder')}
              autoCapitalize="none"
              hint={from.trim() && fromDay === undefined ? t('loanForm.date_hint') : undefined}
            />
            <Field
              label={t('eraseHistory.au')}
              value={to}
              onChangeText={setTo}
              placeholder={t('propertyForm.date_placeholder')}
              autoCapitalize="none"
              hint={
                to.trim() && toDay === undefined
                  ? t('loanForm.date_hint')
                  : fromDay && toDay && fromDay > toDay
                    ? t('eraseHistory.date_fin_hint')
                    : undefined
              }
            />
          </>
        )}
        <Text style={[styles.preview, matches.length > 0 && { color: C.warning }]}>
          {valid
            ? matches.length > 0
              ? t('eraseHistory.points_seront_supprimes', { count: matches.length })
              : t('eraseHistory.aucun_point')
            : t('eraseHistory.renseignez_dates')}
        </Text>
        <Button title={t('eraseHistory.effacer_bouton', { count: matches.length })} variant="danger" onPress={onErase} disabled={!valid || matches.length === 0} />
      </Card>
    </ScrollView>
  );
}
