import { describe, expect, it, jest } from '@jest/globals';
import { act, render, renderHook } from '@testing-library/react-native';
import { Text } from 'react-native';
import type { ReactNode } from 'react';

import type { SyncStore } from '@/platform/storage';
import { EV_MODELS } from '@/shared/data/evFallbackSeed';
import { authenticate, registerAccount } from '@/shared/state/accounts';
import { STORAGE_KEY } from '@/shared/state/persisted';
import { AppStateProvider, useApp } from './AppState';

/** Prototype mode, on an in-memory store; `failWrites` makes every write throw, like a full phone. */
function memoryStore() {
  const m = new Map<string, string>();
  let failWrites = false;
  const store: SyncStore & { failWrites(v: boolean): void; raw: Map<string, string> } = {
    raw: m,
    failWrites: (v) => {
      failWrites = v;
    },
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => {
      if (failWrites) throw new Error('full');
      m.set(k, String(v));
    },
    removeItem: (k) => void m.delete(k),
  };
  return store;
}

const USER = { name: 'Test Driver', email: 'test.driver@dwell.test', phone: '6175550123' };
const PASSWORD = 'Mobile-check-1029';

async function setup() {
  const storage = memoryStore();
  await registerAccount(storage, PASSWORD, { user: USER, car: null, hostListing: null, booking: null });
  const wrapper = ({ children }: { children: ReactNode }) => <AppStateProvider storage={storage}>{children}</AppStateProvider>;
  const hook = await renderHook(() => useApp(), { wrapper });
  return { storage, ...hook };
}

describe('AppStateProvider (prototype mode)', () => {
  it('saves the signed-in state to the phone', async () => {
    const { storage, result } = await setup();
    await act(async () => result.current.update({ user: USER, car: EV_MODELS[1] }));
    expect(JSON.parse(storage.raw.get(STORAGE_KEY)!)).toMatchObject({ user: USER, car: { id: EV_MODELS[1].id } });
  });

  it('keeps the account’s car through sign-out, and sign-in brings it back', async () => {
    const { storage, result } = await setup();
    await act(async () => result.current.update({ user: USER, car: EV_MODELS[2] }));

    let out: ReturnType<typeof result.current.signOut> | undefined;
    await act(async () => {
      out = result.current.signOut();
    });
    expect(out).toEqual({ ok: true });
    expect(result.current.user).toBeNull();
    expect(result.current.car).toBeNull();

    const auth = await authenticate(storage, USER.email, PASSWORD);
    expect(auth.ok).toBe(true);
    if (!auth.ok) return;
    await act(async () => result.current.signIn(auth.data));
    expect(result.current.user).toEqual(USER);
    expect(result.current.car?.id).toBe(EV_MODELS[2].id);
  });

  it('stays signed in, removing nothing, when the account can’t be saved', async () => {
    const { storage, result } = await setup();
    await act(async () => result.current.update({ user: USER }));
    storage.failWrites(true);
    let out: ReturnType<typeof result.current.signOut> | undefined;
    await act(async () => {
      out = result.current.signOut();
    });
    expect(out).toEqual({ ok: false, reason: 'STORAGE' });
    expect(result.current.user).toEqual(USER);

    await act(async () => {
      out = result.current.signOut({ force: true });
    });
    expect(out).toEqual({ ok: true });
    expect(result.current.user).toBeNull();
  });

  it('prices for the default car until one is chosen, and lists the seeded sample listings', async () => {
    const { result } = await setup();
    expect(result.current.activeCar.name).toBe('Nissan Leaf');
    expect(result.current.listings).toHaveLength(34);
    expect(result.current.backend).toBeNull();
  });
});

describe('AppStateProvider (backend, launching with a saved session)', () => {
  const USER_ME = { user: USER, car: null, listing: null, booking: null };
  const ok = <T,>(data: T) => ({ ok: true as const, status: 200, data });
  const offline = { ok: false as const, status: 0, code: 'NETWORK', message: 'Couldn’t reach Dwell. Check your connection.', details: {} };

  function fakeBackend(meResults: unknown[]) {
    const me = [...meResults];
    const backend = {
      signedIn: true,
      signOut: jest.fn(async () => {
        backend.signedIn = false;
      }),
      api: {
        getMe: jest.fn(async () => me.shift()),
        getBooking: jest.fn(),
        listListings: jest.fn(async () => ok({ listings: [] })),
        listCars: jest.fn(async () => ok({ cars: [] })),
        saveCar: jest.fn(),
      },
    };
    return backend;
  }

  it('shows the can’t-connect screen instead of looking signed out, and Retry loads the account', async () => {
    const backend = fakeBackend([offline, ok(USER_ME)]);
    let actions: { retry: () => void; signOut: () => void } | null = null;
    const startupError = (message: string, a: { retry: () => void; signOut: () => void }) => {
      actions = a;
      return <Text>{message}</Text>;
    };
    const screen = await render(
      <AppStateProvider storage={memoryStore()} backend={backend as never} startupError={startupError}>
        <Probe />
      </AppStateProvider>,
    );
    expect(screen.getByText(offline.message)).toBeTruthy();
    await act(async () => actions!.retry());
    expect(screen.getByText(`Signed in as ${USER.name}`)).toBeTruthy();
    expect(backend.api.getMe).toHaveBeenCalledTimes(2);
  });

  it('lets them sign out from that screen', async () => {
    const backend = fakeBackend([offline]);
    let actions: { retry: () => void; signOut: () => void } | null = null;
    const screen = await render(
      <AppStateProvider storage={memoryStore()} backend={backend as never} startupError={(m, a) => ((actions = a), <Text>{m}</Text>)}>
        <Probe />
      </AppStateProvider>,
    );
    await act(async () => actions!.signOut());
    expect(backend.signOut).toHaveBeenCalled();
    expect(screen.getByText('Signed out')).toBeTruthy();
  });
});

function Probe() {
  const { user } = useApp();
  return <Text>{user ? `Signed in as ${user.name}` : 'Signed out'}</Text>;
}
