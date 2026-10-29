import { describe, expect, it, jest } from '@jest/globals';

import { DwellBackend, SESSION_KEY } from '@/shared/state/backend';
import { backendConfigFromEnv } from './config';
import { locateUser } from './location';
import { takePhoto } from './photos';
import { CHUNK_CHARS, createSecureSessionStore } from './secureSession';
import { hydrateStore } from './storage';
import { base64Bytes, uploadPhoto } from './upload';

const ENV = {
  apiUrl: 'https://abc123.execute-api.us-east-2.amazonaws.com',
  region: 'us-east-2',
  userPoolId: 'us-east-2_AbC123',
  userPoolClientId: 'abcdefghij1234567890',
};

describe('backendConfigFromEnv', () => {
  it('accepts the deployed stage values, trimming stray spaces', () => {
    expect(backendConfigFromEnv({ ...ENV, region: ' us-east-2 ' })).toEqual({ ...ENV, apiUrl: `${ENV.apiUrl}/` });
  });
  it('means prototype mode when a value is missing or unsafe', () => {
    expect(backendConfigFromEnv({ ...ENV, userPoolId: undefined })).toBeNull();
    expect(backendConfigFromEnv({ ...ENV, apiUrl: 'http://abc123.execute-api.us-east-2.amazonaws.com' })).toBeNull();
    expect(backendConfigFromEnv({})).toBeNull();
  });
});

function fakeAsyncStorage(initial: Record<string, string> = {}) {
  const disk = new Map(Object.entries(initial));
  return {
    disk,
    getAllKeys: async () => [...disk.keys()],
    multiGet: async (keys: readonly string[]) => keys.map((k) => [k, disk.get(k) ?? null] as [string, string | null]),
    setItem: async (k: string, v: string) => void disk.set(k, v),
    removeItem: async (k: string) => void disk.delete(k),
  };
}

describe('hydrateStore', () => {
  it('loads only Dwell keys and answers reads from memory', async () => {
    const backing = fakeAsyncStorage({ 'dwell.prototype.v1': '{"v":3}', 'voltlot.prototype.v1': 'old', 'other.app': 'x' });
    const store = await hydrateStore(backing as never);
    expect(store.getItem('dwell.prototype.v1')).toBe('{"v":3}');
    expect(store.getItem('voltlot.prototype.v1')).toBe('old');
    expect(store.getItem('other.app')).toBeNull();
  });

  it('writes changes through in order', async () => {
    const backing = fakeAsyncStorage();
    const store = await hydrateStore(backing as never);
    store.setItem('dwell.a', '1');
    store.setItem('dwell.a', '2');
    store.setItem('dwell.b', '3');
    store.removeItem('dwell.b');
    expect(store.getItem('dwell.a')).toBe('2');
    await store.flush();
    expect(Object.fromEntries(backing.disk)).toEqual({ 'dwell.a': '2' });
  });

  it('starts fresh when the disk cannot be read', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const store = await hydrateStore({ ...fakeAsyncStorage(), getAllKeys: async () => Promise.reject(new Error('io')) } as never);
    expect(store.getItem('dwell.a')).toBeNull();
    warn.mockRestore();
  });
});

function fakeSecureStore() {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (v.length > 2048) throw new Error('value too large for this test store');
      items.set(k, v);
    },
    deleteItemAsync: async (k: string) => void items.delete(k),
  };
}

describe('createSecureSessionStore', () => {
  it('stores a session larger than one secure-store value in chunks', () => {
    const native = fakeSecureStore();
    const store = createSecureSessionStore(native as never);
    const big = 'x'.repeat(CHUNK_CHARS * 2 + 10);
    store.setItem('dwell.session.v1', big);
    expect(native.items.get('dwell.session.v1.n')).toBe('3');
    expect(store.getItem('dwell.session.v1')).toBe(big);
  });

  it('drops leftover chunks when the value shrinks, and reads nothing after removal', async () => {
    const native = fakeSecureStore();
    const store = createSecureSessionStore(native as never);
    store.setItem('k', 'y'.repeat(CHUNK_CHARS * 3));
    store.setItem('k', 'short');
    await Promise.resolve();
    expect([...native.items.keys()].sort()).toEqual(['k.0', 'k.n']);
    expect(store.getItem('k')).toBe('short');
    store.removeItem('k');
    expect(store.getItem('k')).toBeNull();
  });

  it('treats a missing chunk as signed out', () => {
    const native = fakeSecureStore();
    const store = createSecureSessionStore(native as never);
    store.setItem('k', 'z'.repeat(CHUNK_CHARS + 1));
    native.items.delete('k.1');
    expect(store.getItem('k')).toBeNull();
  });

  it('keeps a real Cognito session for the shared DwellBackend', () => {
    const native = fakeSecureStore();
    const store = createSecureSessionStore(native as never);
    const session = { email: 'a@b.co', accessToken: 'a'.repeat(1100), refreshToken: 'r'.repeat(1800), expiresAt: Date.now() + 3_600_000 };
    store.setItem(SESSION_KEY, JSON.stringify(session));
    const backend = new DwellBackend(backendConfigFromEnv(ENV)!, store);
    expect(backend.signedIn).toBe(true);
    expect(backend.email).toBe('a@b.co');
  });
});

