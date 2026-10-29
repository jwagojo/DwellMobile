// Copied from the Dwell web app (jwagojo/Dwell src/features/session/pickup.ts @ 94fda61) by scripts/sync-shared.mjs.
// Do not edit here: change the web file, then re-run the script.
import { PICKUP_RADIUS_M } from '../../engines/constants';

/**
 * The Pickup geofence. The check uses the exact distance, never a rounded one, so 50.4 m is outside a 50 m radius.
 * The distance shown to the driver is rounded toward the answer: down when inside, up when outside. That way the
 * number on screen never contradicts the result (no "50 m away" next to "too far").
 */
export function checkPickupDistance(distanceM: number, radiusM: number = PICKUP_RADIUS_M): { ok: boolean; metersShown: number } {
  const ok = distanceM <= radiusM;
  return { ok, metersShown: ok ? Math.floor(distanceM) : Math.ceil(distanceM) };
}
