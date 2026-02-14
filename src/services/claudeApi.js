import { SYSTEM_PROMPT } from '../prompts/systemPrompt';

const API_URL = 'https://api.anthropic.com/v1/messages';

export async function sendMessage(apiKey, conversationHistory, userMessage) {
  const messages = [
    ...conversationHistory,
    ...(userMessage ? [{ role: 'user', content: userMessage }] : []),
  ];

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    if (response.status === 401) {
      throw new Error('Invalid API key. Please check your key and try again.');
    }
    if (response.status === 429) {
      throw new Error('Rate limited. Please wait a moment and try again.');
    }
    throw new Error(err.error?.message || `API error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text || '';
  return text;
}

export function parseResponse(text) {
  const result = {
    narration: text,
    turn: null,
    options: [],
    scene: null,
    verdictResult: null,
  };

  // Parse turn number
  const turnMatch = text.match(/\*?\*?\[Turn\s+(\d+)\]\*?\*?/i);
  if (turnMatch) {
    result.turn = parseInt(turnMatch[1], 10);
  }

  // Parse scene block
  const sceneMatch = text.match(/\[SCENE\]([\s\S]*?)\[\/SCENE\]/);
  if (sceneMatch) {
    const sceneText = sceneMatch[1];
    result.scene = {
      speaker: extractField(sceneText, 'speaker') || 'narrator',
      mood: extractField(sceneText, 'mood') || 'neutral',
      location: extractField(sceneText, 'location') || 'courtroom_wide',
      evidence: extractField(sceneText, 'evidence') || 'none',
      charactersPresent: (extractField(sceneText, 'characters_present') || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean),
    };
    result.narration = text.replace(/\[SCENE\][\s\S]*?\[\/SCENE\]/, '').trim();
  }

  // Parse verdict result block
  const verdictMatch = text.match(/\[VERDICT_RESULT\]([\s\S]*?)\[\/VERDICT_RESULT\]/);
  if (verdictMatch) {
    const vText = verdictMatch[1];
    result.verdictResult = {
      correct: extractField(vText, 'correct') === 'true',
      score: parseInt(extractField(vText, 'score') || '0', 10),
      label: extractField(vText, 'label') || 'Dangerous Judge',
      timing: parseInt(extractField(vText, 'timing') || '0', 10),
      evidence: parseInt(extractField(vText, 'evidence') || '0', 10),
      deception: parseInt(extractField(vText, 'deception') || '0', 10),
      cognitive: parseInt(extractField(vText, 'cognitive') || '0', 10),
    };
    result.narration = result.narration.replace(/\[VERDICT_RESULT\][\s\S]*?\[\/VERDICT_RESULT\]/, '').trim();
  }

  // Parse numbered options
  const optionMatches = [...result.narration.matchAll(/^\s*(\d+)[.)]\s+(.+)$/gm)];
  if (optionMatches.length >= 2) {
    result.options = optionMatches.map(m => ({
      number: parseInt(m[1], 10),
      text: m[2].trim(),
    }));
  }

  return result;
}

function extractField(text, field) {
  const match = text.match(new RegExp(`${field}:\\s*(.+)`, 'i'));
  return match ? match[1].trim() : null;
}
