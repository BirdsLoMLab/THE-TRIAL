import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CARD_PREVIEW_LENGTH,
  deadTokens,
  nudgePayload,
  preview,
  reminderPayload,
  TEXT,
  turnPayload,
} from '../src/notify.js'

describe('notification text', () => {
  it('matches content/shared.json notifications', () => {
    const shared = JSON.parse(
      readFileSync(resolve(import.meta.dirname, '../../content/shared.json'), 'utf8'),
    ) as {
      notifications: Record<string, string>
    }
    expect(TEXT).toEqual(shared.notifications)
  })

  it('previews the first 60 characters of the card', () => {
    expect(preview('Short one')).toBe('Short one')
    const long =
      'What is a small thing that reliably makes your day better, and when did you last get it?'
    const cut = preview(long)
    expect(cut.length).toBeLessThanOrEqual(CARD_PREVIEW_LENGTH + 3)
    expect(cut.endsWith('...')).toBe(true)
    expect(long.startsWith(cut.slice(0, -3))).toBe(true)
  })

  it('names the card for a normal turn and only the pack for After Dark', () => {
    expect(turnPayload('r1', 'Ada', { text: 'What is your order?', adult: false })).toEqual({
      title: 'Your turn',
      body: 'Ada answered: What is your order?',
      data: { roomId: 'r1', kind: 'turn' },
    })
    const adult = turnPayload('r1', 'Ada', { text: 'Explicit text', adult: true })
    expect(adult.body).toBe('Ada answered an After Dark card')
    expect(adult.body).not.toContain('Explicit')
    expect(turnPayload('r1', 'Ada', null).body).toBe('Ada sent a turn')
  })

  it('builds reminder and nudge bodies', () => {
    expect(reminderPayload('r1', 'Ada', 12)).toEqual({
      title: 'Still your turn',
      body: 'Ada has been waiting 12 hours',
      data: { roomId: 'r1', kind: 'reminder' },
    })
    expect(nudgePayload('r1', 'Ada').body).toBe('Ada nudged you')
  })

  it('finds dead tokens in a multicast response', () => {
    const tokens = ['t1', 't2', 't3', 't4']
    const responses = [
      { success: true },
      { success: false, error: { code: 'messaging/registration-token-not-registered' } },
      { success: false, error: { code: 'messaging/internal-error' } },
      { success: false, error: { code: 'messaging/invalid-argument' } },
    ]
    expect(deadTokens(tokens, responses)).toEqual(['t2', 't4'])
  })
})
