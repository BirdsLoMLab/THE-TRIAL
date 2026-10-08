import { describe, expect, it } from 'vitest'
import { getContent } from '../../../src/content'
import { buildDeck } from '../../../src/game/deck'
import {
  cardBySeq,
  createRoom,
  deckHistory,
  GameError,
  nextDeal,
  NUDGE_INTERVAL_MS,
  partnerOf,
  playersNeedingRules,
  reduce,
  roomPhase,
  turnView,
  validateSettings,
  visibleAnswers,
  type Action,
  type CreateRoomInput,
} from '../../../src/game/turns'
import type {
  CardLookup,
  CurrentPoolCard,
  Deck,
  LevelId,
  PlayMode,
  PoolCard,
  QuestionPoolCard,
  RoomState,
} from '../../../src/game/types'
import { defaultSettings } from './helpers'

const A = 'alice'
const B = 'bob'
const RULES: readonly [string, string] = ['Honest or pass.', 'Follow the thread.']

function q(id: string, level: LevelId, adult = false, pack = 'core'): QuestionPoolCard {
  return { id, pack, adult, type: 'question', level, text: `Question ${id}`, tags: [] }
}

function cur(id: string, modes: PlayMode[] = ['live', 'async'], adult = false): CurrentPoolCard {
  return {
    id,
    pack: 'core',
    adult,
    type: 'current',
    level: null,
    modes,
    text: `Current ${id}`,
    tags: [],
  }
}

const POOL: PoolCard[] = [
  q('q1', 1),
  q('q2', 1),
  q('q3', 1),
  q('q4', 2),
  q('q5', 2),
  q('q6', 3),
  q('q7', 3),
  q('q8', 3),
  q('ad1', 2, true, 'afterdark'),
  cur('w1'),
  cur('w2'),
]
const BY_ID = new Map(POOL.map((c) => [c.id, c]))
const lookup: CardLookup = (id) => BY_ID.get(id)

function deckOf(cards: readonly string[]): Deck {
  return { seed: 'test', cards, dealt: 0, builtAt: 0 }
}

function roomInput(
  cards: readonly string[],
  overrides: Partial<CreateRoomInput> = {},
): CreateRoomInput {
  return {
    createdAt: 1,
    rules: RULES,
    players: [
      { uid: A, name: 'Alice', color: '#4fb3d9' },
      { uid: B, name: 'Bob', color: '#e0a030' },
    ],
    settings: defaultSettings(),
    deck: deckOf(cards),
    ...overrides,
  }
}

function room(cards: readonly string[], overrides: Partial<CreateRoomInput> = {}): RoomState {
  return createRoom(roomInput(cards, overrides))
}

/** A room where both players already agreed to the rules. */
function ready(cards: readonly string[], overrides: Partial<CreateRoomInput> = {}): RoomState {
  let state = room(cards, overrides)
  state = reduce(state, { type: 'agreeRules', by: A, at: 2 }, lookup)
  state = reduce(state, { type: 'agreeRules', by: B, at: 3 }, lookup)
  return state
}

type SendInput = { close?: string; open?: string; replies?: { seq: number; text: string }[] }

function send(state: RoomState, by: string, at: number, input: SendInput = {}): RoomState {
  return reduce(
    state,
    {
      type: 'send',
      by,
      at,
      closeAnswer: input.close,
      openAnswer: input.open,
      replies: input.replies,
    },
    lookup,
  )
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

/** Plays the three first turns: A opens 1, B closes 1 and opens 2, A catches up on 1, closes 2, opens 3. */
function threeTurns(cards: readonly string[] = ['q1', 'q2', 'q3', 'q4']): RoomState {
  let state = ready(cards)
  state = send(state, A, 10, { open: 'A opens 1' })
  state = send(state, B, 20, { close: 'B closes 1', open: 'B opens 2' })
  state = send(state, A, 30, { close: 'A closes 2', open: 'A opens 3' })
  return state
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key])
  }
  return value
}

describe('createRoom', () => {
  it('builds the initial room with the first player holding the ball', () => {
    const state = room(['q1', 'q2'])
    expect(state.version).toBe(1)
    expect(state.createdAt).toBe(1)
    expect(state.rules).toEqual(RULES)
    expect(state.order).toEqual([A, B])
    expect(state.ball).toEqual({ holderUid: A, since: 1, lastReminderAt: null, remindersSent: 0 })
    expect(state.openSeq).toBe(0)
    expect(state.turn).toBe(0)
    expect(state.passes).toEqual({ [A]: 3, [B]: 3 })
    expect(state.lighter).toBeNull()
    expect(state.paused).toBeNull()
    expect(state.nudge).toBeNull()
    expect(state.deleteRequests).toEqual({})
    expect(state.passedCards).toEqual({})
    expect(state.cards).toEqual([])
    expect(state.deck).toEqual(deckOf(['q1', 'q2']))
    expect(state.players[A]).toEqual({
      name: 'Alice',
      color: '#4fb3d9',
      joinedAt: 1,
      lastSeen: null,
      fcmTokens: [],
      quietHours: null,
      excludeTags: [],
      afterDarkEnabled: false,
      afterDarkConfirmedAt: null,
      lastTurnAt: null,
      lastTurn: null,
      rulesAgreedAt: null,
    })
    expect(state.players[B]?.name).toBe('Bob')
  })

  it('trims player names', () => {
    const state = room(['q1'], {
      players: [
        { uid: A, name: '  Alice ', color: '#4fb3d9' },
        { uid: B, name: 'Bob', color: '#e0a030' },
      ],
    })
    expect(state.players[A]?.name).toBe('Alice')
  })

  it('rejects anything but two distinct players with names and colors', () => {
    const alice = { uid: A, name: 'Alice', color: '#4fb3d9' }
    const bob = { uid: B, name: 'Bob', color: '#e0a030' }
    expectGameError(() => room(['q1'], { players: [alice] }), 'invalid-room')
    expectGameError(
      () => room(['q1'], { players: [alice, bob, { ...bob, uid: 'c' }] }),
      'invalid-room',
    )
    expectGameError(() => room(['q1'], { players: [alice, { ...bob, uid: A }] }), 'invalid-room')
    expectGameError(
      () => room(['q1'], { players: [alice, { ...bob, name: '   ' }] }),
      'invalid-player',
    )
    expectGameError(
      () => room(['q1'], { players: [alice, { ...bob, name: 'x'.repeat(41) }] }),
      'invalid-player',
    )
    expectGameError(
      () => room(['q1'], { players: [alice, { ...bob, color: 'amber' }] }),
      'invalid-player',
    )
    expectGameError(() => room(['q1'], { players: [alice, { ...bob, uid: '' }] }), 'invalid-room')
  })

  it('rejects invalid settings and empty rules', () => {
    expectGameError(
      () => room(['q1'], { settings: defaultSettings({ passesPerDeck: -1 }) }),
      'invalid-settings',
    )
    expectGameError(() => room(['q1'], { rules: ['', 'Follow the thread.'] }), 'invalid-room')
  })

  it('rejects a deck that was already dealt from', () => {
    expectGameError(() => room(['q1'], { deck: { ...deckOf(['q1']), dealt: 1 } }), 'invalid-deck')
  })
})

