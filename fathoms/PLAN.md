# Fathoms: build plan for Claude Code (v2)

Working title: Fathoms. A fathom is a unit of water depth, and "to fathom" is to understand. Rename at any time; the name only appears in `src/config/app.ts`, the Android app label, and the launcher icon.

## 0. How to use this file

Paste this into Claude Code as the first message:

```
Read PLAN.md, CLAUDE.md, and every file under content/ in full before doing anything.
Execute Phase 0 and Phase 1 only. Stop after each phase, run the acceptance checks, and show me the results before continuing.
Do not change the game rules, level names, or question wording without asking.
```

Sections 1 to 7 are settled design. Section 8 is the work order. Section 13 lists the decisions still open, each with a default, so work is never blocked.

## 1. What this is

A private two-player conversation game for one couple in a long-distance relationship. Both players are on Samsung Galaxy phones. Nobody else will ever use it.

It plays like Words With Friends: one player takes a turn, the other gets a notification, and they answer whenever they want. No clocks. If a turn sits untouched for 10 hours, the app nudges the player holding it, and again every 10 hours until they move.

The content is a deck of questions in three levels that get progressively more personal, plus action cards ("Currents") that break up the question flow. There are three packs: Core (works with anyone), Partner (written for the two of them and for distance), and After Dark (explicit, adults only, off by default, both players must switch it on). No scoring, no winner.

All content and the name are original. Nothing in this project reproduces the text, level names, branding, or card wording of any commercial conversation game.

## 2. Platform decision

Ship as an Android app built with Capacitor around a React web app. The web build is the same code and stays runnable in a browser for development and testing; the Android build is what the two phones run.

Why Android native over a PWA: the whole product is notifications (turn alerts and reminders), and on Samsung phones the native Firebase Cloud Messaging SDK plus local scheduled notifications are the dependable path. Capacitor also gives a proper launcher icon, a full-screen app, haptics, and an app lock.

Cost of that choice: Android Studio, a JDK, an Android SDK, and a signing keystore on the build machine; the APK is sideloaded to both phones (share the file, allow installs from that source once). Updates mean installing a newer APK signed with the same key. Keep the keystore backed up; losing it means a fresh install under a new signature.

Fallback if Android tooling becomes a hassle: the same code deployed as a PWA. Android Chrome supports web push, so turn alerts and server-sent reminders still work. Only the local-notification backup and the app lock change.

Not recommended: a React Native or Kotlin rewrite (no benefit at this scope), Play Store publishing in v1 (optional later via the Play Console internal testing track, $25 one time).

## 3. Stack

Verify current stable versions at build time. Do not pin versions from memory.

Recommended:
- Vite + React + TypeScript (strict), Tailwind CSS, react-router
- Capacitor with `@capacitor/android`, `@capacitor/push-notifications`, `@capacitor/local-notifications`, `@capacitor/haptics`, `@capacitor/app` (deep links, foreground state)
- Firebase: Firestore (real-time sync), Anonymous Auth, Cloud Messaging (push), Cloud Functions (turn alerts and the reminder schedule), Hosting for the web build
- zod for content and document validation, nanoid for room ids
- Zustand for local UI state only (drafts, modals). Multiplayer state comes from Firestore listeners.
- Vitest + Testing Library for unit and component tests; Playwright for the two-browser turn test against the Firebase emulators
- pnpm, ESLint, Prettier

Billing note: Cloud Functions require the Firebase Blaze (pay as you go) plan, which needs a card on file. Two people's usage sits inside the free quotas; expected cost is zero to a few cents a month. Confirm current pricing and quotas at build time rather than from this file.

Alternative backend if a card on file is unacceptable: Supabase free tier (Postgres + Realtime + Edge Functions + pg_cron). Same data model as tables; an Edge Function sends FCM through the HTTP v1 API using a service account secret; pg_cron runs the reminder sweep.

Not recommended: peer-to-peer (no server to send reminders), polling (laggy, wasteful).

## 4. Game design

