import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  createRoom,
  GameError,
  reduce,
  roomPhase,
  turnView,
  type Action,
} from '../../../src/game/turns'
import type {
  CardLookup,
  Deck,
  LevelId,
  PlayerId,
  PoolCard,
  RoomSettings,
  RoomState,
} from '../../../src/game/types'
import { defaultSettings } from './helpers'

const A = 'alice'
const B = 'bob'
const PLAYERS: readonly PlayerId[] = [A, B]

const POOL: PoolCard[] = []
for (const level of [1, 2, 3] as const) {
  for (let i = 1; i <= 5; i++) {
    POOL.push({
      id: `q${level}-${i}`,
      pack: 'core',
      adult: false,
      type: 'question',
      level: level as LevelId,
      text: `Question ${level}-${i}`,
      tags: [],
    })
  }
}
POOL.push({
  id: 'adult-1',
  pack: 'afterdark',
  adult: true,
  type: 'question',
  level: 2,
  text: 'Adult',
  tags: [],
})
POOL.push({
  id: 'w-1',
  pack: 'core',
  adult: false,
  type: 'current',
  level: null,
  modes: ['async'],
  text: 'Current',
  tags: [],
})
POOL.push({
  id: 'w-2',
  pack: 'core',
  adult: false,
  type: 'current',
  level: null,
  modes: ['async'],
  text: 'Current',
  tags: [],
})
const BY_ID = new Map(POOL.map((c) => [c.id, c]))
const lookup: CardLookup = (id) => BY_ID.get(id)
const IDS = POOL.map((c) => c.id)

type Step =
  | { kind: 'send' }
  | { kind: 'passClose' }
  | { kind: 'passOpen' }
  | { kind: 'lighter' }
  | { kind: 'pause' }
  | { kind: 'resume' }
  | { kind: 'agree'; who: number }
  | { kind: 'ask'; who: number; pick: number }
  | { kind: 'reply'; who: number; pick: number }
  | { kind: 'rebuild'; cards: string[] }
  | { kind: 'sendWrongPlayer' }

const arbDeck = fc.uniqueArray(fc.constantFrom(...IDS), { minLength: 0, maxLength: 12 })

const arbStep: fc.Arbitrary<Step> = fc.oneof(
  { weight: 12, arbitrary: fc.constant<Step>({ kind: 'send' }) },
  { weight: 2, arbitrary: fc.constant<Step>({ kind: 'passClose' }) },
  { weight: 2, arbitrary: fc.constant<Step>({ kind: 'passOpen' }) },
  { weight: 2, arbitrary: fc.constant<Step>({ kind: 'lighter' }) },
  { weight: 1, arbitrary: fc.constant<Step>({ kind: 'pause' }) },
  { weight: 2, arbitrary: fc.constant<Step>({ kind: 'resume' }) },
  {
    weight: 3,
    arbitrary: fc.record({
      kind: fc.constant<'agree'>('agree'),
      who: fc.integer({ min: 0, max: 1 }),
    }),
  },
  {
    weight: 3,
    arbitrary: fc.record({
      kind: fc.constant<'ask'>('ask'),
      who: fc.integer({ min: 0, max: 1 }),
      pick: fc.integer({ min: 0, max: 20 }),
    }),
  },
  {
    weight: 3,
    arbitrary: fc.record({
      kind: fc.constant<'reply'>('reply'),
      who: fc.integer({ min: 0, max: 1 }),
      pick: fc.integer({ min: 0, max: 20 }),
    }),
  },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant<'rebuild'>('rebuild'), cards: arbDeck }) },
  { weight: 1, arbitrary: fc.constant<Step>({ kind: 'sendWrongPlayer' }) },
)

const arbSettings: fc.Arbitrary<Partial<RoomSettings>> = fc.record({
  closerSeesOpener: fc.boolean(),
  passesPerDeck: fc.integer({ min: 0, max: 3 }),
  lighterWindowCards: fc.integer({ min: 1, max: 4 }),
})

function toAction(step: Step, state: RoomState, at: number): Action {
  const holder = state.ball.holderUid
  const who = 'who' in step ? PLAYERS[step.who]! : holder
  switch (step.kind) {
    case 'send':
    case 'sendWrongPlayer': {
      const view = turnView(state, lookup)
      const by = step.kind === 'send' ? holder : view.partner
      const replies = view.pendingFollowUps.map((p) => ({ seq: p.card.seq, text: `reply ${at}` }))
      return {
        type: 'send',
        by,
        at,
        closeAnswer: view.close ? `close ${at}` : undefined,
        openAnswer: view.open ? `open ${at}` : undefined,
        replies,
      }
    }
    case 'passClose':
      return { type: 'pass', by: holder, at, target: 'close' }
    case 'passOpen':
      return { type: 'pass', by: holder, at, target: 'open' }
    case 'lighter':
      return { type: 'lighter', by: holder, at }
    case 'pause':
      return { type: 'pause', by: who, at, note: 'later' }
    case 'resume':
      return { type: 'resume', by: who, at }
    case 'agree':
      return { type: 'agreeRules', by: who, at }
    case 'ask': {
      const closed = state.cards.filter((c) => c.status === 'closed')
      const card = closed[step.pick % Math.max(1, closed.length)]
      return { type: 'askFollowUp', by: who, at, seq: card?.seq ?? 1, text: `why ${at}` }
    }
    case 'reply': {
      const asked = state.cards.filter((c) => Object.keys(c.followUps).length > 0)
      const card = asked[step.pick % Math.max(1, asked.length)]
      return { type: 'replyFollowUp', by: who, at, seq: card?.seq ?? 1, text: `because ${at}` }
    }
    case 'rebuild':
      return {
        type: 'rebuildDeck',
        by: who,
        at,
        deck: { seed: `s${at}`, cards: step.cards, dealt: 0, builtAt: at },
      }
  }
}

