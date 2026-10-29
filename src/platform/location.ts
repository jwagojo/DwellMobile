import * as Location from 'expo-location';

/**
 * Phone version of the web's src/adapters/geolocation.ts: same result type and 30 s budget, never throws. Used for
 * Near me, the host's "I'm at the spot" and the 50 m pickup check. Permission is asked only when the person taps,
 * and the position stays on the device except for the pickup check, which sends it to the API.
 */

/** Budget for a fix, per the project's adapter timeouts (geolocation: 30 s). */
export const GEOLOCATION_TIMEOUT_MS = 30_000;

export type LocateFailure = 'UNSUPPORTED' | 'DENIED' | 'UNAVAILABLE' | 'TIMEOUT';

export type LocateResult =
  | { ok: true; lat: number; lng: number; accuracyM: number }
  | { ok: false; reason: LocateFailure; message: string };

const MESSAGES: Record<LocateFailure, string> = {
  UNSUPPORTED: 'This phone can’t share its location. Search for a station or address instead.',
  DENIED: 'Location is off for Dwell. Turn it on in Settings, or search for a station or address instead.',
  UNAVAILABLE: 'We couldn’t work out where you are. Check that Location Services are on, or search for a station or address instead.',
  TIMEOUT: 'Finding your location took too long. Try again, or search for a station or address instead.',
};

const fail = (reason: LocateFailure): LocateResult => ({ ok: false, reason, message: MESSAGES[reason] });

type Native = Pick<typeof Location, 'requestForegroundPermissionsAsync' | 'getCurrentPositionAsync' | 'hasServicesEnabledAsync'>;

export interface LocateOptions {
  timeoutMs?: number;
  /** Pickup needs a precise fix; Near me is fine with a rough one. */
  precise?: boolean;
  native?: Native;
}

/** Ask for the current position once. The timeout also covers a permission prompt the person ignores. */
export async function locateUser({ timeoutMs = GEOLOCATION_TIMEOUT_MS, precise = false, native = Location }: LocateOptions = {}): Promise<LocateResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<LocateResult>((resolve) => {
    timer = setTimeout(() => resolve(fail('TIMEOUT')), timeoutMs);
  });

  const attempt = (async (): Promise<LocateResult> => {
    try {
      const permission = await native.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') return fail('DENIED');
      if (!(await native.hasServicesEnabledAsync())) return fail('UNAVAILABLE');
      const pos = await native.getCurrentPositionAsync({ accuracy: precise ? Location.Accuracy.High : Location.Accuracy.Balanced });
      return { ok: true, lat: pos.coords.latitude, lng: pos.coords.longitude, accuracyM: pos.coords.accuracy ?? Number.POSITIVE_INFINITY };
    } catch {
      return fail('UNAVAILABLE');
    }
  })();

  try {
    return await Promise.race([attempt, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