describe('validateSettings', () => {
  it('accepts the defaults', () => {
    expect(validateSettings(defaultSettings())).toEqual([])
  })

  it('reports every problem it finds', () => {
    const problems = validateSettings({
      ...defaultSettings(),
      packs: [],
      startLevel: 4 as LevelId,
      progression: 'random' as 'linear',
      currentEvery: -1,
      noCurrentsBefore: 1.5,
      passesPerDeck: 2.5,
      passedCardCooldownDays: -3,
      lighterWindowCards: 0,
      reminderHours: 0,
      reminderCap: 0,
      mode: 'solo' as 'turns',
      afterDarkRetention: 'burn' as 'keep',
      excludeAnswered: 'yes' as unknown as boolean,
      customCardsEnabled: 1 as unknown as boolean,
      closerSeesOpener: null as unknown as boolean,
    })
    for (const field of [
      'packs',
      'startLevel',
      'progression',
      'currentEvery',
      'noCurrentsBefore',
      'passesPerDeck',
      'passedCardCooldownDays',
      'lighterWindowCards',
      'reminderHours',
      'reminderCap',
      'mode',
      'afterDarkRetention',
      'excludeAnswered',
      'customCardsEnabled',
      'closerSeesOpener',
    ]) {
      expect(
        problems.some((p) => p.startsWith(field)),
        field,
      ).toBe(true)
    }
    expect(problems).toHaveLength(15)
  })

  it('accepts a null reminder cap and a positive one, and rejects a pack id that is not a string', () => {
    expect(validateSettings(defaultSettings({ reminderCap: null }))).toEqual([])
    expect(validateSettings(defaultSettings({ reminderCap: 4 }))).toEqual([])
    expect(
      validateSettings(defaultSettings({ packs: ['core', 7 as unknown as string] })),
    ).toHaveLength(1)
    expect(validateSettings(defaultSettings({ packs: ['core', ''] }))).toHaveLength(1)
  })
})

describe('rules agreement', () => {
  it('records agreement per player, idempotently, and lists who still has to agree', () => {
    let state = room(['q1'])
    expect(playersNeedingRules(state)).toEqual([A, B])
    expect(roomPhase(state)).toBe('rules')
    state = reduce(state, { type: 'agreeRules', by: A, at: 5 }, lookup)
    expect(state.players[A]?.rulesAgreedAt).toBe(5)
    expect(playersNeedingRules(state)).toEqual([B])
    expect(roomPhase(state)).toBe('turn')
    const again = reduce(state, { type: 'agreeRules', by: A, at: 6 }, lookup)
    expect(again.players[A]?.rulesAgreedAt).toBe(5)
    expect(again.version).toBe(state.version + 1)
    state = reduce(state, { type: 'agreeRules', by: B, at: 7 }, lookup)
    expect(playersNeedingRules(state)).toEqual([])
  })

  it('rejects an unknown player', () => {
    expectGameError(
      () => reduce(room(['q1']), { type: 'agreeRules', by: 'nobody', at: 1 }, lookup),
      'unknown-player',
    )
  })

  it('blocks sending until the holder agreed', () => {
    let state = room(['q1', 'q2'])
    expectGameError(() => send(state, A, 10, { open: 'x' }), 'rules-not-agreed')
    state = reduce(state, { type: 'agreeRules', by: A, at: 5 }, lookup)
    state = send(state, A, 10, { open: 'x' })
    expect(state.ball.holderUid).toBe(B)
    expect(turnView(state, lookup).rulesAgreed).toBe(false)
    expectGameError(() => send(state, B, 20, { close: 'y', open: 'z' }), 'rules-not-agreed')
  })
})

describe('the first turn', () => {
  it('has only the open step', () => {
    const state = ready(['q1', 'q2'])
    const view = turnView(state, lookup)
    expect(view.holder).toBe(A)
    expect(view.partner).toBe(B)
    expect(view.turn).toBe(0)
    expect(view.rulesAgreed).toBe(true)
    expect(view.catchUp).toBeNull()
    expect(view.pendingFollowUps).toEqual([])
    expect(view.close).toBeNull()
    expect(view.open).toEqual({ seq: 1, card: BY_ID.get('q1') })
    expect(view.deckExhausted).toBe(false)
    expect(view.passesLeft).toBe(3)
    expect(view.lighter).toBeNull()
    expect(view.canGoLighter).toBe(false)
    expect(view.canSend).toBe(true)
    expect(roomPhase(state)).toBe('turn')
  })

  it('deals the first card with the opener answer and passes the ball', () => {
    const before = deepFreeze(ready(['q1', 'q2']))
    const state = send(before, A, 10, { open: 'A opens 1' })
    expect(state.cards).toHaveLength(1)
    expect(state.cards[0]).toEqual({
      seq: 1,
      cardId: 'q1',
      cardText: 'Question q1',
      pack: 'core',
      adult: false,
      level: 1,
      type: 'question',
      dealtAt: 10,
      openerUid: A,
      closerUid: B,
      answers: { [A]: { text: 'A opens 1', at: 10 } },
      followUps: {},
      reactions: {},
      favorite: false,
      readBy: {},
      status: 'open',
      closedAt: null,
      closedTurn: null,
      passedBy: null,
    })
    expect(state.openSeq).toBe(1)
    expect(state.deck.dealt).toBe(1)
    expect(state.turn).toBe(1)
    expect(state.ball).toEqual({ holderUid: B, since: 10, lastReminderAt: null, remindersSent: 0 })
    expect(state.players[A]?.lastTurnAt).toBe(10)
    expect(state.players[A]?.lastTurn).toBe(1)
    expect(state.players[B]?.lastTurnAt).toBeNull()
    expect(state.players[B]?.lastTurn).toBeNull()
    expect(state.version).toBe(before.version + 1)
    expect(before.cards).toEqual([])
    expect(before.openSeq).toBe(0)
  })

  it('trims answers and rejects missing, blank, or unexpected answers', () => {
    const state = ready(['q1', 'q2'])
    expectGameError(() => send(state, A, 10), 'missing-answer')
    expectGameError(() => send(state, A, 10, { open: '   ' }), 'missing-answer')
    expectGameError(() => send(state, A, 10, { open: 'x', close: 'y' }), 'unexpected-answer')
    const sent = send(state, A, 10, { open: '  padded  ' })
    expect(sent.cards[0]?.answers[A]?.text).toBe('padded')
  })

  it('rejects sends from the partner or a stranger', () => {
    const state = ready(['q1', 'q2'])
    expectGameError(() => send(state, B, 10, { open: 'x' }), 'not-holder')
    expectGameError(() => send(state, 'nobody', 10, { open: 'x' }), 'unknown-player')
  })

  it('rejects replies when nothing is pending', () => {
    const state = ready(['q1', 'q2'])
    expectGameError(
      () => send(state, A, 10, { open: 'x', replies: [{ seq: 1, text: 'r' }] }),
      'card-not-found',
    )
  })
})

