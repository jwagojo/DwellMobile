import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts, radius, space, text } from '@/theme';
import { ChevronDown } from './Icons';

export interface SelectOption<T> {
  value: T;
  label: string;
  disabled?: boolean;
}

/**
 * The phone version of the web's <select> (form.tsx SelectField): a field that opens a bottom sheet listing the
 * options, with the current one marked. Disabled options (past start hours) are shown but can't be picked.
 * `compact` is the inline, underlined form the web uses inside a sentence ("Today from 10 AM for 4 h").
 */
export default function SelectField<T extends string | number>({
  label,
  value,
  options,
  onChange,
  compact = false,
}: {
  label: string;
  value: T;
  options: SelectOption<T>[];
  onChange: (v: T) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <View style={compact ? undefined : styles.field}>
      {!compact && <Text style={styles.label}>{label}</Text>}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current?.label ?? 'none'}`}
        accessibilityHint="Opens a list to choose from"
        onPress={() => setOpen(true)}
        style={compact ? styles.compact : styles.control}
      >
        <Text numberOfLines={1} style={compact ? styles.compactText : styles.controlText}>
          {current?.label ?? 'Choose'}
        </Text>
        {!compact && <ChevronDown size={18} color={colors.muted} />}
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} accessibilityLabel="Close" onPress={() => setOpen(false)} />
        <SafeAreaView edges={['bottom']} style={styles.sheet}>
          <Text style={styles.sheetTitle} accessibilityRole="header">
            {label}
          </Text>
          <FlatList
            data={options}
            keyExtractor={(o) => String(o.value)}
            initialScrollIndex={Math.max(0, options.findIndex((o) => o.value === value))}
            getItemLayout={(_, i) => ({ length: ROW, offset: ROW * i, index: i })}
            renderItem={({ item }) => {
              const selected = item.value === value;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected, disabled: item.disabled }}
                  disabled={item.disabled}
                  onPress={() => {
                    onChange(item.value);
                    setOpen(false);
                  }}
                  style={({ pressed }) => [styles.row, selected && styles.rowOn, pressed && { backgroundColor: colors.brandTint }]}
                >
                  <Text style={[styles.rowText, selected && styles.rowTextOn, item.disabled && styles.rowTextOff]}>{item.label}</Text>
                  {selected ? <Text style={styles.tick}>✓</Text> : null}
                </Pressable>
              );
            }}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const ROW = 52;

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: { fontFamily: fonts.bodyMedium, fontSize: text.sm, color: colors.ink },
  control: {
    height: 48,
    borderWidth: 1,
    borderColor: colors.muted,
    borderRadius: radius.card,
    backgroundColor: colors.paper,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  controlText: { flex: 1, fontFamily: fonts.body, fontSize: text.md, color: colors.ink },
  compact: { paddingVertical: 4, minHeight: 32, justifyContent: 'center' },
  compactText: { fontFamily: fonts.bodyMedium, fontSize: text.md, color: colors.ink, textDecorationLine: 'underline', textDecorationColor: colors.lineStrong },
  backdrop: { flex: 1, backgroundColor: 'rgba(7, 35, 17, 0.35)' },
  sheet: { maxHeight: '60%', backgroundColor: colors.paper, borderTopLeftRadius: 12, borderTopRightRadius: 12, paddingTop: space.md },
  sheetTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.ink, paddingHorizontal: space.md, paddingBottom: space.xs },
  row: { height: ROW, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  rowOn: { backgroundColor: colors.brandWash },
  rowText: { fontFamily: fonts.body, fontSize: text.md, color: colors.ink },
  rowTextOn: { fontFamily: fonts.bodySemibold },
  rowTextOff: { color: colors.disabled },
  tick: { fontFamily: fonts.bodyBold, fontSize: text.md, color: colors.brand },
});
