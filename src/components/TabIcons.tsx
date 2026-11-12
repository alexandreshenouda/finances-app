/** Icônes des onglets, style ligne cohérent avec le logo, teintées par l'état actif/inactif. */
import React from 'react';
import type { ColorValue } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { C } from '@/constants/theme';

export type TabName =
  | 'synthese'
  | 'comptes'
  | 'immobilier'
  | 'emprunts'
  | 'diversification'
  | 'ai'
  | 'budget'
  | 'parametres'
  // Icônes de lignes de menu / d'états vides (même style, pas des onglets).
  | 'connexions'
  | 'sauvegarde'
  | 'affichage'
  | 'langue'
  | 'historique'
  | 'developpeur'
  | 'objectif'
  | 'rafraichir';

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
      {name === 'diversification' && (
        <>
          <Circle cx={12} cy={12} r={8.5} {...common} />
          <Path d="M12 12 V3.5" {...common} />
          <Path d="M12 12 L18.5 15.5" {...common} />
          <Path d="M12 12 L6 16" {...common} />
          <Circle cx={12} cy={12} r={1.6} fill={focused ? C.positive : color} />
        </>
      )}
      {name === 'ai' && (
        <>
          <Path d="M12 3.5 L14.2 9.8 L20.5 12 L14.2 14.2 L12 20.5 L9.8 14.2 L3.5 12 L9.8 9.8 Z" {...common} />
          <Path d="M19 4 V7 M17.5 5.5 H20.5" {...common} />
          <Circle cx={12} cy={12} r={1.6} fill={focused ? C.positive : color} />
        </>
      )}
      {name === 'budget' && (
        <>
          <Path d="M8 19 V5" {...common} />
          <Path d="M4 9 L8 5 L12 9" {...common} />
          <Path d="M16 5 V19" {...common} />
          <Path d="M12 15 L16 19 L20 15" {...common} />
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
      {name === 'connexions' && (
        <>
          <Path d="M10 14 a4 4 0 0 0 5.7 0 l3 -3 a4 4 0 0 0 -5.7 -5.7 l-1.2 1.2" {...common} />
          <Path d="M14 10 a4 4 0 0 0 -5.7 0 l-3 3 a4 4 0 0 0 5.7 5.7 l1.2 -1.2" {...common} />
        </>
      )}
      {name === 'sauvegarde' && (
        <>
          <Path d="M12 4 V15" {...common} />
          <Path d="M7.5 10.5 L12 15 L16.5 10.5" {...common} />
          <Path d="M4 17 V20 H20 V17" {...common} />
        </>
      )}
      {name === 'affichage' && (
        <>
          <Circle cx={12} cy={12} r={8.5} {...common} />
          <Path d="M12 3.5 V20.5" {...common} />
          <Path d="M12 7 H18.5 M12 12 H20.5 M12 17 H18.5" {...common} />
        </>
      )}
      {name === 'langue' && (
        <>
          <Circle cx={12} cy={12} r={8.5} {...common} />
          <Path d="M3.5 12 H20.5" {...common} />
          <Path d="M12 3.5 C8.5 7 8.5 17 12 20.5 C15.5 17 15.5 7 12 3.5 Z" {...common} />
        </>
      )}
      {name === 'historique' && (
        <>
          <Path d="M4 12 a8 8 0 1 0 2.6 -5.9" {...common} />
          <Path d="M4 4.5 V8.5 H8" {...common} />
          <Path d="M12 8 V12 L15 14" {...common} />
        </>
      )}
      {name === 'developpeur' && (
        <>
          <Path d="M8.5 7.5 L4 12 L8.5 16.5" {...common} />
          <Path d="M15.5 7.5 L20 12 L15.5 16.5" {...common} />
          <Path d="M13.5 5 L10.5 19" {...common} />
        </>
      )}
      {name === 'objectif' && (
        <>
          <Circle cx={12} cy={12} r={8.5} {...common} />
          <Circle cx={12} cy={12} r={4.5} {...common} />
          <Circle cx={12} cy={12} r={1.4} fill={color} />
        </>
      )}
      {name === 'rafraichir' && (
        <>
          <Path d="M20 12 a8 8 0 1 1 -2.6 -5.9" {...common} />
          <Path d="M20 4.5 V8.5 H16" {...common} />
        </>
      )}
    </Svg>
  );
}
