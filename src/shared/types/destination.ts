// Copied from the Dwell web app (jwagojo/Dwell src/types/destination.ts @ 94fda61) by scripts/sync-shared.mjs.
// Do not edit here: change the web file, then re-run the script.
import type { LineKey } from '../data/transit';

/**
 * Where a driver is headed: either a predefined T station or an address picked from search.
 * Transit routes exist only for stations. They are never invented for addresses.
 */
export interface Destination {
  kind: 'station' | 'address';
  /** Station id, or the Mapbox ID of the address */
  id: string;
  label: string;
  lat: number;
  lng: number;
  routes?: string[];
  primary?: LineKey;
}
