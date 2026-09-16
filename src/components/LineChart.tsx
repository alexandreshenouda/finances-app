/**
 * Courbe de valorisation (série unique) : ligne 2px, aire dégradée,
 * grille discrète, inspection au doigt (crosshair + valeur).
 *
 * En mode `percent`, la courbe représente la performance relative depuis le
 * début de la période (0 % au premier point) : la ligne de base 0 % est donc
 * toujours incluse dans l'échelle verticale, l'aire est ancrée sur cette ligne
 * (et non sur le bas du graphe), et la couleur bascule sur `C.negative` sous 0 %.
 * Sans cela, la transformation valeur → % étant affine, l'auto-échelle
 * redonnait exactement la même courbe qu'en mode valeur.
 */
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import { C, useStyles } from '@/constants/theme';
import { formatDate, formatEur, formatPct } from '@/lib/format';
import type { SeriesPoint } from '@/lib/portfolio';
import type { ChartMode } from '@/lib/types';

const H = 200;
const PAD_TOP = 12;
const PAD_BOTTOM = 22;

function makeStyles() {
  return StyleSheet.create({
    wrap: { width: '100%' },
    emptyText: { color: C.textFaint, fontSize: 13, textAlign: 'center', paddingHorizontal: 16 },
    tooltipRow: { height: 20, marginBottom: 2 },
    tooltipText: { color: C.textDim, fontSize: 13, textAlign: 'center' },
    tooltipRaw: { color: C.textFaint, fontSize: 12 },
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
}

export function LineChart({
  points,
  color = C.accent,
  mode = 'value',
}: {
  points: SeriesPoint[];
  color?: string;
  mode?: ChartMode;
}) {
  const styles = useStyles(makeStyles);
  const [width, setWidth] = useState(0);
  const [touchIdx, setTouchIdx] = useState<number | null>(null);
  const nodeRef = useRef<HTMLElement | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  const winWidth = useWindowDimensions().width;
  // Identifiants uniques : plusieurs LineChart peuvent coexister sur un même
  // écran (Synthèse + Projection) et les ids SVG sont globaux au document web.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const areaId = `area-${uid}`;
  const strokeId = `stroke-${uid}`;
  const isPct = mode === 'percent';

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
    // Mode performance : le 0 % est la référence de la période, il doit rester
    // à l'écran même si la courbe est entièrement en gain ou entièrement en perte.
    if (isPct) {
      min = Math.min(min, 0);
      max = Math.max(max, 0);
    }
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
    // L'aire part de la ligne de base : 0 % en mode performance, bas du graphe sinon.
    const baseY = isPct ? y(0) : H - PAD_BOTTOM;
    const area = `${d} L${width},${baseY.toFixed(1)} L0,${baseY.toFixed(1)} Z`;
    // Bascule de couleur exprimée en fraction de la hauteur du SVG (gradient en userSpaceOnUse).
    // Deux offsets quasi confondus plutôt qu'un seul dupliqué : certaines implémentations
    // natives de dégradé exigent des positions strictement croissantes.
    const zeroTop = Math.max(0, Math.min(1, baseY / H));
    const zeroBottom = Math.min(1, zeroTop + 0.001);
    return { x, y, d, area, min, max, lo, hi, baseY, zeroTop, zeroBottom };
  }, [width, points, isPct]);

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
  /** Couleur d'un point : thème au-dessus de 0 %, rouge en dessous (mode performance uniquement). */
  const colorAt = (v: number) => (isPct && v < 0 ? C.negative : color);
  const strokePaint = isPct ? `url(#${strokeId})` : color;

  return (
    <View ref={wrapRef} style={styles.wrap} onLayout={onLayout}>
      <View style={styles.tooltipRow}>
        {touched ? (
          <Text style={styles.tooltipText}>
            {formatDate(touched.date)} ·{' '}
            <Text style={{ color: isPct ? colorAt(touched.value) : C.text, fontWeight: '700' }}>
              {isPct ? formatPct(touched.value, true) : formatEur(touched.value)}
            </Text>
            {isPct && touched.rawValue !== undefined && (
              <Text style={styles.tooltipRaw}>{`  ${formatEur(touched.rawValue)}`}</Text>
            )}
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
              {isPct ? (
                <>
                  {/* Dégradés coupés net sur la ligne 0 % : thème au-dessus, négatif en dessous. */}
                  <LinearGradient id={areaId} x1="0" y1="0" x2="0" y2={H} gradientUnits="userSpaceOnUse">
                    <Stop offset="0" stopColor={color} stopOpacity={0.25} />
                    <Stop offset={geom.zeroTop} stopColor={color} stopOpacity={0.02} />
                    <Stop offset={geom.zeroBottom} stopColor={C.negative} stopOpacity={0.02} />
                    <Stop offset="1" stopColor={C.negative} stopOpacity={0.25} />
                  </LinearGradient>
                  <LinearGradient id={strokeId} x1="0" y1="0" x2="0" y2={H} gradientUnits="userSpaceOnUse">
                    <Stop offset="0" stopColor={color} />
                    <Stop offset={geom.zeroTop} stopColor={color} />
                    <Stop offset={geom.zeroBottom} stopColor={C.negative} />
                    <Stop offset="1" stopColor={C.negative} />
                  </LinearGradient>
                </>
              ) : (
                <LinearGradient id={areaId} x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={color} stopOpacity={0.25} />
                  <Stop offset="1" stopColor={color} stopOpacity={0.02} />
                </LinearGradient>
              )}
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
            <Path d={geom.area} fill={`url(#${areaId})`} />
            {isPct && (
              <Line
                x1={0}
                x2={width}
                y1={geom.baseY}
                y2={geom.baseY}
                stroke={C.textDim}
                strokeWidth={1}
                strokeDasharray="4,4"
              />
            )}
            <Path d={geom.d} stroke={strokePaint} strokeWidth={2} fill="none" strokeLinejoin="round" />
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
                  fill={colorAt(points[touchIdx].value)}
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
