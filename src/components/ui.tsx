/** Primitives UI partagées : cartes, boutons, champs, badges. */
import { Picker } from '@react-native-picker/picker';
import React, { useRef, useState } from 'react';
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
  type ViewStyle,
} from 'react-native';
import { C } from '@/constants/theme';
import { PERIODS_PRIMARY, PERIODS_SECONDARY, type Period } from '@/lib/types';

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
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
  const bg =
    variant === 'primary' ? C.accent : variant === 'danger' ? 'rgba(248,113,113,0.15)' : C.cardAlt;
  const color = variant === 'danger' ? C.negative : variant === 'primary' ? '#fff' : C.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
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
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  labels?: Partial<Record<T, string>>;
}) {
  return (
    <View style={styles.chipsRow}>
      {options.map((opt) => {
        const active = opt === value;
        return (
          <Pressable
            key={opt}
            onPress={() => onChange(opt)}
            style={[styles.chip, active && { backgroundColor: C.accent }]}
          >
            <Text style={[styles.chipText, active && { color: '#fff', fontWeight: '600' }]}>
              {labels?.[opt] ?? opt}
            </Text>
          </Pressable>
        );
      })}
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
  return (
    <Pressable style={styles.checkboxRow} onPress={() => onChange(!value)} hitSlop={8}>
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
export function PeriodChips({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const triggerRef = useRef<View>(null);

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
    <View style={styles.chipsRow}>
      {PERIODS_PRIMARY.map((opt) => {
        const active = opt === value;
        return (
          <Pressable
            key={opt}
            onPress={() => onChange(opt)}
            style={[styles.chip, active && { backgroundColor: C.accent }]}
          >
            <Text style={[styles.chipText, active && { color: '#fff', fontWeight: '600' }]}>{opt}</Text>
          </Pressable>
        );
      })}
      <Pressable
        ref={triggerRef}
        onPress={openMenu}
        style={[styles.chip, secondaryActive && { backgroundColor: C.accent }]}
      >
        <Text style={[styles.chipText, secondaryActive && { color: '#fff', fontWeight: '600' }]}>
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
                  style={styles.menuItem}
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
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  hint?: string;
}) {
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
        >
          {options.map((o) => (
            <Picker.Item
              key={o.value}
              label={o.label}
              value={o.value}
              color={C.text}
              style={{ backgroundColor: C.cardAlt, fontSize: 15 }}
            />
          ))}
        </Picker>
      </View>
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

export function Empty({ text }: { text: string }) {
  return <Text style={styles.empty}>{text}</Text>;
}

export function Dot({ color, size = 10 }: { color: string; size?: number }) {
  return (
    <View
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, marginRight: 8 }}
    />
  );
}

/** Barre de progression remplie (ratio 0..1), ex : capital remboursé d'un crédit. */
export function ProgressBar({ ratio, color = C.accent, height = 10 }: { ratio: number; color?: string; height?: number }) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: C.cardAlt, overflow: 'hidden' }}>
      <View style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: color, borderRadius: height / 2 }} />
    </View>
  );
}

/** Couleur d'une barre de progression selon le taux d'atteinte d'un objectif :
 * rouge <30%, orange 30-95%, vert 95-120%, rouge au-delà. */
export function objectiveProgressColor(pct: number): string {
  if (pct >= 95 && pct <= 120) return C.positive;
  if (pct >= 30 && pct < 95) return C.warning;
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
  const trackRef = useRef<View>(null);
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
      {...responder.panHandlers}
    >
      <View style={styles.sliderBase} />
      <View style={[styles.sliderFill, { width: `${ratio * 100}%`, backgroundColor: color }]} />
      <View style={[styles.sliderThumb, { left: `${ratio * 100}%`, borderColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  sectionTitle: {
    color: C.textDim,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 8,
  },
  button: {
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
  },
  buttonText: { fontSize: 15, fontWeight: '600' },
  fieldLabel: { color: C.textDim, fontSize: 13, marginBottom: 6 },
  fieldHint: { color: C.textFaint, fontSize: 12, marginTop: 4 },
  input: {
    backgroundColor: C.cardAlt,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: C.text,
    fontSize: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  pickerWrap: {
    backgroundColor: C.cardAlt,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    overflow: 'hidden',
  },
  picker: { color: C.text, backgroundColor: 'transparent', borderWidth: 0, height: 44, paddingHorizontal: 8 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: {
    backgroundColor: C.cardAlt,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipText: { color: C.textDim, fontSize: 13 },
  checkboxRow: { flexDirection: 'row', alignItems: 'center' },
  checkboxBox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  checkboxBoxOn: { backgroundColor: C.accent, borderColor: C.accent },
  checkboxTick: { color: '#fff', fontSize: 12, fontWeight: '700', lineHeight: 16 },
  checkboxLabel: { color: C.text, fontSize: 14 },
  menuBackdrop: { flex: 1 },
  menu: {
    position: 'absolute',
    backgroundColor: C.card,
    borderRadius: 12,
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
  menuItem: { paddingVertical: 10, paddingHorizontal: 16 },
  menuItemText: { color: C.text, fontSize: 14 },
  empty: { color: C.textFaint, fontSize: 14, textAlign: 'center', paddingVertical: 24 },
  sliderTrack: {
    height: 28,
    justifyContent: 'center',
  },
  sliderBase: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.cardAlt,
  },
  sliderFill: {
    position: 'absolute',
    left: 0,
    height: 6,
    borderRadius: 3,
  },
  sliderThumb: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    marginLeft: -10,
    backgroundColor: C.card,
    borderWidth: 3,
  },
});
