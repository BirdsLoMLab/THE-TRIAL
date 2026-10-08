# Fathoms build log

One entry per phase, written as each phase closed. The commits are on `ccr-6a73b9a1-qrj664`. Everything below `fathoms/` was built in one unattended session on 2026-10-08; the root of the repository was not touched.

## What is yours to do

1. Create the Firebase project and drop the config in: `.env.local` and `android/app/google-services.json` (README, Firebase). Rooms, push, and reminders stay off until then; Same Device mode works without it.
2. Put the project on the Blaze plan and deploy: `cd functions && pnpm deploy`, then `pnpm exec firebase deploy --only firestore:rules`.
3. Create the signing key (RELEASE.md), back it up twice, and run `pnpm android:release`. For a first look, the debug APK is enough: `pnpm android:debug` with a phone on USB, or the file from `android/app/build/outputs/apk/debug/app-debug.apk` after `pnpm android:sync && cd android && ./gradlew assembleDebug`.
4. On each phone: allow installs from the source you used, open the app, allow notifications, and go through the Samsung battery guide in Settings.

## Decisions taken without you

PLAN.md section 13 lists the open decisions with defaults. Every default was kept: Firebase on Blaze, blind close, quiet hours off, After Dark retention keep, the name Fathoms, sideloading. Beyond those, the plan left gaps that had to be closed to build it. Each one is a line here so you can reverse it.

1. A Current is dealt as an ordinary card: the opener does what it says and writes a one line note, the closer does the same. No follow-ups on Currents, no reveal screen for them (the catch up shows both notes). PLAN 4.4 called a Current "a turn on its own"; this reading keeps the ball changing hands exactly once per card.
2. Mixed progression shuffles every eligible question together. PLAN 4.6 named the option without defining it.
3. Rules agreement is tracked per player and reset on every deck rebuild, so the Rules screen shows again then, as PLAN 4.2 asks. A send needs the sender's agreement.
4. Players carry `lastTurnAt` and `rulesAgreedAt`; cards carry `closedAt` and `passedBy` (passes are visible). The room carries `order`, `turn`, `cardCount`, `nudge`, and `deleteRequests`. PLAN section 5 did not list them.
5. A follow-up is shown for a reply at the start of the answering player's next turn only (it is pending while it was asked after their last send). Skipped, it stays in the journal as unanswered and can still be replied to from the reveal of that card later.
6. The After Dark skip (PLAN 4.7) is a pass that costs nothing. Turning After Dark off passes an open After Dark card for free and prunes undealt ones (PLAN 4.9).
7. Blind close and the Send transaction conflict in PLAN section 5: the closer cannot read the opener's private answer inside the close transaction while the card is open. So the closer writes only its own answer; the opener's client copies its private answer into the card once the card is closed, and the closer reads the private document directly for the reveal in between. Rules let a member read a private document once the parent card is closed or passed.
8. The room document is readable by any signed in user while it still has one player (the joiner must read it to join), and anyone signed in can learn that a room id does not exist. After the second player joins, only members can read it. Rooms can never be listed.
9. The `version` check lives in the client transactions, not in the rules: Firestore aborts and retries a stale transaction, while a rule would reject it for good. Presence stamps are plain updates outside the version sequence.
10. "Hidden after read" leaves a tombstone: the card number stays, the text, answers, follow-ups, and reactions are deleted. A fully deleted document would break the card numbering the client relies on.
11. The reminder sweep queries rooms whose ball moved at least one hour ago and applies each room's own reminder hours in code. One index free range query instead of a composite index.
12. Custom cards are validated like printed ones (1 to 220 characters, no double quotes) and dealt under the pack id `custom`. Custom After Dark cards follow the After Dark gate.
13. The app lock holds a salted SHA-256 of the PIN in localStorage and re-locks after 30 seconds in the background. Biometrics go through `@aparajita/capacitor-biometric-auth` 10.0.0 (Capacitor 8).
14. Phase 6 (Live mode) was not started: PLAN 4.10 makes it conditional on wanting it after using Turns mode.

## Phase 0: scaffold (6e24d9a, 0c77e76)

Built before this session. Open items from it: the Firebase project and the APK on both phones.

