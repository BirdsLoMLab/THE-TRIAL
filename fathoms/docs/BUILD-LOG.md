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
4. Players carry `lastTurnAt`, `lastTurn`, and `rulesAgreedAt`; cards carry `closedAt`, `closedTurn`, and `passedBy` (passes are visible); follow-ups carry `askedTurn`. The room carries `order`, `turn`, `cardCount`, `nudge`, and `deleteRequests`. PLAN section 5 did not list them. Catch up and pending follow-ups are decided by the turn counters, never by comparing clocks from two phones.
5. A follow-up is shown for a reply at the start of the answering player's next turn only (it is pending while it was asked at or after the turn count of their last send). Skipped, it stays in the journal as unanswered and can still be replied to from the reveal of that card later.
6. The After Dark skip (PLAN 4.7) is a pass that costs nothing. Turning After Dark off passes an open After Dark card for free and prunes undealt ones (PLAN 4.9).
7. Blind close and the Send transaction conflict in PLAN section 5: the closer cannot read the opener's private answer inside the close transaction while the card is open. So the closer writes only its own answer; the opener's client copies its private answer into the card once the card is closed, and the closer reads the private document directly for the reveal in between. Rules let a member read a private document once the parent card is closed or passed.
8. The room document is readable by any signed in user while it still has one player (the joiner must read it to join), and anyone signed in can learn that a room id does not exist. After the second player joins, only members can read it. Rooms can never be listed.
9. The `version` check lives in the client transactions, not in the rules: Firestore aborts and retries a stale transaction, while a rule would reject it for good. Presence stamps are plain updates outside the version sequence.
10. "Hidden after read" leaves a tombstone: the card number stays, the text, answers, follow-ups, and reactions are deleted. A fully deleted document would break the card numbering the client relies on.
11. The reminder sweep queries rooms whose ball moved at least one hour ago and applies each room's own reminder hours in code. One index free range query instead of a composite index.
12. Custom cards are validated like printed ones (1 to 220 characters, no double quotes) and dealt under the pack id `custom`. Custom After Dark cards follow the After Dark gate.
13. The app lock holds a salted SHA-256 of the PIN in localStorage and re-locks after 30 seconds in the background. Biometrics go through `@aparajita/capacitor-biometric-auth` 10.0.0 (Capacitor 8).
14. Phase 6 (Live mode) was not started: PLAN 4.10 makes it conditional on wanting it after using Turns mode.
15. Closing the last card of a deck keeps the ball with the closer (a send that deals nothing does not pass it). The closer rebuilds the deck and opens its first card, so every card's opener is still the previous card's closer, across decks. Phase 1 as first committed passed the ball there, which gave one player two openings in a row around every rebuild. The ball did not move, so instead of "Your turn" the opener gets a "Last card answered" push with the usual body (pack name only for After Dark); the Waiting screen tells them the deck is finished. The reveal screen names the closer as its sender from the card itself, not from the ball.
16. Currents are spread over the whole deck: the gap between Currents is the larger of `currentEvery` and `floor(questions / (Currents + 1))`. With the bundled core and partner packs (192 questions, 21 Currents) that is 8 questions instead of PLAN 4.6's 5, because 5 would place every Current inside the first level and leave the rest of the deck without any. `currentEvery` stays the minimum gap, the Settings label says "at least every", and 0 still disables Currents. Reverse it by making `currentInterval` in `src/game/deck.ts` return `settings.currentEvery`.
17. Go lighter is offered only when it would change a card inside its window (`canGoLighter`): some question among the next `lighterWindowCards` cards has a lower level question somewhere behind it. Otherwise the menu item is greyed out and the reducer refuses with `nothing-lighter`. The substitute is the first undealt question of the nearest lower level, not only one level down. On a linear deck that has already left level 1 there is nothing lighter to pull forward, which PLAN 4.7 does not address.

## Phase 0: scaffold (6e24d9a, 0c77e76)

Built before this session. Open items from it: the Firebase project and the APK on both phones.

Added in this session: the Android SDK was reachable after all, so the command line tools, platform 36, and build tools 36.0.0 were installed under a scratch directory and the debug APK builds with `./gradlew assembleDebug` (Maven Central rate limits a first build; `--max-workers=1` gets it through). The APK is not committed.

## Phase 1: pure logic and Same Device mode (21ec76c)

