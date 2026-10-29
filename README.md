# Dwell Mobile

The iPhone and Android app for **Dwell**, peer-to-peer charge-and-ride for Massachusetts EV drivers. It is a React
Native (Expo) port of the web app in [`jwagojo/Dwell`](https://github.com/jwagojo/Dwell) and talks to the **same
backend**: the same Cognito user pool and the same HTTP API, with nothing changed on the server.

Book, park, charge, go: drivers book a host's home charger near a T stop or an address, park, plug in and ride the
rest of the way. No key handoff, the car never moves, and the host never touches the car.

## What's in the app

| Screen | Web page it ports |
|---|---|
| Landing (`/`) | `Landing.tsx`: destination search, Near me, popular stations, priced preview |
| Sign up, sign in, sign out | `SignUp.tsx`, `SignIn.tsx`, `SignOut.tsx`, plus the Cognito email-code step |
| Search (`/search`) | `Search.tsx`: destination, time window, car, level, map and results |
| Listing (`/listing/:id`) | `ListingPage.tsx`: trip, charger fit, Green Score, booking panel |
| Session (`/session`) | `Session.tsx`: Arrived → Charging → Pickup (50 m check) → Done, with demo controls |
| Host home (`/host`) | `HostHome.tsx`: your listing, what drivers pay, edit, remove |
| Listing wizard (`/host/new`, `/host/edit`) | `HostSignup.tsx`: the six steps |

Differences from the web, on purpose:

- **Offline mode lists the 34 sample listings** that are seeded into the backend, so search has chargers without a
  backend. The web's offline mode shows only your own listing.
- **The host pin is tapped into place** and nudged 5 m with arrows, instead of dragged.
- **The Cognito session lives in the iOS Keychain / Android Keystore** (the web uses sessionStorage), so you stay
  signed in after closing the app. Sign-out still revokes it.
- **Launching offline with a saved session** shows "Couldn't reach Dwell" with Try again, instead of looking signed out.
- **Select menus are bottom sheets**, and the web's side-by-side layouts stack in one scrolling screen.

## How the code is organized

```
src/
  app/          Screens (Expo Router: one file per route)
  components/   UI: buttons and fields (ui.tsx), badges, map/, host/ (wizard, pin picker), …
  state/        AppState: the web's app state on phone storage
  platform/     Phone-only code: backend config, storage, secure session, location, photos, S3 upload
  shared/       Copied from the web app by scripts/sync-shared.mjs. Do not edit here.
  theme.ts      The web's "Garden" colors and fonts
```

**`src/shared/` is the web app's own code**: the pricing, billing, Green Score, booking and validation logic, the
Cognito and API clients, and the sample data. Prices and rules match the website and the backend because it is the
same code. When the web changes:

```bash
npm run sync-shared
```

```bash
npm run check-shared
```

The first copies the files again from `../VoltLot` (a clone of the web repo next to this one); the second reports
any file that has drifted. Two files there are phone versions and are never overwritten: `lib/mapbox.ts` and
`state/accounts.ts` (password hashing without WebCrypto). The copies themselves get small mechanical rewrites:
`VITE_*` names become `EXPO_PUBLIC_*`, and tests use Jest instead of Vitest.

## Setup

Needs Node 22.12 or newer.

```bash
npm install
```

Copy `.env.example` to `.env` and fill in the deployed backend's four public values. They are the same four the
website reads from its `/config.json` (open the deployed site with `/config.json` on the end). `.env` is git-ignored.
**Without them the app runs in offline mode** on the phone's own storage, with a demo account in development builds:
`demo@dwell.test` / `dwell-demo-2026`.

## Run it

**In the browser** (quickest check of screens and flows; no camera, the map is the labeled schematic):

```bash
npm run web
```

**On your phone with Expo Go** (install Expo Go from the App Store or Play Store, then scan the QR code):

```bash
npm start
```

Everything works in Expo Go except the live map, which shows the labeled schematic instead.

**With the live map** you need a development build (see below), then:

```bash
npm start
```

## Tests and checks

```bash
npm test
```

```bash
npm run typecheck
```

```bash
npx expo-doctor
```

`npm test` runs the web's own tests on the copied logic plus the phone code's tests (218 in total).

## Building for phones and TestFlight (EAS)

Builds run in Expo's cloud (EAS), so iPhone builds work from Windows. You log in yourself; the config is in `eas.json`.

1. Log in to Expo and link the project (adds the project id to `app.json`):

   ```bash
   npx eas-cli@latest login
   ```

   ```bash
   npx eas-cli@latest init
   ```

2. **Check the bundle id.** `app.json` uses `com.dwell.mobile` as a placeholder. If your team already has an app in
   App Store Connect, set `ios.bundleIdentifier` (and `android.package`) to its id before the first build.

3. Give EAS the backend values (`.env` is not uploaded). Run each of these once, with your values, for each
   environment you build (`development`, `preview`, `production`):

   ```bash
   npx eas-cli@latest env:create --environment production --name EXPO_PUBLIC_DWELL_API_URL --value "https://…/" --visibility plaintext
   ```

   Do the same for `EXPO_PUBLIC_DWELL_REGION`, `EXPO_PUBLIC_DWELL_USER_POOL_ID` and
   `EXPO_PUBLIC_DWELL_USER_POOL_CLIENT_ID`. Leave them out to build an offline-mode app.

4. Build:

   - A development build with the live map, installed on your own phone:

     ```bash
     npx eas-cli@latest build --profile development --platform ios
     ```

   - A TestFlight build:

     ```bash
     npx eas-cli@latest build --profile production --platform ios
     ```

     ```bash
     npx eas-cli@latest submit --platform ios --latest
     ```

   iOS builds ask for your Apple Developer login the first time, to make the signing certificate and profile.
   Use `--platform android` for Android.

## Not done yet

- **Never run on a real phone so far.** The camera, GPS, the live MapLibre map, secure storage and real sign-in to
  the live backend are built and unit-tested but only a device can confirm them.
- **App icon and splash** are Expo's placeholders. A square Dwell logo (1024×1024) is needed before TestFlight.
- What the web hasn't built yet isn't here either: MBTA transit data, Open-Meteo sunlight, walking directions, the
  host's bookings list.

The plan this was built from is [`MIGRATION_PROMPT.md`](MIGRATION_PROMPT.md).
