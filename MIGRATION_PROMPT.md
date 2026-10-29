# Dwell Mobile: migration prompt

The brief Claude follows to build the React Native version of Dwell. Review it, change anything, then say go.

---

## Role and goal

You are porting **Dwell** (peer-to-peer EV charge-and-ride for Massachusetts) from the React web app in
`../VoltLot` (GitHub `jwagojo/Dwell`, `main` @ `94fda61`) to a **React Native app** in this repo
(`jwagojo/DwellMobile`, branch **`draft`**). Wes's direction: React Native, talking to **the exact same backend**.

Done means: a driver and a host can do the whole demo story on a phone ("book, park, charge, go"), with the same
screens, rules, prices and copy as the web app, against the same Cognito user pool and HTTP API.

## Ground rules

1. **Workspace:** commit only to `draft` in `DwellMobile`. Never push, never touch `main`, never force-push.
   Pushing and PRs are the user's call (Wes reviews). Small commits, one per milestone below.
2. **The web repo is read-only reference.** Never edit `../VoltLot`. If the backend seems to need a change, stop
   and report it instead of changing it.
3. **Same backend, no new backend.** No Amplify libraries (`aws-amplify`, `@aws-amplify/*`): the project rules
   forbid them (`.kiro/steering/voltlot-rules.md` §2). The app talks only to Cognito's public user-pool API and to
   the Dwell HTTP API with a bearer token, exactly like `src/adapters/cognito.ts` and `src/adapters/dwellApi.ts`.
   It never holds AWS credentials and never calls DynamoDB or S3 except through presigned URLs from the API.
4. **The server decides money and status.** The app shows engine results for display only; the Lambdas recompute.
5. **Read before building.** Source of truth, in order: `.kiro/specs/voltlot-mvp/requirements.md`,
   `.kiro/steering/{product,tech,structure,voltlot-rules}.md`, `design.md`, then the web code itself.
6. **Copy rules carry over** (voltlot-rules.md §1): say "Estimated Miles Added", never "full charge"; never call
   exported solar "wasted"; never ask the driver whether they own an adapter; "No key handoff, car never moves,
   host never touches the car."
7. **Pin exact versions** (`save-exact=true` in `.npmrc`, like the web repo). Use versions that are the current
   stable release and at least two weeks old.
8. **Verify before claiming.** Typecheck and tests pass at every milestone; say plainly what was and wasn't run on
   a real device.

## Stack (defaults; the user can override)

| Concern | Choice | Why |
|---|---|---|
| Framework | **Expo** (managed workflow, latest stable SDK), TypeScript strict | Runs on a phone through Expo Go or a dev build without Xcode; the user is on Windows |
| Navigation | **expo-router** (file-based) | Maps 1:1 onto the web's 10 routes |
| Styling | `StyleSheet` + a `theme.ts` copied from `src/tokens.css` (Hallmark "Garden": dark green on warm oat, Vollkorn 600 heads, Hanken Grotesk body) via `expo-font` | Same look, no web CSS |
| Map | **`@maplibre/maplibre-react-native`** with the same OpenFreeMap "positron" style | Same tiles and look as the web, no API key. Needs an Expo dev build (not Expo Go) |
| Location | `expo-location` | Near me, "I'm at the spot", 50 m pickup check |
| Camera / photos | `expo-image-picker` (camera + library), `expo-image-manipulator` to resize to JPEG | Arrival, pickup and listing photos |
| Session tokens | `expo-secure-store` | Keychain/Keystore: safer than the web's sessionStorage |
| Prefs and prototype data | `@react-native-async-storage/async-storage` | Replaces localStorage |
| Tests | Jest via `jest-expo` | Expo's supported runner (the web uses Vitest) |
| Polyfills | `react-native-url-polyfill` | `dwellApi.ts` builds URLs with `new URL(path, base)` |

## Code reuse

The web repo's pure layers have no DOM and already run inside Lambdas, so they port as-is. **Copy** them into
`src/shared/` (two repos, so no workspace link), with a header comment naming the source path and commit, and a
`scripts/sync-shared` note listing every copied file so they can be re-synced when the web changes:

- `src/engines/*` (pricing, billing, climate, rate, plug, money, constants, types) and their tests
- `src/features/**` (evaluateListing, bookingGuard, pickup, settleBooking, validateListing) and tests
- `src/types/*`
- pure `src/lib/*`: geo, availability, format, accountRules, massachusetts, eia, hostEntry
- `src/data/*` sample data (stations, destinations, transit colors, evFallbackSeed, sampleIrradiance, heroPreview)
- `src/adapters/cognito.ts` and `src/adapters/dwellApi.ts` (plain fetch: work unchanged with the URL polyfill)

**Rewrite for mobile** (browser-only today):

- `lib/backendConfig.ts`: read the 4 values (`apiUrl`, `region`, `userPoolId`, `userPoolClientId`) from
  `app.config.ts` `extra`, filled from `EXPO_PUBLIC_DWELL_*` env vars; keep `parseBackendConfig` validation.
  Missing or invalid config means prototype mode, same as the web.
