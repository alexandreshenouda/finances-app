/** Sélecteur de rubrique en haut d'un onglet regroupant plusieurs écrans (Patrimoine, Analyse).
 *  Masqué quand une seule rubrique est visible. */
import { StyleSheet, View } from 'react-native';
import { Chips } from '@/components/ui';
import { C, CONTENT, useStyles } from '@/constants/theme';

function makeStyles() {
  return StyleSheet.create({
    bar: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 10,
      backgroundColor: C.bg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
    },
  });
}

export function SectionSwitcher<T extends string>({
  options,
  value,
  onChange,
  labels,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  labels: Partial<Record<T, string>>;
}) {
  const styles = useStyles(makeStyles);
  if (options.length < 2) return null;
  return (
    <View style={styles.bar}>
      <View style={CONTENT}>
        <Chips options={options} value={value} onChange={onChange} labels={labels} style={{ marginBottom: 0 }} />
      </View>
    </View>
  );
}
