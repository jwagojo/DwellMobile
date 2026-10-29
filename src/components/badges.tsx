import { useState, type ReactNode } from 'react';
import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { routeStyle } from '@/shared/data/transit';
import { colors, fonts, photoTones, radius, space, text } from '@/theme';
import { House, Walk } from './Icons';

/* Ports of the web's spec §4.6 badges and chips and the §2.1 photo (src/components/ui.tsx). */

export function RouteBadge({ route }: { route: string }) {
  const { bg, text: fg } = routeStyle(route);
  return <Text style={[styles.chip, { backgroundColor: bg, color: fg }]}>{route}</Text>;
}

export function RouteBadges({ routes, max = 5 }: { routes: string[]; max?: number }) {
  const shown = routes.slice(0, max);
  const extra = routes.length - shown.length;
  return (
    <>
      {shown.map((r) => (
        <RouteBadge key={r} route={r} />
      ))}
      {extra > 0 ? <Text style={[styles.chip, { backgroundColor: colors.chip, color: colors.ink }]}>+{extra}</Text> : null}
    </>
  );
}

export function WalkChip({ minutes }: { minutes: number }) {
  return (
    <View style={styles.walk}>
      <Walk size={14} color={colors.ink} />
      <Text style={styles.chipText}>{minutes} min walk</Text>
    </View>
  );
}

export function GreenPill({ score }: { score: number }) {
  return <Text style={styles.green}>Green {score.toFixed(2)}</Text>;
}

export function LevelTag({ children }: { children: ReactNode }) {
  return <Text style={styles.level}>{children}</Text>;
}

export function NewBadge() {
  return <Text style={styles.newBadge}>New listing</Text>;
}

export function StatusDot({ children, tone = 'green' }: { children: ReactNode; tone?: 'green' | 'muted' }) {
  return <Text style={[styles.status, { color: tone === 'green' ? colors.brand : colors.muted }]}>{children}</Text>;
}

export function PaidPill({ amount }: { amount: string }) {
  return <Text style={styles.paid}>Paid {amount}</Text>;
}

/** Spec §4.11 stat tile. */
export function StatTile({ label, value, tone = 'surface', big = false }: { label: string; value: string; tone?: 'surface' | 'green' | 'amber'; big?: boolean }) {
  const bg = { surface: colors.surface, green: colors.greenBg, amber: colors.amberBg }[tone];
  const fg = { surface: colors.ink, green: colors.greenInk, amber: colors.amberInk }[tone];
  return (
    <View style={[styles.tile, { backgroundColor: bg }]} accessibilityLabel={`${label}: ${value}`}>
      <Text style={[styles.tileLabel, { color: tone === 'surface' ? colors.muted : fg }]}>{label}</Text>
      <Text style={[styles.tileValue, { color: fg, fontSize: big ? 22 : 18 }]}>{value}</Text>
    </View>
  );
}

/**
 * A host photo, or the labeled placeholder when there is none or it fails to load (hotlinked photos can vanish).
 * Fills the size the parent gives it through `style`.
 */
export function Photo({ src, index = 0, label, style, children }: { src?: string; index?: number; label?: string; style?: StyleProp<ViewStyle>; children?: ReactNode }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = !!src && src !== failedSrc;
  return (
    <View style={[styles.photo, { backgroundColor: photoTones[index % photoTones.length] }, style]} accessibilityRole="image" accessibilityLabel={label ?? 'Host photo'}>
      {showImage ? (
        <Image source={{ uri: src }} style={StyleSheet.absoluteFill} resizeMode="cover" onError={() => setFailedSrc(src!)} />
      ) : (
        <View style={styles.placeholder}>
          <House size={30} color={colors.muted} />
          {label ? <Text style={styles.placeholderText}>Host photo: {label}</Text> : null}
        </View>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { borderRadius: 3, paddingHorizontal: space.xs, paddingVertical: 4, fontFamily: fonts.bodyMedium, fontSize: text.xs, overflow: 'hidden' },
  walk: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 3, backgroundColor: colors.chip, paddingHorizontal: space.xs, paddingVertical: 4 },
  chipText: { fontFamily: fonts.bodyMedium, fontSize: text.xs, color: colors.ink },
  green: { borderRadius: radius.pill, backgroundColor: colors.greenBg, paddingHorizontal: 10, paddingVertical: 4, fontFamily: fonts.bodySemibold, fontSize: text.xs, color: colors.greenInk, overflow: 'hidden' },
  level: { borderRadius: 3, backgroundColor: colors.paper, paddingHorizontal: space.xs, paddingVertical: 4, fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.ink, overflow: 'hidden' },
  newBadge: { borderRadius: radius.pill, backgroundColor: colors.brandTint, paddingHorizontal: 10, paddingVertical: 2, fontFamily: fonts.bodySemibold, fontSize: 12, color: colors.brand, overflow: 'hidden' },
  status: { fontFamily: fonts.bodyMedium, fontSize: text.sm },
  paid: { borderRadius: radius.pill, backgroundColor: colors.greenBg, paddingHorizontal: 10, paddingVertical: 4, fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.greenInk, overflow: 'hidden' },
  tile: { flexGrow: 1, flexBasis: '45%', borderRadius: radius.card, padding: 14 },
  tileLabel: { fontFamily: fonts.bodyMedium, fontSize: 12 },
  tileValue: { fontFamily: fonts.bodySemibold, marginTop: 2 },
  photo: { overflow: 'hidden', borderRadius: radius.card },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, padding: space.xs },
  placeholderText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.body, textAlign: 'center' },
});
