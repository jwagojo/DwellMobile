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
import { Warn } from './Icons';

/* Ports of the web's spec §4.2 buttons and §4.4 form primitives (src/components/ui.tsx, form.tsx). */

/* ---------- Screen ---------- */

/** Paper background, safe areas, scrolling, and the keyboard pushing the form up instead of covering it. */
export function Screen({ children, header, scroll = true }: { children: ReactNode; header?: ReactNode; scroll?: boolean }) {
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      {header}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? (
          <ScrollView style={styles.surface} contentContainerStyle={styles.scrollBody} keyboardShouldPersistTaps="handled">
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

/* ---------- Notes ---------- */

export function WarnNote({ children }: { children: ReactNode }) {
  return (
    <View style={styles.warn} accessibilityRole="alert">
      <Warn size={16} color={colors.amberInk} />
      <Text style={styles.warnText}>{children}</Text>
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
});
