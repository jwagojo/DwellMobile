import { File, Paths } from 'expo-file-system';

import type { DwellApi } from '@/shared/adapters/dwellApi';

/**
 * Phone version of the web's src/lib/upload.ts: the one photo upload for listing, arrival and pickup photos. The API
 * issues a presigned POST for one exact key, then the photo goes straight to the private S3 bucket. Same 30 s budget
 * and the same results; never throws, and the caller only moves on with `ok: true`.
 *
 * The difference: React Native's FormData can't send bytes built in JavaScript (the web turns the data URL into a
 * Blob). It sends files by URI, so the photo is written to a temporary file first and deleted afterwards.
 */

export const UPLOAD_TIMEOUT_MS = 30_000;

export type UploadResult = { ok: true; key: string } | { ok: false; reason: 'TIMEOUT' | 'REFUSED' | 'FAILED'; message: string };

export interface UploadDeps {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Writes the JPEG to a temporary file and returns its URI and size; `dispose` removes it. */
  writeTemp?: (base64: string) => Promise<{ uri: string; size: number; dispose: () => void }>;
}

const JPEG_DATA_URL = /^data:image\/jpeg;base64,(.+)$/s;

/** Bytes a base64 string decodes to, without decoding it. */
export const base64Bytes = (b64: string) => Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);

const writeTempFile: NonNullable<UploadDeps['writeTemp']> = async (base64) => {
  const file = new File(Paths.cache, `dwell-upload-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`);
  await file.write(base64, { encoding: 'base64' });
  return {
    uri: file.uri,
    size: base64Bytes(base64),
    dispose: () => {
      try {
        file.delete();
      } catch {
        // already gone; the OS clears the cache folder anyway
      }
    },
  };
};

export async function uploadPhoto(
  api: Pick<DwellApi, 'createUpload'>,
  target: { kind: 'listing' | 'arrival' | 'pickup'; bookingId?: string },
  dataUrl: string,
  deps: UploadDeps = {},
): Promise<UploadResult> {
  const m = JPEG_DATA_URL.exec(dataUrl);
  if (!m) return { ok: false, reason: 'FAILED', message: 'That photo couldn’t be read. Take it again.' };
  const base64 = m[1];

  const timeoutMs = deps.timeoutMs ?? UPLOAD_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const controller = new AbortController();
  const timeout = new Promise<UploadResult>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ ok: false, reason: 'TIMEOUT', message: `The upload took longer than ${timeoutMs / 1000} seconds. Try again.` });
    }, timeoutMs);
  });

  let temp: Awaited<ReturnType<NonNullable<UploadDeps['writeTemp']>>> | null = null;
  const attempt = (async (): Promise<UploadResult> => {
    const presign = await api.createUpload(target);
    if (!presign.ok) return { ok: false, reason: 'REFUSED', message: presign.message };
    const { url, fields, key, maxBytes } = presign.data.upload;
    if (base64Bytes(base64) > maxBytes) return { ok: false, reason: 'FAILED', message: 'That photo is too large. Take it again.' };
    try {
      temp = await (deps.writeTemp ?? writeTempFile)(base64);
    } catch {
      return { ok: false, reason: 'FAILED', message: 'That photo couldn’t be read. Take it again.' };
    }
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    // React Native's FormData file part. S3 requires the file to be the last field.
    form.append('file', { uri: temp.uri, name: 'photo.jpg', type: 'image/jpeg' } as unknown as Blob);
    try {
      const res = await (deps.fetchImpl ?? fetch)(url, { method: 'POST', body: form, signal: controller.signal });
      return res.ok ? { ok: true, key } : { ok: false, reason: 'FAILED', message: 'The photo didn’t upload. Try again.' };
    } catch {
      return { ok: false, reason: 'FAILED', message: 'The photo didn’t upload. Check your connection and try again.' };
    }
  })();

  try {
    return await Promise.race([attempt, timeout]);
  } finally {
    clearTimeout(timer);
    // On a timeout the attempt may still be writing the file; clean up once it settles.
    void attempt.finally(() => (temp as { dispose: () => void } | null)?.dispose());
  }
}
