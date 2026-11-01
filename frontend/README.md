# AsistenKu (AKU) — Mobile App

Expo (SDK 50, React Native 0.73.6) + TypeScript app that students fill in
themselves: duty roster (piket), homework, exam schedule, subjects and teachers,
plus a daily uniform checklist. Late homework is red and cannot be deleted;
published exams are locked.

**Fully offline.** No API client, no login, no INTERNET permission. Every screen
reads and writes the dataset stored on the phone; nothing leaves the device.

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
├─ components/ Screen, Card, CardActions, StatusBadge, ChecklistRow, TextField, …
├─ navigation/ RootNavigator (lazy bottom tabs, no auth stack)
├─ offline/    seed.ts (empty/demo data + date derivation), storage.ts, repository.ts
├─ screens/    Dashboard (+ Pengaturan), Duty, Homework, Exam, Uniform, Subjects
├─ store/      Redux Toolkit data slice (refreshAll + local mutations)
├─ theme/      tokens (light/dark), WCAG contrast helpers
└─ utils/      Indonesian date/clock/relative-day formatting
```

### Data

A fresh install starts **empty**: the student adds their own piket, PR, exams
and subjects. `repository.ts` is the only data source and owns every rule:

- dates are validated (`YYYY-MM-DD`, `HH:MM`) before anything is stored;
- duty status is derived from its date, so today's duty turns "Hari ini" by
  itself and past homework turns late without any cron job;
- late homework cannot be deleted and stays red after submission;
- a published exam is locked — no edit, no delete;
- `clearAll()` empties everything, `loadDemo()` loads the example dataset
  (both reachable from Pengaturan on the dashboard).

`storage.ts` persists to AsyncStorage under `asistenku.dataset.v2` and rolls the
uniform checklist over at midnight. After every mutation `refreshAll` reloads
the whole (small) dataset once, so the dashboard never shows stale counts.

ponytail: data is device-local. Add export/import when it must move between
phones.

### State

`dataSlice` keeps one status per resource; any storage failure surfaces as an
error while keeping the previously loaded rows on screen.

### Accessibility

- Every interactive element has a role, label and state (`checkbox`, `button`,
  `busy`/`disabled`); badges are announced as part of their card.
- Touch targets are at least 48dp (`theme.touchTarget`).
- Body text pairs are verified at ≥ 4.5:1 and filled-surface labels at ≥ 4.5:1
  in both modes by `tests/contrast.test.ts`. Brand `#2E86C1` on white is only
  3.97:1, so it is reserved for large text/icons; buttons use `#1B5F8F`.
- Light and dark palettes follow `userInterfaceStyle: automatic`.

### Colour coding

`statusTone()` maps statuses (`COMPLETED`, `TODAY`, `OVERDUE`, `LATE`, `PARTIAL`,
`HOLIDAY`, hex accents) to green / yellow / red. Colour is never the only signal
— every card carries a text badge.

## Testing

```bash
npm test                  # 73 tests, 6 suites
npm run test:coverage     # gate: statements 80, branches 70, functions 80, lines 80
```

Screens are rendered through the real store backed by in-memory AsyncStorage, so
add/edit/delete flows, validation errors, persistence, loading and error states
are exercised rather than mocked away.
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
- Detox E2E and store release pipelines (debug-signed APK only).
- Weekly class timetable (jadwal pelajaran) — today the app covers piket and
  exam schedules.
