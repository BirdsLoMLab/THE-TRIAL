# Getting Started with Claude Code

## Step 1: Install Claude Code
```bash
npm install -g @anthropic-ai/claude-code
```

## Step 2: Create your project folder
```bash
mkdir the-trial
cd the-trial
```

## Step 3: Copy CLAUDE.md into your project folder
This file tells Claude Code about your project.

## Step 4: Start Claude Code
```bash
claude
```

## Step 5: Give Claude Code this initial prompt:

---

Initialize a new React + Vite + Tailwind project for THE TRIAL game. Read CLAUDE.md for full specs.

Start by:
1. Setting up the project with `npm create vite@latest . -- --template react`
2. Installing Tailwind CSS
3. Creating the file structure from CLAUDE.md
4. Building the system prompt file for the Claude API
5. Creating the landing page component with the noir aesthetic

Let's build this step by step. After each major component, pause and let me review before continuing.

---

## Step 6: Iterate
Claude Code will build each piece. Review, test, request changes, and continue until the game is complete.

## Tips
- Ask Claude Code to run `npm run dev` so you can see changes live
- If something breaks, paste the error and ask it to fix
- Request "make it more noir" or "add animations" for polish
- When done, ask it to add Capacitor for Android builds

## Example Follow-up Prompts

"Build the GameInterface component with the chat panel on the left and status panel on the right"

"Create the Claude API service that sends messages and parses responses"

"Add the verdict confirmation modal with dramatic styling"

"Make the turn counter pulse when it reaches Turn 4"

"Add sound effects for the gavel when delivering verdict"

"Set up Capacitor so I can build this as an Android APK"