### 4.1 Vocabulary
- Room: the persistent space for the two players. One room, lives for months, owns the journal.
- Deck: the ordered list of cards the room is working through. Built from the enabled packs and settings; rebuilt when exhausted.
- Card: a question (has a level) or a Current (no level, an action).
- Level: 1 Shallows, 2 Open Water, 3 The Deep.
- Current: an action card that interrupts the question flow.
- Open: the first answer on a card, written blind.
- Close: the second answer on a card, also written blind by default. Both answers reveal to both players the moment the close is sent. A room setting (`closerSeesOpener`, default off) shows the opener's answer to the closer before they write.
- Reveal: the moment a card has both answers. Each player sees the other's answer for the first time here.
- Ball: who has to act next. Exactly one player holds it at any moment.
- Turn: everything the ball holder does before passing the ball.
- Pass: declining a card. Limited.
- Pause: either player can freeze the room. No notifications or reminders while paused.
- Journal: the room's permanent record of every card, both answers, follow-ups, reactions, favorites.

### 4.2 The two rules
Shown once when the room is created and again any time the deck is rebuilt. Both players tap Agree. Configurable per room. Defaults (also in `content/shared.json`):
1. Honest or pass. Never fake an answer.
2. Follow the thread. When something lands, ask one more question before moving on.

In async play, rule 2 is a mechanic: at any reveal, either player may attach one follow-up question to the partner's answer on that card (one per player per card). The partner answers it at the start of their next turn.

### 4.3 Levels

| Level | Name | Purpose | Color token |
|---|---|---|---|
| 1 | Shallows | Specific, light, easy to answer, builds momentum | `level-1`, light sea blue |
| 2 | Open Water | Honest admissions, patterns, things not usually said | `level-2`, mid blue |
| 3 | The Deep | Formative, vulnerable, the things that shaped you | `level-3`, near-black navy |
| none | Currents | Actions that change the energy | `current`, amber |

After Dark cards use the same three levels (flirty, explicit preferences, kink and limits) with a distinct accent color (`afterdark`, deep red) so the card is unmistakable before anyone reads it aloud in the wrong room.

### 4.4 The turn (primary mode: Turns)
Every card is answered by both players. One opens it, the other closes it, and the closer of card k automatically opens card k+1. So the ball changes hands exactly once per card and the sequence is strictly A, B, A, B.