describe('the second turn', () => {
  it('closes the open card blind and opens the next, with no catch up', () => {
    const first = send(ready(['q1', 'q2', 'q3']), A, 10, { open: 'A opens 1' })
    const view = turnView(first, lookup)
    expect(view.holder).toBe(B)
    expect(view.catchUp).toBeNull()
    expect(view.close?.card.seq).toBe(1)
    expect(view.close?.openerAnswer).toBeNull()
    expect(view.open).toEqual({ seq: 2, card: BY_ID.get('q2') })
    expect(view.canSend).toBe(true)

    const state = send(first, B, 20, { close: 'B closes 1', open: 'B opens 2' })
    const card1 = cardBySeq(state, 1)
    expect(card1?.status).toBe('closed')
    expect(card1?.closedAt).toBe(20)
    expect(card1?.closedTurn).toBe(1)
    expect(card1?.answers).toEqual({
      [A]: { text: 'A opens 1', at: 10 },
      [B]: { text: 'B closes 1', at: 20 },
    })
    const card2 = cardBySeq(state, 2)
    expect(card2?.status).toBe('open')
    expect(card2?.openerUid).toBe(B)
    expect(card2?.closerUid).toBe(A)
    expect(card2?.answers).toEqual({ [B]: { text: 'B opens 2', at: 20 } })
    expect(state.openSeq).toBe(2)
    expect(state.ball.holderUid).toBe(A)
    expect(state.turn).toBe(2)
    expect(cardBySeq(state, 3)).toBeUndefined()
  })

  it('shows the opener answer to the closer only when closerSeesOpener is on', () => {
    const blind = send(ready(['q1', 'q2']), A, 10, { open: 'secret' })
    expect(turnView(blind, lookup).close?.openerAnswer).toBeNull()
    // The close step card carries no hidden answer either, so no screen can leak it.
    expect(turnView(blind, lookup).close?.card.answers).toEqual({})
    expect(cardBySeq(blind, 1)?.answers[A]?.text).toBe('secret')
    const open = send(
      ready(['q1', 'q2'], { settings: defaultSettings({ closerSeesOpener: true }) }),
      A,
      10,
      {
        open: 'secret',
      },
    )
    expect(turnView(open, lookup).close?.openerAnswer).toBe('secret')
    expect(turnView(open, lookup).close?.card.answers).toEqual({ [A]: { text: 'secret', at: 10 } })
  })

  it('requires both answers', () => {
    const first = send(ready(['q1', 'q2']), A, 10, { open: 'x' })
    expectGameError(() => send(first, B, 20, { open: 'y' }), 'missing-answer')
    expectGameError(() => send(first, B, 20, { close: 'y' }), 'missing-answer')
    expectGameError(() => send(first, B, 20, { close: ' ', open: 'y' }), 'missing-answer')
  })
})

describe('visibleAnswers', () => {
  it('hides the opener answer on an open card from the closer unless the setting is on', () => {
    const state = send(ready(['q1', 'q2']), A, 10, { open: 'secret' })
    const card = cardBySeq(state, 1)!
    expect(visibleAnswers(state, card, A)).toEqual({ [A]: { text: 'secret', at: 10 } })
    expect(visibleAnswers(state, card, B)).toEqual({})
    const seeing = { ...state, settings: { ...state.settings, closerSeesOpener: true } }
    expect(visibleAnswers(seeing, card, B)).toEqual({ [A]: { text: 'secret', at: 10 } })
  })

  it('shows both answers once the card is closed, and a passed card keeps the opener answer', () => {
    const state = send(send(ready(['q1', 'q2', 'q3']), A, 10, { open: 'a' }), B, 20, {
      close: 'b',
      open: 'c',
    })
    const closed = cardBySeq(state, 1)!
    expect(Object.keys(visibleAnswers(state, closed, A))).toEqual([A, B])
    expect(Object.keys(visibleAnswers(state, closed, B))).toEqual([A, B])
    const passed = reduce(state, { type: 'pass', by: A, at: 25, target: 'close' }, lookup)
    expect(visibleAnswers(passed, cardBySeq(passed, 2)!, B)).toEqual({ [B]: { text: 'c', at: 20 } })
  })
})

describe('catch up', () => {
  it('shows the card the holder opened last turn once the partner closed it', () => {
    const state = send(send(ready(['q1', 'q2', 'q3', 'q4']), A, 10, { open: 'a1' }), B, 20, {
      close: 'b1',
      open: 'b2',
    })
    const view = turnView(state, lookup)
    expect(view.catchUp?.card.seq).toBe(1)
    expect(view.catchUp?.canAskFollowUp).toBe(true)
    expect(view.close?.card.seq).toBe(2)
    expect(view.open?.seq).toBe(3)
  })

  it('moves on: the next turn catches up on the next card, never on an old one', () => {
    let state = threeTurns()
    state = send(state, B, 40, { close: 'B closes 3', open: 'B opens 4' })
    const view = turnView(state, lookup)
    expect(view.catchUp?.card.seq).toBe(3)
    expect(view.close?.card.seq).toBe(4)
    expect(view.open).toBeNull()
  })

  it('does not repeat a reveal the holder already caught up on, even across a rebuild', () => {
    let state = threeTurns(['q1', 'q2', 'q3'])
    expect(turnView(state, lookup).catchUp?.card.seq).toBe(2)
    state = send(state, B, 40, { close: 'B closes 3' })
    // B keeps the ball (nothing was dealt) and caught up on card 2 before sending.
    expect(state.ball.holderUid).toBe(B)
    expect(turnView(state, lookup).catchUp).toBeNull()
    const deck = deckOf(['q4', 'q5', 'q6'])
    state = reduce(state, { type: 'rebuildDeck', by: B, at: 50, deck }, lookup)
    state = reduce(state, { type: 'agreeRules', by: A, at: 51 }, lookup)
    state = reduce(state, { type: 'agreeRules', by: B, at: 52 }, lookup)
    expect(turnView(state, lookup).catchUp).toBeNull()
    state = send(state, B, 60, { open: 'B opens 4' })
    // A has not sent since B closed card 3: that reveal waits for A across the rebuild.
    expect(turnView(state, lookup).catchUp?.card.seq).toBe(3)
    state = send(state, A, 70, { close: 'A closes 4', open: 'A opens 5' })
    expect(turnView(state, lookup).catchUp?.card.seq).toBe(4)
    state = send(state, B, 80, { close: 'B closes 5', open: 'B opens 6' })
    expect(turnView(state, lookup).catchUp?.card.seq).toBe(5)
  })

  it('skips a card the holder passed as opener and still shows the real reveal', () => {
    let state = send(send(ready(['q1', 'q2', 'q3', 'q4', 'q5']), A, 10, { open: 'a1' }), B, 20, {
      close: 'b1',
      open: 'b2',
    })
    state = reduce(state, { type: 'pass', by: A, at: 25, target: 'open' }, lookup)
    expect(cardBySeq(state, 3)).toMatchObject({ status: 'passed', passedBy: A, openerUid: A })
    const view = turnView(state, lookup)
    expect(view.catchUp?.card.seq).toBe(1)
    expect(view.catchUp?.canAskFollowUp).toBe(true)
    expect(view.close?.card.seq).toBe(2)
    expect(view.open?.seq).toBe(4)
    // On the second turn an opener pass must not conjure a catch up either.
    let second = send(ready(['q1', 'q2', 'q3']), A, 10, { open: 'a1' })
    second = reduce(second, { type: 'pass', by: B, at: 15, target: 'open' }, lookup)
    expect(turnView(second, lookup).catchUp).toBeNull()
  })

  it('judges freshness by turn count, not by the clock, so a skewed phone hides nothing', () => {
    let state = send(ready(['q1', 'q2', 'q3']), A, 10, { open: 'a1' })
    // B's clock runs behind A's: B closes at 4 and asks at 5, both before A's send at 10.
    state = send(state, B, 4, { close: 'b1', open: 'b2' })
    state = reduce(state, { type: 'askFollowUp', by: B, at: 5, seq: 1, text: 'Why?' }, lookup)
    const view = turnView(state, lookup)
    expect(view.holder).toBe(A)
    expect(view.catchUp?.card.seq).toBe(1)
    expect(view.pendingFollowUps.map((p) => p.card.seq)).toEqual([1])
    expect(cardBySeq(state, 1)?.closedTurn).toBe(1)
    expect(cardBySeq(state, 1)?.followUps[B]?.askedTurn).toBe(2)
  })

  it('shows a card the partner passed as closer, without a follow-up option', () => {
    let state = send(ready(['q1', 'q2', 'q3']), A, 10, { open: 'a1' })
    state = reduce(state, { type: 'pass', by: B, at: 15, target: 'close' }, lookup)
    state = send(state, B, 20, { open: 'b2' })
    const view = turnView(state, lookup)
    expect(view.catchUp?.card.seq).toBe(1)
    expect(view.catchUp?.card.status).toBe('passed')
    expect(view.catchUp?.card.passedBy).toBe(B)
    expect(view.catchUp?.canAskFollowUp).toBe(false)
  })

  it('offers no follow-up once the holder already asked one, or on a Current', () => {
    let state = send(send(ready(['q1', 'q2', 'q3']), A, 10, { open: 'a1' }), B, 20, {
      close: 'b1',
      open: 'b2',
    })
    state = reduce(state, { type: 'askFollowUp', by: A, at: 25, seq: 1, text: 'Why?' }, lookup)
    expect(turnView(state, lookup).catchUp?.canAskFollowUp).toBe(false)

    let withCurrent = send(send(ready(['w1', 'q2', 'q3']), A, 10, { open: 'done' }), B, 20, {
      close: 'done too',
      open: 'b2',
    })
    expect(turnView(withCurrent, lookup).catchUp?.card.type).toBe('current')
    expect(turnView(withCurrent, lookup).catchUp?.canAskFollowUp).toBe(false)
    withCurrent = send(withCurrent, A, 30, { close: 'a2', open: 'a3' })
    expect(withCurrent.turn).toBe(3)
  })
})

