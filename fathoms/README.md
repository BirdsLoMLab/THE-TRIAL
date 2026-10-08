# Fathoms

Private two-player conversation game for two Android phones. React web app wrapped with Capacitor. `PLAN.md` is the spec and build order; `CLAUDE.md` holds the working rules. Card content lives under `content/` and is validated at build time and at startup.

## Status

Phases 0 to 5 are built and verified. Phase 6 (Live mode) is not started: PLAN.md keeps it optional until Turns mode has been used for a while.

- Phase 1: `src/game` holds the deck builder and the turn reducer (pure, 100 percent line coverage enforced by `pnpm test`, a property test for the strict alternation of the ball) and Same Device mode plays a whole deck on one phone with the room in localStorage.
- Phase 2: online rooms on Firestore. Anonymous sign in, create and join by invite link or code, the Turn, Waiting, Journal, and Settings screens wired through one transaction per action, a presence dot, and drafts kept per room and card on the device. Security rules live in `firestore.rules` with emulator tests for every negative case the plan names, and a Playwright spec plays ten cards between two browser contexts against the emulators.
- Phase 3: push and reminders. The Android app registers with FCM and stores its token on the player; `functions/` holds `onBallPass` (turn alert and nudge) and `reminderSweep` (hourly, with quiet hours and a cap), tested with fake timers and against the Firestore emulator; the phone schedules local backup reminders at 10, 20, and 30 hours; Settings has reminder hours, the cap, quiet hours, a notification switch, and the Samsung battery guide.
- Phase 4: follow the thread and the journal. Reactions and favorites at any time, journal filters (favorites, level, Currents, pack), text search, grouping by day, and a Markdown export. After Dark is switched on per player behind an adult confirmation; turning it off passes an open After Dark card for free and prunes the deck; the retention setting hides each After Dark entry once both have read it (a tombstone keeps the card number, the content is gone). Topics a player ticks are excluded for the room. Custom cards, After Dark ones included, join the next deck under the Custom pack. An app lock (PIN, fingerprint or face when the phone has it) blocks the Turn and Journal screens on start and after 30 seconds in the background. Delete Room needs both players to ask, then either can delete it.
- Phase 5: the release process. `RELEASE.md` covers the signing key (created once, kept outside the repo, backed up twice), `pnpm version:bump`, `pnpm android:release` (signed APK in `release/`), the install and update procedure for both phones, and crash reporting (not set up). The Gradle release build signs from `android/keystore.properties` or the `FATHOMS_KEYSTORE_*` variables.
- Still yours to do: create the Firebase project and drop its config in (see Firebase below), deploy the functions once the project is on Blaze (see Functions below), create the signing key (see RELEASE.md), and install the APK on both phones (see Android debug build).

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

| Command              | What it does                                                                           |
| -------------------- | -------------------------------------------------------------------------------------- |
| `pnpm dev`           | Dev server in the browser                                                              |
| `pnpm build`         | Type check, validate content, build to `dist/`. Fails on invalid content               |
| `pnpm preview`       | Serve the production build locally                                                     |
| `pnpm typecheck`     | TypeScript only                                                                        |
| `pnpm test`          | Unit and component tests (Vitest)                                                      |
| `pnpm test:watch`    | Same, in watch mode                                                                    |
| `pnpm test:coverage` | Same, with a coverage report in `coverage/`                                            |
| `pnpm test:e2e`      | Playwright at 360 px: Same Device full deck, two phone room against the emulators      |
| `pnpm test:rules`    | Firestore rules tests and the room repository test against the emulators               |
| `pnpm emulators`     | Start the Auth and Firestore emulators for `pnpm dev` with `VITE_FIREBASE_EMULATORS=1` |
| `pnpm lint`          | ESLint, Prettier check, and the em dash check                                          |
| `pnpm format`        | Prettier write                                                                         |
| `pnpm content:check` | Validate `content/` and print counts per pack and level                                |
| `pnpm android:sync`  | Build the web app and copy it into `android/`                                          |
| `pnpm android:debug` | `android:sync`, assemble a debug APK with the Gradle wrapper, install it over USB      |

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

## Functions (Phase 3, needs the Blaze plan)

`functions/` is its own package (`cd functions && pnpm install`). `pnpm -C functions test` runs the reminder math with fake timers; `pnpm test:rules` at the root also runs the handlers against the Firestore emulator (they write to `rooms/{id}/outbox` there instead of calling FCM). To deploy:

```bash
cd functions
pnpm install
pnpm deploy          # builds, then firebase deploy --only functions
```