- `src/game/deck.ts`: filters (pack, custom, After Dark only when both enabled, tags, Currents by mode, answered, passed cooldown), linear or mixed order with a seeded shuffle, one Current after every N questions, none in the first M cards, never last.
- `src/game/turns.ts`: the reducer and the turn view. 91 tests, a property test over random play, 100 percent line coverage enforced by `pnpm test`.
- Same Device: store in localStorage, Home, setup, Rules, Turn (catch up, close, open, send, reveal, hand off), Journal, Settings subset. Playwright plays a full deck on one phone, reloads mid turn, and recovers from an empty rebuild.
- Acceptance: a full deck on one phone (e2e), the journal survives a reload (e2e and unit), `src/game` at 100 percent lines.
- A 90 agent adversarial review of this phase ran in the background through the rest of the session; its confirmed findings are in the "Phase 1 review fixes" commit below.

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

## Phase 5: release process (49b71b7)

- Gradle release signing from `android/keystore.properties` or `FATHOMS_KEYSTORE_*`, `pnpm android:release`, `pnpm version:bump`, RELEASE.md with the key procedure, the recovery note, the install and update guide. A signed release APK was built here with a throwaway key to prove the pipeline; your key replaces it.
- Acceptance (both phones run the release build, an update installs over it without losing the room) needs the phones.

## Phase 1 review fixes (this commit)

An adversarial review of `src/game` against PLAN.md (40 finders and refuters) confirmed these, all fixed here with tests:

- An opener pass in the middle of a turn made the holder's own passed card the catch up and hid the reveal they were owed. The catch up now skips cards the holder passed.
- The close step handed the screen the whole open card, opener answer included. It now carries only the answers the holder may see.
- Closing the last card of a deck passed the ball, so the player who had just opened the last card also opened the first card of the next deck. The ball now stays with the closer (decision 15). Same Device hands the phone over only when the ball moved.
- Catch up and pending follow-ups compared timestamps written by two phones. They now compare turn counts (decision 4).
- Go lighter was a silent no op on a linear deck past level 1 and only ever looked one level down (decision 17).
- Currents bunched in the first level of the bundled deck (decision 16).
- The property test was too loose: the random step list rarely reached 60 steps, the non send actions were only checked for not moving the ball, and two assertions could not fail. It now checks every accepted action's exact effect and untouched fields, predicts the error code of every refused action, asserts the open card's closer is the holder, and fails if the generator stops reaching close only sends, opener passes with a catch up pending, rebuilds with a card open, Go lighter, replies, or settings changes.

Refuted by the review and left as designed: rebuild allowed while paused or mid deck (Settings needs it), positional card numbering (guarded by `cardCount` and tombstones), `version` bumping on plain updates, rooms of exactly two players.

A second review (four lenses over the fix diff, two refuters per finding) then caught what the first round introduced or missed, all fixed in the same commit series:

- The reveal screen took "the player who no longer holds the ball" as its sender. With the ball staying on the last close, the closer's follow-up was filed under the opener's key on one phone and refused by the rules online. The sender is now the card's closer, and the reveal stamps the closer as reader (before, one phone stamped the next holder, so hide after read could never complete there).
- Online reactions, favorites, and read stamps never loaded their card inside the transaction, so every one of them failed with "no card in this room". The transaction now loads the card the action names.
- Go lighter was judged on the next card only, so a Current up next blocked it. It now looks over the whole window (decision 17).
- The last close of a deck went silent to the opener; they now get a push (decision 15).
- Documents written without the turn counters parse with "never pending again" defaults; the lighter scan skips deck ids the pool no longer knows (a deleted custom card) instead of throwing on every render.
- Tests: the property test pins the full dealt card, the lighter window after an opener pass, and the whole card on a reply; the After Dark auto pass asserts its turn count and the opener's catch up; the emulator suite reacts, favorites, marks read, and accepts Go lighter through the transaction; the schema defaults and the follow-up round trip are tested.

Not changed: PLAN.md still describes the ball passing on every send, one Current every 5 questions, and one level lower. Decisions 15 to 17 are the deviations; PLAN.md is yours to amend.

## Numbers at the end

Run from `fathoms/` on 2026-10-09: `pnpm lint` clean, `pnpm test` green (222 tests) with `src/game` and `src/content` at 100 percent lines, `pnpm build` clean, `pnpm test:rules` green against the emulators (29 tests), `pnpm test:e2e` green (Same Device full deck, two phone room, home smoke test), `pnpm -C functions test` green (14 tests).
