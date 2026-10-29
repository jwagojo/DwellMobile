#!/usr/bin/env node
/**
 * Copies the web app's pure modules (no DOM, already shared with the Lambdas) into src/shared/, keeping the web's
 * folder layout so their relative imports work unchanged. The web repo stays the source of truth: change a copied
 * file there, then re-run this script.
 *
 *   node scripts/sync-shared.mjs [path/to/VoltLot]          copy (default: ../VoltLot)
 *   node scripts/sync-shared.mjs [path/to/VoltLot] --check  exit 1 if any copy differs from the web
 *
 * Each copy gets a header naming the source file and commit, and three mechanical rewrites: `import.meta.env.VITE_X`
 * becomes `process.env.EXPO_PUBLIC_X`, `import.meta.env.DEV` becomes `__DEV__`, and tests import `@jest/globals`
 * (with `jest` for `vi`) instead of `vitest`.
 * Files in src/shared/ that are not listed here (lib/mapbox.ts) are mobile versions and are never overwritten.
 * Phone-only code (storage, location, photos, upload) lives in src/platform/.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FILES = [
  'engines/billing.ts',
  'engines/billing.test.ts',
  'engines/climate.ts',
  'engines/climate.test.ts',
  'engines/constants.ts',
  'engines/money.ts',
  'engines/plug.ts',
  'engines/pricing.ts',
  'engines/pricing.test.ts',
  'engines/rate.ts',
  'engines/rate.test.ts',
  'engines/types.ts',
  'features/host/validateListing.ts',
  'features/host/validateListing.test.ts',
  'features/search/evaluateListing.ts',
  'features/session/bookingGuard.ts',
  'features/session/pickup.ts',
  'features/session/settleBooking.ts',
  'features/session/session.test.ts',
  'types/booking.ts',
  'types/destination.ts',
  'types/listing.ts',
  'lib/accountRules.ts',
  'lib/accountRules.test.ts',
  'lib/availability.ts',
  'lib/eia.ts',
  'lib/format.ts',
  'lib/geo.ts',
  'lib/hostEntry.ts',
  'lib/lib.test.ts',
  'lib/massachusetts.ts',
  'data/destinations.ts',
  'data/evFallbackSeed.ts',
  'data/heroPreview.ts',
  'data/sampleIrradiance.ts',
  'data/stations.ts',
  'data/transit.ts',
  'adapters/geocodingTypes.ts',
  'adapters/addressSearch.ts',
  'adapters/mapboxGeocoding.ts',
  'adapters/mapboxGeocoding.test.ts',
  'adapters/photonGeocoding.ts',
  'adapters/eiaRates.ts',
  'adapters/eiaRates.test.ts',
  'adapters/cognito.ts',
  'adapters/dwellApi.ts',
  'adapters/backendClient.test.ts',
  'lib/backendConfig.ts',
  'state/backend.ts',
  'state/persisted.ts',
  'state/persisted.test.ts',
];

const args = process.argv.slice(2);
const check = args.includes('--check');
const webRoot = resolve(args.find((a) => !a.startsWith('--')) ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'VoltLot'));
const outRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'shared');

if (!existsSync(join(webRoot, 'src', 'engines', 'pricing.ts'))) {
  console.error(`No Dwell web app at ${webRoot}. Pass its path: node scripts/sync-shared.mjs path/to/VoltLot`);
  process.exit(1);
}
const commit = execFileSync('git', ['-C', webRoot, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();

// The header names the commit, so --check compares the bodies only: a newer web commit that leaves a file alone
// is not drift.
const HEADER = /^\/\/ Copied from the Dwell web app[^\n]*\n\/\/ [^\n]*\n/;
const body = (text) => text.replace(/\r\n/g, '\n').replace(HEADER, '');

const transform = (rel, source) => {
  let text = source
    .replace(/\r\n/g, '\n')
    // Vite's env becomes Expo's. Expo inlines EXPO_PUBLIC_* only in this exact `process.env.NAME` form.
    .replace(/import\.meta\.env\.VITE_([A-Z0-9_]+)/g, 'process.env.EXPO_PUBLIC_$1')
    .replace(/import\.meta\.env\.DEV/g, '__DEV__')
    // The same names in comments and messages, so they point at the setting the app actually reads.
    .replace(/\bVITE_([A-Z0-9_]+)/g, 'EXPO_PUBLIC_$1');
  if (rel.endsWith('.test.ts')) {
    // Vitest's `vi` helpers used here (fn, fake timers) have the same names on Jest's `jest` object.
    text = text
      .replace(/import \{([^}]*)\} from 'vitest';/g, (_, names) => `import {${names.replace(/\bvi\b/, 'jest')}} from '@jest/globals';`)
      .replace(/\bvi\./g, 'jest.');
  }
  return text;
};

let drift = 0;
for (const rel of FILES) {
  const source = readFileSync(join(webRoot, 'src', rel), 'utf8');
  const header = `// Copied from the Dwell web app (jwagojo/Dwell src/${rel} @ ${commit}) by scripts/sync-shared.mjs.\n// Do not edit here: change the web file, then re-run the script.\n`;
  const next = header + transform(rel, source);
  const target = join(outRoot, rel);
  if (check) {
    if (!existsSync(target) || body(readFileSync(target, 'utf8')) !== body(next)) {
      console.log(`differs: src/shared/${rel}`);
      drift++;
    }
    continue;
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, next);
}

if (check) {
  console.log(drift === 0 ? `src/shared matches the web app @ ${commit}.` : `${drift} file(s) differ from the web app @ ${commit}. Run the script without --check.`);
  process.exit(drift === 0 ? 0 : 1);
}
console.log(`Copied ${FILES.length} files from ${webRoot} @ ${commit} into src/shared/.`);