The Firebase CLI needs a login (`pnpm exec firebase login`) and the project selected (`pnpm exec firebase use <project-id>` writes `.firebaserc`). `onBallPass` is a Firestore trigger on `rooms/{roomId}`; `reminderSweep` runs every 60 minutes through Cloud Scheduler, which the deploy sets up. Both use the default service account.

The Functions emulator could not register its Firestore trigger inside the build container (the Firestore emulator answered 502 to the registration call), so the emulator tests call the exported handlers directly. On a normal machine `pnpm -C functions serve` runs the full emulator set.

## Android debug build

Push needs `android/app/google-services.json` from the Firebase console (see Firebase above); without it the app builds and runs, but turn alerts stay off and the local backup reminders still fire. The web app is copied into `android/app/src/main/assets/public` by `cap sync`. The Android project itself is committed. The native shell is dark (window background, splash background, and system bar icons) to match the app; the launcher icon is still the Capacitor default until a Fathoms icon is drawn.

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

`RELEASE.md` covers signed release builds and the keystore. Keystore files (`*.jks`, `*.keystore`) and `android/keystore.properties` are ignored by git.

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

`pnpm test:e2e` starts the Auth and Firestore emulators, then the dev server with a demo Firebase config, and runs Chromium with a 360 by 780 CSS pixel viewport. The first time on a machine, run `pnpm exec playwright install chromium`. To reuse an existing Chromium instead, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to its path. `pnpm test:e2e:direct` skips the emulators (the online spec then fails).

## Emulators

The Firestore emulator needs a JDK (21 works) and downloads its jar on first use. `pnpm emulators` starts Auth and Firestore on 9099 and 8080 for a dev server started with `VITE_FIREBASE_EMULATORS=1` and any non empty `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID` (use `demo-fathoms`), and `VITE_FIREBASE_APP_ID`. `pnpm test:rules` and `pnpm test:e2e` start their own emulators.

## Online rooms

Home, then Create a room: one name and one color. Send the invite link (or the room code); the partner opens it, picks a name and a color, and both agree to the rules. The first card goes to the creator. Each action is one Firestore transaction that runs the same reducer as Same Device mode. Blind close is enforced by the data layout: an open card's opener answer lives in `cards/{seq}/private/{uid}`, readable by its author only until the card closes (or always, when Settings lets the closer see the opener). The closer writes only their own answer; the opener's client copies its private answer into the card once the card is closed, and the closer reads the private document directly for the reveal in the meantime. A room is readable by any signed in user while it still has one player, so the invite link works; after that only members can read it, and nobody can list rooms.

## Layout

```
fathoms/
  content/            shared.json and packs/*.json, validated by src/content/schema.ts
  src/config/         app name and id
  src/content/        schema, loader
  src/game/           pure logic: types.ts, deck.ts (deck builder), turns.ts (reducer and turn view), journal.ts, custom.ts
  src/game-ui/        the game adapter context and the two providers (Same Device, online room)
  src/store/          zustand stores: sameDevice (localStorage room), online (room id and drafts), clock
  src/sync/           Firebase init, anonymous auth, document schemas, the room repository (transactions, listeners)
  src/notifications/  push registration, the notification channel, the local reminder backup
  src/lock/           the app lock: PIN hash, biometric unlock, the lock gate
  functions/          Cloud Functions: onBallPass, reminderSweep, and their tests
  src/components/     shared UI: buttons, inputs, card blocks, level chips, color picker
  src/routes/         one file per screen, routes.ts is the hash route table
  scripts/            content check, dash check, Vite content plugin, Android debug build
  tests/unit/         Vitest: game logic, store, screens, content, sync model
  tests/rules/        Firestore rules against the emulator
  tests/emulator/     the room repository against the emulators
  tests/e2e/          Playwright: home smoke test, a full deck on one phone, two phones in a room
  firestore.rules     security rules (PLAN section 5)
  firebase.json       emulator ports, hosting, rules path
  android/            Capacitor Android project (generated, committed)
```

## Same Device mode

Pass and play on one phone, no backend. Home, then Play on this phone: two names and two colors. Both players agree to the two rules, then the phone goes back and forth. The first turn only opens a card. Every later turn shows, in order: the reveal of the card you opened last time (with one follow-up question each), any follow-up questions waiting for you, the card to close (written blind unless Settings says otherwise), the next card to open, and one Send button. After Send the closer sees the reveal, then hands the phone over. Pass, Go lighter, and Pause live under More. When the deck runs out, a closer prompt shows and New deck deals again, skipping the cards already answered and asking for the rules again. Drafts are saved on the phone until you send.