describe('locateUser', () => {
  const position = { coords: { latitude: 42.3655, longitude: -71.1039, accuracy: 12 } };
  const native = (over: Record<string, unknown> = {}) =>
    ({
      requestForegroundPermissionsAsync: async () => ({ status: 'granted' }),
      hasServicesEnabledAsync: async () => true,
      getCurrentPositionAsync: async () => position,
      ...over,
    }) as never;

  it('returns the position', async () => {
    expect(await locateUser({ native: native() })).toEqual({ ok: true, lat: 42.3655, lng: -71.1039, accuracyM: 12 });
  });
  it('says so when permission is refused or location services are off', async () => {
    expect(await locateUser({ native: native({ requestForegroundPermissionsAsync: async () => ({ status: 'denied' }) }) })).toMatchObject({ ok: false, reason: 'DENIED' });
    expect(await locateUser({ native: native({ hasServicesEnabledAsync: async () => false }) })).toMatchObject({ ok: false, reason: 'UNAVAILABLE' });
  });
  it('gives up at the timeout, including an ignored permission prompt', async () => {
    const r = await locateUser({ timeoutMs: 20, native: native({ requestForegroundPermissionsAsync: () => new Promise(() => {}) }) });
    expect(r).toMatchObject({ ok: false, reason: 'TIMEOUT' });
  });
});

describe('takePhoto', () => {
  const granted = async () => ({ granted: true });
  const picker = (over: Record<string, unknown> = {}) =>
    ({
      requestCameraPermissionsAsync: granted,
      requestMediaLibraryPermissionsAsync: granted,
      launchCameraAsync: async () => ({ canceled: false, assets: [{ uri: 'file:///cam.jpg', width: 4000, height: 3000 }] }),
      launchImageLibraryAsync: async () => ({ canceled: true, assets: null }),
      ...over,
    }) as never;

  it('returns a resized JPEG data URL', async () => {
    const resize = jest.fn(async (_uri: string, _width: number, _height: number, _maxDim: number) => 'QUJD');
    expect(await takePhoto('camera', { picker: picker(), resize })).toEqual({ ok: true, dataUrl: 'data:image/jpeg;base64,QUJD' });
    expect(resize).toHaveBeenCalledWith('file:///cam.jpg', 4000, 3000, 800);
  });
  it('separates a cancel from a refusal', async () => {
    expect(await takePhoto('library', { picker: picker() })).toMatchObject({ ok: false, reason: 'CANCELLED' });
    const refused = picker({ requestCameraPermissionsAsync: async () => ({ granted: false }) });
    expect(await takePhoto('camera', { picker: refused })).toMatchObject({ ok: false, reason: 'DENIED' });
  });
});

describe('uploadPhoto', () => {
  const DATA_URL = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
  const presigned = { ok: true as const, status: 200, data: { upload: { key: 'media/bookings/b1/arrival.jpg', url: 'https://bucket.s3.amazonaws.com/', fields: { key: 'media/bookings/b1/arrival.jpg', Policy: 'p' }, maxBytes: 5_000_000 } } };
  const api = (r: unknown = presigned) => ({ createUpload: jest.fn(async () => r) }) as never;
  const temp = () => {
    const dispose = jest.fn();
    return { dispose, writeTemp: jest.fn(async () => ({ uri: 'file:///cache/p.jpg', size: 10, dispose })) };
  };

  it('posts the presigned fields, then the file last, and cleans up the temp file', async () => {
    const t = temp();
    let sent: FormData | null = null;
    const fetchImpl = jest.fn(async (_url: unknown, init?: RequestInit) => {
      sent = init?.body as FormData;
      return new Response(null, { status: 204 });
    });
    const r = await uploadPhoto(api(), { kind: 'arrival', bookingId: 'b1' }, DATA_URL, { fetchImpl: fetchImpl as never, writeTemp: t.writeTemp });
    expect(r).toEqual({ ok: true, key: 'media/bookings/b1/arrival.jpg' });
    // React Native's FormData lists parts with getParts(); under Jest it is Node's, which has keys().
    const form = sent as unknown as { getParts?: () => { fieldName: string }[]; keys: () => Iterable<string> };
    const parts = form.getParts ? form.getParts().map((p) => p.fieldName) : [...form.keys()];
    expect(parts).toEqual(['key', 'Policy', 'file']);
    await Promise.resolve();
    expect(t.dispose).toHaveBeenCalled();
  });

  it('refuses anything that is not a JPEG data URL, and reports a refused presign', async () => {
    expect(await uploadPhoto(api(), { kind: 'listing' }, 'data:image/png;base64,AAAA')).toMatchObject({ ok: false, reason: 'FAILED' });
    const refused = { ok: false, status: 403, code: 'FORBIDDEN', message: 'Not your booking.', details: {} };
    expect(await uploadPhoto(api(refused), { kind: 'pickup', bookingId: 'b1' }, DATA_URL)).toEqual({ ok: false, reason: 'REFUSED', message: 'Not your booking.' });
  });

  it('refuses a photo over the size the API allows', async () => {
    const small = { ...presigned, data: { upload: { ...presigned.data.upload, maxBytes: 4 } } };
    expect(await uploadPhoto(api(small), { kind: 'listing' }, DATA_URL, { writeTemp: temp().writeTemp })).toMatchObject({ ok: false, reason: 'FAILED' });
  });

  it('gives up at the timeout and aborts the request', async () => {
    let aborted = false;
    const fetchImpl = (_url: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          aborted = true;
          reject(new Error('aborted'));
        });
      });
    const r = await uploadPhoto(api(), { kind: 'listing' }, DATA_URL, { fetchImpl: fetchImpl as never, timeoutMs: 20, writeTemp: temp().writeTemp });
    expect(r).toMatchObject({ ok: false, reason: 'TIMEOUT' });
    expect(aborted).toBe(true);
  });

  it('counts decoded bytes without decoding', () => {
    expect(base64Bytes('QUJD')).toBe(3);
    expect(base64Bytes('QUI=')).toBe(2);
    expect(base64Bytes('QQ==')).toBe(1);
  });
});
