# AsistenKu (AKU) — Mobile App

Expo (SDK 50, React Native 0.73.6) + TypeScript app. Students see today's duty,
uniform checklist, homework, exam schedule and subjects; late homework is red,
published exams are read-only.

**Fully offline.** The app has no API client, no login and no INTERNET
permission — every screen reads and writes a dataset bundled in the APK.

> SDK 50 is the Expo release that pairs with RN 0.73.6. If the team pins SDK 49
> instead, RN must move to 0.72.x.

## Run

```bash
npm install
npm start                 # Expo dev server (a/i for Android/iOS)
```

There is nothing to configure: no server, no credentials, no environment
variables.

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
App.tsx                     providers (store, theme, safe area)
src/
├─ api/        types.ts (shared model types)
├─ components/ Screen, Card, StatusBadge, ChecklistRow, PrimaryButton, EmptyState
├─ navigation/ RootNavigator (lazy bottom tabs, no auth stack)
├─ offline/    seed.ts (bundled dataset), storage.ts (AsyncStorage), repository.ts
├─ screens/    Dashboard, Duty, Homework, Exam, Uniform, Subjects
├─ store/      Redux Toolkit data slice
├─ theme/      tokens (light/dark), WCAG contrast helpers
└─ utils/      Indonesian date/clock/relative-day formatting
```

### Data

`src/offline/seed.ts` is the dataset (dates are relative to today, so the app
always looks current). `storage.ts` seeds AsyncStorage once and persists
mutations, rolling the uniform checklist over at midnight; `repository.ts` is
the only data source — no fetch, no server.

Completing a duty or ticking a uniform item writes straight to the device store
and survives restarts. "Reset data contoh" on the dashboard restores the seed.
`android.blockedPermissions` removes INTERNET, so the APK cannot reach a network
even by accident.

ponytail: data is device-local. Add export/import or a sync layer when it must
move between devices.

### State

`dataSlice` holds the loaded resources and their status. A storage failure
surfaces as an error while keeping any previously loaded rows on screen.

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
npm test                  # 56 tests, 6 suites
npm run test:coverage     # gate: statements 80, branches 70, functions 80, lines 80
```

Screens are rendered through the real store backed by in-memory AsyncStorage, so
thunks, persistence, loading and error states are exercised rather than mocked
away.
`tests/contrast.test.ts` is the a11y regression gate for the palette.

## Brand assets

`python3 scripts/make-icon.py` regenerates `assets/icon.png`,
`adaptive-icon.png`, `splash.png` and `favicon.png` from code (Pillow, Gabarito
font). Colours match `src/theme/tokens.ts`.

## Build an APK locally

Requires JDK 17 and Android SDK 34 (`ANDROID_HOME` set). No Expo account needed.

```bash
npx expo prebuild -p android
cd android && ./gradlew clean assembleRelease
# -> app/build/outputs/apk/release/app-release.apk  (id.sch.asistenku)
```

The generated project signs release builds with the debug keystore, so the APK
installs on a device but is **not** store-ready. `gradle` caches `app.config` and
the JS bundle aggressively — use `clean` (or delete `android/app/build`) when a
change does not show up in the APK.

## Not built yet

- Export/import or multi-device sync (data is device-local).
- Detox E2E and store release pipelines (debug-signed demo APK only).
