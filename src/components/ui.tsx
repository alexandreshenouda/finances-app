/** Primitives UI partagées : cartes, boutons, champs, badges. */
import { C, FONT, RADIUS, SPACE, TABULAR, TOUCH_MIN, useStyles, withAlpha } from '@/constants/theme';
import { PERIODS_PRIMARY, PERIODS_SECONDARY, type ObjectiveCategory, type Period } from '@/lib/types';
import { Picker } from '@react-native-picker/picker';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Dimensions,
    Modal,
    PanResponder,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
    type StyleProp,
    type TextInputProps,
    type ViewInstance,
    type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

/** Zone tactile élargie des petites commandes (puces, segments) : ~36 px visibles, 44+ au toucher. */
const SMALL_HIT_SLOP = { top: 6, bottom: 6, left: 2, right: 2 } as const;

function makeStyles() {
  return StyleSheet.create({
    card: {
      backgroundColor: C.card,
      borderRadius: RADIUS.md,
      padding: 16,
      marginBottom: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
    },
    sectionTitle: {
      color: C.textDim,
      fontSize: FONT.sm,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: 8,
      marginTop: 8,
    },
    button: {
      borderRadius: RADIUS.sm,
      paddingVertical: 12,
      paddingHorizontal: 16,
      minHeight: TOUCH_MIN,
      alignItems: 'center',
      justifyContent: 'center',
      marginVertical: 4,
    },
    buttonText: { fontSize: FONT.md, fontWeight: '600' },
    fieldLabel: { color: C.textDim, fontSize: FONT.sm, marginBottom: 6 },
    fieldHint: { color: C.textFaint, fontSize: FONT.sm, marginTop: 4 },
    input: {
      backgroundColor: C.cardAlt,
      borderRadius: RADIUS.sm,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: C.text,
      fontSize: FONT.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
    },
    pickerWrap: {
      backgroundColor: C.cardAlt,
      borderRadius: RADIUS.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
      overflow: 'hidden',
    },
    picker: { color: C.text, backgroundColor: 'transparent', borderWidth: 0, height: 44, paddingHorizontal: 8 },
    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    chip: {
      backgroundColor: C.cardAlt,
      borderRadius: RADIUS.pill,
      paddingHorizontal: 14,
      paddingVertical: 9,
      minHeight: 36,
      justifyContent: 'center',
    },
    chipText: { color: C.textDim, fontSize: FONT.sm },
    checkboxRow: { flexDirection: 'row', alignItems: 'center', minHeight: 32 },
    checkboxBox: {
      width: 20,
      height: 20,
      borderRadius: RADIUS.xs,
      borderWidth: 1.5,
      borderColor: C.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 8,
    },
    checkboxBoxOn: { backgroundColor: C.accent, borderColor: C.accent },
    checkboxTick: { color: C.onAccent, fontSize: FONT.sm, fontWeight: '700', lineHeight: 16 },
    checkboxLabel: { color: C.text, fontSize: FONT.md },
    menuBackdrop: { flex: 1 },
    menu: {
      position: 'absolute',
      backgroundColor: C.card,
      borderRadius: RADIUS.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
      paddingVertical: 4,
      minWidth: 88,
      shadowColor: '#000',
      shadowOpacity: 0.3,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 8,
    },
    menuItem: { paddingVertical: 10, paddingHorizontal: 16, minHeight: TOUCH_MIN, justifyContent: 'center' },
    menuItemText: { color: C.text, fontSize: FONT.md },
    pressed: { opacity: 0.65 },
    cardPressed: { backgroundColor: C.cardAlt },
    listCard: { paddingVertical: 0, paddingHorizontal: 0, overflow: 'hidden' },
    listRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: SPACE.md,
      paddingHorizontal: SPACE.lg,
      minHeight: 52,
    },
    listRowPressed: { backgroundColor: C.cardAlt },
    listRowSeparator: { height: StyleSheet.hairlineWidth, backgroundColor: C.border, marginLeft: SPACE.lg },
    listRowLeft: { marginRight: SPACE.md },
    listRowTitle: { color: C.text, fontSize: FONT.md, fontWeight: '500' },
    listRowSub: { color: C.textFaint, fontSize: FONT.sm, marginTop: 2 },
    listRowRight: { alignItems: 'flex-end', marginLeft: SPACE.sm },
    listRowValue: { color: C.text, fontSize: FONT.md, fontWeight: '600', ...TABULAR },
    listRowValueSub: { fontSize: FONT.sm, fontWeight: '600', marginTop: 2, color: C.textDim, ...TABULAR },
    chevronWrap: { marginLeft: SPACE.sm, width: 16, alignItems: 'center' },
    groupHeader: { flexDirection: 'row', alignItems: 'center', marginTop: SPACE.lg, marginBottom: SPACE.sm },
    groupTitle: {
      color: C.textDim,
      fontSize: FONT.sm,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      flex: 1,
    },
    groupTotal: { color: C.textDim, fontSize: FONT.sm, fontWeight: '600', ...TABULAR },
    segmented: {
      flexDirection: 'row',
      alignSelf: 'flex-start',
      backgroundColor: C.bg,
      borderRadius: RADIUS.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
      padding: 2,
    },
    segment: { paddingHorizontal: SPACE.md, paddingVertical: 8, borderRadius: RADIUS.sm - 2, justifyContent: 'center' },
    segmentActive: { backgroundColor: C.cardAlt },
    segmentText: { color: C.textDim, fontSize: FONT.sm },
    segmentTextActive: { color: C.accent, fontWeight: '700' },
    pill: { alignSelf: 'flex-start', borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 3 },
    pillText: { fontSize: FONT.sm, fontWeight: '700', ...TABULAR },
    emptyState: { alignItems: 'center', paddingVertical: SPACE.xl, paddingHorizontal: SPACE.lg },
    emptyIcon: {
      width: 64,
      height: 64,
      borderRadius: RADIUS.pill,
      backgroundColor: C.cardAlt,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: SPACE.md,
    },
    emptyTitle: { color: C.text, fontSize: FONT.lg, fontWeight: '600', textAlign: 'center', marginBottom: SPACE.xs },
    emptyText: { color: C.textDim, fontSize: FONT.md, lineHeight: 21, textAlign: 'center' },
    emptyAction: { alignSelf: 'stretch', marginTop: SPACE.lg },
    empty: { color: C.textFaint, fontSize: FONT.md, textAlign: 'center', paddingVertical: 24 },
    sliderTrack: {
      height: 28,
      justifyContent: 'center',
    },
    sliderBase: {
      position: 'absolute',
      left: 0,
      right: 0,
      height: 6,
      borderRadius: RADIUS.xs,
      backgroundColor: C.cardAlt,
    },
    sliderFill: {
      position: 'absolute',
      left: 0,
      height: 6,
      borderRadius: RADIUS.xs,
    },
    sliderThumb: {
      position: 'absolute',
      width: 20,
      height: 20,
      borderRadius: RADIUS.pill,
      marginLeft: -10,
      backgroundColor: C.card,
      borderWidth: 3,
    },
  });
}

