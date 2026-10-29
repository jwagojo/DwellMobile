import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { LatLng } from '@/shared/lib/geo';
import { LiveMap, liveMapUnavailableReason } from './live';
import { PricePin } from './pins';
import { SchematicMap } from './SchematicMap';
import { FallbackBanner } from './SearchMap';

export interface PreviewPin {
  id: string;
  lat: number;
  lng: number;
  price: number;
  selected: boolean;
}

/** Port of the web's map/MapPreview.tsx: the non-interactive landing map with price pins, or the labeled schematic. */
export default function MapPreview({ center, zoom = 13.4, pins, accessibilityLabel = 'Preview map of chargers near Central Square' }: { center: LatLng; zoom?: number; pins: PreviewPin[]; accessibilityLabel?: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  const reason = liveMapUnavailableReason ?? failed;
  const selected = pins.find((p) => p.selected)?.id ?? null;

  if (!reason) {
    return <LiveMap center={center} zoom={zoom} interactive={false} pins={pins} selectedId={selected} onFail={setFailed} accessibilityLabel={accessibilityLabel} />;
  }
  return (
    <View style={StyleSheet.absoluteFill} accessibilityLabel={accessibilityLabel}>
      <SchematicMap center={center} zoom={zoom >= 13 ? 1.25 : 1} showLabels={false}>
        {({ project }) =>
          pins.map((p) => {
            const { x, y } = project(p);
            return (
              <View key={p.id} style={[styles.pinAt, { left: x, top: y, zIndex: p.selected ? 20 : 10 }]} pointerEvents="none">
                <PricePin price={p.price} selected={p.selected} />
              </View>
            );
          })
        }
      </SchematicMap>
      <FallbackBanner reason={reason} short />
    </View>
  );
}

const styles = StyleSheet.create({
  pinAt: { position: 'absolute', transform: [{ translateX: -36 }, { translateY: -16 }] },
});
