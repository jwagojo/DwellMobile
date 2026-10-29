import { useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, displayTracking, fonts, radius, space, text } from '@/theme';
import { Info, Plug, Warn } from './Icons';

/* Ports of the web's spec §4.2 buttons and §4.4 form primitives (src/components/ui.tsx, form.tsx). */

/* ---------- Screen ---------- */

/** Paper background, safe areas, scrolling, and the keyboard pushing the form up instead of covering it. */
export function Screen({ children, header, scroll = true, padded = true }: { children: ReactNode; header?: ReactNode; scroll?: boolean; padded?: boolean }) {
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      {header}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? (
          <ScrollView style={styles.surface} contentContainerStyle={padded ? styles.scrollBody : undefined} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.surface, styles.flex]}>{children}</View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** The bordered paper card the web puts its forms in. */
export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Title({ children }: { children: ReactNode }) {
  return (
    <Text style={styles.title} accessibilityRole="header">
      {children}
    </Text>
  );
}

export function Lead({ children }: { children: ReactNode }) {
  return <Text style={styles.lead}>{children}</Text>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <Text style={styles.sectionTitle} accessibilityRole="header">
      {children}
    </Text>
  );
}

/* ---------- Buttons ---------- */

type Variant = 'primary' | 'secondary' | 'ghost' | 'link';
type Size = 'nav' | 'md' | 'lg';

