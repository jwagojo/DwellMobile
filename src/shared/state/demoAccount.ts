// Copied from the Dwell web app (jwagojo/Dwell src/state/demoAccount.ts @ 94fda61) by scripts/sync-shared.mjs.
// Do not edit here: change the web file, then re-run the script.
import { registerAccount } from './accounts';

/**
 * A ready-made account for trying the app locally, so nobody has to sign up on every fresh browser or after
 * clearing storage. It is created only by the dev server (`npm run dev`). `__DEV__` is false in a
 * production build, so none of this ships: not the account and not the password below.
 * The data is made up and the password protects nothing real.
 */
export const DEMO_EMAIL = 'demo@dwell.test';
export const DEMO_PASSWORD = 'dwell-demo-2026';

export const SHOW_DEMO_HINT: boolean = __DEV__;

/** Create the demo account if this browser doesn't have it yet. Safe to call on every start. */
export async function seedDemoAccount(storage: Pick<Storage, 'getItem' | 'setItem'>): Promise<void> {
  if (!__DEV__) return;
  await registerAccount(storage, DEMO_PASSWORD, {
    user: { name: 'Demo Driver', email: DEMO_EMAIL, phone: '6175550100' },
    car: null,
    hostListing: null,
    booking: null,
  });
  // "Already exists" is the normal case after the first run, so the result is ignored.
}
