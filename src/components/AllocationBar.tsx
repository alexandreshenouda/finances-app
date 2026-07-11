/** Répartition du patrimoine par type de compte : barre empilée + légende chiffrée. */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { C } from '@/constants/theme';
import { formatEur, formatPct } from '@/lib/format';
import { ACCOUNT_TYPE_COLORS, ACCOUNT_TYPE_LABELS, ACCOUNT_TYPE_ORDER, type AccountType } from '@/lib/types';

export function AllocationBar({ byType }: { byType: Map<AccountType, number> }) {
  const entries = ACCOUNT_TYPE_ORDER.filter((t) => (byType.get(t) ?? 0) > 0).map(
    (t) => [t, byType.get(t)!] as const
  );
  const total = entries.reduce((acc, [, v]) => acc + v, 0);
  if (total <= 0) return null;

  return (
    <View>
      <View style={styles.bar}>
        {entries.map(([type, value]) => (
          <View
            key={type}
            style={{
              flex: value / total,
              backgroundColor: ACCOUNT_TYPE_COLORS[type],
              marginRight: 2, // gap de séparation entre segments
            }}
          />
        ))}
      </View>
      <View style={styles.legend}>
        {entries.map(([type, value]) => (
          <View key={type} style={styles.legendRow}>
            <View style={[styles.swatch, { backgroundColor: ACCOUNT_TYPE_COLORS[type] }]} />
            <Text style={styles.legendLabel}>{ACCOUNT_TYPE_LABELS[type]}</Text>
            <Text style={styles.legendValue}>
              {formatEur(value)}
              <Text style={styles.legendPct}>  {formatPct((value / total) * 100)}</Text>
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    height: 14,
    borderRadius: 7,
    overflow: 'hidden',
    marginBottom: 12,
  },
  legend: { gap: 6 },
  legendRow: { flexDirection: 'row', alignItems: 'center' },
  swatch: { width: 10, height: 10, borderRadius: 3, marginRight: 8 },
  legendLabel: { color: C.text, fontSize: 14, flex: 1 },
  legendValue: { color: C.text, fontSize: 14, fontWeight: '600' },
  legendPct: { color: C.textFaint, fontSize: 12, fontWeight: '400' },
});