function checkInvariants(prev: RoomState, next: RoomState, action: Action, sends: number): void {
  const opens = next.cards.filter((c) => c.status === 'open')
  expect(opens.length).toBeLessThanOrEqual(1)
  expect(next.openSeq).toBe(opens[0]?.seq ?? 0)
  expect(next.version).toBe(prev.version + 1)

  if (action.type === 'send') {
    expect(next.ball.holderUid).toBe(prev.ball.holderUid === A ? B : A)
    expect(next.turn).toBe(prev.turn + 1)
    expect(next.ball.since).toBe(action.at)
    expect(prev.paused).toBeNull()
  } else {
    expect(next.ball).toEqual(prev.ball)
    expect(next.turn).toBe(prev.turn)
  }
  expect(next.ball.holderUid).toBe(next.order[sends % 2])

  if (action.type === 'pass' || action.type === 'lighter') expect(prev.paused).toBeNull()

  for (const card of next.cards) {
    expect(PLAYERS).toContain(card.openerUid)
    expect(PLAYERS).toContain(card.closerUid)
    expect(card.openerUid).not.toBe(card.closerUid)
    if (card.status === 'closed') {
      expect(Object.keys(card.answers).sort()).toEqual([A, B])
      expect(card.closedAt).not.toBeNull()
    }
    if (card.status === 'open') expect(Object.keys(card.answers)).toEqual([card.openerUid])
    if (card.status === 'passed') {
      expect(card.passedBy).not.toBeNull()
      expect(next.passedCards[card.cardId]).toBeDefined()
    }
    for (const [asker, fu] of Object.entries(card.followUps)) {
      expect(PLAYERS).toContain(asker)
      expect(card.type).toBe('question')
      expect(card.status).toBe('closed')
      expect(fu.text.length).toBeGreaterThan(0)
    }
  }
  next.cards.forEach((card, i) => {
    expect(card.seq).toBe(i + 1)
    if (i === 0) return
    const before = next.cards[i - 1]!
    const openerPassed = before.status === 'passed' && before.passedBy === before.openerUid
    expect(card.openerUid).toBe(openerPassed ? before.openerUid : before.closerUid)
  })

  for (const uid of PLAYERS) {
    expect(next.passes[uid]).toBeGreaterThanOrEqual(0)
    expect(next.passes[uid]).toBeLessThanOrEqual(next.settings.passesPerDeck)
  }
  expect(next.deck.dealt).toBeLessThanOrEqual(next.deck.cards.length)
  if (action.type !== 'rebuildDeck') {
    expect([...next.deck.cards].sort()).toEqual([...prev.deck.cards].sort())
    expect(next.deck.dealt - prev.deck.dealt).toBe(next.cards.length - prev.cards.length)
  }
}

describe('turn reducer properties', () => {
  it('keeps the ball strictly alternating and the room consistent over random play', () => {
    fc.assert(
      fc.property(
        arbDeck,
        arbSettings,
        fc.array(arbStep, { maxLength: 60 }),
        (deckCards, settingsPatch, steps) => {
          const settings = defaultSettings(settingsPatch)
          const deck: Deck = { seed: 'prop', cards: deckCards, dealt: 0, builtAt: 0 }
          let state = createRoom({
            createdAt: 0,
            rules: ['one', 'two'],
            players: [
              { uid: A, name: 'Alice', color: '#4fb3d9' },
              { uid: B, name: 'Bob', color: '#e0a030' },
            ],
            settings,
            deck,
          })
          let sends = 0
          let at = 1
          let accepted = 0
          for (const step of steps) {
            const action = toAction(step, state, at)
            at += 1
            let next: RoomState
            try {
              next = reduce(state, action, lookup)
            } catch (error) {
              expect(error).toBeInstanceOf(GameError)
              if (action.type === 'send' && action.by === state.ball.holderUid) {
                const view = turnView(state, lookup)
                expect(view.canSend).toBe(false)
              }
              continue
            }
            if (action.type === 'send') {
              expect(turnView(state, lookup).canSend).toBe(true)
              sends += 1
            }
            accepted += 1
            checkInvariants(state, next, action, sends)
            state = next
          }
          expect(state.turn).toBe(sends)
          expect(['turn', 'rules', 'paused', 'exhausted']).toContain(roomPhase(state))
          return accepted >= 0
        },
      ),
      { seed: 20261008, numRuns: 400 },
    )
  })
})
