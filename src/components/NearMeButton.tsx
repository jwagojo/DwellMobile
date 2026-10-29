import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { locateUser } from '@/platform/location';
import { currentLocationDestination } from '@/shared/data/destinations';
import { isInMassachusettsArea } from '@/shared/lib/massachusetts';
import type { Destination } from '@/shared/types/destination';
import { colors, fonts, radius, text } from '@/theme';
import { Locate } from './Icons';

type Status = { kind: 'idle' } | { kind: 'locating' } | { kind: 'error'; message: string };

const OUTSIDE_MESSAGE = 'You’re outside Massachusetts, where Dwell has no chargers yet. Search for a station or address instead.';

/**
 * Port of the web's NearMeButton.tsx: asks for the phone's position (only when tapped), then hands back a
 * destination so the screen can look for chargers around that point. Failures explain what to do next.
 */
export default function NearMeButton({ onLocated, label = 'Use my current location', compact = false }: { onLocated: (destination: Destination) => void; label?: string; compact?: boolean }) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function locate() {
    setStatus({ kind: 'locating' });
    const result = await locateUser();
    if (!mounted.current) return;
    if (!result.ok) return setStatus({ kind: 'error', message: result.message });
    if (!isInMassachusettsArea(result.lat, result.lng)) return setStatus({ kind: 'error', message: OUTSIDE_MESSAGE });
    setStatus({ kind: 'idle' });
    onLocated(currentLocationDestination(result.lat, result.lng));
  }

  const locating = status.kind === 'locating';
  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={locating ? 'Finding your location' : label}
        accessibilityState={{ busy: locating, disabled: locating }}
        disabled={locating}
        onPress={locate}
        style={({ pressed }) => [styles.button, compact && styles.compact, pressed && { backgroundColor: colors.brandTint, borderColor: colors.brand }, locating && { opacity: 0.55 }]}
      >
        <Locate size={18} color={colors.ink} />
        <Text style={styles.label}>{locating ? 'Finding you…' : label}</Text>
      </Pressable>
      {status.kind === 'error' ? (
        <Text style={styles.error} accessibilityRole="alert">
          {status.message}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, alignItems: 'flex-start' },
  button: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.paper,
    paddingHorizontal: 16,
  },
  compact: { height: 48 },
  label: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.ink },
  error: { fontFamily: fonts.bodyMedium, fontSize: text.xs, color: colors.amberInk },
});