const HEIGHT: Record<Size, number> = { nav: 40, md: 48, lg: 52 };
const PAD: Record<Size, number> = { nav: 16, md: 20, lg: 24 };
const FONT: Record<Size, number> = { nav: 15, md: 16, lg: 17 };

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  block = false,
  accessibilityHint,
}: {
  label: string;
  onPress?: PressableProps['onPress'];
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  /** Full width */
  block?: boolean;
  accessibilityHint?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      accessibilityHint={accessibilityHint}
      disabled={disabled}
      onPress={onPress}
      hitSlop={size === 'nav' ? 4 : 0}
      style={({ pressed }) => [
        styles.button,
        { height: HEIGHT[size], paddingHorizontal: PAD[size] },
        block && styles.block,
        variant === 'primary' && { backgroundColor: disabled ? colors.disabled : pressed ? colors.greenDeep : colors.brand },
        variant === 'secondary' && [styles.secondary, pressed && { backgroundColor: colors.brandTint, borderColor: colors.brand }],
        variant === 'ghost' && pressed && { backgroundColor: colors.chip },
        disabled && variant !== 'primary' && styles.dimmed,
        disabled && variant === 'primary' && styles.primaryDisabled,
      ]}
    >
      {({ pressed }) => (
        <Text
          numberOfLines={1}
          style={[
            styles.buttonText,
            { fontSize: FONT[size] },
            variant === 'primary' ? styles.onInk : styles.inkText,
            variant === 'link' && [styles.linkText, pressed && { color: colors.greenDeep }],
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/** An inline text link inside a sentence ("Already have an account? Sign in"). */
export function TextLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Text accessibilityRole="link" onPress={onPress} style={styles.textLink} suppressHighlighting={false}>
      {label}
    </Text>
  );
}

/* ---------- Form ---------- */

function FieldShell({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite" accessibilityRole="alert">
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

export function TextField({ label, hint, error, ...rest }: { label: string; hint?: string; error?: string } & TextInputProps) {
  const [focused, setFocused] = useState(false);
  return (
    <FieldShell label={label} hint={hint} error={error}>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={error ?? hint}
        placeholderTextColor={colors.muted}
        {...rest}
        onFocus={(e) => {
          setFocused(true);
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          rest.onBlur?.(e);
        }}
        style={[styles.input, { borderColor: error ? colors.amberInk : focused ? colors.brand : colors.muted }, focused && styles.inputFocused]}
      />
    </FieldShell>
  );
}

export function CheckboxCard({
  checked,
  onChange,
  lead,
  children,
  error,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  lead: string;
  children?: ReactNode;
  error?: string;
}) {
  return (
    <View style={styles.field}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={lead}
        accessibilityState={{ checked }}
        accessibilityHint={error}
        onPress={() => onChange(!checked)}
        style={[styles.checkCard, checked ? styles.checkCardOn : error ? { borderColor: colors.amberInk } : null]}
      >
        <View style={[styles.box, checked && styles.boxOn]}>{checked && <Text style={styles.tick}>✓</Text>}</View>
        <Text style={styles.checkText}>
          <Text style={styles.checkLead}>{lead}</Text> {children}
        </Text>
      </Pressable>
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/** 44 px round − / + buttons around a value (web form.tsx Stepper). */
export function Stepper({ label, value, min, max, onChange, format = String }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void; format?: (n: number) => string }) {
  const step = (d: number) => onChange(Math.min(max, Math.max(min, value + d)));
  return (
    <View style={styles.stepper}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Fewer ${label.toLowerCase()}`} accessibilityState={{ disabled: value <= min }} disabled={value <= min} onPress={() => step(-1)} style={[styles.stepBtn, value <= min && styles.dimmed]}>
        <Text style={styles.stepSign}>−</Text>
      </Pressable>
      <Text style={styles.stepValue} accessibilityLabel={`${label}: ${format(value)}`} accessibilityLiveRegion="polite">
        {format(value)}
      </Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`More ${label.toLowerCase()}`} accessibilityState={{ disabled: value >= max }} disabled={value >= max} onPress={() => step(1)} style={[styles.stepBtn, value >= max && styles.dimmed]}>
        <Text style={styles.stepSign}>+</Text>
      </Pressable>
    </View>
  );
}

/* ---------- Pills (spec §4.3) ---------- */

export function Pill({ selected, onPress, label }: { selected: boolean; onPress: () => void; label: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.pill, selected ? styles.pillOn : pressed && { backgroundColor: colors.brandTint, borderColor: colors.brand }]}
    >
      <Text style={[styles.pillText, selected && { color: colors.onInk }]}>{label}</Text>
    </Pressable>
  );
}

export function Segmented<T extends string | number>({ label, options, value, onChange }: { label: string; options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={styles.segmented} accessibilityRole="radiogroup" accessibilityLabel={label}>
      <Text style={styles.segLabel}>{label}</Text>
      {options.map((o) => (
        <Pill key={String(o.value)} label={o.label} selected={o.value === value} onPress={() => onChange(o.value)} />
      ))}
    </View>
  );
}

/* ---------- Notes (spec §4.7) ---------- */

export function InfoNote({ children }: { children: ReactNode }) {
  return (
    <View style={styles.info}>
      <Info size={18} color={colors.muted} />
      <Text style={styles.infoText}>{children}</Text>
    </View>
  );
}

export function WarnNote({ children }: { children: ReactNode }) {
  return (
    <View style={styles.warn} accessibilityRole="alert">
      <Warn size={16} color={colors.amberInk} />
      <Text style={styles.warnText}>{children}</Text>
    </View>
  );
}

export function FitNote({ tone, children }: { tone: 'green' | 'amber'; children: ReactNode }) {
  const fg = tone === 'green' ? colors.greenInk : colors.amberInk;
  return (
    <View style={[styles.fit, { backgroundColor: tone === 'green' ? colors.greenBg : colors.amberBg }]}>
      {tone === 'green' ? <Plug size={16} color={fg} /> : <Warn size={16} color={fg} />}
      <Text style={[styles.fitText, { color: fg }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.paper },
  surface: { backgroundColor: colors.surface },
  scrollBody: { paddingHorizontal: space.md, paddingTop: space.lg, paddingBottom: space.xxl, gap: space.lg },
  card: {
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: radius.card,
    padding: 20,
    gap: space.lg,
  },
  title: { fontFamily: fonts.display, fontSize: 30, lineHeight: 34, letterSpacing: displayTracking(30), color: colors.ink },
  lead: { fontFamily: fonts.body, fontSize: text.md, lineHeight: 24, color: colors.body, marginTop: space.xs },
  sectionTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.ink },

  button: { borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: space.xs },
  block: { alignSelf: 'stretch' },
  secondary: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.lineStrong },
  dimmed: { opacity: 0.55 },
  primaryDisabled: { opacity: 0.55 },
  buttonText: { fontFamily: fonts.bodySemibold },
  onInk: { color: colors.onInk },
  inkText: { color: colors.ink, fontFamily: fonts.bodyMedium },
  linkText: { color: colors.brand, textDecorationLine: 'underline' },
  textLink: { fontFamily: fonts.bodyMedium, color: colors.ink, textDecorationLine: 'underline', textDecorationColor: colors.lineStrong },

  field: { gap: 6 },
  label: { fontFamily: fonts.bodyMedium, fontSize: text.sm, color: colors.ink },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: radius.card,
    backgroundColor: colors.paper,
    paddingHorizontal: 14,
    fontFamily: fonts.body,
    fontSize: text.md,
    color: colors.ink,
  },
  inputFocused: { borderWidth: 2, paddingHorizontal: 13 },
  hint: { fontFamily: fonts.body, fontSize: text.xs, lineHeight: 19, color: colors.muted },
  error: { fontFamily: fonts.bodyMedium, fontSize: text.xs, lineHeight: 19, color: colors.amberInk },

  checkCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radius.card,
    backgroundColor: colors.paper,
    padding: 14,
  },
  checkCardOn: { borderColor: colors.brand, backgroundColor: colors.brandWash },
  box: { width: 22, height: 22, borderRadius: 4, borderWidth: 1.5, borderColor: colors.muted, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  boxOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  tick: { color: colors.onInk, fontSize: 14, lineHeight: 16, fontFamily: fonts.bodyBold },
  checkText: { flex: 1, fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.body },
  checkLead: { fontFamily: fonts.bodyMedium, color: colors.ink },

  warn: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs, borderRadius: radius.card, backgroundColor: colors.amberBg, padding: 10 },
  warnText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: text.xs, lineHeight: 19, color: colors.amberInk },
  info: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: radius.card, backgroundColor: colors.surface, padding: space.sm },
  infoText: { flex: 1, fontFamily: fonts.body, fontSize: text.sm, lineHeight: 20, color: colors.body },
  fit: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs, borderRadius: radius.card, padding: space.sm },
  fitText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: text.sm, lineHeight: 20 },

  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  stepBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' },
  stepSign: { fontFamily: fonts.bodySemibold, fontSize: 22, lineHeight: 24, color: colors.ink },
  stepValue: { minWidth: 44, textAlign: 'center', fontFamily: fonts.bodySemibold, fontSize: text.md, color: colors.ink },

  pill: { height: 40, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.paper, paddingHorizontal: space.sm, justifyContent: 'center' },
  pillOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  pillText: { fontFamily: fonts.bodyMedium, fontSize: text.sm, color: colors.ink },
  segmented: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.xs },
  segLabel: { fontFamily: fonts.bodyMedium, fontSize: text.xs, color: colors.muted },
});
