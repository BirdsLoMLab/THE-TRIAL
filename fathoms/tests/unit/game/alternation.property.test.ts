import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  createRoom,
  GameError,
  reduce,
  turnView,
  type Action,
  type GameErrorCode,
  type TurnView,
} from '../../../src/game/turns'
import type {
  CardLookup,
  CardRecord,
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
  | { kind: 'settings'; who: number; patch: Partial<RoomSettings> }
  | { kind: 'badSettings'; who: number }

const arbDeck = fc.uniqueArray(fc.constantFrom(...IDS), { minLength: 0, maxLength: 12 })

const arbSettingsPatch: fc.Arbitrary<Partial<RoomSettings>> = fc.record(
  {
    closerSeesOpener: fc.boolean(),
    passesPerDeck: fc.integer({ min: 0, max: 3 }),
    lighterWindowCards: fc.integer({ min: 1, max: 4 }),
    currentEvery: fc.integer({ min: 0, max: 6 }),
  },
  { requiredKeys: [] },
)

const arbStep: fc.Arbitrary<Step> = fc.oneof(
  { weight: 12, arbitrary: fc.constant<Step>({ kind: 'send' }) },
  { weight: 2, arbitrary: fc.constant<Step>({ kind: 'passClose' }) },
  { weight: 2, arbitrary: fc.constant<Step>({ kind: 'passOpen' }) },
  { weight: 2, arbitrary: fc.constant<Step>({ kind: 'lighter' }) },
  { weight: 1, arbitrary: fc.constant<Step>({ kind: 'pause' }) },
  { weight: 2, arbitrary: fc.constant<Step>({ kind: 'resume' }) },
  {
    weight: 4,
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
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant<'settings'>('settings'),
      who: fc.integer({ min: 0, max: 1 }),
      patch: arbSettingsPatch,
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant<'badSettings'>('badSettings'),
      who: fc.integer({ min: 0, max: 1 }),
    }),
  },
)

const arbSettings: fc.Arbitrary<Partial<RoomSettings>> = fc.record({
  closerSeesOpener: fc.boolean(),
  passesPerDeck: fc.integer({ min: 0, max: 3 }),
  lighterWindowCards: fc.integer({ min: 1, max: 4 }),
})

