import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The shared state code (src/shared/state/persisted.ts, and the prototype accounts) reads and writes storage
 * synchronously, like the web's localStorage. AsyncStorage is asynchronous, so the app loads every Dwell key into
 * memory once at startup and then writes each change through in the background. Reads are always from memory.
 *
 * A failed background write is logged and the app keeps working from memory, like the web when storage is full.
 */
export type SyncStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

type Backing = Pick<typeof AsyncStorage, 'getAllKeys' | 'multiGet' | 'setItem' | 'removeItem'>;

/** Only keys the app owns are loaded (the web's keys all start with these). */
const OWNED = /^(dwell|voltlot)\./;

export async function hydrateStore(backing: Backing = AsyncStorage): Promise<SyncStore & { flush(): Promise<void> }> {
  const memory = new Map<string, string>();
  try {
    const keys = (await backing.getAllKeys()).filter((k) => OWNED.test(k));
    for (const [k, v] of await backing.multiGet(keys)) if (v !== null) memory.set(k, v);
  } catch (err) {
    console.warn('[Dwell] Could not read saved data; starting fresh.', err);
  }

  // Writes for one key run in order, so a quick set-then-remove never lands as set.
  let queue: Promise<void> = Promise.resolve();
  const enqueue = (write: () => Promise<void>) => {
    queue = queue.then(write).catch((err) => console.warn('[Dwell] Could not save data; it is kept until the app closes.', err));
  };

  return {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => {
      const v = String(value);
      memory.set(key, v);
      enqueue(() => backing.setItem(key, v));
    },
    removeItem: (key) => {
      memory.delete(key);
      enqueue(() => backing.removeItem(key));
    },
    /** Resolves once every write so far has reached the disk (tests, and before sign-out). */
    flush: () => queue,
  };
}
