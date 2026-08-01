/** Logo de l'app : marque « F + courbe » (SVG) et logotype « Finances ». */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { C } from '@/constants/theme';

/** Symbole = courbe de valorisation (montée-descente-montée) + point vert cerclé. */
export function LogoMark({
  size = 28,
  color = C.accent,
  dot = C.positive,
  ring = C.bg,
}: { size?: number; color?: string; dot?: string; ring?: string }) {
  return (
    <Svg width={size} height={size} viewBox="10 1 80 80">
      <Path d="M16 66 L37 50 L53 58 L80 24" fill="none" stroke={color} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={80} cy={24} r={8} fill={dot} stroke={ring} strokeWidth={3.5} />
    </Svg>
  );
}

/** Logotype « Fin » gras + « ances » allégé. */
export function LogoWordmark({ size = 19, color = C.text, dim = C.textDim }: { size?: number; color?: string; dim?: string }) {
  return (
    <Text style={[styles.word, { fontSize: size, color }]}>
      Fin<Text style={{ fontWeight: '300', color: dim }}>ances</Text>
    </Text>
  );
}

/** Marque + logotype en ligne (en-tête). */
export function Logo({ mark = 28, text = 20 }: { mark?: number; text?: number }) {
  return (
    <View style={styles.row}>
      <LogoMark size={mark} />
      <LogoWordmark size={text} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  word: { fontWeight: '800', letterSpacing: -0.5 },
});
