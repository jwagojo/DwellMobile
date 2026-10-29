import * as SecureStore from 'expo-secure-store';

import type { SyncStore } from './storage';

/**
 * Where the Cognito session (src/shared/state/backend.ts) is kept on the phone: the iOS Keychain or the Android
 * Keystore, through expo-secure-store. This replaces the web's sessionStorage and is safer: other apps can't read
 * it. Unlike the web, the session survives closing the app; sign-out still revokes the refresh token at Cognito.
 *
 * The session JSON is about 3 KB (two Cognito tokens). Android's secure store is only reliable for values under
 * 2 KB, so each value is split into chunks under `<key>.n` (count) and `<key>.0`, `<key>.1`, ...
 * Secure-store keys allow only letters, digits, ".", "-" and "_", which the Dwell keys already use.
 */
export const CHUNK_CHARS = 1800;

type Native = Pick<typeof SecureStore, 'getItem' | 'setItem' | 'deleteItemAsync'>;

const OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };

export function createSecureSessionStore(native: Native = SecureStore): SyncStore {
  const countKey = (key: string) => `${key}.n`;
  const chunkKey = (key: string, i: number) => `${key}.${i}`;
  const readCount = (key: string) => {
    const n = Number(native.getItem(countKey(key), OPTIONS) ?? '0');
    return Number.isInteger(n) && n > 0 ? n : 0;
  };
  const dropChunks = (key: string, from: number, to: number) => {
    for (let i = from; i < to; i++) void native.deleteItemAsync(chunkKey(key, i), OPTIONS).catch(() => {});
  };

  return {
    getItem(key) {
      try {
        const n = readCount(key);
        if (n === 0) return null;
        let value = '';
        for (let i = 0; i < n; i++) {
          const part = native.getItem(chunkKey(key, i), OPTIONS);
          if (part === null) return null; // half-written or wiped: treat as signed out
          value += part;
        }
        return value;
      } catch {
        return null;
      }
    },
    setItem(key, value) {
      const v = String(value);
      const before = readCount(key);
      const n = Math.max(1, Math.ceil(v.length / CHUNK_CHARS));
      for (let i = 0; i < n; i++) native.setItem(chunkKey(key, i), v.slice(i * CHUNK_CHARS, (i + 1) * CHUNK_CHARS), OPTIONS);
      // The count goes last, so a crash mid-write leaves the old count, whose chunks no longer join into valid JSON
      // and read back as signed out instead of as a mix of two sessions.
      native.setItem(countKey(key), String(n), OPTIONS);
      dropChunks(key, n, before);
    },
    removeItem(key) {
      const before = readCount(key);
      // There is no synchronous delete: zero the count now (reads see nothing at once), clear the chunks after.
      native.setItem(countKey(key), '0', OPTIONS);
      dropChunks(key, 0, before);
    },
  };
}
