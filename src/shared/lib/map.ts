// Copied from the Dwell web app (jwagojo/Dwell src/lib/map.ts @ 94fda61) by scripts/sync-shared.mjs.
// Do not edit here: change the web file, then re-run the script.
/**
 * Map configuration for MapLibre GL JS. The map needs a style URL, not an access token.
 *
 * Default: OpenFreeMap "positron" (light, OpenStreetMap data). It is free, needs no key or account, and its
 * attribution is included in the style, so keep the attribution control on the map.
 * To use another provider (MapTiler, Stadia, Amazon Location, self-hosted), set EXPO_PUBLIC_MAP_STYLE_URL to a MapLibre
 * style JSON URL. If that URL carries an API key, the key is visible in the browser bundle, so restrict it by URL.
 */

export const DEFAULT_MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

export function resolveMapStyleUrl(raw: string | undefined): string {
  const url = (raw ?? '').trim();
  return url === '' ? DEFAULT_MAP_STYLE_URL : url;
}

export const MAP_STYLE_URL: string = resolveMapStyleUrl(process.env.EXPO_PUBLIC_MAP_STYLE_URL as string | undefined);
