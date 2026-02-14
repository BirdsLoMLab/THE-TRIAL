# THE TRIAL - Implementation Plan

## What We're Building
A noir courtroom simulation game where the player is a judge. Claude AI generates unique cases and acts as Game Master. The player questions witnesses, examines evidence, and delivers a verdict. Features comic book style visuals, live voice input/output, and packages as an Android APK.

---

## Phase 1: Project Setup [DONE]
- React + Vite + Tailwind CSS v4
- Google Fonts (Playfair Display, Crimson Text)
- Noir color palette: charcoal (#0d0d0d, #1a1a1a), muted gold (#c9a227), cream (#f5f0e6)

## Phase 2: Landing Page [DONE]
- Dramatic title "THE TRIAL" with noir atmosphere
- "Enter the Courtroom" + "How to Play" buttons
- API key input with step-by-step instructions for getting a Claude key
- Key stored in localStorage, never sent anywhere except Anthropic's API

## Phase 3: Rules Modal [DONE]
- Gameplay explanation, scoring categories, score labels
- Voice controls documentation

## Phase 4: Game Interface [DONE]
- **Comic Panel** (top): SVG courtroom scene that updates based on AI scene data
  - Dynamic characters: Judge, Witness, Prosecution, Defense, Jury
  - Mood-reactive colors and speed lines for dramatic moments
  - Evidence examination visuals with magnifying glass animation
  - Location labels, speech indicators, halftone overlay
- **Chat Panel** (main): AI narration with clickable numbered action options
- **Status Panel** (right sidebar, collapsible on mobile):
  - Turn counter with gold pulse at Turn 4
  - Evidence tracker
  - Verdict buttons (locked until Turn 4)
  - Voice toggle controls

## Phase 5: Claude API Integration [DONE]
- Direct browser-to-API calls (no backend)
- System prompt with [SCENE] block parsing for visual updates
- [VERDICT_RESULT] block parsing for structured scoring
- Turn number extraction, option parsing

## Phase 6: Game State Management [DONE]
- `useGameState` hook: conversation, turns, evidence, phases, verdict flow
- `useVoice` hook: speech recognition, synthesis, auto-narrate

## Phase 7: Voice System [DONE]
- **Input**: Web Speech API SpeechRecognition (Chrome/Chromium)
  - Tap mic button, speak action, auto-submits on speech end
  - Visual pulse animation while listening
- **Output**: Web Speech API SpeechSynthesis
  - Auto-narrates AI responses aloud
  - Deep/slow voice for noir feel (rate 0.9, pitch 0.8)
  - Chunks long text for reliable playback
  - Toggle on/off in status panel

## Phase 8: Verdict Flow [DONE]
- Confirmation modal with gavel animation
- Warning for early verdicts (before Turn 4)
- AI reveals truth + calculates score

## Phase 9: Results Page [DONE]
- Correct/Incorrect verdict display
- Animated score bars (Timing, Evidence, Deception, Cognitive)
- Full truth explanation from AI
- "Try Another Case" button

## Phase 10: Android APK via Capacitor [TODO]
- Capacitor setup + Android platform
- Build APK

---

## File Structure
```
src/
├── components/
│   ├── LandingPage.jsx      # Title screen + API key input
│   ├── GameInterface.jsx     # Main game layout
│   ├── ChatPanel.jsx         # AI narration + action buttons
│   ├── StatusPanel.jsx       # Turn/evidence/verdict/voice
│   ├── CourtroomScene.jsx    # Comic book SVG scene
│   ├── VerdictModal.jsx      # Verdict confirmation
│   ├── RulesModal.jsx        # How to play
│   └── ResultsPage.jsx       # Score breakdown
├── hooks/
│   ├── useGameState.js       # Core game state
│   └── useVoice.js           # Speech recognition + synthesis
├── services/
│   └── claudeApi.js          # Anthropic API client
├── prompts/
│   └── systemPrompt.js       # AI Game Master prompt
├── App.jsx
├── main.jsx
└── index.css                 # Tailwind + custom animations
```

## Architecture
```
Player action (tap/voice) → useGameState → claudeApi → Claude API
→ Parse response ([Turn], [SCENE], options, [VERDICT_RESULT])
→ Update state → Re-render UI (chat, comic panel, status)
→ Auto-narrate via SpeechSynthesis
```
