# THE TRIAL - Implementation Plan

## What We're Building
A noir courtroom simulation game where the player is a judge. Claude AI generates unique cases and acts as Game Master. The player questions witnesses, examines evidence, and delivers a verdict. Packaged as an Android APK.

---

## Phase 1: Project Setup
- Initialize React + Vite project
- Install and configure Tailwind CSS
- Set up Google Fonts (Playfair Display for headers, Crimson Text for body)
- Establish the noir color palette: charcoal (#0d0d0d, #1a1a1a), muted gold (#c9a227), cream (#f5f0e6)
- Create the file structure from the spec

## Phase 2: Landing Page
- Full-screen noir landing page with dramatic title "THE TRIAL"
- "Enter the Courtroom" button
- "How to Play" button that opens a Rules modal
- API key input (stored in localStorage) — required before starting a game
- Atmospheric styling: dark background, gold accents, serif typography

## Phase 3: Rules Modal
- Explain the gameplay: you're the judge, one action per turn, verdict unlocks at Turn 4
- Explain scoring categories (Timing, Evidence, Deception, Cognitive)
- Explain score labels (Elite Judge through Dangerous Judge)
- Styled to match the noir theme

## Phase 4: Game Interface
- **Chat Panel** (left/main area): Scrollable area showing AI narration and player choices
  - AI messages styled as narration
  - Numbered action options the player can tap/click to select
  - Player's chosen actions shown as their messages
- **Status Panel** (right side on desktop, collapsible on mobile):
  - Turn counter (pulses at Turn 4 when verdict unlocks)
  - Evidence tracker (list of evidence examined so far)
  - Verdict buttons: "Guilty" and "Not Guilty" (locked/grayed until Turn 4)
- Mobile-responsive: status panel moves to top/bottom on small screens

## Phase 5: Claude API Integration
- Service module that calls the Anthropic Claude API
- Sends the system prompt (Game Master instructions) + conversation history
- Parses `[Turn X]` from responses to update turn counter
- Extracts evidence mentions to populate the tracker
- One API call per player action
- API key read from localStorage (entered on landing page)

## Phase 6: Game State Management
- Custom `useGameState` hook managing:
  - Conversation history (messages array)
  - Current turn number
  - Evidence examined
  - Game phase (landing, playing, verdict, results)
  - Verdict lock status (unlocks at Turn 4)
  - Loading state during API calls

## Phase 7: Verdict Flow
- Verdict confirmation modal: "Are you sure?" with dramatic styling
- If before Turn 4: send verdict to AI, get automatic failure response
- If Turn 4+: send verdict to AI, get full case reveal + score breakdown
- Parse score from AI response

## Phase 8: Results Page
- Display: Correct/Incorrect verdict
- Full truth explanation from the AI
- Score breakdown by category (Timing, Evidence, Deception, Cognitive)
- Total score + label (Elite Judge, etc.)
- "Play Again" button to return to landing page

## Phase 9: Polish
- Smooth transitions/animations between screens
- Loading states during API calls (typing indicator)
- Turn counter pulse animation at Turn 4
- Gavel animation or effect on verdict delivery
- Mobile responsiveness testing
- Error handling for API failures

## Phase 10: Android APK via Capacitor
- Install Capacitor (`@capacitor/core`, `@capacitor/cli`, `@capacitor/android`)
- Initialize Capacitor config
- Add Android platform
- Build the web app (`npm run build`)
- Copy web assets to Android project (`npx cap copy`)
- Configure Android project (app name, icon, splash screen)
- Build the APK

---

## Architecture Summary

```
User taps action → useGameState formats message → claudeApi sends to Claude
→ Response parsed (turn #, evidence, narration) → State updated → UI re-renders
```

## Key Design Decisions
- **No backend server**: API calls go directly from the client to Anthropic's API (API key stored locally)
- **All game logic lives in the AI prompt**: Claude handles case generation, narration, scoring — the frontend is a themed chat interface with state tracking
- **Capacitor for Android**: wraps the web app as-is, no native code needed
