import Constants, { ExecutionEnvironment } from 'expo-constants';
import { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';

import type { GeoBounds } from '@/shared/lib/geo';
import { MAP_STYLE_URL } from '@/shared/lib/map';
import { DestinationPin, PricePin } from './pins';
import type { LiveMapProps } from './types';

/**
 * The live map on a phone: MapLibre Native with the same OpenFreeMap style as the web (no key). Expo Go doesn't
 * include MapLibre's native code, so there the map reports itself unavailable and the caller draws the schematic.
 * MapLibre is required lazily so Expo Go never touches the missing native module.
 */
export const liveMapUnavailableReason: string | null =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient ? 'Expo Go can’t run the live map; a development build can.' : null;

type MapLibreModule = typeof import('@maplibre/maplibre-react-native');
let mapLibre: MapLibreModule | null = null;
const loadMapLibre = (): MapLibreModule => (mapLibre ??= require('@maplibre/maplibre-react-native') as MapLibreModule);

export function LiveMap({ center, zoom, interactive = true, destination, pins, selectedId, onSelect, onAreaChange, onFail, accessibilityLabel }: LiveMapProps) {
  const { Map, Camera, ViewAnnotation } = loadMapLibre();
  const camera = useRef<import('@maplibre/maplibre-react-native').CameraRef>(null);

  // Fly to a newly chosen destination. Panning and zooming by hand never come through here.
  const previousId = useRef(destination?.id ?? null);
  useEffect(() => {
    const id = destination?.id ?? null;
    if (id === previousId.current) return;
    previousId.current = id;
    if (destination) camera.current?.flyTo({ center: [destination.lng, destination.lat], zoom, duration: 700 });
  }, [destination, zoom]);

  return (
    <Map
      style={StyleSheet.absoluteFill}
      mapStyle={MAP_STYLE_URL}
      accessibilityLabel={accessibilityLabel}
      dragPan={interactive}
      touchZoom={interactive}
      doubleTapZoom={interactive}
      doubleTapHoldZoom={interactive}
      touchRotate={false}
      touchPitch={false}
      compass={false}
      attribution
      logo={false}
      onDidFailLoadingMap={() => onFail?.('The map couldn’t load. Check your connection.')}
      onRegionDidChange={(e) => {
        const [west, south, east, north] = e.nativeEvent.bounds;
        const area: GeoBounds = { south, west, north, east };
        onAreaChange?.(area, { lat: e.nativeEvent.center[1], lng: e.nativeEvent.center[0] }, e.nativeEvent.zoom);
      }}
    >
      <Camera ref={camera} initialViewState={{ center: [center.lng, center.lat], zoom }} />
      {destination ? (
        <ViewAnnotation id="destination" lngLat={[destination.lng, destination.lat]} anchor="top">
          <DestinationPin destination={destination} />
        </ViewAnnotation>
      ) : null}
      {pins.map((p) => (
        <ViewAnnotation key={p.id} id={p.id} lngLat={[p.lng, p.lat]} selected={p.id === selectedId} onPress={onSelect ? () => onSelect(p.id) : undefined}>
          <PricePin price={p.price} selected={p.id === selectedId} label={p.title ? `${p.title}, $${p.price.toFixed(2)} per hour` : undefined} />
        </ViewAnnotation>
      ))}
    </Map>
  );
}