A turn, in order, for the ball holder:
1. Catch up: the card you opened last turn is now closed, so its reveal is shown first: your answer and the partner's side by side. You may attach one follow-up question to their answer. Below it, any follow-up questions the partner has asked you are listed with reply boxes. Replies are optional; a skipped follow-up stays visible in the journal as unanswered.
2. Close: the open card. Write your answer blind (with `closerSeesOpener` on, the opener's answer is shown instead). No follow-up here; you have not seen their answer yet.
3. Open: the next card is dealt automatically. Write your blind answer.
4. Send turn. One transaction writes everything, closes card k, opens card k+1, passes the ball, and triggers the push to the partner.
5. After Send: the card you just closed reveals immediately on your screen. You may attach one follow-up question to the opener's answer right there. This does not move the ball; the partner answers it in their next Catch up step.

So every closed card carries up to two follow-ups, one from each player, each answered by the other at the start of their next turn. Drafts autosave on the device so a turn can be written across several sittings. The ball passes only on a complete Send. There are no timers of any kind.

The very first turn of a room has only step 3. The second turn has only steps 2, 3, and 4.

When a Current is dealt it is a turn on its own: the holder does what it says (voice note, photo, text, whatever the card asks), writes a one-line note, and sends; the partner does the same on their turn. Currents tagged `live` only are never dealt in Turns mode.

### 4.5 Notifications and reminders
- On every ball pass: push to the new holder. Title "Your turn". Body: partner name plus the first 60 characters of the card text. Tapping opens the Turn screen directly.
- Reminder: a scheduled function sweeps every hour. If a room is not paused and the ball has been held for at least `reminderHours` (default 10) since the later of `ball.since` and `ball.lastReminderAt`, send "Still your turn" to the holder and stamp `lastReminderAt`. Repeats every 10 hours until the turn is sent. Optional per-player quiet hours (default off) and an optional cap on reminders per turn (default none).
- Backup: when the device learns the ball is theirs, it also schedules local notifications at +10 h, +20 h, +30 h and cancels them on Send. This covers a dead function or a lapsed server.
- Samsung specifics: request `POST_NOTIFICATIONS` at first launch, create a high-importance notification channel, and put a one-screen guide in Settings for turning off "Put app to sleep" for Fathoms in Samsung Battery settings. Document it; do not try to automate it.

### 4.6 Deck building
Inputs: enabled packs (After Dark only if both players enabled it), start level, progression (linear or mixed), Currents frequency (default one Current after every 5 questions, none in the first 3 cards), excluded tags, custom cards on or off, exclude cards already answered in this room (default on), mode (Turns or Live, which filters Currents by their `modes` field).

Algorithm: filter → group by level → seeded shuffle each group (seed stored on the room) → concatenate in level order → splice Currents at the interval → store `deck: cardId[]` and `dealt: number`. When the deck is exhausted, show the closer card, then offer "new deck" (same settings, previously answered cards excluded) or "replay favorites".

### 4.7 Pass, Pause, lighter
- Each player has 3 passes per deck. Passing as opener deals a replacement card; passing as closer keeps the opener's answer in the journal and marks the card passed. Passes are visible. Passed cards are not dealt again for 30 days.
- Pause: either player, any time. Partner sees "Paused by <name>" and the optional note. Notifications and reminders stop. Either player can resume.
- Lighter: the ball holder can tap "Go lighter" to make the next 5 cards one level lower. Shown to the partner.
- After Dark cards always show a "Skip this one" that does not consume a pass.

### 4.8 Journal
One document per dealt card: card text, level, pack, both answers, up to two follow-ups with replies, reactions, favorite. Views: by date, favorites, by level, by pack, text search. Export to Markdown (client side). Reactions (❤️ 😂 😮 🥺 and ⭐) can be added at any time, not only during a turn. After Dark journal entries have a per-room retention setting: keep, or hide after both players have read them (hidden entries are deleted, not archived). Delete Room is a hard delete that both players confirm.

### 4.9 After Dark gating
- Off by default. Both players must enable it in Settings, each confirming they are 18 or older. Either player can turn it off at any time for the room; dealt After Dark cards still open are passed without penalty.
- Tag exclusions apply per player: anything a player excludes is excluded for the room, and the partner sees that something was excluded but not what.
- App lock (PIN, with biometric unlock when available) is offered during After Dark enablement and in Settings. Notification bodies for After Dark cards show only the pack name, never the card text.

### 4.10 Live mode (secondary, optional)
Both online on a call, same card on both screens, Reader alternates, Talk or Write & Reveal answer modes, Pause votes. This is the v1 design carried over; it is now Phase 6 and only if still wanted after Turns mode has been used for a while.

### 4.11 Same Device mode
Pass-and-play on one phone with no backend. Exists for in-person visits and as the Phase 1 testbed for all pure logic.

## 5. Data model (Firestore)

```
rooms/{roomId}
  createdAt, version: number
  rules: [string, string]
  players: { [uid]: { name, color, joinedAt, lastSeen, fcmTokens: string[],
                      quietHours: null | { start: 'HH:MM', end: 'HH:MM', tz },
                      excludeTags: string[], afterDarkEnabled: boolean, afterDarkConfirmedAt } }
  settings: { packs: string[], startLevel: 1|2|3, progression: 'linear'|'mixed',
              currentEvery: number, passesPerDeck: number, excludeAnswered: boolean,
              customCardsEnabled: boolean, closerSeesOpener: boolean,
              reminderHours: number, reminderCap: number|null,
              afterDarkRetention: 'keep'|'hide-after-read', mode: 'turns'|'live' }
  deck: { seed: string, cards: string[], dealt: number, builtAt }
  ball: { holderUid, since, lastReminderAt, remindersSent: number }
  openSeq: number                       // seq of the card currently open, or 0
  passes: { [uid]: number }             // remaining this deck
  lighter: { until: number } | null     // seq until which cards are one level lower
  paused: null | { by: uid, at, note }
  passedCards: { [cardId]: timestamp }

rooms/{roomId}/cards/{seq}              // one per dealt card, seq is 1-based and zero-padded
  seq, cardId, cardText, pack, level, type, dealtAt,
  openerUid, closerUid,
  answers: { [uid]: { text, at, mediaRef? } },
  followUps: { [askerUid]: { text, at, reply: null | { text, at } } },   // at most one per player
  reactions: { [emoji]: uid[] }, favorite: boolean,
  readBy: { [uid]: timestamp },
  status: 'open'|'closed'|'passed'

rooms/{roomId}/cards/{seq}/private/{uid}   // a player's answer while the card is still open
  text, at, mediaRef?                      // copied into the parent's answers map on close

rooms/{roomId}/customCards/{cardId}
  text, level: 1|2|3|null, type, pack: 'custom', adult: boolean, createdBy, createdAt
```

Packs are static JSON bundled with the client (`content/`). Card documents copy `cardText` at deal time so later edits to the pool never rewrite history.

Transactions: Send turn, Pass, Pause, Resume, Go lighter, and deck rebuild each run as one Firestore transaction that checks `version`, applies the change, and increments `version`. Reactions, favorites, and follow-up questions are plain updates scoped to the writer's own key (last write wins is fine for them).

Blind close is enforced by the data layout, not by the UI alone. Firestore rules work per document, so an answer on an open card lives in `cards/{seq}/private/{uid}`, which only its author can read while the card is open. The Send transaction copies both private answers into the parent card's `answers` map and sets `status: 'closed'`, and only then can the partner read them. With `closerSeesOpener` on, the rules let the partner read the opener's private doc while the card is open.

Security rules intent (implement, then test against the emulator):
- Auth required; anonymous is fine.
- Room ids are 16+ character nanoids. Knowing the id is the invitation.
- Create: the creator must be the only entry in `players`.
- Join: an update that only adds `players[request.auth.uid]` is allowed while `players` has fewer than 2 entries.
- Every other write: only if `request.auth.uid` is a key in `resource.data.players`.
- `cards` and `customCards`: read and write only for room members.
- `cards/{seq}/private/{uid}`: write only by `{uid}`; read by `{uid}` always, and by the partner only when the parent card is closed or `settings.closerSeesOpener` is true.
- Answers in the parent card: a player may write only `answers[their own uid]`, and only inside the Send transaction. The rules enforce ownership, not content.
- Follow-ups: a player may write only `followUps[their own uid]`, and may write a `reply` only inside the other player's entry.
- Never allow listing `rooms`.

Cloud Functions:
- `onBallPass`: Firestore trigger on `rooms/{roomId}` where `ball.holderUid` changed → send FCM to all tokens of the new holder. Prune tokens that FCM reports invalid.
- `reminderSweep`: scheduled hourly → query rooms with `paused == null` and `ball.since <= now - reminderHours` → for each, if `lastReminderAt` is older than `reminderHours` and the cap is not hit and the holder is not in quiet hours, send "Still your turn" and stamp. Keep the query cheap: index on `ball.since`.

## 6. Screens

1. Home: Create a room, or paste a code or open an invite link. Pick a display name and a color. If a room exists, Home is the Turn screen's doorway: "Your turn" or "Waiting on <name> since <time>".
2. Rules: the two rules in large type, Agree, shows when the partner has agreed.
3. Turn: the stack described in 4.4, in order: Catch up (reveal plus follow-ups, if any), Close, Open, then one Send button. Each block is a full-width card in its level color. Draft indicator. Pass and Go lighter live in an overflow menu, not next to Send.
4. Reveal: shown right after Send. The closed card with both answers, a reaction row, and "Ask a follow-up". One button: Done.
5. Waiting: the card the partner is on (text only, never their answer), time since the ball passed, "Nudge now" (one extra push, limited to one per 10 hours), and the latest journal entries below so there is always something to read.
6. Current: full-screen amber card with the action, a note box, Done.
7. Journal: list, filters, favorite toggle, reactions, export.
8. Settings: name, color, rules text, packs, start level, progression, Currents frequency, excluded tags, passes, closer sees opener, reminder hours and cap, quiet hours, After Dark (gate, retention, app lock), Samsung battery guide, Leave room, Delete room.
9. Pause: note box, Resume.
10. Same Device: the Phase 1 pass-and-play flow.
11. Live (Phase 6): the v1 live screens.

Design notes: dark theme by default; phone-first at 360 px; one primary action per screen; animation only on card deal (slide up) and reveal (fade); respect `prefers-reduced-motion`; card text at least 18 px; everything reachable with one thumb; After Dark cards use the `afterdark` accent and a small lock glyph.

## 7. Repository layout

```
fathoms/
  CLAUDE.md
  PLAN.md
  content/
    shared.json                 // levels, rules, follow-ups, daily prompts, opener, closer, defaults
    packs/core.json             // general pack
    packs/partner.json          // long-distance partner pack
    packs/afterdark.json        // explicit pack, adult: true, gated
  src/
    config/app.ts
    content/                    // loader that merges content/packs/*.json, zod schema
    game/                       // pure logic, no React, no Firebase, 100% line coverage
      deck.ts                   // buildDeck(settings, pool, history, seed)
      turns.ts                  // async turn reducer: open, close, follow-up, pass, lighter, pause
      live.ts                   // Phase 6 live-session reducer
    sync/                       // firebase init, room repository, transactions, presence, tokens
    notifications/              // push registration, channels, local reminder scheduling
    store/                      // zustand UI store, drafts
    routes/                     // one file per screen
    components/
  functions/                    // Cloud Functions: onBallPass, reminderSweep
  android/                      // Capacitor Android project (generated, committed)
  tests/unit/  tests/e2e/  tests/rules/
  firebase.json  firestore.rules  firestore.indexes.json  capacitor.config.ts
```

`src/game` has zero imports from React, Firebase, or Capacitor. Same Device mode and Turns mode share `turns.ts`; Turns mode persists reducer output through Firestore transactions.

## 8. Build phases

Each phase ends with: lint clean, tests green, a short written summary of what was built and what was skipped, and a stop for review.

### Phase 0: Scaffold
- Vite React TS project, Tailwind, router, ESLint, Prettier, Vitest, Playwright.
- Capacitor added, Android project generated, debug build installs on a Galaxy over USB (`adb install`) and launches to a placeholder screen.
- Content loader merges `content/packs/*.json` with `content/shared.json` and validates with zod. The build fails on invalid content.
- Firebase project created; web config in `.env.local`; `google-services.json` in `android/app`.

Accept: the debug APK opens on both phones and shows the app name plus card counts per pack and level; `pnpm build` fails when a card is given a double quote.

### Phase 1: Pure logic and Same Device mode
- Deck builder with tests: filtering, level order, Currents spacing and `modes` filtering, answered and passed exclusion, After Dark exclusion unless both enabled, seed reproducibility.
- Turn reducer with tests: first turn is open only; second turn has no catch up; close then open; blind close by default and opener-visible when the setting is on; follow-up from either side at reveal and reply at next catch up; pass as opener and as closer; lighter window; pause blocks sends; deck exhaustion; strict alternation invariant (a property test over random sequences).
- Same Device screens: Rules, Turn, Current, Journal (localStorage), Settings subset.

Accept: a full deck can be played on one phone by passing it back and forth; the journal survives a reload; `src/game` at 100% line coverage.

### Phase 2: Rooms and Turns mode (no push yet)
- Anonymous auth, create and join, invite link and code, Firestore rules from section 5 with emulator tests including negative cases.
- Turn, Waiting, Journal, Settings wired to Firestore through transactions. Presence dot.
- Drafts persist on device per room and card.

Accept: a Playwright spec with two browser contexts plays 10 cards against the emulator; refreshing either side lands on the right screen; a third client cannot join or read.

### Phase 3: Push and reminders
- FCM registration on Android, token storage, notification channel, `POST_NOTIFICATIONS` permission flow, deep link into the Turn screen.
- `onBallPass` and `reminderSweep` functions with unit tests (time math, quiet hours, cap, paused rooms).
- Local notification backup at +10, +20, +30 hours, cancelled on Send.
- Settings: reminder hours, cap, quiet hours, Samsung battery guide.

Accept: Phone A sends a turn, Phone B shows a notification within seconds with the app closed; a room left untouched past the configured interval (set to minutes in a test config) receives the reminder; pausing stops it.

### Phase 4: Follow the thread, journal, After Dark
- Follow-up question at reveal (both sides) and reply at catch up.
- Reactions, favorites, journal filters and search, Markdown export.
- After Dark gate (both players, 18+ confirm), per-player tag exclusions, retention setting, pack-name-only notification bodies, app lock with PIN and biometric unlock.
- Custom cards editor, including custom After Dark cards.

Accept: After Dark cards are never dealt unless both players enabled it (tested in the deck builder and in the rules); a hidden-after-read entry is gone from Firestore after both `readBy` stamps exist; the app lock blocks the Journal and Turn screens cold.

### Phase 5: Release process
- Signed release APK, keystore stored outside the repo with a written recovery note, version bump script, install guide for both phones (allow installs from the chosen source once), update procedure.
- Crash reporting optional (Firebase Crashlytics) or skip.

Accept: both phones run the release build; an updated build installs over it without losing the room.

### Phase 6: Live mode (optional)
- The v1 live-session design: Reader, Talk and Write & Reveal, Pause votes. Only if still wanted.

Out of scope for every phase: password accounts, more than 2 players, in-app audio or video, public rooms, payments, iOS.

## 9. Testing rules
- Pure game logic: tests first, then implementation. Include one property test for strict alternation of the ball.
- Firestore rules: emulator tests including non-member write, third player join, listing rooms, writing another player's answer.
- Functions: unit tests with fake timers for the reminder math; one emulator test for `onBallPass`.
- Sync: one Playwright spec with two contexts is the regression gate for Phases 2 to 4.
- Content: a test asserts every card id is unique across all packs, every question has a level of 1 to 3, every Current has `level: null` and a non-empty `modes` array, no card text contains a double quote or exceeds 220 characters, every pack has at least 16 cards per level, and every pack with `adult: true` is excluded by the deck builder unless both players enabled it.

## 10. Config and secrets
- `.env.local`: Firebase web config (public by design; security lives in the rules).
- `android/app/google-services.json`: FCM config for the Android build. Not a secret, but keep it out of any public repo.
- Functions use the default service account; no key files in the repo.
- Signing keystore and its passwords live outside the repo. Commit `.env.example` and a `RELEASE.md` that says where they are, without the values.

## 11. Content rules for the question pool
- Original wording only. Short. Specific over abstract.
- Level 1 is answerable in under a minute without risk. Level 3 may be heavy but never prescribes trauma; the player decides what the question is about.
- Core and Partner contain nothing sexual and nothing about substance use, and nothing that assumes a particular family structure or religion.
- After Dark is explicit by design: sexual preferences, kink, BDSM, anal, cum, limits, aftercare. It stays between two consenting adults, never involves anyone else without their consent, and never involves minors, animals, family members, or non-consent presented as real. Fantasy is asked about as fantasy. Limits and safewords are part of the pack, not an afterthought.
- Every card can be answered over a phone with no props beyond the phone.
- Currents carry a `modes` field. `async` Currents work across a day with text, voice notes, or photos; `live` Currents need both players present and are only dealt in Live mode.

## 12. Working agreements for Claude Code
- Read every file under `content/` before building any UI that displays cards. The shape is fixed.
- Do not rewrite questions, rename levels, or change the two rules. Propose changes in the phase summary instead.
- No em dashes or en dashes anywhere in UI text, docs, comments, or commit messages.
- One primary action per screen. Send is the only large button on the Turn screen.
- When a library, Capacitor plugin, Firebase API, or Android SDK version matters, check current docs rather than assuming.
- Stop at the end of each phase.

## 13. Open decisions (default in bold)
1. Backend: **Firebase on Blaze** / Supabase free tier.
2. Closer sees the opener's answer before writing: **no, blind** / yes (toggle exists either way).
3. Reminder quiet hours: **off** / on with a default window.
4. After Dark journal retention: **keep** / hide after both have read.
5. App name: **Fathoms** / something else.
6. Play Store internal testing track instead of sideloading: **no** / yes ($25 one time).