Added in this session: the Android SDK was reachable after all, so the command line tools, platform 36, and build tools 36.0.0 were installed under a scratch directory and the debug APK builds with `./gradlew assembleDebug` (Maven Central rate limits a first build; `--max-workers=1` gets it through). The APK is not committed.

## Phase 1: pure logic and Same Device mode (21ec76c)

- `src/game/deck.ts`: filters (pack, custom, After Dark only when both enabled, tags, Currents by mode, answered, passed cooldown), linear or mixed order with a seeded shuffle, one Current after every N questions, none in the first M cards, never last.
- `src/game/turns.ts`: the reducer and the turn view. 91 tests, a property test over random play, 100 percent line coverage enforced by `pnpm test`.
- Same Device: store in localStorage, Home, setup, Rules, Turn (catch up, close, open, send, reveal, hand off), Journal, Settings subset. Playwright plays a full deck on one phone, reloads mid turn, and recovers from an empty rebuild.
- Acceptance: a full deck on one phone (e2e), the journal survives a reload (e2e and unit), `src/game` at 100 percent lines.
- A 90 agent adversarial review of this phase ran in the background through the rest of the session; its confirmed findings are in the "Phase 1 review fixes" commit if one follows this log, otherwise it had not finished.

## Phase 2: rooms and Turns mode (2dd19d9)

- `firestore.rules` with 20 emulator tests (rules) plus the room repository against the emulators (create, join, a third player kept out, blind turns, materialized answers, follow-ups, presence, a fresh subscription).
- `src/sync/`: Firebase init with emulator wiring, anonymous sign in, zod document schemas, the room repository (one transaction per action around the reducer, a consistent listener, blind close through the private subcollection).
- One set of screens through a game adapter serves both modes. New: create, join by link or code, invite, Waiting, presence dot, drafts per room and card.
- Acceptance: a Playwright spec plays ten cards between two browser contexts against the emulators, refreshes both sides, and keeps a third client out.

## Phase 3: push and reminders (09fd0a5)

- `functions/`: `onBallPass` (turn alert, nudge, pack name only for After Dark, dead token pruning) and `reminderSweep` (hourly, reminder hours, cap, quiet hours). Reminder math with fake timers; the handlers against the Firestore emulator through the admin SDK. The Functions emulator could not register its Firestore trigger in the build container (a 502 from the Firestore emulator), so the tests call the exported handlers directly.
- Client: `@capacitor/push-notifications` 8.1.3, `local-notifications` 8.3.1, `app` 8.1.2, `haptics` 8.0.2. Token storage on the player, the Turns channel, a tap opens the room, local backup reminders at 10, 20, 30 hours when the ball lands on the phone. The reducer gained `nudge` and per player quiet hours. Settings: reminder hours, cap, quiet hours, notification switch, Samsung battery guide.
- Acceptance on real phones (a push within seconds with the app closed, a reminder after the interval, pausing stops it) needs the Firebase project and the two phones: not verified here.

## Phase 4: follow the thread, journal, After Dark (a438364)

- Reducer: reactions, favorites, read stamps with retention tombstones, the After Dark switch per player behind an adult confirmation, tag exclusions pruning the deck, the delete confirmation. Rules updated and tested for each.
- Journal: filters, search, grouping by day, reactions and favorites on each entry, tombstones, Markdown export. Settings: After Dark, topics to skip, custom cards, app lock, Delete Room. A custom card editor.
- Acceptance: After Dark never dealt unless both enabled (deck builder tests, reducer tests, rules tests); a hidden after read entry has no content once both read stamps exist (reducer and rules); the app lock blocks the Journal and Turn screens cold (unit test).

## Phase 5: release process (this commit)

- Gradle release signing from `android/keystore.properties` or `FATHOMS_KEYSTORE_*`, `pnpm android:release`, `pnpm version:bump`, RELEASE.md with the key procedure, the recovery note, the install and update guide. A signed release APK was built here with a throwaway key to prove the pipeline; your key replaces it.
- Acceptance (both phones run the release build, an update installs over it without losing the room) needs the phones.

## Numbers at the end

Run from `fathoms/` on 2026-10-08: `pnpm lint` clean, `pnpm test` green with `src/game` and `src/content` at 100 percent lines, `pnpm build` clean, `pnpm test:rules` green against the emulators, `pnpm test:e2e` green (Same Device full deck, two phone room, home smoke test), `pnpm -C functions test` green.
