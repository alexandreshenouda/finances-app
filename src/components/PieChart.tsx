/** Répartition du patrimoine par type : anneau (donut) SVG + légende chiffrée. */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { C, FONT, RADIUS, TABULAR, useStyles } from '@/constants/theme';
import { formatEur, formatPct } from '@/lib/format';
import { useTranslation } from 'react-i18next';
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

function makeStyles() {
  return StyleSheet.create({
    chartWrap: { height: SIZE, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
    center: { position: 'absolute', alignItems: 'center' },
    centerLabel: { color: C.textFaint, fontSize: FONT.xs, textTransform: 'uppercase', letterSpacing: 0.6 },
    centerValue: { color: C.text, fontSize: FONT.lg, fontWeight: '700', marginTop: 2, ...TABULAR },
    legend: { gap: 6 },
    legendRow: { flexDirection: 'row', alignItems: 'center' },
    swatch: { width: 10, height: 10, borderRadius: RADIUS.xs, marginRight: 8 },
    legendLabel: { color: C.text, fontSize: FONT.md, flex: 1 },
    legendValue: { color: C.text, fontSize: FONT.md, fontWeight: '600', ...TABULAR },
    legendPct: { color: C.textFaint, fontSize: FONT.sm, fontWeight: '400' },
  });
}

export type DonutSlice = { key: string; label: string; value: number; color: string };

/** Anneau générique + légende chiffrée (répartition du patrimoine, du budget…). */
export function DonutChart({ slices: input, centerLabel }: { slices: DonutSlice[]; centerLabel?: string }) {
  const styles = useStyles(makeStyles);
  const { t } = useTranslation();
  const entries = input.filter((s) => s.value > 0);
  const total = entries.reduce((acc, s) => acc + s.value, 0);
  if (total <= 0) return null;

  const full = 2 * Math.PI;
  let angle = 0;
  const arcs = entries.map((s) => {
    const start = angle;
    const end = angle + (s.value / total) * full;
    angle = end;
    return { ...s, start, end };
  });

  return (
    <View>
      <View style={styles.chartWrap}>
        <Svg width={SIZE} height={SIZE}>
          {entries.length === 1 ? (
            <Circle cx={CX} cy={CY} r={R} stroke={entries[0].color} strokeWidth={STROKE} fill="none" />
          ) : (
            arcs.map(({ key, color, start, end }) => (
              <Path key={key} d={arcPath(start, end)} stroke={color} strokeWidth={STROKE} strokeLinecap="butt" fill="none" />
            ))
          )}
        </Svg>
        <View style={styles.center} pointerEvents="none">
          <Text style={styles.centerLabel}>{centerLabel ?? t('common.total')}</Text>
          <Text style={styles.centerValue}>{formatEur(total)}</Text>
        </View>
      </View>
      <View style={styles.legend}>
        {entries.map((s) => (
          <View key={s.key} style={styles.legendRow}>
            <View style={[styles.swatch, { backgroundColor: s.color }]} />
            <Text style={styles.legendLabel}>{s.label}</Text>
            <Text style={styles.legendValue}>
              {formatEur(s.value)}
              <Text style={styles.legendPct}>  {formatPct((s.value / total) * 100)}</Text>
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function PieChart({ byType }: { byType: Map<AccountType, number> }) {
  return (
    <DonutChart
      slices={ACCOUNT_TYPE_ORDER.map((type) => ({
        key: type,
        label: ACCOUNT_TYPE_LABELS[type],
        value: byType.get(type) ?? 0,
        color: ACCOUNT_TYPE_COLORS[type],
      }))}
    />
  );
}
