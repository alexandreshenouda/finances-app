/** Effacer une zone du graphique : supprime des points d'historique (snapshots)
 *  avant une date, ou entre deux dates — pour lisser les erreurs de saisie. */
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { Button, Card, Chips, Field, SectionTitle, SelectField } from '@/components/ui';
import { C } from '@/constants/theme';
import { confirmAction, notify } from '@/lib/confirm';
import { formatDate } from '@/lib/format';
import { useStore } from '@/lib/store';

const MODES = ['avant', 'entre'] as const;
const MODE_LABELS: Record<(typeof MODES)[number], string> = {
  avant: 'Avant une date',
  entre: 'Entre deux dates',
};

/** Date valide au format AAAA-MM-JJ, sinon undefined. */
function parseDay(s: string): string | undefined {
  const t = s.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t) || Number.isNaN(Date.parse(t))) return undefined;
  return t;
}

export default function EraseHistory() {
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

  const scopeLabel = scope === 'all' ? 'tous les comptes' : `« ${accounts.find((a) => a.id === scope)?.name} »`;

  const onErase = () =>
    confirmAction(
      'Effacer ces points',
      mode === 'avant'
        ? `${matches.length} point(s) antérieur(s) au ${formatDate(beforeDay!)} seront supprimés (${scopeLabel}).`
        : `${matches.length} point(s) entre le ${formatDate(fromDay!)} et le ${formatDate(toDay!)} inclus seront supprimés (${scopeLabel}).`,
      () => {
        deleteSnapshotsByIds(matches.map((sn) => sn.id));
        notify('Zone effacée', `${matches.length} point(s) supprimé(s) des courbes.`);
        setBefore('');
        setFrom('');
        setTo('');
      }
    );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <SectionTitle>Zone à effacer</SectionTitle>
      <Card>
        <Text style={styles.hint}>
          Supprime des points des courbes (l'historique de valeur), par exemple pour lisser une
          erreur de saisie. Les comptes, lignes et biens ne sont pas modifiés.
        </Text>
        <Text style={styles.label}>Mode</Text>
        <Chips options={MODES} value={mode} onChange={setMode} labels={MODE_LABELS} />
        <SelectField
          label="Portée"
          value={scope}
          onChange={setScope}
          options={[
            { value: 'all', label: 'Tous les comptes' },
            ...accounts.map((a) => ({ value: a.id, label: a.name })),
          ]}
        />
        {mode === 'avant' ? (
          <Field
            label="Effacer tout avant le"
            value={before}
            onChangeText={setBefore}
            placeholder="AAAA-MM-JJ"
            autoCapitalize="none"
            hint={before.trim() && beforeDay === undefined ? 'Format attendu : AAAA-MM-JJ.' : 'La date saisie est conservée ; seuls les points antérieurs sont supprimés.'}
          />
        ) : (
          <>
            <Field
              label="Du (inclus)"
              value={from}
              onChangeText={setFrom}
              placeholder="AAAA-MM-JJ"
              autoCapitalize="none"
              hint={from.trim() && fromDay === undefined ? 'Format attendu : AAAA-MM-JJ.' : undefined}
            />
            <Field
              label="Au (inclus)"
              value={to}
              onChangeText={setTo}
              placeholder="AAAA-MM-JJ"
              autoCapitalize="none"
              hint={
                to.trim() && toDay === undefined
                  ? 'Format attendu : AAAA-MM-JJ.'
                  : fromDay && toDay && fromDay > toDay
                    ? 'La date de fin doit être postérieure à celle de début.'
                    : undefined
              }
            />
          </>
        )}
        <Text style={[styles.preview, matches.length > 0 && { color: C.warning }]}>
          {valid
            ? matches.length > 0
              ? `${matches.length} point(s) de courbe seront supprimés.`
              : 'Aucun point dans cette zone.'
            : 'Renseignez les dates pour voir les points concernés.'}
        </Text>
        <Button title={`Effacer ${matches.length} point(s)`} variant="danger" onPress={onErase} disabled={!valid || matches.length === 0} />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 40 },
  hint: { color: C.textDim, fontSize: 13, marginBottom: 12, lineHeight: 18 },
  label: { color: C.textDim, fontSize: 13, marginBottom: 6 },
  preview: { color: C.textFaint, fontSize: 13, marginTop: 4, marginBottom: 8 },
});
