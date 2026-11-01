# AsistenSiswa — Mobile App

Expo (SDK 50, React Native 0.73.6) + TypeScript client for the AsistenSiswa
backend. Students see today's duty, uniform checklist, homework and exam
schedule; late homework is red, published exams are read-only.

> SDK 50 is the Expo release that pairs with RN 0.73.6. If the team pins SDK 49
> instead, RN must move to 0.72.x.

## Run

```bash
cp .env.example .env      # optional; defaults to localhost:4000
npm install
npm start                 # Expo dev server (a/i for Android/iOS)
```

The API base URL resolves from `EXPO_PUBLIC_API_URL` first, then
`app.json → expo.extra.apiUrl`. Both must include the `/api/v1` prefix.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm start` | Expo dev server |
| `npm run android` / `npm run ios` | Launch on a device/simulator |
| `npm run lint` | ESLint (`src`, `tests`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Jest + React Native Testing Library |
| `npm run test:coverage` | Same + coverage gate |

## Structure

```
App.tsx                     providers (store, theme, safe area), session restore
src/
├─ api/        client.ts (fetch, bearer, 401 refresh), types.ts (openapi mirror)
├─ components/ Screen, Card, StatusBadge, ChecklistRow, PrimaryButton, EmptyState
├─ navigation/ RootNavigator (auth stack vs. lazy bottom tabs)
├─ screens/    Login, Register, Dashboard, Duty, Homework, Exam, Uniform
├─ store/      Redux Toolkit slices, session storage
├─ theme/      tokens (light/dark), WCAG contrast helpers
└─ utils/      Indonesian date/clock/relative-day formatting
```

### Offline mode

The app is local-first. `src/offline/repository.ts` wraps every data call: it
uses the API when reachable and falls back to a bundled dataset
(`src/offline/seed.ts`) on transport failures, so airplane mode still shows
duty, uniform, homework and exams. Offline mutations (complete duty, tick a
uniform item) are written to AsyncStorage and survive restarts.

"Mode offline (data contoh)" on the login screen opens the demo dataset without
credentials; `restoreSession` reopens it on the next launch until the user signs
out. Server errors (401/403/5xx) are **not** masked by the fallback.

ponytail: offline writes are not queued for `/sync/push`. Add a change log plus
WatermelonDB when edits must reach other devices.

### State

`authSlice` owns the session and persists only the rotating token pair
(AsyncStorage). `dataSlice` caches the last successful payload per resource, so
a failed refresh keeps the previous list on screen instead of blanking it.
API 401s trigger exactly one refresh attempt; concurrent 401s share it, because
refresh tokens are single-use.

### Accessibility

- Every interactive element has a role, label and state (`checkbox`, `button`,
  `busy`/`disabled`); badges are announced as part of their card.
- Touch targets are at least 48dp (`theme.touchTarget`).
- Body text pairs are verified at ≥ 4.5:1 and filled-surface labels at ≥ 4.5:1
  in both modes by `tests/contrast.test.ts`. Brand `#2E86C1` on white is only
  3.97:1, so it is reserved for large text/icons; buttons use `#1B5F8F`.
- Light and dark palettes follow `userInterfaceStyle: automatic`.

### Colour coding

`statusTone()` maps server statuses (`COMPLETED`, `TODAY`, `OVERDUE`, `LATE`,
`PARTIAL`, `HOLIDAY`, and the server's `accentColor` hex) to green / yellow /
red. Colour is never the only signal — every card carries a text badge.

## Testing

```bash
npm test                  # 76 tests, 8 suites
npm run test:coverage     # gate: statements 80, branches 70, functions 80, lines 80
```

Screens are rendered through the real store with a fake `Api` implementation, so
thunks, loading and error states are exercised rather than mocked away.
`tests/contrast.test.ts` is the a11y regression gate for the palette.

## Build an APK locally

Requires JDK 17 and Android SDK 34 (`ANDROID_HOME` set). No Expo account needed.

```bash
npx expo prebuild -p android          # generates android/ (already committed?)
cd android && ./gradlew assembleRelease
# -> app/build/outputs/apk/release/app-release.apk
```

The generated project signs release builds with the debug keystore, so the APK
installs on a device but is **not** store-ready.

Point the app at your API in `app.json → expo.extra.apiUrl` (for example
`http://192.168.1.10:4000/api/v1`), then rebuild. `EXPO_PUBLIC_API_URL` still
overrides it when the JS bundle is produced, but Gradle/Metro caches can keep an
older value, so the config file is the reliable source for a demo build:

```bash
rm -rf android/app/build && (cd android && ./gradlew assembleRelease)
```

Cleartext HTTP is enabled through `expo-build-properties`
(`android.usesCleartextTraffic`). Remove it for production and serve the API
over TLS.

## Not built yet

- WatermelonDB + `POST /sync/push` replay for offline edits (the demo cache is
  device-local only).
- Expo push-token registration (`POST /auth/push-tokens`) and notification
  handlers for the H-1 duty reminder.
- Detox E2E and store release pipelines.
