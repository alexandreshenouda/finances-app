/** Icônes des onglets, style ligne cohérent avec le logo, teintées par l'état actif/inactif. */
import React from 'react';
import type { ColorValue } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { C } from '@/constants/theme';

export type TabName = 'synthese' | 'comptes' | 'immobilier' | 'emprunts' | 'parametres';

export function TabIcon({
  name,
  color,
  focused = false,
  size = 26,
}: { name: TabName; color: ColorValue; focused?: boolean; size?: number }) {
  const sw = 2;
  const common = { stroke: color, strokeWidth: sw, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'synthese' && (
        <>
          <Path d="M3.5 15 L8.5 10 L12.5 13 L20 5" {...common} />
          <Circle cx={20} cy={5} r={1.9} fill={focused ? C.positive : color} />
        </>
      )}
      {name === 'comptes' && (
        <>
          <Rect x={3} y={6} width={18} height={12} rx={3} {...common} />
          <Path d="M3 10 H21" stroke={color} strokeWidth={sw} strokeLinecap="round" fill="none" />
          <Circle cx={16.5} cy={14} r={1.4} fill={color} />
        </>
      )}
      {name === 'immobilier' && (
        <>
          <Path d="M3 11 L12 4 L21 11" {...common} />
          <Path d="M5.5 9.5 V20 H18.5 V9.5" {...common} />
          <Path d="M10 20 V15 H14 V20" {...common} />
        </>
      )}
      {name === 'emprunts' && (
        <>
          <Path d="M18.5 5.5 L5.5 18.5" {...common} />
          <Circle cx={7} cy={7} r={2.5} {...common} />
          <Circle cx={17} cy={17} r={2.5} {...common} />
        </>
      )}
      {name === 'parametres' && (
        <>
          <Path d="M3 6 H12.5" {...common} />
          <Circle cx={16} cy={6} r={2.4} {...common} />
          <Path d="M19.5 6 H21" {...common} />
          <Path d="M3 12 H4.5" {...common} />
          <Circle cx={8} cy={12} r={2.4} {...common} />
          <Path d="M11.5 12 H21" {...common} />
          <Path d="M3 18 H8.5" {...common} />
          <Circle cx={12} cy={18} r={2.4} {...common} />
          <Path d="M15.5 18 H21" {...common} />
        </>
      )}
    </Svg>
  );
}