function toAction(step: Step, state: RoomState, view: TurnView, at: number): Action {
  const holder = state.ball.holderUid
  // who 0 is the holder, 1 the partner, so agreement after a rebuild comes quickly enough to play on.
  const who = 'who' in step ? (step.who === 0 ? holder : view.partner) : holder
  switch (step.kind) {
    case 'send':
    case 'sendWrongPlayer': {
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
    case 'settings':
      return { type: 'updateSettings', by: who, at, patch: step.patch }
    case 'badSettings':
      return { type: 'updateSettings', by: who, at, patch: { passesPerDeck: -1 } }
  }
}

/** The error the rules promise for this action in this state, or null when it must succeed. */
function expectedFailure(state: RoomState, action: Action, view: TurnView): GameErrorCode | null {
  const holder = state.ball.holderUid
  const agreed = state.players[holder]?.rulesAgreedAt !== null
  const turnGate = (): GameErrorCode | null =>
    state.paused ? 'paused' : !agreed ? 'rules-not-agreed' : null
  switch (action.type) {
    case 'send':
      if (action.by !== holder) return state.paused ? 'paused' : 'not-holder'
      if (turnGate()) return turnGate()
      return view.close || view.open ? null : 'nothing-to-send'
    case 'pass': {
      if (turnGate()) return turnGate()
      const target = action.target === 'close' ? view.close?.card : view.open?.card
      if (!target) return 'nothing-to-pass'
      const free = target.adult
      return !free && (state.passes[holder] ?? 0) <= 0 ? 'no-passes' : null
    }
    case 'lighter':
      if (turnGate()) return turnGate()
      return view.canGoLighter ? null : 'nothing-lighter'
    case 'pause':
      return state.paused ? 'already-paused' : null
    case 'resume':
      return state.paused ? null : 'not-paused'
    case 'askFollowUp': {
      const card = state.cards[action.seq - 1]
      if (!card) return 'card-not-found'
      if (card.type === 'current') return 'no-follow-ups-on-currents'
      if (card.status !== 'closed') return 'card-not-closed'
      return action.by in card.followUps ? 'follow-up-exists' : null
    }
    case 'replyFollowUp': {
      const card = state.cards[action.seq - 1]
      if (!card) return 'card-not-found'
      const asker = action.by === A ? B : A
      const followUp = card.followUps[asker]
      if (!followUp) return 'follow-up-missing'
      return followUp.reply ? 'already-replied' : null
    }
    case 'updateSettings':
      return (action.patch.passesPerDeck ?? 0) < 0 ? 'invalid-settings' : null
    default:
      return null
  }
}

type Key = keyof RoomState

/** Every top level field except `version` and the listed ones is untouched. */
function expectUnchangedExcept(prev: RoomState, next: RoomState, changed: readonly Key[]): void {
  const allowed = new Set<Key>(['version', ...changed])
  for (const key of Object.keys(prev) as Key[]) {
    if (!allowed.has(key)) expect(next[key]).toEqual(prev[key])
  }
}

function expectOtherCardsUnchanged(prev: RoomState, next: RoomState, seqs: number[]): void {
  prev.cards.forEach((card, i) => {
    if (!seqs.includes(card.seq)) expect(next.cards[i]).toEqual(card)
  })
}

/** The fields every freshly dealt card shares, copied from the pool card the view announced. */
function dealtRecord(
  view: TurnView,
  seq: number,
  opener: PlayerId,
  closer: PlayerId,
  at: number,
): Omit<CardRecord, 'answers' | 'status' | 'closedAt' | 'closedTurn' | 'passedBy'> {
  const pool = view.open!.card
  return {
    seq,
    cardId: pool.id,
    cardText: pool.text,
    pack: pool.pack,
    adult: pool.adult,
    level: pool.level,
    type: pool.type,
    dealtAt: at,
    openerUid: opener,
    closerUid: closer,
    followUps: {},
    reactions: {},
    favorite: false,
    readBy: {},
  }
}

interface Model {
  /** Who must hold the ball after the action. Flips only on a send that deals a card. */
  holder: PlayerId
  /** passesPerDeck in force since the last deal of the deck. */
  deckPasses: number
  sends: number
}

/** Checks the exact effect of one accepted action against the state it was applied to. */
function checkEffect(
  prev: RoomState,
  next: RoomState,
  action: Action,
  view: TurnView,
  model: Model,
): void {
  const holder = prev.ball.holderUid
  const partner = holder === A ? B : A
  switch (action.type) {
    case 'agreeRules': {
      expectUnchangedExcept(prev, next, ['players'])
      const before = prev.players[action.by]!
      expect(next.players[action.by]).toEqual({
        ...before,
        rulesAgreedAt: before.rulesAgreedAt ?? action.at,
      })
      const other = action.by === A ? B : A
      expect(next.players[other]).toEqual(prev.players[other])
      break
    }
    case 'send': {
      expectUnchangedExcept(prev, next, [
        'players',
        'cards',
        'deck',
        'openSeq',
        'ball',
        'turn',
        'lighter',
      ])
      model.sends += 1
      expect(next.turn).toBe(prev.turn + 1)
      const dealt = view.open !== null
      expect(next.cards.length).toBe(prev.cards.length + (dealt ? 1 : 0))
      expect(next.deck.dealt).toBe(prev.deck.dealt + (dealt ? 1 : 0))
      if (dealt) {
        const card = next.cards[next.cards.length - 1]!
        expect(card).toEqual({
          ...dealtRecord(view, prev.cards.length + 1, holder, partner, action.at),
          answers: { [holder]: { text: action.openAnswer, at: action.at } },
          status: 'open',
          closedAt: null,
          closedTurn: null,
          passedBy: null,
        })
        expect(next.openSeq).toBe(card.seq)
        model.holder = partner
      } else {
        expect(next.openSeq).toBe(0)
      }
      if (view.close) {
        const before = prev.cards[view.close.card.seq - 1]!
        expect(next.cards[before.seq - 1]).toEqual({
          ...before,
          answers: { ...before.answers, [holder]: { text: action.closeAnswer, at: action.at } },
          status: 'closed',
          closedAt: action.at,
          closedTurn: prev.turn,
        })
      }
      for (const reply of action.replies ?? []) {
        const before = prev.cards[reply.seq - 1]!
        expect(next.cards[reply.seq - 1]).toEqual({
          ...before,
          followUps: {
            ...before.followUps,
            [partner]: {
              ...before.followUps[partner]!,
              reply: { text: reply.text, at: action.at },
            },
          },
        })
      }
      const touched = [
        ...(view.close ? [view.close.card.seq] : []),
        ...(action.replies ?? []).map((r) => r.seq),
      ]
      expectOtherCardsUnchanged(prev, next, touched)
      expect(next.ball).toEqual({
        holderUid: model.holder,
        since: action.at,
        lastReminderAt: null,
        remindersSent: 0,
      })
      expect(next.players[holder]).toEqual({
        ...prev.players[holder],
        lastTurnAt: action.at,
        lastTurn: next.turn,
      })
      expect(next.players[partner]).toEqual(prev.players[partner])
      expect(next.lighter).toEqual(
        prev.lighter && next.cards.length >= prev.lighter.until ? null : prev.lighter,
      )
      break
    }
    case 'pass': {
      if (action.target === 'close') {
        expectUnchangedExcept(prev, next, ['openSeq', 'passes', 'passedCards', 'cards'])
        const before = prev.cards[prev.openSeq - 1]!
        expect(next.cards[before.seq - 1]).toEqual({
          ...before,
          status: 'passed',
          closedAt: action.at,
          closedTurn: prev.turn,
          passedBy: holder,
        })
        expect(next.openSeq).toBe(0)
        expectOtherCardsUnchanged(prev, next, [before.seq])
        expect(next.passes[holder]).toBe((prev.passes[holder] ?? 0) - (before.adult ? 0 : 1))
        expect(next.passedCards).toEqual({ ...prev.passedCards, [before.cardId]: action.at })
      } else {
        expectUnchangedExcept(prev, next, ['deck', 'lighter', 'passes', 'passedCards', 'cards'])
        expect(next.cards.length).toBe(prev.cards.length + 1)
        const card = next.cards[next.cards.length - 1]!
        expect(card).toEqual({
          ...dealtRecord(view, prev.cards.length + 1, holder, partner, action.at),
          answers: {},
          status: 'passed',
          closedAt: action.at,
          closedTurn: prev.turn,
          passedBy: holder,
        })
        expectOtherCardsUnchanged(prev, next, [])
        expect(next.lighter).toEqual(
          prev.lighter && next.cards.length >= prev.lighter.until ? null : prev.lighter,
        )
        expect(next.deck.dealt).toBe(prev.deck.dealt + 1)
        expect(next.passes[holder]).toBe((prev.passes[holder] ?? 0) - (card.adult ? 0 : 1))
        expect(next.passedCards).toEqual({ ...prev.passedCards, [card.cardId]: action.at })
      }
      expect(next.passes[partner]).toBe(prev.passes[partner])
      break
    }
    case 'lighter':
      expectUnchangedExcept(prev, next, ['lighter'])
      expect(next.lighter).toEqual({
        until: prev.cards.length + prev.settings.lighterWindowCards,
      })
      break
    case 'pause':
      expectUnchangedExcept(prev, next, ['paused'])
      expect(next.paused).toEqual({ by: action.by, at: action.at, note: 'later' })
      break
    case 'resume':
      expectUnchangedExcept(prev, next, ['paused'])
      expect(next.paused).toBeNull()
      break
    case 'askFollowUp': {
      expectUnchangedExcept(prev, next, ['cards'])
      const before = prev.cards[action.seq - 1]!
      expect(next.cards[action.seq - 1]).toEqual({
        ...before,
        followUps: {
          ...before.followUps,
          [action.by]: { text: action.text, at: action.at, askedTurn: prev.turn, reply: null },
        },
      })
      expectOtherCardsUnchanged(prev, next, [action.seq])
      break
    }
    case 'replyFollowUp': {
      expectUnchangedExcept(prev, next, ['cards'])
      const before = prev.cards[action.seq - 1]!
      const asker = action.by === A ? B : A
      expect(next.cards[action.seq - 1]).toEqual({
        ...before,
        followUps: {
          ...before.followUps,
          [asker]: { ...before.followUps[asker], reply: { text: action.text, at: action.at } },
        },
      })
      expectOtherCardsUnchanged(prev, next, [action.seq])
      break
    }
    case 'rebuildDeck': {
      expectUnchangedExcept(prev, next, ['deck', 'passes', 'lighter', 'players'])
      const open = prev.openSeq > 0 ? prev.cards[prev.openSeq - 1] : undefined
      expect(next.deck).toEqual({
        ...action.deck,
        cards: action.deck.cards.filter((id) => id !== open?.cardId),
      })
      expect(next.passes).toEqual({
        [A]: prev.settings.passesPerDeck,
        [B]: prev.settings.passesPerDeck,
      })
      expect(next.lighter).toBeNull()
      for (const uid of PLAYERS)
        expect(next.players[uid]).toEqual({ ...prev.players[uid], rulesAgreedAt: null })
      model.deckPasses = prev.settings.passesPerDeck
      break
    }
    case 'updateSettings':
      expectUnchangedExcept(prev, next, ['settings'])
      expect(next.settings).toEqual({ ...prev.settings, ...action.patch })
      break
    default:
      throw new Error(`unexpected action ${action.type}`)
  }
}

/** Invariants that hold after every accepted action, whatever it was. */
function checkInvariants(prev: RoomState, next: RoomState, action: Action, model: Model): void {
  expect(next.version).toBe(prev.version + 1)
  expect(next.turn).toBe(model.sends)
  expect(next.ball.holderUid).toBe(model.holder)

  const opens = next.cards.filter((c) => c.status === 'open')
  expect(opens.length).toBeLessThanOrEqual(1)
  expect(next.openSeq).toBe(opens[0]?.seq ?? 0)
  // The open card always waits for the ball holder: its opener sent it over.
  if (opens[0]) expect(opens[0].closerUid).toBe(next.ball.holderUid)

  for (const card of next.cards) {
    expect(PLAYERS).toContain(card.openerUid)
    expect(PLAYERS).toContain(card.closerUid)
    expect(card.openerUid).not.toBe(card.closerUid)
    expect(BY_ID.get(card.cardId)?.text).toBe(card.cardText)
    if (card.status === 'closed') {
      expect(Object.keys(card.answers).sort()).toEqual([A, B])
      expect(card.closedAt).not.toBeNull()
      expect(card.closedTurn).not.toBeNull()
      expect(card.passedBy).toBeNull()
    }
    if (card.status === 'open') {
      expect(Object.keys(card.answers)).toEqual([card.openerUid])
      expect(card.closedTurn).toBeNull()
    }
    if (card.status === 'passed') {
      expect(card.passedBy).not.toBeNull()
      expect(card.closedTurn).not.toBeNull()
      expect(next.passedCards[card.cardId]).toBeDefined()
      expect(card.answers[card.closerUid]).toBeUndefined()
    }
    for (const [asker, fu] of Object.entries(card.followUps)) {
      expect(PLAYERS).toContain(asker)
      expect(card.type).toBe('question')
      expect(card.status).toBe('closed')
      expect(fu.text.length).toBeGreaterThan(0)
      expect(fu.askedTurn).toBeGreaterThanOrEqual(card.closedTurn!)
    }
  }
  // Seqs are dense, and every card's opener is the previous card's closer, unless the
  // previous card was passed by its opener. This holds across deck rebuilds too.
  next.cards.forEach((card, i) => {
    expect(card.seq).toBe(i + 1)
    if (i === 0) return
    const before = next.cards[i - 1] as CardRecord
    const openerPassed = before.status === 'passed' && before.passedBy === before.openerUid
    expect(card.openerUid).toBe(openerPassed ? before.openerUid : before.closerUid)
  })

  for (const uid of PLAYERS) {
    expect(next.passes[uid]).toBeGreaterThanOrEqual(0)
    expect(next.passes[uid]).toBeLessThanOrEqual(model.deckPasses)
  }
  expect(next.deck.dealt).toBeLessThanOrEqual(next.deck.cards.length)
  expect(new Set(next.deck.cards).size).toBe(next.deck.cards.length)
  if (action.type !== 'rebuildDeck') {
    expect([...next.deck.cards].sort()).toEqual([...prev.deck.cards].sort())
    expect(next.deck.dealt - prev.deck.dealt).toBe(next.cards.length - prev.cards.length)
  }
  // Dealt cards and the deck agree, in order.
  const dealtIds = next.deck.cards.slice(0, next.deck.dealt)
  const sinceRebuild = next.cards.slice(next.cards.length - dealtIds.length)
  expect(sinceRebuild.map((c) => c.cardId)).toEqual(dealtIds)
}

/** How often the interesting paths ran, so a silent degeneration of the generator shows up. */
const coverage = {
  sends: 0,
  closeOnlySends: 0,
  refusedSends: 0,
  lighter: 0,
  rebuildWithOpenCard: 0,
  rebuildWhenExhausted: 0,
  openerPassWithCatchUp: 0,
  replies: 0,
  settingsChanges: 0,
}

describe('turn reducer properties', () => {
  it('keeps the ball with the open card, the cards consistent, and every effect exact over random play', () => {
    fc.assert(
      fc.property(
        arbDeck,
        arbSettings,
        fc.array(arbStep, { maxLength: 60, size: 'max' }),
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
          // Both agreed up front; rebuilds and the agree steps still exercise the rules gate.
          state = reduce(state, { type: 'agreeRules', by: A, at: 0 }, lookup)
          state = reduce(state, { type: 'agreeRules', by: B, at: 0 }, lookup)
          const model: Model = { holder: A, deckPasses: settings.passesPerDeck, sends: 0 }
          let at = 1
          for (const step of steps) {
            const view = turnView(state, lookup)
            const action = toAction(step, state, view, at)
            at += 1
            const failure = expectedFailure(state, action, view)
            let next: RoomState
            try {
              next = reduce(state, action, lookup)
            } catch (error) {
              expect(error).toBeInstanceOf(GameError)
              expect((error as GameError).code).toBe(failure)
              if (action.type === 'send' && action.by === state.ball.holderUid) {
                expect(view.canSend).toBe(false)
                coverage.refusedSends += 1
              }
              continue
            }
            expect(failure).toBeNull()
            if (action.type === 'send') {
              expect(view.canSend).toBe(true)
              coverage.sends += 1
              if (!view.open) coverage.closeOnlySends += 1
              if (action.replies?.length) coverage.replies += 1
            }
            if (action.type === 'lighter') coverage.lighter += 1
            if (action.type === 'rebuildDeck') {
              if (state.openSeq > 0) coverage.rebuildWithOpenCard += 1
              if (state.openSeq === 0 && state.deck.dealt >= state.deck.cards.length)
                coverage.rebuildWhenExhausted += 1
            }
            if (action.type === 'pass' && action.target === 'open' && view.catchUp)
              coverage.openerPassWithCatchUp += 1
            if (action.type === 'updateSettings') coverage.settingsChanges += 1
            checkEffect(state, next, action, view, model)
            checkInvariants(state, next, action, model)
            // A pass as opener never hides the reveal the holder is still owed.
            if (action.type === 'pass' && action.target === 'open') {
              expect(turnView(next, lookup).catchUp?.card.seq).toBe(view.catchUp?.card.seq)
            }
            state = next
          }
        },
      ),
      { seed: 20261008, numRuns: 400 },
    )
    // Measured at about twice these values with the fixed seed; the floor catches a
    // generator that stops reaching the interesting paths.
    expect(coverage.sends).toBeGreaterThan(600)
    expect(coverage.closeOnlySends).toBeGreaterThan(60)
    expect(coverage.refusedSends).toBeGreaterThan(1000)
    expect(coverage.lighter).toBeGreaterThan(30)
    expect(coverage.rebuildWithOpenCard).toBeGreaterThan(60)
    expect(coverage.rebuildWhenExhausted).toBeGreaterThan(40)
    expect(coverage.openerPassWithCatchUp).toBeGreaterThan(20)
    expect(coverage.replies).toBeGreaterThan(50)
    expect(coverage.settingsChanges).toBeGreaterThan(100)
  })
})