describe('follow-ups', () => {
  it('lets either player attach one question to a closed card', () => {
    let state = send(send(ready(['q1', 'q2', 'q3']), A, 10, { open: 'a1' }), B, 20, {
      close: 'b1',
      open: 'b2',
    })
    state = reduce(
      state,
      { type: 'askFollowUp', by: B, at: 21, seq: 1, text: ' What did you leave out? ' },
      lookup,
    )
    expect(cardBySeq(state, 1)?.followUps).toEqual({
      [B]: { text: 'What did you leave out?', at: 21, askedTurn: 2, reply: null },
    })
    state = reduce(state, { type: 'askFollowUp', by: A, at: 25, seq: 1, text: 'Why now?' }, lookup)
    expect(Object.keys(cardBySeq(state, 1)?.followUps ?? {})).toEqual([B, A])
    expectGameError(
      () => reduce(state, { type: 'askFollowUp', by: A, at: 26, seq: 1, text: 'Again?' }, lookup),
      'follow-up-exists',
    )
  })

  it('rejects follow-ups on open, passed, missing, or Current cards, and empty text', () => {
    let state = send(ready(['q1', 'w1', 'q3', 'q4']), A, 10, { open: 'a1' })
    expectGameError(
      () => reduce(state, { type: 'askFollowUp', by: B, at: 11, seq: 1, text: 'x' }, lookup),
      'card-not-closed',
    )
    expectGameError(
      () => reduce(state, { type: 'askFollowUp', by: B, at: 11, seq: 9, text: 'x' }, lookup),
      'card-not-found',
    )
    expectGameError(
      () => reduce(state, { type: 'askFollowUp', by: 'z', at: 11, seq: 1, text: 'x' }, lookup),
      'unknown-player',
    )
    state = send(state, B, 20, { close: 'b1', open: 'note' })
    expectGameError(
      () => reduce(state, { type: 'askFollowUp', by: B, at: 21, seq: 1, text: '  ' }, lookup),
      'empty-text',
    )
    state = send(state, A, 30, { close: 'note too', open: 'a3' })
    expectGameError(
      () => reduce(state, { type: 'askFollowUp', by: A, at: 31, seq: 2, text: 'x' }, lookup),
      'no-follow-ups-on-currents',
    )
    state = reduce(state, { type: 'pass', by: B, at: 35, target: 'close' }, lookup)
    expectGameError(
      () => reduce(state, { type: 'askFollowUp', by: B, at: 36, seq: 3, text: 'x' }, lookup),
      'card-not-closed',
    )
  })

  it('lists the partner questions as pending for the next turn and takes replies in the send', () => {
    let state = send(send(ready(['q1', 'q2', 'q3', 'q4']), A, 10, { open: 'a1' }), B, 20, {
      close: 'b1',
      open: 'b2',
    })
    state = reduce(
      state,
      { type: 'askFollowUp', by: B, at: 21, seq: 1, text: 'From the closer, after send' },
      lookup,
    )
    let view = turnView(state, lookup)
    expect(view.holder).toBe(A)
    expect(view.pendingFollowUps.map((p) => [p.card.seq, p.askedBy, p.followUp.text])).toEqual([
      [1, B, 'From the closer, after send'],
    ])
    state = reduce(
      state,
      { type: 'askFollowUp', by: A, at: 25, seq: 1, text: 'From the opener, at catch up' },
      lookup,
    )
    expect(turnView(state, lookup).pendingFollowUps).toHaveLength(1)
    state = send(state, A, 30, {
      close: 'a2',
      open: 'a3',
      replies: [{ seq: 1, text: ' I left out the ending. ' }],
    })
    expect(cardBySeq(state, 1)?.followUps[B]?.reply).toEqual({
      text: 'I left out the ending.',
      at: 30,
    })
    view = turnView(state, lookup)
    expect(view.holder).toBe(B)
    expect(view.pendingFollowUps.map((p) => [p.card.seq, p.askedBy])).toEqual([[1, A]])
    expect(view.catchUp?.card.seq).toBe(2)
  })

  it('drops a skipped follow-up from the turn but keeps it unanswered in the journal', () => {
    let state = send(send(ready(['q1', 'q2', 'q3', 'q4']), A, 10, { open: 'a1' }), B, 20, {
      close: 'b1',
      open: 'b2',
    })
    state = reduce(state, { type: 'askFollowUp', by: B, at: 21, seq: 1, text: 'Skipped' }, lookup)
    state = send(state, A, 30, { close: 'a2', open: 'a3' })
    state = send(state, B, 40, { close: 'b3', open: 'b4' })
    expect(turnView(state, lookup).pendingFollowUps).toEqual([])
    expect(cardBySeq(state, 1)?.followUps[B]).toEqual({
      text: 'Skipped',
      at: 21,
      askedTurn: 2,
      reply: null,
    })
    const late = reduce(
      state,
      { type: 'replyFollowUp', by: A, at: 45, seq: 1, text: 'Late answer' },
      lookup,
    )
    expect(cardBySeq(late, 1)?.followUps[B]?.reply).toEqual({ text: 'Late answer', at: 45 })
  })

  it('rejects replies to missing or answered questions, own questions, and empty replies', () => {
    let state = send(send(ready(['q1', 'q2', 'q3', 'q4']), A, 10, { open: 'a1' }), B, 20, {
      close: 'b1',
      open: 'b2',
    })
    expectGameError(
      () => reduce(state, { type: 'replyFollowUp', by: A, at: 22, seq: 1, text: 'x' }, lookup),
      'follow-up-missing',
    )
    expectGameError(
      () => reduce(state, { type: 'replyFollowUp', by: A, at: 22, seq: 7, text: 'x' }, lookup),
      'card-not-found',
    )
    state = reduce(state, { type: 'askFollowUp', by: B, at: 21, seq: 1, text: 'Q' }, lookup)
    expectGameError(
      () => reduce(state, { type: 'replyFollowUp', by: B, at: 22, seq: 1, text: 'x' }, lookup),
      'follow-up-missing',
    )
    expectGameError(
      () => reduce(state, { type: 'replyFollowUp', by: A, at: 22, seq: 1, text: ' ' }, lookup),
      'empty-text',
    )
    expectGameError(
      () => reduce(state, { type: 'replyFollowUp', by: 'z', at: 22, seq: 1, text: 'x' }, lookup),
      'unknown-player',
    )
    state = reduce(state, { type: 'replyFollowUp', by: A, at: 22, seq: 1, text: 'first' }, lookup)
    expectGameError(
      () => reduce(state, { type: 'replyFollowUp', by: A, at: 23, seq: 1, text: 'again' }, lookup),
      'already-replied',
    )
    expectGameError(
      () => send(state, A, 30, { close: 'a2', open: 'a3', replies: [{ seq: 1, text: 'again' }] }),
      'already-replied',
    )
  })
})

