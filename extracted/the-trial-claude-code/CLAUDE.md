# THE TRIAL - AI Courtroom Simulation Game

## Project Overview
An interactive courtroom simulation game where the player acts as a judge who must determine if a defendant is guilty or not guilty. The game uses Claude AI as the Game Master to generate unique cases, narrate courtroom drama, and evaluate player performance.

## Tech Stack
- **Frontend**: React + Vite
- **Styling**: Tailwind CSS
- **AI**: Anthropic Claude API
- **Target Platforms**: Web (desktop/mobile), optionally Android via Capacitor

## Core Game Mechanics

### Case Generation (AI does this internally)
1. Randomly determine GUILTY or NOT GUILTY (locked, cannot change)
2. Generate defendant: realistic name, age, background (vary each game)
3. Select crime: murder, arson, embezzlement, fraud, robbery, poisoning, etc.
4. Create 5-7 evidence pieces:
   - 2-3 CRITICAL (point to truth)
   - 2 MISLEADING (suggest wrong answer)
   - 1-2 NEUTRAL (background flavor)
5. Create 3-4 witnesses with hidden lies/biases
6. Plant at least one catchable contradiction
7. Create 4-6 jurors with visible reactions

### Gameplay Flow
- Player takes ONE action per turn: question defendant, question prosecution, or examine evidence
- AI narrates outcomes vividly with reactions
- AI presents 4-5 numbered options after each action
- Track turn count (displayed to player)
- Verdict unlocks at Turn 4

### Verdict Rules
- Before Turn 4: Automatic failure ("reckless judgment")
- Turn 4+: Reveal correct/incorrect, explain full truth, calculate score

### Scoring (0-100)
- Timing (30 pts): Turns 4-6 = 30, 7-9 = 22, 10-12 = 12, 13+ = 5
- Evidence (30 pts): +10 per critical evidence examined (max 30)
- Deception (20 pts): +10 catching lies, -10 believing them
- Cognitive (20 pts): +10 adapting to contradictions

### Score Labels
- 100 = Elite Judge
- 85-99 = Excellent Judgment
- 70-84 = Competent but Vulnerable
- 50-69 = Poor Under Pressure
- Below 50 = Dangerous Judge

## Design Direction
- **Aesthetic**: Dark noir courtroom thriller
- **Colors**: Deep charcoal (#0d0d0d, #1a1a1a), muted gold (#c9a227), cream text (#f5f0e6)
- **Typography**: Serif fonts (Playfair Display for headers, Crimson Text for body)
- **Tone**: Tense, atmospheric, no reassurance, player can fail

## Key Features to Build
1. Landing page with dramatic title and "Enter the Courtroom" button
2. Rules/How to Play modal
3. Game interface with:
   - Chat panel showing AI narration and player messages
   - Turn counter
   - Evidence tracker (what's been examined)
   - Verdict buttons (locked until Turn 4)
4. Verdict confirmation modal
5. Results page showing correct/incorrect, explanation, score breakdown
6. API key input (stored in localStorage)

## File Structure
```
the-trial/
├── src/
│   ├── components/
│   │   ├── LandingPage.jsx
│   │   ├── GameInterface.jsx
│   │   ├── ChatPanel.jsx
│   │   ├── StatusPanel.jsx
│   │   ├── VerdictModal.jsx
│   │   ├── RulesModal.jsx
│   │   └── ResultsPage.jsx
│   ├── hooks/
│   │   └── useGameState.js
│   ├── services/
│   │   └── claudeApi.js
│   ├── prompts/
│   │   └── systemPrompt.js
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── public/
├── package.json
├── vite.config.js
├── tailwind.config.js
└── README.md
```

## System Prompt for Claude API
The AI Game Master needs this system prompt to run the game properly. See `/src/prompts/systemPrompt.js` for the full prompt.

## Commands
```bash
npm install      # Install dependencies
npm run dev      # Start dev server
npm run build    # Build for production
```

## Notes
- Keep API calls minimal (one per player action)
- Parse turn numbers from AI response: [Turn X]
- Extract evidence mentions to populate tracker
- Mobile-responsive design (game should work on phones)
- Smooth animations for modals and transitions
