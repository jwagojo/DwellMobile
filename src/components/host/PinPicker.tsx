import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { offsetMeters, type LatLng } from '@/shared/lib/geo';
import { colors, fonts, radius, space, text } from '@/theme';
import { ChevronLeft } from '../Icons';
import { LivePinMap, liveMapUnavailableReason } from '../map/live';
import { HostPinGlyph } from '../map/pins';
import { SchematicMap } from '../map/SchematicMap';
import { FallbackBanner } from '../map/SearchMap';
import { Button } from '../ui';

const NUDGE_METERS = 5;

/**
 * Port of the web's PinPicker.tsx: map plus explicit confirmation for the exact charger location. On a phone the
 * pin goes where you tap (no dragging), and the arrows nudge it 5 m. Any move is reported through `onMove`; the
 * wizard clears `confirmed` when that happens, so a pin is only confirmed for the exact spot the host approved.
 */
export default function PinPicker({
  position,
  confirmed,
  onMove,
  onConfirm,
  onUnconfirm,
  recenterToken,
  fallbackCenter,
  error,
}: {
  position: LatLng | null;
  confirmed: boolean;
  onMove: (p: LatLng) => void;
  onConfirm: () => void;
  onUnconfirm: () => void;
  recenterToken: number;
  fallbackCenter: LatLng;
  error?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const reason = liveMapUnavailableReason ?? failed;
  const nudge = (north: number, east: number) => () => position && onMove(offsetMeters(position, north, east));
  const arrows: { label: string; rotate: string; n: number; e: number }[] = [
    { label: 'Nudge pin west', rotate: '0deg', n: 0, e: -NUDGE_METERS },
    { label: 'Nudge pin north', rotate: '90deg', n: NUDGE_METERS, e: 0 },
    { label: 'Nudge pin south', rotate: '-90deg', n: -NUDGE_METERS, e: 0 },
    { label: 'Nudge pin east', rotate: '180deg', n: 0, e: NUDGE_METERS },
  ];

  return (
    <View style={styles.wrap}>
      <View>
        <Text style={styles.title}>Place the pin on your driveway or charger entrance</Text>
        <Text style={styles.body}>Tap the map at the exact spot, then confirm it. Drivers and the pickup check use this point.</Text>
      </View>

      <View style={styles.map}>
        {reason ? (
          <SchematicMap center={position ?? fallbackCenter} zoom={1.6} showLabels>
            {({ project, unproject }) => (
              <>
                <Pressable
                  style={StyleSheet.absoluteFill}
                  accessibilityRole="button"
                  accessibilityLabel="Map. Tap to place the pin there."
                  onPress={(e) => onMove(unproject(e.nativeEvent.locationX, e.nativeEvent.locationY))}
                />
                {position
                  ? (() => {
                      const { x, y } = project(position);
                      return (
                        <View style={[styles.pinAt, { left: x - 18, top: y - 46 }]} pointerEvents="none">
                          <HostPinGlyph />
                        </View>
                      );
                    })()
                  : null}
              </>
            )}
          </SchematicMap>
        ) : (
          <LivePinMap position={position} center={fallbackCenter} onMove={onMove} recenterToken={recenterToken} onFail={setFailed} />
        )}
        {reason ? <FallbackBanner reason={`${reason} Taps are approximate; use the arrows to fine-tune.`} /> : null}
      </View>

      <View style={styles.nudges} accessibilityLabel="Nudge the pin">
        <Text style={styles.nudgeLabel}>Nudge {NUDGE_METERS} m</Text>
        {arrows.map((a) => (
          <Pressable key={a.label} accessibilityRole="button" accessibilityLabel={a.label} disabled={!position} onPress={nudge(a.n, a.e)} style={[styles.arrow, !position && { opacity: 0.55 }]}>
            <View style={{ transform: [{ rotate: a.rotate }] }}>
              <ChevronLeft size={18} color={colors.ink} />
            </View>
          </Pressable>
        ))}
      </View>

      {confirmed && position ? (
        <View style={styles.confirmed} accessibilityLiveRegion="polite">
          <Text style={styles.confirmedText}>
            Pin confirmed at {position.lat.toFixed(5)}, {position.lng.toFixed(5)}.
          </Text>
          <Button label="Move pin" variant="secondary" size="nav" onPress={onUnconfirm} />
        </View>
      ) : (
        <View style={styles.unconfirmed}>
          <Button label="Confirm pin location" block disabled={!position} onPress={onConfirm} />
          <Text style={styles.fine}>
            {position ? `Pin at ${position.lat.toFixed(5)}, ${position.lng.toFixed(5)} (not confirmed yet).` : 'Choose an address, use your location, or tap the map to place the pin.'}
          </Text>
        </View>
      )}
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  title: { fontFamily: fonts.bodySemibold, fontSize: text.md, color: colors.ink },
  body: { fontFamily: fonts.body, fontSize: text.sm, lineHeight: 20, color: colors.body },
  map: { height: 300, borderRadius: radius.card, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  pinAt: { position: 'absolute', zIndex: 10 },
  nudges: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  nudgeLabel: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.muted, marginRight: 4 },
  arrow: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' },
  confirmed: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, borderRadius: radius.card, backgroundColor: colors.greenBg, padding: 14 },
  confirmedText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: text.sm, color: colors.greenInk },
  unconfirmed: { gap: 6 },
  fine: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  error: { fontFamily: fonts.bodyMedium, fontSize: text.xs, color: colors.amberInk },
});