/** Carte. Avec `onPress`, toute la carte devient pressable (fond `cardAlt` à l'appui). */
export function Card({
  children,
  style,
  onPress,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}) {
  const styles = useStyles(makeStyles);
  if (!onPress) return <View style={[styles.card, style]}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed, style]}
    >
      {children}
    </Pressable>
  );
}

/** Chevron « aller au détail » au trait (remplace le caractère `›`). */
export function Chevron({
  color = C.textFaint,
  size = 16,
  direction = 'right',
}: {
  color?: string;
  size?: number;
  direction?: 'right' | 'down' | 'up';
}) {
  const rotate = direction === 'down' ? '90deg' : direction === 'up' ? '-90deg' : '0deg';
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ transform: [{ rotate }] }}>
      <Path d="M9 5l7 7-7 7" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Carte sans marge intérieure, destinée à contenir des `ListRow` (surbrillance bord à bord). */
export function ListCard({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const styles = useStyles(makeStyles);
  return <Card style={[styles.listCard, style]}>{children}</Card>;
}

/**
 * Ligne de liste partagée (comptes, postes du budget, menus des paramètres…) :
 * libellé + sous-titre à gauche, valeur + sous-valeur à droite, chevron si pressable.
 * À placer dans une `ListCard` ; passer `last` sur la dernière ligne (pas de séparateur).
 */
export function ListRow({
  title,
  subtitle,
  value,
  valueSub,
  valueColor,
  valueSubColor,
  left,
  onPress,
  disabled,
  last,
  chevron,
  expanded,
}: {
  title: string;
  subtitle?: string;
  value?: string;
  valueSub?: string;
  valueColor?: string;
  valueSubColor?: string;
  /** Élément à gauche du libellé (icône, pastille de couleur). */
  left?: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  last?: boolean;
  /** Par défaut : affiché quand la ligne est pressable. */
  chevron?: boolean;
  /** Ligne d'en-tête repliable : chevron vers le bas (replié) ou le haut (déplié). */
  expanded?: boolean;
}) {
  const styles = useStyles(makeStyles);
  const pressable = !!onPress && !disabled;
  const showChevron = chevron ?? pressable;
  return (
    <>
      <Pressable
        onPress={onPress}
        disabled={!pressable}
        accessibilityRole={pressable ? 'button' : undefined}
        accessibilityState={expanded === undefined ? undefined : { expanded }}
        accessibilityLabel={[title, subtitle, value, valueSub].filter(Boolean).join(', ')}
        style={({ pressed }) => [styles.listRow, pressed && styles.listRowPressed]}
      >
        {left ? <View style={styles.listRowLeft}>{left}</View> : null}
        <View style={{ flex: 1 }}>
          <Text style={styles.listRowTitle}>{title}</Text>
          {subtitle ? <Text style={styles.listRowSub}>{subtitle}</Text> : null}
        </View>
        {value !== undefined || valueSub !== undefined ? (
          <View style={styles.listRowRight}>
            {value !== undefined ? (
              <Text style={[styles.listRowValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
            ) : null}
            {valueSub ? (
              <Text style={[styles.listRowValueSub, valueSubColor ? { color: valueSubColor } : null]}>{valueSub}</Text>
            ) : null}
          </View>
        ) : null}
        <View style={styles.chevronWrap}>{showChevron ? (
            <Chevron direction={expanded === undefined ? 'right' : expanded ? 'up' : 'down'} />
          ) : null}</View>
      </Pressable>
      {!last && <View style={styles.listRowSeparator} />}
    </>
  );
}

/** En-tête d'un groupe de lignes : pastille optionnelle, titre en capitales, total à droite.
 *  Avec `onPress` + `expanded`, l'en-tête replie / déplie son groupe. */
export function GroupHeader({
  title,
  total,
  color,
  onPress,
  expanded,
}: {
  title: string;
  total?: string;
  color?: string;
  onPress?: () => void;
  expanded?: boolean;
}) {
  const styles = useStyles(makeStyles);
  const content = (
    <>
      {color ? <Dot color={color} /> : null}
      <Text style={styles.groupTitle}>{title}</Text>
      {total !== undefined ? <Text style={styles.groupTotal}>{total}</Text> : null}
      {onPress ? (
        <View style={styles.chevronWrap}>
          <Chevron direction={expanded ? 'up' : 'down'} />
        </View>
      ) : null}
    </>
  );
  if (!onPress) return <View style={styles.groupHeader}>{content}</View>;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ expanded: !!expanded }}
      style={({ pressed }) => [styles.groupHeader, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  const styles = useStyles(makeStyles);
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useStyles(makeStyles);
  const bg =
    variant === 'primary' ? C.accent : variant === 'danger' ? withAlpha(C.negative, 0.15) : C.cardAlt;
  const color = variant === 'danger' ? C.negative : variant === 'primary' ? C.onAccent : C.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled || loading ? 0.5 : pressed ? 0.8 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={color} size="small" />
      ) : (
        <Text style={[styles.buttonText, { color }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  hint,
  ...inputProps
}: TextInputProps & { label: string; hint?: string }) {
  const styles = useStyles(makeStyles);
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        placeholderTextColor={C.textFaint}
        {...inputProps}
        style={[styles.input, inputProps.multiline && { minHeight: 80, textAlignVertical: 'top' }]}
      />
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

/** Sélecteur horizontal de valeurs (types de comptes, périodes, sources…). */
export function Chips<T extends string>({
  options,
  value,
  onChange,
  labels,
  style,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  labels?: Partial<Record<T, string>>;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useStyles(makeStyles);
  return (
    <View style={[styles.chipsRow, style]}>
      {options.map((opt) => {
        const active = opt === value;
        return (
          <Pressable
            key={opt}
            onPress={() => onChange(opt)}
            hitSlop={SMALL_HIT_SLOP}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [styles.chip, active && { backgroundColor: C.accent }, pressed && styles.pressed]}
          >
            <Text style={[styles.chipText, active && { color: C.onAccent, fontWeight: '600' }]}>
              {labels?.[opt] ?? opt}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Bascule entre deux ou trois **vues** d'une même donnée (Net/Brut, Valeur/Performance,
 * Barre/Camembert). À ne pas confondre avec `Chips`, réservé aux filtres et aux choix de valeur.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  labels,
  style,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  labels?: Partial<Record<T, string>>;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useStyles(makeStyles);
  return (
    <View style={[styles.segmented, style]}>
      {options.map((opt) => {
        const active = opt === value;
        return (
          <Pressable
            key={opt}
            onPress={() => onChange(opt)}
            hitSlop={SMALL_HIT_SLOP}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [styles.segment, active && styles.segmentActive, pressed && styles.pressed]}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{labels?.[opt] ?? opt}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Pastille colorée (variation sur la période, statut) : texte `color` sur fond `color` à 14 %. */
export function Pill({ text, color, style }: { text: string; color: string; style?: StyleProp<ViewStyle> }) {
  const styles = useStyles(makeStyles);
  return (
    <View style={[styles.pill, { backgroundColor: withAlpha(color, 0.14) }, style]}>
      <Text style={[styles.pillText, { color }]}>{text}</Text>
    </View>
  );
}

/** Case à cocher avec libellé, alignée à gauche. */
export function Checkbox({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const styles = useStyles(makeStyles);
  return (
    <Pressable
      style={({ pressed }) => [styles.checkboxRow, pressed && styles.pressed]}
      onPress={() => onChange(!value)}
      hitSlop={8}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
    >
      <View style={[styles.checkboxBox, value && styles.checkboxBoxOn]}>
        {value && <Text style={styles.checkboxTick}>✓</Text>}
      </View>
      <Text style={styles.checkboxLabel}>{label}</Text>
    </Pressable>
  );
}

/**
 * Sélecteur de période : 5 échelles courantes en puces, les autres dans un
 * menu déroulant. La puce « ··· » reprend l'échelle secondaire active si besoin.
 */
export function PeriodChips({
  value,
  onChange,
  style,
}: {
  value: Period;
  onChange: (p: Period) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useStyles(makeStyles);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const triggerRef = useRef<ViewInstance>(null);

  const secondaryActive = PERIODS_SECONDARY.includes(value);
  const moreLabel = secondaryActive ? value : '···';

  const openMenu = () => {
    triggerRef.current?.measureInWindow((x, y, w, h) => {
      setAnchor({ x, y, w, h });
      setOpen(true);
    });
  };

  const screenW = Dimensions.get('window').width;

  return (
    <View style={[styles.chipsRow, style]}>
      {PERIODS_PRIMARY.map((opt) => {
        const active = opt === value;
        return (
          <Pressable
            key={opt}
            onPress={() => onChange(opt)}
            hitSlop={SMALL_HIT_SLOP}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [styles.chip, active && { backgroundColor: C.accent }, pressed && styles.pressed]}
          >
            <Text style={[styles.chipText, active && { color: C.onAccent, fontWeight: '600' }]}>{opt}</Text>
          </Pressable>
        );
      })}
      <Pressable
        ref={triggerRef}
        onPress={openMenu}
        hitSlop={SMALL_HIT_SLOP}
        accessibilityRole="button"
        accessibilityState={{ selected: secondaryActive, expanded: open }}
        style={({ pressed }) => [styles.chip, secondaryActive && { backgroundColor: C.accent }, pressed && styles.pressed]}
      >
        <Text style={[styles.chipText, secondaryActive && { color: C.onAccent, fontWeight: '600' }]}>
          {moreLabel}
        </Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setOpen(false)}>
          <View
            style={[
              styles.menu,
              { top: anchor.y + anchor.h + 6, right: Math.max(8, screenW - (anchor.x + anchor.w)) },
            ]}
          >
            {PERIODS_SECONDARY.map((opt) => {
              const active = opt === value;
              return (
                <Pressable
                  key={opt}
                  onPress={() => {
                    onChange(opt);
                    setOpen(false);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={({ pressed }) => [styles.menuItem, pressed && styles.listRowPressed]}
                >
                  <Text style={[styles.menuItemText, active && { color: C.accent, fontWeight: '700' }]}>
                    {opt}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

/** Liste déroulante générique (devise, etc.) sur base du Picker natif. */
export function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
  hint,
  enabled = true,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  hint?: string;
  enabled?: boolean;
}) {
  const styles = useStyles(makeStyles);
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.pickerWrap}>
        <Picker
          selectedValue={value}
          onValueChange={(v) => onChange(v as T)}
          dropdownIconColor={C.textDim}
          mode="dropdown"
          style={styles.picker}
          enabled={enabled}
        >
          {options.map((o) => (
            <Picker.Item
              key={o.value}
              label={o.label}
              value={o.value}
              color={C.text}
              style={{ backgroundColor: C.cardAlt, fontSize: FONT.md }}
            />
          ))}
        </Picker>
      </View>
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

export function Empty({ text }: { text: string }) {
  const styles = useStyles(makeStyles);
  return <Text style={styles.empty}>{text}</Text>;
}

/** État vide d'un écran ou d'une rubrique : icône au trait, phrase d'explication, action. */
export function EmptyState({
  icon,
  title,
  text,
  actionLabel,
  onAction,
}: {
  icon?: React.ReactNode;
  title?: string;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.emptyState}>
      {icon ? <View style={styles.emptyIcon}>{icon}</View> : null}
      {title ? <Text style={styles.emptyTitle}>{title}</Text> : null}
      <Text style={styles.emptyText}>{text}</Text>
      {actionLabel && onAction ? <Button title={actionLabel} onPress={onAction} style={styles.emptyAction} /> : null}
    </View>
  );
}

export function Dot({ color, size = 10 }: { color: string; size?: number }) {
  return (
    <View
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, marginRight: 8 }}
    />
  );
}

/** Durée des petites transitions (remplissage des barres, apparition de contenu). */
export const MOTION_MS = 220;

/** Barre de progression remplie (ratio 0..1), ex : capital remboursé d'un crédit.
 *  Le remplissage glisse vers sa nouvelle valeur (sauf si le système réduit les animations). */
export function ProgressBar({ ratio, color = C.accent, height = 10 }: { ratio: number; color?: string; height?: number }) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
  const progress = useSharedValue(pct);
  useEffect(() => {
    progress.value = withTiming(pct, { duration: MOTION_MS });
  }, [pct, progress]);
  const fill = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}
      style={{ height, borderRadius: height / 2, backgroundColor: C.cardAlt, overflow: 'hidden' }}
    >
      <Animated.View style={[{ height: '100%', backgroundColor: color, borderRadius: height / 2 }, fill]} />
    </View>
  );
}

/** Enveloppe qui fait apparaître son contenu en fondu (changement de rubrique, détail déplié).
 *  Donner une `key` différente à chaque contenu pour rejouer l'apparition. */
export function FadeInView({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const opacity = useSharedValue(0);
  useEffect(() => {
    opacity.value = withTiming(1, { duration: MOTION_MS });
  }, [opacity]);
  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[style, fade]}>{children}</Animated.View>;
}

/** Couleur d'une barre de progression selon le taux d'atteinte d'un objectif :
 * - épargne de précaution : rouge <30%, orange 30-95%, vert 95-120%, rouge au-delà.
 * - projets (court / long terme) : rouge <30%, orange 30-95%, vert >= 95%. */
export function objectiveProgressColor(pct: number, category?: ObjectiveCategory): string {
  if (category === 'epargne_precaution') {
    if (pct >= 95 && pct <= 120) return C.positive;
    if (pct >= 30 && pct < 95) return C.warning;
    return C.negative;
  }
  if (pct >= 95) return C.positive;
  if (pct >= 30) return C.warning;
  return C.negative;
}

/** Curseur numérique (valeur entière min..max), ex : durée en mois. Pas de dépendance
 * externe (aucune lib de slider n'est installée et l'app doit rester exportable en web) :
 * repose sur PanResponder, compatible react-native-web. */
export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  color = C.accent,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  color?: string;
}) {
  const styles = useStyles(makeStyles);
  const trackRef = useRef<ViewInstance>(null);
  const trackPageX = useRef(0);
  // Layout/props are read through refs, not state: `responder` below is created once
  // (via useRef) so its closures must read live values at call time rather than
  // capturing them — otherwise they'd stay stuck on the first render's values
  // (width === 0, before onLayout ever fires) for the component's whole lifetime.
  const width = useRef(0);
  const params = useRef({ min, max, step, onChange });
  params.current = { min, max, step, onChange };

  const ratio = Math.max(0, Math.min(1, (value - min) / (max - min)));

  const handleTouch = (pageX: number) => {
    if (width.current <= 0) return;
    const { min, max, step, onChange } = params.current;
    const r = Math.max(0, Math.min(1, (pageX - trackPageX.current) / width.current));
    const raw = min + r * (max - min);
    const stepped = Math.round(raw / step) * step;
    onChange(Math.max(min, Math.min(max, stepped)));
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => handleTouch(e.nativeEvent.pageX),
      onPanResponderMove: (e) => handleTouch(e.nativeEvent.pageX),
    })
  ).current;

  return (
    <View
      ref={trackRef}
      onLayout={(e) => {
        width.current = e.nativeEvent.layout.width;
        trackRef.current?.measure((_x, _y, _w, _h, pageX) => {
          trackPageX.current = pageX;
        });
      }}
      style={styles.sliderTrack}
      accessibilityRole="adjustable"
      accessibilityValue={{ min, max, now: value }}
      {...responder.panHandlers}
    >
      <View style={styles.sliderBase} />
      <View style={[styles.sliderFill, { width: `${ratio * 100}%`, backgroundColor: color }]} />
      <View style={[styles.sliderThumb, { left: `${ratio * 100}%`, borderColor: color }]} />
    </View>
  );
}
