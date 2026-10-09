// Phase 4 reducer rules: reactions and favorites any time, read stamps with
// After Dark retention, the After Dark switch per player, per player tag
// exclusions pruning the deck, and the two player delete confirmation.
import { describe, expect, it } from 'vitest'
import {
  cardBySeq,
  createRoom,
  deleteConfirmed,
  GameError,
  reduce,
  turnView,
  type CreateRoomInput,
} from '../../../src/game/turns'
import type { CardLookup, PoolCard, RoomSettings, RoomState } from '../../../src/game/types'
import { defaultSettings } from './helpers'

const A = 'alice'
const B = 'bob'

const POOL: PoolCard[] = [
  { id: 'q1', pack: 'core', adult: false, type: 'question', level: 1, text: 'One', tags: ['joy'] },
  { id: 'q2', pack: 'core', adult: false, type: 'question', level: 1, text: 'Two', tags: ['fear'] },
  {
    id: 'q3',
    pack: 'core',
    adult: false,
    type: 'question',
    level: 2,
    text: 'Three',
    tags: ['joy', 'fear'],
  },
  { id: 'q4', pack: 'core', adult: false, type: 'question', level: 2, text: 'Four', tags: [] },
  {
    id: 'ad1',
    pack: 'afterdark',
    adult: true,
    type: 'question',
    level: 1,
    text: 'Adult one',
    tags: ['flirt'],
  },
  {
    id: 'ad2',
    pack: 'afterdark',
    adult: true,
    type: 'question',
    level: 2,
    text: 'Adult two',
    tags: ['kink'],
  },
  {
    id: 'w1',
    pack: 'core',
    adult: false,
    type: 'current',
    level: null,
    modes: ['async'],
    text: 'Current',
    tags: ['remote'],
  },
]
const BY_ID = new Map(POOL.map((c) => [c.id, c]))
const lookup: CardLookup = (id) => BY_ID.get(id)

function room(
  cards: string[],
  settings: Partial<RoomSettings> = {},
  input: Partial<CreateRoomInput> = {},
): RoomState {
  let state = createRoom({
    createdAt: 1,
    rules: ['a', 'b'],
    players: [
      { uid: A, name: 'Ada', color: '#4fb3d9' },
      { uid: B, name: 'Ben', color: '#e0a030' },
    ],
    settings: defaultSettings({ packs: ['core', 'afterdark'], currentEvery: 0, ...settings }),
    deck: { seed: 's', cards, dealt: 0, builtAt: 1 },
    ...input,
  })
  state = reduce(state, { type: 'agreeRules', by: A, at: 2 }, lookup)
  state = reduce(state, { type: 'agreeRules', by: B, at: 3 }, lookup)
  return state
}

function send(state: RoomState, by: string, at: number, close?: string, open?: string): RoomState {
  return reduce(state, { type: 'send', by, at, closeAnswer: close, openAnswer: open }, lookup)
}

function closedOne(cards = ['q1', 'q2', 'q3']): RoomState {
  return send(send(room(cards), A, 10, undefined, 'a1'), B, 20, 'b1', 'b2')
}

function expectGameError(fn: () => unknown, code: string): void {
  let caught: unknown
  try {
    fn()
  } catch (error) {
    caught = error
  }
  expect(caught).toBeInstanceOf(GameError)
  expect((caught as GameError).code).toBe(code)
}

