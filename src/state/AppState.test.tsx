import { describe, expect, it } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
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