describe('pass', () => {
  it('as closer marks the open card passed, keeps the opener answer, and costs a pass', () => {
    const before = send(ready(['q1', 'q2', 'q3']), A, 10, { open: 'a1' })
    const state = reduce(before, { type: 'pass', by: B, at: 15, target: 'close' }, lookup)
    const card = cardBySeq(state, 1)!
    expect(card.status).toBe('passed')
    expect(card.passedBy).toBe(B)
    expect(card.closedAt).toBe(15)
    expect(card.answers).toEqual({ [A]: { text: 'a1', at: 10 } })
    expect(state.openSeq).toBe(0)
    expect(state.passes).toEqual({ [A]: 3, [B]: 2 })
    expect(state.passedCards).toEqual({ q1: 15 })
    expect(state.ball.holderUid).toBe(B)
    expect(state.deck.dealt).toBe(1)
    const view = turnView(state, lookup)
    expect(view.close).toBeNull()
    expect(view.open?.seq).toBe(2)
    expect(view.passesLeft).toBe(2)
    expectGameError(() => send(state, B, 20, { close: 'late', open: 'b2' }), 'unexpected-answer')
    const sent = send(state, B, 20, { open: 'b2' })
    expect(sent.ball.holderUid).toBe(A)
    expect(cardBySeq(sent, 2)?.openerUid).toBe(B)
  })

  it('as opener deals a replacement card and records the passed one', () => {
    const before = ready(['q1', 'q2', 'q3'])
    const state = reduce(before, { type: 'pass', by: A, at: 5, target: 'open' }, lookup)
    expect(state.cards).toHaveLength(1)
    expect(state.cards[0]).toMatchObject({
      seq: 1,
      cardId: 'q1',
      status: 'passed',
      passedBy: A,
      openerUid: A,
      closerUid: B,
      answers: {},
      dealtAt: 5,
      closedAt: 5,
    })
    expect(state.openSeq).toBe(0)
    expect(state.deck.dealt).toBe(1)
    expect(state.passes[A]).toBe(2)
    expect(state.passedCards).toEqual({ q1: 5 })
    expect(state.ball.holderUid).toBe(A)
    expect(turnView(state, lookup).open).toEqual({ seq: 2, card: BY_ID.get('q2') })
    const sent = send(state, A, 10, { open: 'a2' })
    expect(sent.openSeq).toBe(2)
    expect(cardBySeq(sent, 2)?.cardId).toBe('q2')
  })

  it('as opener in the middle of a turn keeps the close step', () => {
    const before = send(ready(['q1', 'q2', 'q3']), A, 10, { open: 'a1' })
    const state = reduce(before, { type: 'pass', by: B, at: 15, target: 'open' }, lookup)
    expect(state.openSeq).toBe(1)
    expect(cardBySeq(state, 2)?.status).toBe('passed')
    const view = turnView(state, lookup)
    expect(view.catchUp).toBeNull()
    expect(view.close?.card.seq).toBe(1)
    expect(view.open?.seq).toBe(3)
    expect(view.open?.card.id).toBe('q3')
  })

  it('runs out after passesPerDeck passes', () => {
    let state = ready(['q1', 'q2', 'q3', 'q4', 'q5'], {
      settings: defaultSettings({ passesPerDeck: 2 }),
    })
    state = reduce(state, { type: 'pass', by: A, at: 5, target: 'open' }, lookup)
    state = reduce(state, { type: 'pass', by: A, at: 6, target: 'open' }, lookup)
    expect(state.passes[A]).toBe(0)
    expectGameError(
      () => reduce(state, { type: 'pass', by: A, at: 7, target: 'open' }, lookup),
      'no-passes',
    )
    expect(turnView(state, lookup).open?.card.id).toBe('q3')
  })

  it('is free on After Dark cards', () => {
    let state = ready(['ad1', 'q2', 'q3'])
    state = reduce(state, { type: 'pass', by: A, at: 5, target: 'open' }, lookup)
    expect(state.passes[A]).toBe(3)
    expect(state.passedCards).toEqual({ ad1: 5 })
    let closerSide = send(ready(['q1', 'ad1', 'q3']), A, 10, { open: 'a1' })
    closerSide = send(closerSide, B, 20, { close: 'b1', open: 'b opens adult' })
    closerSide = reduce(closerSide, { type: 'pass', by: A, at: 25, target: 'close' }, lookup)
    expect(closerSide.passes[A]).toBe(3)
    expect(cardBySeq(closerSide, 2)?.status).toBe('passed')
  })

  it('rejects passing when there is nothing to pass, from the wrong player, or while paused', () => {
    const start = ready(['q1'])
    expectGameError(
      () => reduce(start, { type: 'pass', by: A, at: 5, target: 'close' }, lookup),
      'nothing-to-pass',
    )
    expectGameError(
      () => reduce(start, { type: 'pass', by: B, at: 5, target: 'open' }, lookup),
      'not-holder',
    )
    expectGameError(
      () => reduce(start, { type: 'pass', by: 'z', at: 5, target: 'open' }, lookup),
      'unknown-player',
    )
    const sent = send(start, A, 10, { open: 'a1' })
    expectGameError(
      () => reduce(sent, { type: 'pass', by: B, at: 11, target: 'open' }, lookup),
      'nothing-to-pass',
    )
    const paused = reduce(sent, { type: 'pause', by: A, at: 12 }, lookup)
    expectGameError(
      () => reduce(paused, { type: 'pass', by: B, at: 13, target: 'close' }, lookup),
      'paused',
    )
    expectGameError(
      () => reduce(room(['q1']), { type: 'pass', by: A, at: 5, target: 'open' }, lookup),
      'rules-not-agreed',
    )
  })
})

