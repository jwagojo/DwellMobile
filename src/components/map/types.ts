import type { GeoBounds, LatLng } from '@/shared/lib/geo';
import type { Destination } from '@/shared/types/destination';

export interface MapPin {
  id: string;
  lat: number;
  lng: number;
  price: number;
  /** Spoken label for the pin; empty on the non-interactive landing preview */
  title?: string;
}

export interface LivePinMapProps {
  position: LatLng | null;
  /** Where to start when there is no pin yet */
  center: LatLng;
  onMove: (p: LatLng) => void;
  /** Bump to fly the camera to the pin (address chosen, GPS). Tapping must not recenter. */
  recenterToken: number;
  onFail?: (reason: string) => void;
}

export interface LiveMapProps {
  center: LatLng;
  zoom: number;
  interactive?: boolean;
  destination?: Destination | null;
  pins: MapPin[];
  selectedId: string | null;
  onSelect?: (id: string) => void;
  /** After every pan, zoom or fly: the visible area, plus the camera so the screen can come back to it */
  onAreaChange?: (area: GeoBounds, center: LatLng, zoom: number) => void;
  /** The map couldn't load; the caller switches to the schematic with this reason */
  onFail?: (reason: string) => void;
  accessibilityLabel: string;
}
