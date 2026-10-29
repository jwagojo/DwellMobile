import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import type { SyncStore } from '@/platform/storage';
import { DEFAULT_CAR, EV_MODELS } from '@/shared/data/evFallbackSeed';
import { SEEDED_LISTINGS } from '@/shared/data/seedListings';
import { stashAccount, type AccountData, type StashResult } from '@/shared/state/accounts';
import type { DwellBackend } from '@/shared/state/backend';
import { BACKEND_STORAGE_KEY, DEFAULTS, loadSavedState, saveState, type Persisted } from '@/shared/state/persisted';
import type { Booking } from '@/shared/types/booking';
import type { Car, Listing } from '@/shared/types/listing';

export type { LevelFilter, Persisted, User } from '@/shared/state/persisted';

/**
 * Port of the web app's src/state/AppState.tsx (@ 94fda61). Same state, same actions, same backend sync; the only
 * difference is storage: the web uses localStorage directly, the app gets a SyncStore (src/platform/storage.ts),
 * which is AsyncStorage loaded into memory. Keep the two in step when either changes.
 */

/** Why signing out stopped instead of removing the account's data. */
export type SignOutProblem = 'NOT_REGISTERED' | 'STORAGE';
export type SignOutResult = { ok: true } | { ok: false; reason: SignOutProblem };
export type SyncResult = { ok: true } | { ok: false; message: string };

interface AppContextValue extends Persisted {
  update: (patch: Partial<Persisted>) => void;
  /**
   * Sign out. Prototype: the account's own data (profile, car, host listing, booking) is kept under its email so
   * signing back in restores it; if that data cannot be kept, nothing is removed and the reason comes back, so the
   * screen can ask first. `force` signs out anyway. Backend: the session is revoked and the server keeps everything.
   */
  signOut: (opts?: { force?: boolean }) => SignOutResult;
  /** Prototype: start a session for an account that sign-in has already verified. */
  signIn: (data: AccountData) => void;
  /** Backend: active listings from the API. Prototype: the account's own listing plus the 34 seeded samples. */
  listings: Listing[];
  /** The driver's car, or a default for hosts previewing search */
  activeCar: Car;
  /** Cars to choose from. Backend: Open EV Data from GET /cars. Prototype: the 8 seeded cars. */
  cars: Car[];
  /** The Cognito session and API client, or null in prototype mode (no backend values in .env). */
  backend: DwellBackend | null;
  /** The app's synchronous storage, for the prototype accounts. */
  storage: SyncStore;
  /** Backend: reload the account (profile, car, listing, booking) and the listings from the API. */
  syncAccount: () => Promise<SyncResult>;
  /** Backend: take a booking returned by the API, keeping this phone's photos and pickup step for it. */
  applyBooking: (booking: Booking) => void;
}

function load(storage: SyncStore, key?: string): Persisted {
  try {
    return loadSavedState(storage, key);
  } catch {
    return DEFAULTS;
  }
}

/** Backend mode keeps only search choices on the phone; the account lives on the server. */
const prefsOnly = (s: Persisted): Persisted => ({ ...s, user: null, car: null, hostListing: null, booking: null });

/**
 * The server's booking plus what only this phone has: the photo data URLs (until the server returns its own photo
 * URLs) and whether the driver is on the pickup step.
 */
export function mergeBooking(server: Booking, local: Booking | null): Booking {
  if (!local || local.id !== server.id) return server;
  return {
    ...server,
    arrivalPhoto: server.arrivalPhoto ?? local.arrivalPhoto ?? null,
    pickupPhoto: server.pickupPhoto ?? local.pickupPhoto ?? null,
    pickupStarted: server.status === 'ACTIVE' ? local.pickupStarted : false,
  };
}