describe('go lighter', () => {
  const deck = ['q6', 'q7', 'q4', 'q8', 'q5', 'q1', 'q2']

  it('deals the next cards one level lower by pulling them forward in the deck', () => {
    let state = ready(deck, { settings: defaultSettings({ lighterWindowCards: 2 }) })
    state = reduce(state, { type: 'lighter', by: A, at: 5 }, lookup)
    expect(state.lighter).toEqual({ until: 2 })
    expect(turnView(state, lookup).lighter).toEqual({ until: 2 })
    expect(nextDeal(state, lookup)).toEqual({ index: 2, seq: 1, card: BY_ID.get('q4') })
    expect(turnView(state, lookup).open?.card.id).toBe('q4')
    state = send(state, A, 10, { open: 'a1' })
    expect(cardBySeq(state, 1)?.cardId).toBe('q4')
    expect(state.deck.cards).toEqual(['q4', 'q7', 'q6', 'q8', 'q5', 'q1', 'q2'])
    expect(state.deck.dealt).toBe(1)
    expect(state.lighter).toEqual({ until: 2 })
    expect(turnView(state, lookup).open?.card.id).toBe('q5')
    state = send(state, B, 20, { close: 'b1', open: 'b2' })
    expect(cardBySeq(state, 2)?.cardId).toBe('q5')
    expect(state.deck.cards).toEqual(['q4', 'q5', 'q6', 'q8', 'q7', 'q1', 'q2'])
    expect(state.lighter).toBeNull()
    expect(turnView(state, lookup).open?.card.id).toBe('q6')
  })

  it('falls back to the nearest lower level that still has a card, and leaves the rest alone', () => {
    // q6 is level 3 and no level 2 card is undealt, so a level 1 card comes forward.
    let state = ready(['q6', 'q1', 'w1', 'q7'], {
      settings: defaultSettings({ lighterWindowCards: 5 }),
    })
    expect(turnView(state, lookup).canGoLighter).toBe(true)
    state = reduce(state, { type: 'lighter', by: A, at: 5 }, lookup)
    expect(nextDeal(state, lookup)).toEqual({ index: 1, seq: 1, card: BY_ID.get('q1') })
    state = send(state, A, 10, { open: 'a1' })
    expect(state.deck.cards).toEqual(['q1', 'q6', 'w1', 'q7'])
    // Nothing lower is left: q6 is dealt as it is, then the Current, then q7.
    expect(nextDeal(state, lookup)?.card.id).toBe('q6')
    expect(turnView(state, lookup).canGoLighter).toBe(false)
    state = send(state, B, 20, { close: 'b1', open: 'b2' })
    expect(nextDeal(state, lookup)?.card.id).toBe('w1')
    state = send(state, A, 30, { close: 'a2', open: 'a3' })
    expect(nextDeal(state, lookup)?.card.id).toBe('q7')
    expect(state.deck.cards).toEqual(['q1', 'q6', 'w1', 'q7'])
  })

  it('refuses Go lighter when it would not change the next card', () => {
    // Level 1 up next; a Current up next; a linear deck past its lowest level; an empty deck.
    for (const cards of [['q1', 'q2'], ['w1', 'q6', 'q1'], ['q4', 'q5', 'q6'], []]) {
      const state = ready(cards)
      expect(turnView(state, lookup).canGoLighter).toBe(false)
      expectGameError(
        () => reduce(state, { type: 'lighter', by: A, at: 5 }, lookup),
        'nothing-lighter',
      )
    }
    // Once the only lower card is used up, extending the window is refused too.
    let state = ready(['q4', 'q1', 'q5'], { settings: defaultSettings({ lighterWindowCards: 1 }) })
    state = reduce(state, { type: 'lighter', by: A, at: 5 }, lookup)
    state = send(state, A, 10, { open: 'a1' })
    expect(cardBySeq(state, 1)?.cardId).toBe('q1')
    expect(state.lighter).toBeNull()
    expect(turnView(state, lookup).canGoLighter).toBe(false)
    expectGameError(
      () => reduce(state, { type: 'lighter', by: B, at: 15 }, lookup),
      'nothing-lighter',
    )
  })

  it('can be triggered again to extend the window, and only by the holder while not paused', () => {
    let state = ready(deck, { settings: defaultSettings({ lighterWindowCards: 1 }) })
    expectGameError(() => reduce(state, { type: 'lighter', by: B, at: 5 }, lookup), 'not-holder')
    expectGameError(
      () => reduce(state, { type: 'lighter', by: 'z', at: 5 }, lookup),
      'unknown-player',
    )
    expectGameError(
      () => reduce(room(deck), { type: 'lighter', by: A, at: 5 }, lookup),
      'rules-not-agreed',
    )
    state = reduce(state, { type: 'lighter', by: A, at: 5 }, lookup)
    expect(state.lighter).toEqual({ until: 1 })
    state = send(state, A, 10, { open: 'a1' })
    expect(state.lighter).toBeNull()
    state = reduce(state, { type: 'lighter', by: B, at: 15 }, lookup)
    expect(state.lighter).toEqual({ until: 2 })
    const paused = reduce(state, { type: 'pause', by: A, at: 16 }, lookup)
    expectGameError(() => reduce(paused, { type: 'lighter', by: B, at: 17 }, lookup), 'paused')
  })

  it('applies to an opener pass too, so the preview and the dealt card agree', () => {
    let state = ready(deck, { settings: defaultSettings({ lighterWindowCards: 3 }) })
    state = reduce(state, { type: 'lighter', by: A, at: 5 }, lookup)
    expect(turnView(state, lookup).open?.card.id).toBe('q4')
    state = reduce(state, { type: 'pass', by: A, at: 6, target: 'open' }, lookup)
    expect(cardBySeq(state, 1)?.cardId).toBe('q4')
    expect(turnView(state, lookup).open?.card.id).toBe('q5')
  })
})

describe('pause and resume', () => {
  it('freezes sends, passes, and lighter until either player resumes', () => {
    const playing = send(ready(['q1', 'q2', 'q3']), A, 10, { open: 'a1' })
    const paused = reduce(playing, { type: 'pause', by: A, at: 11, note: ' Back Sunday ' }, lookup)
    expect(paused.paused).toEqual({ by: A, at: 11, note: 'Back Sunday' })
    expect(paused.ball).toEqual(playing.ball)
    expect(roomPhase(paused)).toBe('paused')
    expect(turnView(paused, lookup).paused).toEqual(paused.paused)
    expect(turnView(paused, lookup).canSend).toBe(false)
    expectGameError(() => send(paused, B, 12, { close: 'b1', open: 'b2' }), 'paused')
    expectGameError(
      () => reduce(paused, { type: 'pause', by: B, at: 13 }, lookup),
      'already-paused',
    )
    expectGameError(
      () => reduce(paused, { type: 'pause', by: 'z', at: 13 }, lookup),
      'unknown-player',
    )
    expectGameError(
      () => reduce(paused, { type: 'resume', by: 'z', at: 13 }, lookup),
      'unknown-player',
    )
    const resumed = reduce(paused, { type: 'resume', by: B, at: 14 }, lookup)
    expect(resumed.paused).toBeNull()
    expect(roomPhase(resumed)).toBe('turn')
    expectGameError(() => reduce(resumed, { type: 'resume', by: B, at: 15 }, lookup), 'not-paused')
    const sent = send(resumed, B, 16, { close: 'b1', open: 'b2' })
    expect(sent.ball.holderUid).toBe(A)
  })

  it('defaults the note to an empty string and still allows follow-ups and agreement', () => {
    let state = send(send(ready(['q1', 'q2', 'q3']), A, 10, { open: 'a1' }), B, 20, {
      close: 'b1',
      open: 'b2',
    })
    state = reduce(state, { type: 'pause', by: B, at: 21 }, lookup)
    expect(state.paused?.note).toBe('')
    state = reduce(
      state,
      { type: 'askFollowUp', by: B, at: 22, seq: 1, text: 'Still curious' },
      lookup,
    )
    state = reduce(
      state,
      { type: 'replyFollowUp', by: A, at: 23, seq: 1, text: 'Still here' },
      lookup,
    )
    state = reduce(state, { type: 'agreeRules', by: A, at: 24 }, lookup)
    expect(cardBySeq(state, 1)?.followUps[B]?.reply?.text).toBe('Still here')
  })
})

