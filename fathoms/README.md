# Fathoms

Private two-player conversation game for two Android phones. React web app wrapped with Capacitor. `PLAN.md` is the spec and build order; `CLAUDE.md` holds the working rules. Card content lives under `content/` and is validated at build time and at startup.

## Status

Phase 0 (scaffold) and Phase 1 (pure logic and Same Device mode) are built and verified.

- `src/game` holds the deck builder and the turn reducer: pure functions, no React, Firebase, or Capacitor, 100 percent line coverage enforced by `pnpm test`, plus a property test for the strict alternation of the ball.
- Same Device mode plays a whole deck on one phone: Home, setup, Rules, Turn (catch up, close, open, send, reveal, hand off), Current cards in the same flow, Journal, and the Phase 1 subset of Settings. The room lives in localStorage and survives a reload.
- Two Phase 0 steps still need your accounts and phones: create the Firebase project (see Firebase below) and install the debug APK on both phones (see Android debug build). Online rooms, push, and reminders arrive in Phases 2 and 3.

Dependency versions were checked against the npm registry on 2026-10-08. Re-check before upgrading.

## Requirements

- Node 22.22 or newer (React Router 8 requires it) and pnpm 10. Install pnpm with `npm install -g pnpm@10`, or run `corepack enable` on a Node release that still ships corepack.
- For the Android build: Android Studio 2025.2.1 or newer with SDK Platform 36 installed (Capacitor 8). The Gradle wrapper (8.14.3) and the Android Gradle Plugin (8.13.0) download themselves on first build.
- JDK 21 or newer. Capacitor 8 compiles Java 21, so JDK 17 fails with an invalid source release error. Android Studio bundles a JetBrains Runtime 21 under its `jbr` folder; command line builds need `JAVA_HOME` pointed at that folder or at another JDK 21.
- `adb` on your PATH to install over USB. It lives in `platform-tools` inside the Android SDK.

## Setup

```bash
cd fathoms
pnpm install
cp .env.example .env.local   # fill in once the Firebase project exists
pnpm dev                     # http://localhost:5173
```

## Commands

| Command              | What it does                                                                      |
| -------------------- | --------------------------------------------------------------------------------- |
| `pnpm dev`           | Dev server in the browser                                                         |
| `pnpm build`         | Type check, validate content, build to `dist/`. Fails on invalid content          |
| `pnpm preview`       | Serve the production build locally                                                |
| `pnpm typecheck`     | TypeScript only                                                                   |
| `pnpm test`          | Unit and component tests (Vitest)                                                 |
| `pnpm test:watch`    | Same, in watch mode                                                               |
| `pnpm test:coverage` | Same, with a coverage report in `coverage/`                                       |
| `pnpm test:e2e`      | Playwright smoke test at 360 px against the dev server                            |
| `pnpm lint`          | ESLint, Prettier check, and the em dash check                                     |
| `pnpm format`        | Prettier write                                                                    |
| `pnpm content:check` | Validate `content/` and print counts per pack and level                           |
| `pnpm android:sync`  | Build the web app and copy it into `android/`                                     |
| `pnpm android:debug` | `android:sync`, assemble a debug APK with the Gradle wrapper, install it over USB |

Phase 2 adds `pnpm emulators` and `pnpm test:rules`. Phase 5 adds `pnpm android:release`.

## Content

The shape of `content/shared.json` and `content/packs/*.json` is fixed (PLAN section 11). The zod schema in `src/content/schema.ts` enforces it, and the same schema runs in a Vite plugin so `pnpm build` and `pnpm dev` stop on bad content. Rules enforced: unique card ids across packs, questions have a level of 1 to 3, Currents have `level: null` and a non-empty `modes` list, no card text contains a double quote or exceeds 220 characters, every pack has at least 16 questions per level, and the `adult` flag agrees between `shared.json` and the pack file.

Do not edit card wording without asking. Adding a field means changing the schema and `tests/unit/content.test.ts` in the same commit.

## Firebase (open Phase 0 step, first used in Phase 2)

Do this once, in the Firebase console, signed in with the Google account that will own the project.

