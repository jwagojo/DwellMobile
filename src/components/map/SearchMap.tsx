import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { isCurrentLocation, placeName } from '@/shared/data/destinations';
import { LINE_STYLES } from '@/shared/data/transit';
import { SEARCH_RADIUS_M } from '@/shared/features/search/evaluateListing';
import { boundsAround, type GeoBounds, type LatLng } from '@/shared/lib/geo';
import type { Destination } from '@/shared/types/destination';
import { colors, fonts, radius, space } from '@/theme';
import { LiveMap, liveMapUnavailableReason } from './live';
import { DestinationPin, PricePin } from './pins';
import { SchematicMap } from './SchematicMap';
import type { MapPin } from './types';

export type { MapPin } from './types';

/** Port of the web's MapView.tsx and map/MapFallbacks.tsx (search map). Same zoom rules and camera memory. */
const DESTINATION_ZOOM = 14;
const BROWSING_ZOOM = 13;
/** "Near me" starts one level wider: a driver standing somewhere wants chargers within a short drive. */
const NEAR_ME_ZOOM = 13;
const zoomFor = (d: Destination) => (isCurrentLocation(d) ? NEAR_ME_ZOOM : DESTINATION_ZOOM);

/** Where the camera was last left. Survives leaving the screen (a listing, then back) but not an app restart. */
let lastView: { center: LatLng; zoom: number } | null = null;

export function FallbackBanner({ reason, short = false }: { reason: string; short?: boolean }) {
  return (
    <View style={styles.banner} accessibilityRole="text">
      <Text style={styles.bannerText}>{short ? 'Schematic preview, not a live map' : `Schematic map, not a live map. ${reason}`}</Text>
    </View>
  );
}

/**
 * Search map. The live map lets the driver pan and zoom; `onAreaChange` reports what it shows so the screen can list
 * the chargers in view. The schematic can't be dragged, so it reports a fixed area around its center.
 */
export default function SearchMap({
  destination,
  browseCenter,
  pins,
  selectedId,
  onSelect,
  onAreaChange,
}: {
  destination: Destination | null;
  browseCenter: LatLng;
  pins: MapPin[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAreaChange: (area: GeoBounds) => void;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const reason = liveMapUnavailableReason ?? failed;
  const start = destination ? { center: destination, zoom: zoomFor(destination) } : (lastView ?? { center: browseCenter, zoom: BROWSING_ZOOM });
  const label = destination ? `Map of chargers near ${placeName(destination)}` : 'Map of chargers. Drag the map to search another area.';

  if (reason) {
    return <SchematicSearchMap destination={destination} center={destination ?? start.center} pins={pins} selectedId={selectedId} onSelect={onSelect} onAreaChange={onAreaChange} reason={reason} />;
  }
  return (
    <LiveMap
      center={start.center}
      zoom={destination ? zoomFor(destination) : start.zoom}
      destination={destination}
      pins={pins}
      selectedId={selectedId}
      onSelect={onSelect}
      onAreaChange={(area, center, zoom) => {
        lastView = { center, zoom };
        onAreaChange(area);
      }}
      onFail={setFailed}
      accessibilityLabel={label}
    />
  );
}

function SchematicSearchMap({
  destination,
  center,
  pins,
  selectedId,
  onSelect,
  onAreaChange,
  reason,
}: {
  destination: Destination | null;
  center: LatLng;
  pins: MapPin[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAreaChange: (area: GeoBounds) => void;
  reason: string;
}) {
  const [zoom, setZoom] = useState(1);
  const latest = useRef(onAreaChange);
  latest.current = onAreaChange;
  useEffect(() => {
    latest.current(boundsAround(center, SEARCH_RADIUS_M));
  }, [center.lat, center.lng]);

  return (
    <View style={StyleSheet.absoluteFill}>
      <SchematicMap center={center} zoom={zoom}>
        {({ project }) => (
          <>
            {destination
              ? (() => {
                  const { x, y } = project(destination);
                  return (
                    <View style={[styles.anchor, { left: x - 17, top: y - 17 }]} pointerEvents="none">
                      <DestinationPin destination={destination} />
                    </View>
                  );
                })()
              : null}
            {pins.map((p) => {
              const { x, y } = project(p);
              const selected = p.id === selectedId;
              return (
                <View key={p.id} style={[styles.pinAt, { left: x, top: y, zIndex: selected ? 20 : 10 }]}>
                  <PricePin price={p.price} selected={selected} label={`${p.title ?? 'Charger'}, $${p.price.toFixed(2)} per hour`} onPress={() => onSelect(p.id)} />
                </View>
              );
            })}
          </>
        )}
      </SchematicMap>
      <FallbackBanner reason={reason} />
      <View style={styles.zoom}>
        <Pressable accessibilityRole="button" accessibilityLabel="Zoom in" style={styles.zoomBtn} onPress={() => setZoom((z) => Math.min(z * 1.35, 3))}>
          <Text style={styles.zoomText}>+</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Zoom out" style={styles.zoomBtn} onPress={() => setZoom((z) => Math.max(z / 1.35, 0.7))}>
          <Text style={styles.zoomText}>−</Text>
        </Pressable>
      </View>
      <View style={styles.legend}>
        {(['red', 'green', 'orange', 'cr'] as const).map((k) => (
          <View key={k} style={styles.legendRow}>
            <View style={[styles.legendLine, { backgroundColor: LINE_STYLES[k].stroke }, k === 'cr' && styles.legendDashed]} />
            <Text style={styles.legendText}>{LINE_STYLES[k].label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const shadow = { shadowColor: colors.ink, shadowOpacity: 0.15, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 3 };

const styles = StyleSheet.create({
  anchor: { position: 'absolute', zIndex: 5, alignItems: 'center', width: 34 },
  // Centered on the point: the pin is about 72 x 32.
  pinAt: { position: 'absolute', transform: [{ translateX: -36 }, { translateY: -16 }] },
  banner: { position: 'absolute', left: space.sm, top: space.sm, maxWidth: '85%', zIndex: 30, borderRadius: radius.card, backgroundColor: colors.paper, paddingHorizontal: space.sm, paddingVertical: space.xs, ...shadow },
  bannerText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.amberInk },
  zoom: { position: 'absolute', right: space.sm, bottom: space.sm, zIndex: 30, gap: space.xs },
  zoomBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center', ...shadow },
  zoomText: { fontFamily: fonts.bodyMedium, fontSize: 20, color: colors.ink },
  legend: { position: 'absolute', left: space.sm, bottom: space.sm, zIndex: 30, gap: 6, borderRadius: radius.card, backgroundColor: colors.paper, paddingHorizontal: space.sm, paddingVertical: space.xs, ...shadow },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  legendLine: { width: 20, height: 4, borderRadius: 2 },
  legendDashed: { opacity: 0.7 },
  legendText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.body },
});
