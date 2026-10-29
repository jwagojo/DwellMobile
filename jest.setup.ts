import { beforeAll } from '@jest/globals';

/**
 * Test environment only. Under jest-expo, `Response` comes from Node's fetch, which runs in a different JavaScript
 * realm from the tests, so a bad JSON body rejects with Node's SyntaxError and `err instanceof SyntaxError` is false
 * inside the shared adapters (src/shared/adapters/eiaRates.ts). On a phone there is one realm and the check works.
 * Re-throw parse errors as this realm's SyntaxError so the shared code runs here exactly as it does on a device.
 * Patched in beforeAll because React Native's test setup installs `Response` after this file loads.
 */
beforeAll(() => {
  const proto = Response.prototype as Response & { dwellRealmPatched?: true };
  if (proto.dwellRealmPatched) return;
  const json = proto.json;
  proto.json = async function (this: Response) {
    try {
      return await json.call(this);
    } catch (err) {
      // Node's error fails `instanceof Error` here too (same realm problem), so test the name.
      const e = err as { name?: unknown; message?: unknown };
      if (e?.name === 'SyntaxError' && !(err instanceof SyntaxError)) throw new SyntaxError(String(e.message));
      throw err;
    }
  };
  proto.dwellRealmPatched = true;
});