describe('reactions', () => {
  it('toggle an emoji per player on a closed or passed card', () => {
    let state = closedOne()
    state = reduce(state, { type: 'react', by: A, at: 30, seq: 1, emoji: '❤️' }, lookup)
    state = reduce(state, { type: 'react', by: B, at: 31, seq: 1, emoji: '❤️' }, lookup)
    state = reduce(state, { type: 'react', by: B, at: 32, seq: 1, emoji: '😂' }, lookup)
    expect(cardBySeq(state, 1)?.reactions).toEqual({ '❤️': [A, B], '😂': [B] })
    state = reduce(state, { type: 'react', by: A, at: 33, seq: 1, emoji: '❤️' }, lookup)
    expect(cardBySeq(state, 1)?.reactions).toEqual({ '❤️': [B], '😂': [B] })
    state = reduce(state, { type: 'react', by: B, at: 34, seq: 1, emoji: '❤️' }, lookup)
    expect(cardBySeq(state, 1)?.reactions).toEqual({ '😂': [B] })
  })

  it('refuse open cards, unknown cards, strangers, and empty emoji', () => {
    const state = closedOne()
    expectGameError(
      () => reduce(state, { type: 'react', by: A, at: 30, seq: 2, emoji: '❤️' }, lookup),
      'card-not-closed',
    )
    expectGameError(
      () => reduce(state, { type: 'react', by: A, at: 30, seq: 9, emoji: '❤️' }, lookup),
      'card-not-found',
    )
    expectGameError(
      () => reduce(state, { type: 'react', by: 'z', at: 30, seq: 1, emoji: '❤️' }, lookup),
      'unknown-player',
    )
    expectGameError(
      () => reduce(state, { type: 'react', by: A, at: 30, seq: 1, emoji: ' ' }, lookup),
      'empty-text',
    )
    const passed = reduce(state, { type: 'pass', by: A, at: 25, target: 'close' }, lookup)
    expect(
      reduce(passed, { type: 'react', by: B, at: 26, seq: 2, emoji: '🥺' }, lookup).cards[1]
        ?.reactions,
    ).toEqual({ '🥺': [B] })
  })
})

describe('favorites', () => {
  it('star and unstar any dealt card', () => {
    let state = closedOne()
    state = reduce(state, { type: 'favorite', by: B, at: 30, seq: 1, on: true }, lookup)
    expect(cardBySeq(state, 1)?.favorite).toBe(true)
    state = reduce(state, { type: 'favorite', by: A, at: 31, seq: 2, on: true }, lookup)
    expect(cardBySeq(state, 2)?.favorite).toBe(true)
    state = reduce(state, { type: 'favorite', by: A, at: 32, seq: 1, on: false }, lookup)
    expect(cardBySeq(state, 1)?.favorite).toBe(false)
    expectGameError(
      () => reduce(state, { type: 'favorite', by: 'z', at: 33, seq: 1, on: true }, lookup),
      'unknown-player',
    )
    expectGameError(
      () => reduce(state, { type: 'favorite', by: A, at: 33, seq: 7, on: true }, lookup),
      'card-not-found',
    )
  })
})

