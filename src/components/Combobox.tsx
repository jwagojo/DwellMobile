import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, fonts, radius, space, text } from '@/theme';

/**
 * Port of the web's src/components/Combobox.tsx with the same rules:
 * - Remote search is debounced, needs `minChars`, and cancels the previous request when the text changes.
 * - `localOptions` are instant (for example T stations) and shown even before `minChars`.
 * - Shows searching, empty and error states.
 * On a phone the suggestions open as a list right under the field (not a floating dropdown), so a scrolling screen
 * never clips them.
 */
export interface ComboOption<T> {
  id: string;
  primary: string;
  secondary?: string;
  badge?: string;
  payload: T;
}
export type ComboSearchResult<T> = { ok: true; options: ComboOption<T>[] } | { ok: false; message: string; aborted?: boolean };
export type ComboSearch<T> = (query: string, signal: AbortSignal) => Promise<ComboSearchResult<T>>;

type Status = 'idle' | 'loading' | 'done' | 'error';

export default function Combobox<T>({
  label,
  value,
  onInputChange,
  onSelect,
  search,
  localOptions,
  minChars = 3,
  debounceMs = 300,
  placeholder,
  hint,
  error,
  emptyText = 'No matching addresses. Check the spelling, or try the street and town.',
  onBlur,
  unavailableNote,
  footerNote,
}: {
  label: string;
  value: string;
  onInputChange: (text: string) => void;
  onSelect: (option: ComboOption<T>) => void;
  search: ComboSearch<T>;
  localOptions?: (query: string) => ComboOption<T>[];
  minChars?: number;
  debounceMs?: number;
  placeholder?: string;
  hint?: string;
  error?: string;
  emptyText?: string;
  onBlur?: () => void;
  unavailableNote?: string;
  footerNote?: string;
}) {
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [remote, setRemote] = useState<ComboOption<T>[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const typed = useRef(false); // true only for text the person typed, not text the parent set after a selection
  const abortRef = useRef<AbortController | null>(null);
  const searchRef = useRef(search);
  searchRef.current = search;
  // A tap on a suggestion blurs the field first; remember it so the blur doesn't undo the choice.
  const choosing = useRef(false);

  const query = value.trim();
  const local = useMemo(() => (query ? (localOptions?.(query) ?? []) : []), [localOptions, query]);
  const options = useMemo(() => [...local, ...remote], [local, remote]);

  useEffect(() => {
    if (!typed.current) return;
    setRemote([]);
    if (query.length < minChars) {
      setStatus('idle');
      return;
    }
    setStatus('loading');
    const timer = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      const result = await searchRef.current(query, controller.signal);
      if (controller.signal.aborted) return; // a newer search replaced this one
      if (result.ok) {
        setRemote(result.options);
        setStatus('done');
      } else if (!result.aborted) {
        setErrorMsg(result.message);
        setStatus('error');
      }
    }, debounceMs);
    return () => {
      clearTimeout(timer);
      abortRef.current?.abort(); // cancel the stale in-flight request
    };
  }, [query, minChars, debounceMs]);

  useEffect(() => () => abortRef.current?.abort(), []);

  function choose(option: ComboOption<T>) {
    typed.current = false;
    abortRef.current?.abort();
    setOpen(false);
    setRemote([]);
    setStatus('idle');
    onSelect(option);
  }

  const tooShort = query.length > 0 && query.length < minChars;
  const showEmpty = status === 'done' && options.length === 0;
  const showList = open && query.length > 0 && (options.length > 0 || status !== 'idle' || tooShort);

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={error ?? hint}
        value={value}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        autoCorrect={false}
        autoCapitalize="words"
        returnKeyType="search"
        clearButtonMode="while-editing"
        onChangeText={(t) => {
          typed.current = true;
          setOpen(true);
          onInputChange(t);
        }}
        onFocus={() => {
          setFocused(true);
          if (query) setOpen(true);
        }}
        onBlur={() => {
          setFocused(false);
          // Let a tap on a suggestion land before the list closes.
          setTimeout(() => {
            if (choosing.current) return;
            setOpen(false);
            onBlur?.();
          }, 150);
        }}
        onSubmitEditing={() => {
          if (options.length > 0) choose(options[0]);
        }}
        style={[styles.input, { borderColor: error ? colors.amberInk : focused ? colors.brand : colors.muted }, focused && styles.inputFocused]}
      />

      {showList ? (
        <View style={styles.list} accessibilityRole="list" accessibilityLabel={`${label} suggestions`}>
          {options.map((o) => (
            <Pressable
              key={o.id}
              accessibilityRole="button"
              accessibilityLabel={[o.primary, o.secondary, o.badge].filter(Boolean).join(', ')}
              onPressIn={() => {
                choosing.current = true;
              }}
              onPress={() => {
                choosing.current = false;
                choose(o);
              }}
              style={({ pressed }) => [styles.option, pressed && { backgroundColor: colors.brandWash }]}
            >
              <View style={styles.optionText}>
                <Text style={styles.primary} numberOfLines={1}>
                  {o.primary}
                </Text>
                {o.secondary ? (
                  <Text style={styles.secondary} numberOfLines={1}>
                    {o.secondary}
                  </Text>
                ) : null}
              </View>
              {o.badge ? <Text style={styles.badge}>{o.badge}</Text> : null}
            </Pressable>
          ))}
          {status === 'loading' ? <Text style={styles.note}>Searching…</Text> : null}
          {showEmpty ? <Text style={styles.noteBody}>{emptyText}</Text> : null}
          {status === 'error' ? (
            <Text style={styles.noteError}>
              {errorMsg}
              {unavailableNote ? ` ${unavailableNote}` : ''}
            </Text>
          ) : null}
          {footerNote && options.length > 0 ? <Text style={styles.footer}>{footerNote}</Text> : null}
          {tooShort && local.length === 0 ? <Text style={styles.note}>Type at least {minChars} characters to search.</Text> : null}
        </View>
      ) : null}

      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: { fontFamily: fonts.bodyMedium, fontSize: text.sm, color: colors.ink },
  input: { height: 48, borderWidth: 1, borderRadius: radius.card, backgroundColor: colors.paper, paddingHorizontal: 14, fontFamily: fonts.body, fontSize: text.md, color: colors.ink },
  inputFocused: { borderWidth: 2, paddingHorizontal: 13 },
  list: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.card, backgroundColor: colors.paper, overflow: 'hidden' },
  option: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: 14, paddingVertical: space.xs, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  optionText: { flex: 1 },
  primary: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.ink },
  secondary: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  badge: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.muted },
  note: { paddingHorizontal: 14, paddingVertical: 10, fontFamily: fonts.bodyMedium, fontSize: text.sm, color: colors.muted },
  noteBody: { paddingHorizontal: 14, paddingVertical: 10, fontFamily: fonts.body, fontSize: text.sm, color: colors.body },
  noteError: { paddingHorizontal: 14, paddingVertical: 10, fontFamily: fonts.bodyMedium, fontSize: text.sm, color: colors.amberInk },
  footer: { paddingHorizontal: 14, paddingTop: 6, paddingBottom: 4, fontFamily: fonts.body, fontSize: 12, color: colors.muted },
  hint: { fontFamily: fonts.body, fontSize: text.xs, color: colors.muted },
  error: { fontFamily: fonts.bodyMedium, fontSize: text.xs, color: colors.amberInk },
});
