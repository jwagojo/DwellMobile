// Mobile version of the Dwell web app's src/lib/mapbox.ts. Not copied by scripts/sync-shared.mjs: the web reads the
// token through Vite (`import.meta.env`), the app through Expo (`process.env.EXPO_PUBLIC_*`). Keep the rules the same.

/**
 * Mapbox configuration for address search (Geocoding API). The token is optional: without one, address search uses
 * Photon (OpenStreetMap). The map itself uses MapLibre and needs no token.
 * The token is a PUBLIC (pk.) token read from EXPO_PUBLIC_MAPBOX_TOKEN in .env. It ships inside the app, so restrict
 * it in the Mapbox dashboard. Secret (sk.) tokens are refused.
 */

export type MapboxTokenStatus = 'ok' | 'missing' | 'secret' | 'invalid';

export function classifyMapboxToken(raw: string | undefined): MapboxTokenStatus {
  const token = (raw ?? '').trim();
  if (token === '') return 'missing';
  if (token.startsWith('sk.')) return 'secret';
  if (!token.startsWith('pk.')) return 'invalid'; // includes the .env.example placeholder
  return 'ok';
}

// Expo inlines EXPO_PUBLIC_* at build time only for this exact `process.env.NAME` form.
const rawToken = process.env.EXPO_PUBLIC_MAPBOX_TOKEN?.trim() ?? '';

export const mapboxTokenStatus: MapboxTokenStatus = classifyMapboxToken(rawToken);
export const hasMapboxToken = mapboxTokenStatus === 'ok';
/** Only ever a public token. Empty string when missing, secret, or malformed. */
export const MAPBOX_TOKEN: string = hasMapboxToken ? rawToken : '';

export function describeTokenProblem(status: MapboxTokenStatus): string {
  switch (status) {
    case 'missing':
      return 'No Mapbox token. Add EXPO_PUBLIC_MAPBOX_TOKEN to .env and restart Expo.';
    case 'secret':
      return 'EXPO_PUBLIC_MAPBOX_TOKEN is a secret (sk.) token and was ignored. Use a public (pk.) token.';
    case 'invalid':
      return 'EXPO_PUBLIC_MAPBOX_TOKEN is not a public (pk.) token.';
    default:
      return '';
  }
}

/** Rough center of Massachusetts, used to bias address search and as a last-resort camera. */
export const MASSACHUSETTS_CENTER = { lat: 42.3601, lng: -71.0589 };

if (__DEV__ && !hasMapboxToken && process.env.NODE_ENV !== 'test') {
  console.warn(`[Dwell] ${describeTokenProblem(mapboxTokenStatus)} Address search uses OpenStreetMap (Photon) instead.`);
}
