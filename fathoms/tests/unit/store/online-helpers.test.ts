import { describe, expect, it } from 'vitest'
import { timeAgo } from '../../../src/game-ui/useNow'
import { createRoom } from '../../../src/game/turns'
import {
  inviteUrlFor,
  partnerIsOnline,
  PRESENCE_WINDOW_MS,
  readyState,
} from '../../../src/store/online'
import { emulatorsEnabled, firebaseConfigFromEnv } from '../../../src/sync/firebase'
import { defaultSettings } from '../game/helpers'

const state = createRoom({
  createdAt: 1,
  rules: ['a', 'b'],
  players: [
    { uid: 'me', name: 'Ada', color: '#4fb3d9' },
    { uid: 'you', name: 'Ben', color: '#e0a030' },
  ],
  settings: defaultSettings(),
  deck: { seed: 's', cards: [], dealt: 0, builtAt: 1 },
})

describe('online helpers', () => {
  it('reads the room state only from a ready snapshot', () => {
    expect(readyState(null)).toBeNull()
    expect(readyState({ kind: 'missing' })).toBeNull()
    expect(readyState({ kind: 'ready', state })).toBe(state)
  })

  it('treats a recently seen partner as online', () => {
    const now = 1_000_000
    expect(partnerIsOnline(state, 'me', now)).toBe(false)
    const seen = {
      ...state,
      players: { ...state.players, you: { ...state.players['you']!, lastSeen: now - 1000 } },
    }
    expect(partnerIsOnline(seen, 'me', now)).toBe(true)
    const stale = {
      ...state,
      players: {
        ...state.players,
        you: { ...state.players['you']!, lastSeen: now - PRESENCE_WINDOW_MS - 1 },
      },
    }
    expect(partnerIsOnline(stale, 'me', now)).toBe(false)
  })

  it('builds hash invite links on the current origin', () => {
    expect(inviteUrlFor('abc', 'https://fathoms.example/app/')).toBe(
      'https://fathoms.example/app/#/join/abc',
    )
    expect(inviteUrlFor('abc')).toContain('#/join/abc')
  })

  it('reads the emulator switch from the env', () => {
    expect(emulatorsEnabled({})).toBe(false)
    expect(emulatorsEnabled({ VITE_FIREBASE_EMULATORS: '1' })).toBe(true)
    expect(emulatorsEnabled({ VITE_FIREBASE_EMULATORS: 'true' })).toBe(true)
    expect(firebaseConfigFromEnv({ VITE_FIREBASE_EMULATORS: '1' })).toBeNull()
  })

  it('describes how long ago something happened', () => {
    const now = 10_000_000
    expect(timeAgo(now - 5_000, now)).toBe('just now')
    expect(timeAgo(now - 60_000, now)).toBe('1 minute ago')
    expect(timeAgo(now - 5 * 60_000, now)).toBe('5 minutes ago')
    expect(timeAgo(now - 3 * 3_600_000, now)).toBe('3 hours ago')
    expect(timeAgo(now - 3 * 86_400_000, now)).toBe('3 days ago')
    expect(timeAgo(now + 5000, now)).toBe('just now')
  })
})
