# Fathoms

Private two-player conversation game for two Android phones. React web app wrapped with Capacitor. `PLAN.md` is the spec and build order; `CLAUDE.md` holds the working rules. Card content lives under `content/` and is validated at build time and at startup.

## Status

Phase 0 (scaffold) is done. The app builds, the Android project is generated, and the placeholder Home screen shows the app name and card counts per pack and level. Game logic and screens arrive in Phase 1.

Dependency versions were checked against the npm registry on 2026-10-08. Re-check before upgrading.

## Requirements

- Node 22.22 or newer (React Router 8 requires it) and pnpm 10 (`corepack enable` gives you pnpm).
- For the Android build: Android Studio 2025.2.1 or newer with SDK Platform 36 installed (Capacitor 8). The Gradle wrapper (8.14.3) and the Android Gradle Plugin (8.13.0) download themselves on first build. A JDK 17 or newer is required; Android Studio bundles one.
- `adb` on your PATH to install over USB (part of Android SDK Platform-Tools).

## Setup

```bash
cd fathoms
pnpm install
cp .env.example .env.local   # fill in once the Firebase project exists (Phase 2)
pnpm dev                     # http://localhost:5173
```

## Commands

| Command              | What it does                                                             |
| -------------------- | ------------------------------------------------------------------------ |
| `pnpm dev`           | Dev server in the browser                                                |
| `pnpm build`         | Type check, validate content, build to `dist/`. Fails on invalid content |
| `pnpm test`          | Unit and component tests (Vitest)                                        |
| `pnpm test:coverage` | Same, with a coverage report in `coverage/`                              |
| `pnpm test:e2e`      | Playwright smoke test at 360 px against the dev server                   |
| `pnpm lint`          | ESLint, Prettier check, and the em dash check                            |
| `pnpm format`        | Prettier write                                                           |
| `pnpm content:check` | Validate `content/` and print counts per pack and level                  |
| `pnpm android:sync`  | Build the web app and copy it into `android/`                            |
| `pnpm android:debug` | `android:sync`, assemble a debug APK, install it over USB                |

Phase 2 adds `pnpm emulators` and `pnpm test:rules`. Phase 5 adds `pnpm android:release`.

## Content

The shape of `content/shared.json` and `content/packs/*.json` is fixed (PLAN section 11). The zod schema in `src/content/schema.ts` enforces it, and the same schema runs in a Vite plugin so `pnpm build` and `pnpm dev` stop on bad content. Rules enforced: unique card ids across packs, questions have a level of 1 to 3, Currents have `level: null` and a non-empty `modes` list, no card text contains a double quote or exceeds 220 characters, every pack has at least 16 questions per level, and the `adult` flag agrees between `shared.json` and the pack file.

Do not edit card wording without asking. Adding a field means changing the schema and `tests/unit/content.test.ts` in the same commit.

## Firebase (needed from Phase 2)

Do this once, in the Firebase console, signed in with the Google account that will own the project.

1. Create a project. Enable Google Analytics or not; it is not used.
2. Build, then Firestore Database: create a database in production mode. The rules ship with the repo in Phase 2.
3. Build, then Authentication: enable the Anonymous sign-in provider.
4. Project settings, then General: add a Web app. Copy the config values into `.env.local` using the names in `.env.example`.
5. Project settings, then General: add an Android app with package name `com.fathoms.app`. Download `google-services.json` and save it as `android/app/google-services.json`. It is ignored by git on purpose.
6. Project settings, then Cloud Messaging: nothing to do yet. Phase 3 wires push.
7. Upgrade the project to the Blaze plan before Phase 3. Cloud Functions need it. Usage for two people stays inside the free quotas.

## Android debug build

The web app is copied into `android/app/src/main/assets/public` by `cap sync`. The Android project itself is committed.

With Android Studio:

1. `pnpm android:sync`
2. Open the `android/` folder in Android Studio and let it sync Gradle.
3. Connect a phone with USB debugging on, pick it in the device list, and press Run.

From the command line:

```bash
pnpm android:sync
cd android
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

`pnpm android:debug` runs all of that in one go. The APK lands at `android/app/build/outputs/apk/debug/app-debug.apk`; share that file to install on the second phone and allow installs from that source once when Android asks.

Both phones need Developer options and USB debugging on for `adb install`. Phase 5 covers signed release builds and the keystore.

## Playwright

`pnpm test:e2e` starts the dev server and runs Chromium with a 360 by 780 CSS pixel viewport. The first time on a machine, run `pnpm exec playwright install chromium`. To reuse an existing Chromium instead, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to its path.

## Layout

```
fathoms/
  content/            shared.json and packs/*.json, validated by src/content/schema.ts
  src/config/         app name and id
  src/content/        schema, loader
  src/game/           pure logic, no React, Firebase, or Capacitor (Phase 1)
  src/routes/         one file per screen
  src/sync/           Firebase init (guarded until .env.local exists)
  scripts/            content check, dash check, Vite content plugin
  tests/unit/         Vitest
  tests/e2e/          Playwright
  android/            Capacitor Android project (generated, committed)
```
