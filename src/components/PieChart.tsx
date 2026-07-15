/** Répartition du patrimoine par type : anneau (donut) SVG + légende chiffrée. */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { C } from '@/constants/theme';
import { formatEur, formatPct } from '@/lib/format';
import { ACCOUNT_TYPE_COLORS, ACCOUNT_TYPE_LABELS, ACCOUNT_TYPE_ORDER, type AccountType } from '@/lib/types';

const SIZE = 176;
const STROKE = 32;
const R = (SIZE - STROKE) / 2;
const CX = SIZE / 2;
const CY = SIZE / 2;

/** Point sur le cercle central de l'anneau ; angle 0 = haut, sens horaire. */
function pointAt(angle: number): [number, number] {
  return [CX + R * Math.sin(angle), CY - R * Math.cos(angle)];
}

/** Arc de donut entre deux angles (radians). */
function arcPath(start: number, end: number): string {
  const [x1, y1] = pointAt(start);
  const [x2, y2] = pointAt(end);
  const large = end - start > Math.PI ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${R} ${R} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

export function PieChart({ byType }: { byType: Map<AccountType, number> }) {
  const entries = ACCOUNT_TYPE_ORDER.filter((t) => (byType.get(t) ?? 0) > 0).map(
    (t) => [t, byType.get(t)!] as const
  );
  const total = entries.reduce((acc, [, v]) => acc + v, 0);
  if (total <= 0) return null;

  const full = 2 * Math.PI;
  let angle = 0;
  const slices = entries.map(([type, value]) => {
    const start = angle;
    const end = angle + (value / total) * full;
    angle = end;
    return { type, start, end };
  });

  return (
    <View>
      <View style={styles.chartWrap}>
        <Svg width={SIZE} height={SIZE}>
          {entries.length === 1 ? (
            <Circle cx={CX} cy={CY} r={R} stroke={ACCOUNT_TYPE_COLORS[entries[0][0]]} strokeWidth={STROKE} fill="none" />
          ) : (
            slices.map(({ type, start, end }) => (
              <Path
                key={type}
                d={arcPath(start, end)}
                stroke={ACCOUNT_TYPE_COLORS[type]}
                strokeWidth={STROKE}
                strokeLinecap="butt"
                fill="none"
              />
            ))
          )}
        </Svg>
        <View style={styles.center} pointerEvents="none">
          <Text style={styles.centerLabel}>Total</Text>
          <Text style={styles.centerValue}>{formatEur(total)}</Text>
        </View>
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
  chartWrap: { height: SIZE, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  center: { position: 'absolute', alignItems: 'center' },
  centerLabel: { color: C.textFaint, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 },
  centerValue: { color: C.text, fontSize: 17, fontWeight: '700', marginTop: 2 },
  legend: { gap: 6 },
  legendRow: { flexDirection: 'row', alignItems: 'center' },
  swatch: { width: 10, height: 10, borderRadius: 3, marginRight: 8 },
  legendLabel: { color: C.text, fontSize: 14, flex: 1 },
  legendValue: { color: C.text, fontSize: 14, fontWeight: '600' },
  legendPct: { color: C.textFaint, fontSize: 12, fontWeight: '400' },
});