describe('deck exhaustion and rebuild', () => {
  it('closes the last card without opening another; the closer keeps the ball for the new deck', () => {
    let state = threeTurns(['q1', 'q2', 'q3'])
    expect(turnView(state, lookup).open).toBeNull()
    expect(turnView(state, lookup).deckExhausted).toBe(true)
    expect(turnView(state, lookup).canSend).toBe(true)
    expectGameError(() => send(state, B, 40, { close: 'b3', open: 'extra' }), 'unexpected-answer')
    state = send(state, B, 40, { close: 'b3' })
    expect(state.openSeq).toBe(0)
    expect(state.turn).toBe(4)
    expect(cardBySeq(state, 3)?.status).toBe('closed')
    // No card was dealt, so the ball stays: B deals the next deck and opens its first card,
    // which keeps every card's opener equal to the previous card's closer.
    expect(state.ball).toEqual({ holderUid: B, since: 40, lastReminderAt: null, remindersSent: 0 })
    expect(state.players[B]?.lastTurn).toBe(4)
    const view = turnView(state, lookup)
    expect(view.holder).toBe(B)
    expect(view.catchUp).toBeNull()
    expect(view.close).toBeNull()
    expect(view.open).toBeNull()
    expect(view.deckExhausted).toBe(true)
    expect(view.canSend).toBe(false)
    expect(roomPhase(state)).toBe('exhausted')
    expectGameError(() => send(state, B, 50), 'nothing-to-send')
    expectGameError(
      () => reduce(state, { type: 'pass', by: B, at: 50, target: 'open' }, lookup),
      'nothing-to-pass',
    )
  })

  it('is exhausted from the start when the deck is empty', () => {
    const state = ready([])
    expect(roomPhase(state)).toBe('exhausted')
    expect(nextDeal(state, lookup)).toBeNull()
    expectGameError(() => send(state, A, 5, { open: 'x' }), 'unexpected-answer')
  })

  it('rebuilds with a new deck, resets passes and lighter, and asks for the rules again', () => {
    let state = ready(['q1', 'q4', 'q2'], { settings: defaultSettings({ lighterWindowCards: 5 }) })
    state = send(state, A, 10, { open: 'a1' })
    state = reduce(state, { type: 'lighter', by: B, at: 15 }, lookup)
    state = reduce(state, { type: 'pass', by: B, at: 16, target: 'close' }, lookup)
    state = send(state, B, 20, { open: 'b2' })
    expect(cardBySeq(state, 2)?.cardId).toBe('q2')
    state = send(state, A, 30, { close: 'a2', open: 'a3' })
    state = reduce(state, { type: 'pass', by: B, at: 35, target: 'close' }, lookup)
    expect(state.lighter).toEqual({ until: 6 })
    expect(state.passes).toEqual({ [A]: 3, [B]: 1 })
    expect(turnView(state, lookup).open).toBeNull()
    expect(roomPhase(state)).toBe('exhausted')
    const deck = { seed: 'second', cards: ['q5', 'q6', 'q7'], dealt: 0, builtAt: 50 }
    const rebuilt = reduce(state, { type: 'rebuildDeck', by: B, at: 50, deck }, lookup)
    expect(rebuilt.deck).toEqual(deck)
    expect(rebuilt.passes).toEqual({ [A]: 3, [B]: 3 })
    expect(rebuilt.lighter).toBeNull()
    expect(rebuilt.players[A]?.rulesAgreedAt).toBeNull()
    expect(rebuilt.players[B]?.rulesAgreedAt).toBeNull()
    expect(rebuilt.ball.holderUid).toBe(state.ball.holderUid)
    expect(rebuilt.cards).toEqual(state.cards)
    expect(rebuilt.passedCards).toEqual(state.passedCards)
    expect(roomPhase(rebuilt)).toBe('rules')
    expectGameError(() => send(rebuilt, B, 60, { open: 'x' }), 'rules-not-agreed')
    let next = reduce(rebuilt, { type: 'agreeRules', by: B, at: 61 }, lookup)
    next = send(next, B, 62, { open: 'B opens the new deck' })
    expect(cardBySeq(next, 4)?.cardId).toBe('q5')
    expect(next.ball.holderUid).toBe(A)
  })

  it('continues a half written turn after a rebuild with a card open', () => {
    let state = send(ready(['q1']), A, 10, { open: 'a1' })
    const deck = { seed: 'again', cards: ['q1', 'q2', 'q3'], dealt: 0, builtAt: 20 }
    state = reduce(state, { type: 'rebuildDeck', by: A, at: 20, deck }, lookup)
    expect(state.deck.cards).toEqual(['q2', 'q3'])
    expect(roomPhase(state)).toBe('rules')
    expectGameError(() => send(state, B, 21, { close: 'b1', open: 'b2' }), 'rules-not-agreed')
    state = reduce(state, { type: 'agreeRules', by: B, at: 22 }, lookup)
    const view = turnView(state, lookup)
    expect(view.close?.card.seq).toBe(1)
    expect(view.open).toEqual({ seq: 2, card: BY_ID.get('q2') })
    state = send(state, B, 30, { close: 'b1', open: 'b2' })
    expect(cardBySeq(state, 1)).toMatchObject({
      status: 'closed',
      closedTurn: 1,
      answers: { [A]: { text: 'a1', at: 10 }, [B]: { text: 'b1', at: 30 } },
    })
    expect(cardBySeq(state, 2)).toMatchObject({ cardId: 'q2', status: 'open', openerUid: B })
    expect(state.deck.dealt).toBe(1)
    expect(state.ball.holderUid).toBe(A)
    expect(state.turn).toBe(2)
    state = reduce(state, { type: 'agreeRules', by: A, at: 31 }, lookup)
    expect(turnView(state, lookup).catchUp?.card.seq).toBe(1)
  })

  it('keeps the open card and drops it from the new deck', () => {
    const state = send(ready(['q1', 'q2']), A, 10, { open: 'a1' })
    const deck = { seed: 'again', cards: ['q1', 'q3', 'q2'], dealt: 0, builtAt: 20 }
    const rebuilt = reduce(state, { type: 'rebuildDeck', by: A, at: 20, deck }, lookup)
    expect(rebuilt.openSeq).toBe(1)
    expect(rebuilt.deck.cards).toEqual(['q3', 'q2'])
    expect(rebuilt.deck.seed).toBe('again')
  })

  it('rejects a deck that is already dealt from or from a stranger', () => {
    const state = ready(['q1'])
    expectGameError(
      () =>
        reduce(
          state,
          { type: 'rebuildDeck', by: A, at: 5, deck: { ...deckOf(['q2']), dealt: 1 } },
          lookup,
        ),
      'invalid-deck',
    )
    expectGameError(
      () => reduce(state, { type: 'rebuildDeck', by: 'z', at: 5, deck: deckOf(['q2']) }, lookup),
      'unknown-player',
    )
  })

  it('reports the history a rebuild needs', () => {
    let state = threeTurns(['q1', 'q2', 'q3', 'q4'])
    state = reduce(state, { type: 'pass', by: B, at: 35, target: 'close' }, lookup)
    state = send(state, B, 40, { open: 'b4' })
    const history = deckHistory(state)
    expect(history.answeredCardIds).toEqual(new Set(['q1', 'q2']))
    expect(history.excludedCardIds).toEqual(new Set(['q4']))
    expect(history.passedCards).toEqual({ q3: 35 })
    expect(deckHistory(ready(['q1'])).excludedCardIds).toEqual(new Set())
  })

  it('throws when the deck names a card the pool does not have', () => {
    const state = ready(['ghost', 'q1'])
    expectGameError(() => turnView(state, lookup), 'unknown-card')
    expectGameError(() => send(state, A, 5, { open: 'x' }), 'unknown-card')
  })
})

