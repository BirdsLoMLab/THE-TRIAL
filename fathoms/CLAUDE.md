# Fathoms

Private two-player conversation game for two Android phones, built as a React web app wrapped with Capacitor. Async turn-based play with push notifications and reminders. PLAN.md is the full spec and build order. Card content lives under `content/` and is loaded and validated at startup.

## Commands
- `pnpm dev` local dev server (browser)
- `pnpm test` unit and component tests (Vitest)
- `pnpm test:rules` Firestore rules tests against the emulator (Phase 2+)
- `pnpm test:e2e` Playwright two-browser turn spec against the emulators (Phase 2+)
- `pnpm lint` ESLint + Prettier check
- `pnpm build` web build; fails if content is invalid
- `pnpm emulators` Firebase emulators for Firestore, Auth, Functions
- `pnpm android:sync` build web then `npx cap sync android`
- `pnpm android:debug` assemble a debug APK and install it over USB with `adb install -r`
- `pnpm android:release` assemble a signed release APK (Phase 5; keystore path from `RELEASE.md`)

## Rules
- `src/game` has no imports from React, Firebase, or Capacitor. Pure functions, unit tested, 100% line coverage.
- Send turn, Pass, Pause, Resume, Go lighter, and deck rebuild each run as one Firestore transaction that checks and increments `room.version`.
- UI renders from the room document and the `cards` subcollection. Never from a locally derived copy. Drafts are the only local state that matters.
- Do not edit card wording in `content/` without asking. Adding fields is fine if the zod schema and the content test change in the same commit.
- Level names (Shallows, Open Water, The Deep, Currents) and the two rules are fixed. Propose changes in a phase summary.
- After Dark (`content/packs/afterdark.json`) is dealt only when both players have enabled it. Enforce this in the deck builder and in the Firestore rules, and test both. Its notification bodies never include card text.
- No em dashes or en dashes in any text, including comments and commit messages.
- Verify library, Capacitor plugin, Firebase, and Android SDK versions against current docs. Do not assume from memory.
- One primary action per screen. Phone-first at 360 px. Dark theme default.
- Stop at the end of each phase in PLAN.md and report: built, skipped, test results, open issues.
