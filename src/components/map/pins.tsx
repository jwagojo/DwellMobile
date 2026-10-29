import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LINE_STYLES } from '@/shared/data/transit';
import type { Destination } from '@/shared/types/destination';
import { colors, fonts, radius } from '@/theme';
import { Bolt, Pin } from '../Icons';

/** Ports of the web's map/PricePin.tsx and map/DestinationPin.tsx, drawn the same on the live map and the schematic. */

export function PricePin({ price, selected, label, onPress }: { price: number; selected: boolean; label?: string; onPress?: () => void }) {
  const body = (
    <View style={[styles.price, selected ? styles.priceOn : null]}>
      <Bolt size={13} color={colors.onInk} />
      <Text style={styles.priceText}>${price.toFixed(2)}</Text>
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected }} onPress={onPress} hitSlop={6}>
      {body}
    </Pressable>
  );
}

/** A round "T" in the line color for stations, a brand-colored location glyph for addresses; the label hangs below. */
export function DestinationPin({ destination }: { destination: Destination }) {
  const isStation = destination.kind === 'station';
  const bg = isStation && destination.primary ? LINE_STYLES[destination.primary].stroke : colors.brand;
  return (
    <View style={styles.dest} pointerEvents="none" accessibilityLabel={`Destination: ${destination.label}`}>
      <View style={[styles.destDot, { backgroundColor: bg }]}>{isStation ? <Text style={styles.destT}>T</Text> : <Pin size={17} color={colors.onInk} />}</View>
      <Text numberOfLines={1} style={styles.destLabel}>
        {destination.label}
      </Text>
    </View>
  );
}

const shadow = { shadowColor: colors.ink, shadowOpacity: 0.18, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 3 };

const styles = StyleSheet.create({
  price: { height: 32, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, borderWidth: 2, borderColor: colors.paper, backgroundColor: colors.ink, paddingHorizontal: 10, ...shadow },
  priceOn: { backgroundColor: colors.brand, transform: [{ scale: 1.1 }] },
  priceText: { fontFamily: fonts.bodySemibold, fontSize: 14, color: colors.onInk },
  dest: { alignItems: 'center', maxWidth: 220 },
  destDot: { width: 34, height: 34, borderRadius: 17, borderWidth: 3, borderColor: colors.paper, alignItems: 'center', justifyContent: 'center', ...shadow },
  destT: { fontFamily: fonts.bodySemibold, fontSize: 15, color: colors.onInk },
  destLabel: { marginTop: 4, borderRadius: radius.card, backgroundColor: colors.paper, paddingHorizontal: 8, paddingVertical: 2, fontFamily: fonts.bodySemibold, fontSize: 13, color: colors.ink, overflow: 'hidden', ...shadow },
});
