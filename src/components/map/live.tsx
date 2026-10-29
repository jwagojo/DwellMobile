import type { LiveMapProps, LivePinMapProps } from './types';

/**
 * Web build (the browser preview used while developing): MapLibre Native has no web version, so the map always
 * falls back to the labeled schematic here. Phones use live.native.tsx.
 */
export const liveMapUnavailableReason: string | null = 'The live map runs in the phone app.';

export function LiveMap(_props: LiveMapProps): null {
  return null;
}

export function LivePinMap(_props: LivePinMapProps): null {
  return null;
}
