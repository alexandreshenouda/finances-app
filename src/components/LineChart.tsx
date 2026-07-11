/**
 * Courbe de valorisation (série unique) : ligne 2px, aire dégradée,
 * grille discrète, inspection au doigt (crosshair + valeur).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import { C } from '@/constants/theme';
import { formatDate, formatEur } from '@/lib/format';
import type { SeriesPoint } from '@/lib/portfolio';

const H = 200;
const PAD_TOP = 12;
const PAD_BOTTOM = 22;

export function LineChart({ points, color = C.accent }: { points: SeriesPoint[]; color?: string }) {
  const [width, setWidth] = useState(0);
  const [touchIdx, setTouchIdx] = useState<number | null>(null);
  const nodeRef = useRef<HTMLElement | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  const winWidth = useWindowDimensions().width;

  // react-native-web ≥ 0.20 ne déclenche plus onLayout : mesure directe du DOM,
  // ResizeObserver pour les redimensionnements, ref callback car le nœud change
  // quand on passe de l'état vide à la courbe.
  const wrapRef = useCallback((node: unknown) => {
    if (Platform.OS !== 'web') return;
    roRef.current?.disconnect();
    roRef.current = null;
    const el = node as HTMLElement | null;
    nodeRef.current = el;
    if (!el) return;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver !== 'undefined') {
      roRef.current = new ResizeObserver(() => setWidth(el.clientWidth));
      roRef.current.observe(el);
    }
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web' && nodeRef.current) setWidth(nodeRef.current.clientWidth);
  }, [winWidth]);

  const geom = useMemo(() => {
    if (width === 0 || points.length < 2) return null;
    const values = points.map((p) => p.value);
    let min = Math.min(...values);
    let max = Math.max(...values);
    if (min === max) {
      min -= 1;
      max += 1;
    }
    const span = max - min;
    // Marge visuelle pour ne pas coller la courbe aux bords.
    const lo = min - span * 0.08;
    const hi = max + span * 0.08;
    const innerH = H - PAD_TOP - PAD_BOTTOM;
    const x = (i: number) => (i / (points.length - 1)) * width;
    const y = (v: number) => PAD_TOP + innerH - ((v - lo) / (hi - lo)) * innerH;
    const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
    const area = `${d} L${width},${H - PAD_BOTTOM} L0,${H - PAD_BOTTOM} Z`;
    return { x, y, d, area, min, max };
  }, [width, points]);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const locate = (locationX: number) => {
    if (!geom || points.length < 2) return;
    const i = Math.round((locationX / width) * (points.length - 1));
    setTouchIdx(Math.max(0, Math.min(points.length - 1, i)));
  };

  if (points.length < 2) {
    return (
      <View ref={wrapRef} style={[styles.wrap, { height: H, justifyContent: 'center' }]} onLayout={onLayout}>
        <Text style={styles.emptyText}>
          Pas encore assez d'historique — les courbes apparaîtront après quelques mises à jour de valeur.
        </Text>
      </View>
    );
  }

  const touched = touchIdx !== null ? points[touchIdx] : null;

  return (
    <View ref={wrapRef} style={styles.wrap} onLayout={onLayout}>
      <View style={styles.tooltipRow}>
        {touched ? (
          <Text style={styles.tooltipText}>
            {formatDate(touched.date)} · <Text style={{ color: C.text, fontWeight: '700' }}>{formatEur(touched.value)}</Text>
          </Text>
        ) : (
          <Text style={styles.tooltipText}> </Text>
        )}
      </View>
      {geom && (
        <View
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={(e) => locate(e.nativeEvent.locationX)}
          onResponderMove={(e) => locate(e.nativeEvent.locationX)}
          onResponderRelease={() => setTouchIdx(null)}
        >
          <Svg width={width} height={H}>
            <Defs>
              <LinearGradient id="area" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color} stopOpacity={0.25} />
                <Stop offset="1" stopColor={color} stopOpacity={0.02} />
              </LinearGradient>
            </Defs>
            {[0.25, 0.5, 0.75].map((f) => (
              <Line
                key={f}
                x1={0}
                x2={width}
                y1={PAD_TOP + (H - PAD_TOP - PAD_BOTTOM) * f}
                y2={PAD_TOP + (H - PAD_TOP - PAD_BOTTOM) * f}
                stroke={C.border}
                strokeWidth={StyleSheet.hairlineWidth}
              />
            ))}
            <Path d={geom.area} fill="url(#area)" />
            <Path d={geom.d} stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" />
            {touchIdx !== null && (
              <>
                <Line
                  x1={geom.x(touchIdx)}
                  x2={geom.x(touchIdx)}
                  y1={PAD_TOP}
                  y2={H - PAD_BOTTOM}
                  stroke={C.textDim}
                  strokeWidth={1}
                  strokeDasharray="3,3"
                />
                <Circle
                  cx={geom.x(touchIdx)}
                  cy={geom.y(points[touchIdx].value)}
                  r={5}
                  fill={color}
                  stroke={C.bg}
                  strokeWidth={2}
                />
              </>
            )}
          </Svg>
          <View style={styles.axisRow}>
            <Text style={styles.axisText}>{formatDate(points[0].date)}</Text>
            <Text style={styles.axisText}>{formatDate(points[points.length - 1].date)}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  emptyText: { color: C.textFaint, fontSize: 13, textAlign: 'center', paddingHorizontal: 16 },
  tooltipRow: { height: 20, marginBottom: 2 },
  tooltipText: { color: C.textDim, fontSize: 13, textAlign: 'center' },
  axisRow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  axisText: { color: C.textFaint, fontSize: 11 },
});