- `lib/upload.ts`: same presigned-POST flow and 30 s budget, but append the file as
  `{ uri, name: 'photo.jpg', type: 'image/jpeg' }` (React Native FormData can't build a Blob from bytes).
- `lib/image.ts`: resize with `expo-image-manipulator` instead of canvas.
- `adapters/geolocation.ts`: `expo-location`, same 30 s budget and typed results, permission prompt only on tap.
- `adapters/{photon,mapbox}Geocoding.ts`, `eiaRates.ts`: keep the logic, read keys from `EXPO_PUBLIC_*` instead of
  `import.meta.env`. Same rule: never accept a secret `sk.` Mapbox token.
- `state/AppState.tsx`, `state/persisted.ts`, `state/backend.ts`: same shape and behavior; AsyncStorage for
  prefs and prototype data, SecureStore for the Cognito session.
- `state/accounts.ts` (prototype sign-in): keep the salted PBKDF2 hash using `expo-crypto`, or, if that's not
  available, drop prototype sign-in and require backend mode. Report which.

## Screens (web route → mobile screen)

Port each page's behavior, guards and copy; redesign the layout for a phone (one column, bottom sheets instead
of side panels, large tap targets).

| Web | Mobile | Notes |
|---|---|---|
| `/` Landing | `app/index.tsx` | Destination search, Near me, popular stations, sample priced ledger, four steps, Become a host, booking banner |
| `/signup` (`?next=host`) | `app/signup.tsx` | Same fields and Cognito rules; email code confirm (`ConfirmEmail`) |
| `/signin`, `/signout` | `app/signin.tsx`, sign-out action | Sign-out keeps or revokes exactly like the web |
| `/search` | `app/(tabs)/search.tsx` | Full-screen map with price pins + draggable results sheet; car picker, start hour, 1–12 h, level filter, sort; hidden-for-plug and not-open counts |
| `/listing/:id` | `app/listing/[id].tsx` | Trip, charger fit, Green Score, instructions, booking panel with every booking block and its reason |
| `/session` | `app/session.tsx` | Arrived (camera) → Charging (countdown / late minutes) → Pickup (location + photo, 50 m, photo-only flagged fallback) → Done (receipt). Keep the demo-controls panel |
| `/host` | `app/host/index.tsx` | Own listing as drivers see it, private address, edit, remove |
| `/host/new`, `/host/edit` | `app/host/wizard.tsx` | Same 6 steps and `validateListing` rules; pin picker on the native map |

The header's "Host an EV charger / Switch to Hosting / Switch to Driving" becomes a **Driving / Hosting** switch
(tab bar or header toggle), still one account and at most one listing.

## Milestones (one commit each, stop and report after each)

1. **Scaffold:** Expo + TypeScript strict + expo-router + fonts + theme on `draft`. `.npmrc`, `.gitignore`,
   `.env.example` with placeholder `EXPO_PUBLIC_*` names only. Runs to a blank themed screen.
2. **Shared core:** copy the pure modules and their tests; port the tests to Jest; all pass.
3. **Platform adapters:** config, storage, secure session, location, photo pick/resize/upload, URL polyfill, with
   tests using mocks.
4. **Auth:** sign-up, email confirm, sign-in, sign-out; prototype mode when no config.
5. **Driver flow:** landing, search with map, listing, booking.
6. **Session flow:** arrival photo, charging, pickup with location check, receipt, demo controls.
7. **Host flow:** host home and the 6-step wizard with pin picker and photo upload.
8. **Polish and check:** empty/error/offline states, permission denials, small screens, Android back button.
   README with setup and run steps. Final report.

## Known limits to report, not work around

- **The backend is deployed on AWS** (confirmed by the user, Oct 29). Point the app at that stage with its four
  public values (`apiUrl`, `region`, `userPoolId`, `userPoolClientId`, the same ones in the web's `/config.json`),
  supplied through `.env` (git-ignored). Never deploy, change or seed the backend; never commit the values' `.env`.
- **Photos in prototype mode** stay on the device, like the web's data URLs.
- **iOS ships through TestFlight.** On Windows, iOS builds go through EAS Build (cloud) and `eas submit` to
  TestFlight. Set up `eas.json` with a `development` profile (dev client, needed for MapLibre) and a `preview`/
  `production` profile for TestFlight. Logging in to Expo/EAS and Apple, and running the builds and submits, is the
  user's step; Claude prepares the config and the exact commands. Set `ios.bundleIdentifier` and
  `android.package` to placeholders the user confirms (suggested `com.dwell.mobile`).
- Everything still missing on the web (MBTA, Open-Meteo, Mapbox Directions, host bookings view, property tests)
  stays out of scope unless the user asks.

## Final report

What works, what was verified on a device versus only by tests, every deviation from the web app and why, and
anything the backend would need changed (expected: nothing).