describe('settings and players', () => {
  it('patches settings after validation; passes apply at the next rebuild', () => {
    let state = ready(['q1', 'q2'])
    state = reduce(
      state,
      { type: 'updateSettings', by: A, at: 5, patch: { closerSeesOpener: true, passesPerDeck: 1 } },
      lookup,
    )
    expect(state.settings.closerSeesOpener).toBe(true)
    expect(state.settings.passesPerDeck).toBe(1)
    expect(state.passes).toEqual({ [A]: 3, [B]: 3 })
    expectGameError(
      () =>
        reduce(
          state,
          { type: 'updateSettings', by: A, at: 6, patch: { currentEvery: -2 } },
          lookup,
        ),
      'invalid-settings',
    )
    expectGameError(
      () => reduce(state, { type: 'updateSettings', by: 'z', at: 6, patch: {} }, lookup),
      'unknown-player',
    )
    const rebuilt = reduce(
      state,
      { type: 'rebuildDeck', by: A, at: 7, deck: deckOf(['q3']) },
      lookup,
    )
    expect(rebuilt.passes).toEqual({ [A]: 1, [B]: 1 })
  })

  it('lets a player change their own name and color', () => {
    let state = ready(['q1'])
    state = reduce(
      state,
      { type: 'updatePlayer', by: B, at: 5, patch: { name: ' Robert ', color: '#8B1E3F' } },
      lookup,
    )
    expect(state.players[B]).toMatchObject({ name: 'Robert', color: '#8B1E3F' })
    expect(state.players[A]?.name).toBe('Alice')
    expectGameError(
      () => reduce(state, { type: 'updatePlayer', by: B, at: 6, patch: { name: '' } }, lookup),
      'invalid-player',
    )
    expectGameError(
      () => reduce(state, { type: 'updatePlayer', by: B, at: 6, patch: { color: 'red' } }, lookup),
      'invalid-player',
    )
    expectGameError(
      () => reduce(state, { type: 'updatePlayer', by: 'z', at: 6, patch: { name: 'Z' } }, lookup),
      'unknown-player',
    )
    const unchanged = reduce(state, { type: 'updatePlayer', by: A, at: 7, patch: {} }, lookup)
    expect(unchanged.players[A]).toEqual(state.players[A])
  })

  it('sets and validates quiet hours', () => {
    let state = ready(['q1'])
    const quiet = { start: '22:00', end: '07:30', tz: 'Europe/Berlin' }
    state = reduce(
      state,
      { type: 'updatePlayer', by: A, at: 5, patch: { quietHours: quiet } },
      lookup,
    )
    expect(state.players[A]?.quietHours).toEqual(quiet)
    state = reduce(
      state,
      { type: 'updatePlayer', by: A, at: 6, patch: { quietHours: null } },
      lookup,
    )
    expect(state.players[A]?.quietHours).toBeNull()
    for (const bad of [
      { start: '25:00', end: '07:00', tz: 'UTC' },
      { start: '22:00', end: '7:00', tz: 'UTC' },
      { start: '22:00', end: '07:00', tz: '' },
      'later',
    ]) {
      expectGameError(
        () =>
          reduce(
            state,
            { type: 'updatePlayer', by: A, at: 7, patch: { quietHours: bad as never } },
            lookup,
          ),
        'invalid-player',
      )
    }
  })

  it('lets the waiting player nudge the holder once every ten hours', () => {
    const state = send(ready(['q1', 'q2']), A, 10, { open: 'a1' })
    expectGameError(() => reduce(state, { type: 'nudge', by: B, at: 20 }, lookup), 'own-turn')
    expectGameError(
      () => reduce(state, { type: 'nudge', by: 'z', at: 20 }, lookup),
      'unknown-player',
    )
    const nudged = reduce(state, { type: 'nudge', by: A, at: 20 }, lookup)
    expect(nudged.nudge).toEqual({ by: A, at: 20 })
    expect(nudged.ball).toEqual(state.ball)
    expectGameError(
      () => reduce(nudged, { type: 'nudge', by: A, at: 20 + NUDGE_INTERVAL_MS - 1 }, lookup),
      'nudge-too-soon',
    )
    const again = reduce(nudged, { type: 'nudge', by: A, at: 20 + NUDGE_INTERVAL_MS }, lookup)
    expect(again.nudge?.at).toBe(20 + NUDGE_INTERVAL_MS)
    const paused = reduce(nudged, { type: 'pause', by: B, at: 30 }, lookup)
    expectGameError(
      () => reduce(paused, { type: 'nudge', by: A, at: 20 + 2 * NUDGE_INTERVAL_MS }, lookup),
      'paused',
    )
  })

  it('rejects an unknown action', () => {
    expectGameError(
      () => reduce(ready(['q1']), { type: 'teleport' } as unknown as Action, lookup),
      'unknown-action',
    )
  })
})

describe('helpers', () => {
  it('finds the partner and bumps the version on every action', () => {
    const state = ready(['q1', 'q2'])
    expect(partnerOf(state, A)).toBe(B)
    expect(partnerOf(state, B)).toBe(A)
    expect(() => partnerOf(state, 'z')).toThrow(GameError)
    const after = reduce(state, { type: 'pause', by: A, at: 5 }, lookup)
    expect(after.version).toBe(state.version + 1)
  })

  it('never mutates the state it is given', () => {
    const frozen = deepFreeze(ready(['q6', 'q4', 'q2', 'q3', 'w1']))
    let state = reduce(frozen, { type: 'lighter', by: A, at: 4 }, lookup)
    state = deepFreeze(state)
    state = deepFreeze(send(state, A, 10, { open: 'a1' }))
    state = deepFreeze(reduce(state, { type: 'pass', by: B, at: 15, target: 'open' }, lookup))
    state = deepFreeze(send(state, B, 20, { close: 'b1', open: 'b3' }))
    state = deepFreeze(
      reduce(state, { type: 'askFollowUp', by: B, at: 21, seq: 1, text: 'q' }, lookup),
    )
    state = deepFreeze(
      send(state, A, 30, { close: 'a3', open: 'a4', replies: [{ seq: 1, text: 'r' }] }),
    )
    expect(frozen.cards).toEqual([])
    expect(state.cards).toHaveLength(4)
  })
})

describe('a full deck on one device', () => {
  it('plays every card of the default deck with the ball alternating on every send', () => {
    const content = getContent()
    const pool: readonly PoolCard[] = content.cards
    const byId = new Map(pool.map((c) => [c.id, c]))
    const realLookup: CardLookup = (id) => byId.get(id)
    const settings = defaultSettings()
    const deck = buildDeck({
      settings,
      players: [
        { afterDarkEnabled: false, excludeTags: [] },
        { afterDarkEnabled: false, excludeTags: [] },
      ],
      pool,
      history: { answeredCardIds: new Set(), excludedCardIds: new Set(), passedCards: {} },
      seed: 'full-deck',
      now: 1,
    })
    let state = createRoom(roomInput([], { deck, settings }))
    state = reduce(state, { type: 'agreeRules', by: A, at: 2 }, realLookup)
    state = reduce(state, { type: 'agreeRules', by: B, at: 3 }, realLookup)
    let at = 10
    let expectedHolder = A
    while (roomPhase(state) === 'turn') {
      const view = turnView(state, realLookup)
      expect(view.holder).toBe(expectedHolder)
      state = reduce(
        state,
        {
          type: 'send',
          by: view.holder,
          at,
          closeAnswer: view.close ? `${view.holder} closes ${view.close.card.seq}` : undefined,
          openAnswer: view.open ? `${view.holder} opens ${view.open.seq}` : undefined,
        },
        realLookup,
      )
      if (view.open) expectedHolder = expectedHolder === A ? B : A
      at += 10
    }
    expect(roomPhase(state)).toBe('exhausted')
    expect(state.turn).toBe(deck.cards.length + 1)
    expect(state.ball.holderUid).toBe(state.cards[state.cards.length - 1]!.closerUid)
    expect(state.cards).toHaveLength(deck.cards.length)
    expect(state.cards.every((c) => c.status === 'closed')).toBe(true)
    expect(state.cards.every((c) => Object.keys(c.answers).length === 2)).toBe(true)
    expect(state.cards.map((c) => c.cardId)).toEqual(deck.cards)
    for (let i = 1; i < state.cards.length; i++) {
      expect(state.cards[i]!.openerUid).toBe(state.cards[i - 1]!.closerUid)
    }
    expect(state.cards.some((c) => c.type === 'current')).toBe(true)
  })
})