/** First copy of each id wins, so the booked and own listings (with their exact address) beat the public copy. */
const uniqueById = (lists: (Listing | null)[]): Listing[] => {
  const seen = new Set<string>();
  return lists.filter((l): l is Listing => l !== null && !seen.has(l.id) && (seen.add(l.id), true));
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppStateProvider({
  children,
  storage,
  backend = null,
  loading = null,
}: {
  children: ReactNode;
  storage: SyncStore;
  backend?: DwellBackend | null;
  /** Shown while a saved backend session loads the account. */
  loading?: ReactNode;
}) {
  const [state, setState] = useState<Persisted>(() => (backend ? prefsOnly(load(storage, BACKEND_STORAGE_KEY)) : load(storage)));
  const [remote, setRemote] = useState<{ listings: Listing[]; bookingListing: Listing | null }>({ listings: [], bookingListing: null });
  const [cars, setCars] = useState<Car[]>(EV_MODELS);
  // With a saved session, wait for the account before rendering, so guarded screens don't bounce to sign-up.
  const [ready, setReady] = useState(() => !backend?.signedIn);

  useEffect(() => {
    try {
      if (backend) saveState(storage, prefsOnly(state), BACKEND_STORAGE_KEY);
      else saveState(storage, state);
    } catch {
      // Storage full or unavailable: the app keeps working in memory.
    }
  }, [state, backend, storage]);

  // The latest state, readable from callbacks without making them change on every update.
  const stateRef = useRef(state);
  stateRef.current = state;

  const update = useCallback(
    (patch: Partial<Persisted>) => {
      setState((s) => ({ ...s, ...patch }));
      // Backend: the car is saved on the profile, because bookings are priced for it on the server.
      if (backend && 'car' in patch && stateRef.current.user) void backend.api.saveCar(patch.car ?? null);
    },
    [backend],
  );

  const syncAccount = useCallback(async (): Promise<SyncResult> => {
    if (!backend) return { ok: true };
    const me = await backend.api.getMe();
    if (!me.ok) {
      if (me.status === 401) {
        await backend.signOut();
        setState((s) => prefsOnly(s));
      }
      return { ok: false, message: me.message };
    }
    const [details, list, carList] = await Promise.all([
      me.data.booking ? backend.api.getBooking(me.data.booking.id) : Promise.resolve(null),
      backend.api.listListings(),
      backend.api.listCars(),
    ]);
    // Keep the seeded cars if the list can't load, so pricing still works.
    if (carList.ok && carList.data.cars.length > 0) setCars(carList.data.cars);
    const serverBooking = details?.ok ? details.data.booking : me.data.booking;
    setState((s) => ({
      ...s,
      user: me.data.user,
      car: me.data.car,
      hostListing: me.data.listing,
      booking: serverBooking ? mergeBooking(serverBooking, s.booking) : null,
    }));
    setRemote({ listings: list.ok ? list.data.listings : [], bookingListing: details?.ok ? details.data.listing : null });
    return list.ok ? { ok: true } : { ok: false, message: list.message };
  }, [backend]);

  useEffect(() => {
    if (!backend?.signedIn) return;
    void syncAccount().finally(() => setReady(true));
  }, [backend, syncAccount]);

  const applyBooking = useCallback((b: Booking) => setState((s) => ({ ...s, booking: mergeBooking(b, s.booking) })), []);

  const signOut = useCallback(
    (opts: { force?: boolean } = {}): SignOutResult => {
      if (backend) {
        void backend.signOut();
        setState(DEFAULTS);
        setRemote({ listings: [], bookingListing: null });
        return { ok: true };
      }
      const current = stateRef.current;
      if (!current.user) {
        setState(DEFAULTS);
        return { ok: true };
      }
      // Shrink the signed-in copy first, so the listing's photos are never stored twice at once.
      let stash: StashResult;
      try {
        saveState(storage, DEFAULTS);
        stash = stashAccount(storage, current);
      } catch {
        stash = { ok: false, reason: 'STORAGE' };
      }
      if (!stash.ok && !opts.force) {
        // Put the signed-in copy back and stay signed in. If even that fails, the state is still in memory.
        try {
          saveState(storage, current);
        } catch {
          // ignore
        }
        return { ok: false, reason: stash.reason === 'NOT_REGISTERED' ? 'NOT_REGISTERED' : 'STORAGE' };
      }
      setState(DEFAULTS);
      return { ok: true };
    },
    [backend, storage],
  );

  const signIn = useCallback((data: AccountData) => setState({ ...DEFAULTS, ...data }), []);

  const value = useMemo<AppContextValue>(
    () => ({
      ...state,
      update,
      signOut,
      signIn,
      // Prototype: the web shows only the account's own listing. The app adds the 34 sample listings that are seeded
      // into the backend, so offline search has chargers to find (MIGRATION_PROMPT.md, offline-first).
      listings: backend
        ? uniqueById([remote.bookingListing, state.hostListing, ...remote.listings])
        : uniqueById([state.hostListing, ...SEEDED_LISTINGS]),
      // No car chosen yet: price for the default model, using the car list's newest version of it when there is one.
      activeCar: state.car ?? cars.find((c) => c.make && `${c.make} ${c.model}`.toLowerCase() === DEFAULT_CAR.name.toLowerCase()) ?? DEFAULT_CAR,
      cars,
      backend,
      storage,
      syncAccount,
      applyBooking,
    }),
    [state, remote, cars, update, signOut, signIn, backend, storage, syncAccount, applyBooking],
  );

  if (!ready) return <>{loading}</>;
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppStateProvider');
  return ctx;
}