1. Create a project. Enable Google Analytics or not; it is not used.
2. Build, then Firestore Database: create a database in production mode. The rules ship with the repo in Phase 2.
3. Build, then Authentication: enable the Anonymous sign-in provider.
4. Project settings, then General: add a Web app. Copy the config values into `.env.local` using the names in `.env.example`.
5. Project settings, then General: add an Android app with package name `com.fathoms.app`. Download `google-services.json` and save it as `android/app/google-services.json`. It is ignored by git on purpose.
6. Project settings, then Cloud Messaging: nothing to do yet. Phase 3 wires push.
7. Upgrade the project to the Blaze plan before Phase 3. Cloud Functions need it. Usage for two people stays inside the free quotas.

## Android debug build

The web app is copied into `android/app/src/main/assets/public` by `cap sync`. The Android project itself is committed. The native shell is dark (window background, splash background, and system bar icons) to match the app; the launcher icon is still the Capacitor default until a Fathoms icon is drawn.

With Android Studio:

1. `pnpm android:sync`
2. Open the `android/` folder in Android Studio and let it sync Gradle. This also writes `android/local.properties` with your SDK path.
3. Connect a phone with USB debugging on, pick it in the device list, and press Run.

From the command line, once per machine before the first build:

- Make sure Android Studio has opened `android/` once (it writes `android/local.properties`), or create that file yourself with one line, `sdk.dir=<path to your Android SDK>`, or export `ANDROID_HOME` with that path. Default SDK paths: `~/Library/Android/sdk` on macOS, `~/Android/Sdk` on Linux, `%LOCALAPPDATA%\Android\Sdk` on Windows.
- Export `JAVA_HOME` to a JDK 21, for example Android Studio's `jbr` folder, and check with `java -version`.
- Add `<SDK>/platform-tools` to your PATH so `adb` resolves.

Then:

```bash
pnpm android:debug
```

That runs `pnpm android:sync`, then `gradlew assembleDebug` inside `android/` (it picks `gradlew.bat` on Windows), then `adb install -r` of the APK. The APK lands at `android/app/build/outputs/apk/debug/app-debug.apk`. The phone connected over USB needs Developer options and USB debugging on. For the second phone, share that APK file and allow installs from the chosen source once when Android asks.

Phase 5 covers signed release builds and the keystore. Keystore files (`*.jks`, `*.keystore`) are ignored by git.

Without Android Studio, the command line tools alone work too. Download `commandlinetools-linux-<build>_latest.zip` from the Android developer site, unzip it so that `sdkmanager` sits at `<SDK>/cmdline-tools/latest/bin/sdkmanager`, then:

```bash
export ANDROID_HOME=<SDK>
export JAVA_HOME=<a JDK 21>
yes | $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --licenses
$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0"
pnpm android:sync
cd android && ./gradlew assembleDebug
```

Maven Central sometimes answers 429 (too many requests) when Gradle resolves everything at once on a shared network. Rerun with `./gradlew assembleDebug --max-workers=1` and it goes through.

## Playwright

`pnpm test:e2e` starts the dev server and runs Chromium with a 360 by 780 CSS pixel viewport. The first time on a machine, run `pnpm exec playwright install chromium`. To reuse an existing Chromium instead, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to its path.

## Layout

```
fathoms/
  content/            shared.json and packs/*.json, validated by src/content/schema.ts
  src/config/         app name and id
  src/content/        schema, loader
  src/game/           pure logic: types.ts, deck.ts (deck builder), turns.ts (turn reducer and turn view)
  src/store/          zustand store for Same Device mode (localStorage) and the clock helper
  src/components/     shared UI: buttons, inputs, card blocks, level chips
  src/routes/         one file per screen, routes.ts is the hash route table
  src/sync/           Firebase init (guarded until .env.local exists)
  scripts/            content check, dash check, Vite content plugin, Android debug build
  tests/unit/         Vitest: game logic, store, screens, content
  tests/e2e/          Playwright: home smoke test and a full deck on one phone
  android/            Capacitor Android project (generated, committed)
```

## Same Device mode

Pass and play on one phone, no backend. Home, then Play on this phone: two names and two colors. Both players agree to the two rules, then the phone goes back and forth. The first turn only opens a card. Every later turn shows, in order: the reveal of the card you opened last time (with one follow-up question each), any follow-up questions waiting for you, the card to close (written blind unless Settings says otherwise), the next card to open, and one Send button. After Send the closer sees the reveal, then hands the phone over. Pass, Go lighter, and Pause live under More. When the deck runs out, a closer prompt shows and New deck deals again, skipping the cards already answered and asking for the rules again. Drafts are saved on the phone until you send.