describe('read stamps and After Dark retention', () => {
  function adultClosed(retention: 'keep' | 'hide-after-read'): RoomState {
    let state = room(['ad1', 'q1', 'q2'], { afterDarkRetention: retention })
    state = reduce(
      state,
      { type: 'afterDark', by: A, at: 4, enabled: true, confirmAdult: true },
      lookup,
    )
    state = reduce(
      state,
      { type: 'afterDark', by: B, at: 5, enabled: true, confirmAdult: true },
      lookup,
    )
    return send(send(state, A, 10, undefined, 'a1'), B, 20, 'b1', 'b2')
  }

  it('stamp the reader once and keep the card with retention keep', () => {
    let state = adultClosed('keep')
    state = reduce(state, { type: 'markRead', by: B, at: 21, seq: 1 }, lookup)
    state = reduce(state, { type: 'markRead', by: B, at: 22, seq: 1 }, lookup)
    state = reduce(state, { type: 'markRead', by: A, at: 30, seq: 1 }, lookup)
    expect(cardBySeq(state, 1)?.readBy).toEqual({ [B]: 21, [A]: 30 })
    expect(cardBySeq(state, 1)?.status).toBe('closed')
    expect(cardBySeq(state, 1)?.cardText).toBe('Adult one')
  })

  it('hide an After Dark card once both have read it, leaving only a tombstone', () => {
    let state = adultClosed('hide-after-read')
    state = reduce(state, { type: 'markRead', by: B, at: 21, seq: 1 }, lookup)
    expect(cardBySeq(state, 1)?.status).toBe('closed')
    state = reduce(state, { type: 'react', by: B, at: 22, seq: 1, emoji: '❤️' }, lookup)
    state = reduce(state, { type: 'markRead', by: A, at: 30, seq: 1 }, lookup)
    const hidden = cardBySeq(state, 1)
    expect(hidden).toMatchObject({
      seq: 1,
      status: 'hidden',
      adult: true,
      cardText: '',
      answers: {},
      followUps: {},
      reactions: {},
      readBy: { [B]: 21, [A]: 30 },
    })
    expect(state.cards).toHaveLength(2)
    expectGameError(
      () => reduce(state, { type: 'react', by: A, at: 31, seq: 1, emoji: '❤️' }, lookup),
      'card-not-closed',
    )
    expectGameError(
      () => reduce(state, { type: 'favorite', by: A, at: 31, seq: 1, on: true }, lookup),
      'card-not-closed',
    )
    expectGameError(
      () => reduce(state, { type: 'askFollowUp', by: A, at: 31, seq: 1, text: 'x' }, lookup),
      'card-not-closed',
    )
    expect(turnView(state, lookup).catchUp).toBeNull()
  })

  it('never hide a normal card and refuse stamps on open or missing cards', () => {
    let state = closedOne()
    state = { ...state, settings: { ...state.settings, afterDarkRetention: 'hide-after-read' } }
    state = reduce(state, { type: 'markRead', by: A, at: 21, seq: 1 }, lookup)
    state = reduce(state, { type: 'markRead', by: B, at: 22, seq: 1 }, lookup)
    expect(cardBySeq(state, 1)?.status).toBe('closed')
    expectGameError(
      () => reduce(state, { type: 'markRead', by: A, at: 23, seq: 2 }, lookup),
      'card-not-closed',
    )
    expectGameError(
      () => reduce(state, { type: 'markRead', by: A, at: 23, seq: 9 }, lookup),
      'card-not-found',
    )
    expectGameError(
      () => reduce(state, { type: 'markRead', by: 'z', at: 23, seq: 1 }, lookup),
      'unknown-player',
    )
  })
})

