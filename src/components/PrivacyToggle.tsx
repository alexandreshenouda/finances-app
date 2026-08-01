/** Bouton œil (en-tête) : bascule le mode confidentialité — montants masqués, % visibles. */
import React from 'react';
import { Pressable } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { C } from '@/constants/theme';
import { useStore } from '@/lib/store';

export function PrivacyToggle() {
  const privacy = useStore((s) => s.privacyMode);
  const setPrivacyMode = useStore((s) => s.setPrivacyMode);
  const common = {
    stroke: C.textDim,
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none' as const,
  };
  return (
    <Pressable
      onPress={() => setPrivacyMode(!privacy)}
      hitSlop={10}
      style={{ marginRight: 16 }}
      accessibilityRole="button"
      accessibilityLabel={privacy ? 'Afficher les montants' : 'Masquer les montants'}
    >
      <Svg width={24} height={24} viewBox="0 0 24 24">
        <Path d="M2 12 C5 6.5 8.5 5 12 5 C15.5 5 19 6.5 22 12 C19 17.5 15.5 19 12 19 C8.5 19 5 17.5 2 12 Z" {...common} />
        <Circle cx={12} cy={12} r={3} {...common} />
        {privacy && <Line x1={4} y1={3.5} x2={20} y2={20.5} stroke={C.textDim} strokeWidth={2} strokeLinecap="round" />}
      </Svg>
    </Pressable>
  );
}