describe('After Dark switch', () => {
  it('needs an adult confirmation to turn on and records when', () => {
    const state = room(['q1', 'q2'])
    expectGameError(
      () =>
        reduce(
          state,
          { type: 'afterDark', by: A, at: 4, enabled: true, confirmAdult: false },
          lookup,
        ),
      'adult-confirmation',
    )
    const on = reduce(
      state,
      { type: 'afterDark', by: A, at: 4, enabled: true, confirmAdult: true },
      lookup,
    )
    expect(on.players[A]).toMatchObject({ afterDarkEnabled: true, afterDarkConfirmedAt: 4 })
    expect(on.players[B]?.afterDarkEnabled).toBe(false)
    const off = reduce(
      on,
      { type: 'afterDark', by: A, at: 5, enabled: false, confirmAdult: false },
      lookup,
    )
    expect(off.players[A]).toMatchObject({ afterDarkEnabled: false, afterDarkConfirmedAt: 4 })
    expectGameError(
      () =>
        reduce(
          state,
          { type: 'afterDark', by: 'z', at: 4, enabled: true, confirmAdult: true },
          lookup,
        ),
      'unknown-player',
    )
  })

  it('turning it off prunes undealt After Dark cards and passes an open one without penalty', () => {
    let state = room(['ad1', 'q1', 'ad2', 'q2'])
    state = reduce(
      state,
      { type: 'afterDark', by: A, at: 4, enabled: true, confirmAdult: true },
      lookup,
    )
    state = reduce(
      state,
      { type: 'afterDark', by: B, at: 5, enabled: true, confirmAdult: true },
      lookup,
    )
    state = send(state, A, 10, undefined, 'a1')
    expect(cardBySeq(state, 1)?.cardId).toBe('ad1')
    state = reduce(
      state,
      { type: 'afterDark', by: B, at: 11, enabled: false, confirmAdult: false },
      lookup,
    )
    const open = cardBySeq(state, 1)
    expect(open?.status).toBe('passed')
    expect(open?.passedBy).toBe(B)
    expect(open?.closedTurn).toBe(1)
    expect(open?.answers[A]?.text).toBe('a1')
    expect(state.openSeq).toBe(0)
    expect(state.passes).toEqual({ [A]: 3, [B]: 3 })
    expect(state.deck.cards).toEqual(['ad1', 'q1', 'q2'])
    expect(state.deck.dealt).toBe(1)
    expect(turnView(state, lookup).open?.card.id).toBe('q1')
    expect(state.passedCards['ad1']).toBe(11)
    // The opener learns of the pass at the start of their next turn, with no follow-up offered.
    state = send(state, B, 12, undefined, 'b2')
    const view = turnView(state, lookup)
    expect(view.holder).toBe(A)
    expect(view.catchUp?.card.seq).toBe(1)
    expect(view.catchUp?.canAskFollowUp).toBe(false)
  })

  it('leaves the deck alone when the other player still has it off', () => {
    let state = room(['q1', 'ad1', 'q2'])
    state = reduce(
      state,
      { type: 'afterDark', by: A, at: 4, enabled: true, confirmAdult: true },
      lookup,
    )
    state = reduce(
      state,
      { type: 'afterDark', by: A, at: 5, enabled: false, confirmAdult: false },
      lookup,
    )
    expect(state.deck.cards).toEqual(['q1', 'q2'])
  })
})

describe('tag exclusions', () => {
  it('store a player exclusion list and prune undealt cards carrying those tags', () => {
    let state = room(['q1', 'q2', 'q3', 'q4', 'w1'])
    state = send(state, A, 10, undefined, 'a1')
    state = reduce(
      state,
      { type: 'excludeTags', by: B, at: 11, tags: [' fear ', 'remote', 'fear'] },
      lookup,
    )
    expect(state.players[B]?.excludeTags).toEqual(['fear', 'remote'])
    expect(state.deck.cards).toEqual(['q1', 'q4'])
    expect(cardBySeq(state, 1)?.cardId).toBe('q1')
    state = reduce(state, { type: 'excludeTags', by: B, at: 12, tags: [] }, lookup)
    expect(state.players[B]?.excludeTags).toEqual([])
    expect(state.deck.cards).toEqual(['q1', 'q4'])
    expectGameError(
      () => reduce(state, { type: 'excludeTags', by: 'z', at: 12, tags: [] }, lookup),
      'unknown-player',
    )
    expectGameError(
      () => reduce(state, { type: 'excludeTags', by: A, at: 12, tags: ['', 'x'] }, lookup),
      'invalid-player',
    )
  })
})

describe('delete confirmation', () => {
  it('needs both players and can be withdrawn', () => {
    let state = room(['q1'])
    expect(deleteConfirmed(state)).toBe(false)
    state = reduce(state, { type: 'requestDelete', by: A, at: 5, on: true }, lookup)
    expect(state.deleteRequests).toEqual({ [A]: 5 })
    expect(deleteConfirmed(state)).toBe(false)
    state = reduce(state, { type: 'requestDelete', by: A, at: 6, on: false }, lookup)
    expect(state.deleteRequests).toEqual({})
    state = reduce(state, { type: 'requestDelete', by: A, at: 7, on: true }, lookup)
    state = reduce(state, { type: 'requestDelete', by: B, at: 8, on: true }, lookup)
    expect(deleteConfirmed(state)).toBe(true)
    expectGameError(
      () => reduce(state, { type: 'requestDelete', by: 'z', at: 9, on: true }, lookup),
      'unknown-player',
    )
  })
})
