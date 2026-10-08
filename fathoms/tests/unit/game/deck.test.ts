import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { getContent } from '../../../src/content'
import {
  afterDarkAllowed,
  buildDeck,
  createRng,
  eligibleCards,
  hashSeed,
  roomExcludeTags,
  seededShuffle,
  type BuildDeckInput,
  type DeckHistory,
} from '../../../src/game/deck'
import type {
  CurrentPoolCard,
  DeckPlayer,
  DeckSettings,
  LevelId,
  PlayMode,
  PoolCard,
  QuestionPoolCard,
} from '../../../src/game/types'

const DAY = 24 * 60 * 60 * 1000
const NOW = 1_800_000_000_000

function q(
  id: string,
  level: LevelId,
  pack = 'core',
  tags: string[] = [],
  adult = false,
): QuestionPoolCard {
  return { id, pack, adult, type: 'question', level, text: `Question ${id}`, tags }
}

function cur(
  id: string,
  modes: PlayMode[] = ['live', 'async'],
  pack = 'core',
  tags: string[] = [],
  adult = false,
): CurrentPoolCard {
  return { id, pack, adult, type: 'current', level: null, modes, text: `Current ${id}`, tags }
}

/** 6 questions per level per pack plus 4 Currents, for core and partner. */
function smallPool(): PoolCard[] {
  const cards: PoolCard[] = []
  for (const pack of ['core', 'partner']) {
    for (const level of [1, 2, 3] as const) {
      for (let i = 1; i <= 6; i++) cards.push(q(`${pack}-${level}-${i}`, level, pack, [`t${i}`]))
    }
    for (let i = 1; i <= 4; i++) cards.push(cur(`${pack}-w-${i}`, ['live', 'async'], pack))
  }
  return cards
}

const settings: DeckSettings = {
  packs: ['core', 'partner'],
  startLevel: 1,
  progression: 'linear',
  currentEvery: 5,
  noCurrentsBefore: 3,
  excludeAnswered: true,
  customCardsEnabled: false,
  mode: 'turns',
  passedCardCooldownDays: 30,
}

const players: DeckPlayer[] = [
  { afterDarkEnabled: false, excludeTags: [] },
  { afterDarkEnabled: false, excludeTags: [] },
]

const emptyHistory: DeckHistory = {
  answeredCardIds: new Set(),
  excludedCardIds: new Set(),
  passedCards: {},
}

function input(overrides: Partial<BuildDeckInput> = {}): BuildDeckInput {
  return {
    settings,
    players,
    pool: smallPool(),
    history: emptyHistory,
    seed: 'seed-1',
    now: NOW,
    ...overrides,
  }
}

function levelsOf(ids: readonly string[], pool: readonly PoolCard[]): (LevelId | null)[] {
  const byId = new Map(pool.map((c) => [c.id, c]))
  return ids.map((id) => byId.get(id)!.level)
}

describe('seeded randomness', () => {
  it('hashes a seed to a 32 bit unsigned integer, deterministically', () => {
    expect(hashSeed('fathoms')).toBe(hashSeed('fathoms'))
    expect(hashSeed('fathoms')).not.toBe(hashSeed('fathomz'))
    expect(hashSeed('')).toBe(hashSeed(''))
    for (const seed of ['', 'a', 'room-123', 'x'.repeat(100)]) {
      const h = hashSeed(seed)
      expect(Number.isInteger(h)).toBe(true)
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThanOrEqual(0xffffffff)
    }
  })

  it('creates a generator that yields the same sequence in [0, 1) for the same seed', () => {
    const a = createRng('seed')
    const b = createRng('seed')
    const c = createRng('other')
    const fromA = Array.from({ length: 20 }, () => a())
    const fromB = Array.from({ length: 20 }, () => b())
    const fromC = Array.from({ length: 20 }, () => c())
    expect(fromA).toEqual(fromB)
    expect(fromA).not.toEqual(fromC)
    for (const n of fromA) {
      expect(n).toBeGreaterThanOrEqual(0)
      expect(n).toBeLessThan(1)
    }
  })

  it('shuffles into a permutation without mutating the input', () => {
    const items = Array.from({ length: 30 }, (_, i) => i)
    const frozen = Object.freeze([...items])
    const shuffled = seededShuffle(frozen, 'seed-a')
    expect(frozen).toEqual(items)
    expect([...shuffled].sort((x, y) => x - y)).toEqual(items)
    expect(shuffled).not.toEqual(items)
    expect(seededShuffle(frozen, 'seed-a')).toEqual(shuffled)
    expect(seededShuffle(frozen, 'seed-b')).not.toEqual(shuffled)
  })

  it('handles empty and single element lists', () => {
    expect(seededShuffle([], 's')).toEqual([])
    expect(seededShuffle(['only'], 's')).toEqual(['only'])
  })

  it('spreads permutations across seeds instead of favouring one order', () => {
    const items = [1, 2, 3, 4]
    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) seen.add(seededShuffle(items, `seed-${i}`).join(','))
    expect(seen.size).toBeGreaterThan(20)
  })
})

describe('player gates', () => {
  it('allows After Dark only when exactly two players both enabled it', () => {
    const on = { afterDarkEnabled: true, excludeTags: [] }
    const off = { afterDarkEnabled: false, excludeTags: [] }
    expect(afterDarkAllowed([on, on])).toBe(true)
    expect(afterDarkAllowed([on, off])).toBe(false)
    expect(afterDarkAllowed([off, on])).toBe(false)
    expect(afterDarkAllowed([off, off])).toBe(false)
    expect(afterDarkAllowed([on])).toBe(false)
    expect(afterDarkAllowed([])).toBe(false)
    expect(afterDarkAllowed([on, on, on])).toBe(false)
  })

  it('unions excluded tags across players', () => {
    expect(
      roomExcludeTags([
        { afterDarkEnabled: false, excludeTags: ['a', 'b'] },
        { afterDarkEnabled: false, excludeTags: ['b', 'c'] },
      ]),
    ).toEqual(new Set(['a', 'b', 'c']))
    expect(roomExcludeTags([])).toEqual(new Set())
  })
})

describe('eligibleCards', () => {
  it('keeps only cards from enabled packs', () => {
    const { questions, currents } = eligibleCards(
      input({ settings: { ...settings, packs: ['core'] } }),
    )
    expect(questions.every((c) => c.pack === 'core')).toBe(true)
    expect(currents.every((c) => c.pack === 'core')).toBe(true)
    expect(questions).toHaveLength(18)
    expect(currents).toHaveLength(4)
  })

  it('drops everything when no pack is enabled', () => {
    const { questions, currents } = eligibleCards(input({ settings: { ...settings, packs: [] } }))
    expect(questions).toEqual([])
    expect(currents).toEqual([])
  })

  it('includes custom cards only when custom cards are enabled, whatever the pack list says', () => {
    const pool = [...smallPool(), q('custom-1', 2, 'custom'), cur('custom-w', ['async'], 'custom')]
    const off = eligibleCards(input({ pool }))
    expect(off.questions.map((c) => c.id)).not.toContain('custom-1')
    expect(off.currents.map((c) => c.id)).not.toContain('custom-w')
    const on = eligibleCards(
      input({ pool, settings: { ...settings, packs: ['core'], customCardsEnabled: true } }),
    )
    expect(on.questions.map((c) => c.id)).toContain('custom-1')
    expect(on.currents.map((c) => c.id)).toContain('custom-w')
  })

  it('excludes adult cards unless both players enabled After Dark and the pack is on', () => {
    const pool = [
      ...smallPool(),
      q('ad-1', 1, 'afterdark', [], true),
      cur('ad-w', ['async'], 'afterdark', [], true),
      q('custom-adult', 1, 'custom', [], true),
    ]
    const packs = ['core', 'partner', 'afterdark']
    const on = { afterDarkEnabled: true, excludeTags: [] }
    const off = { afterDarkEnabled: false, excludeTags: [] }
    const ids = (i: BuildDeckInput) => {
      const e = eligibleCards(i)
      return [...e.questions, ...e.currents].map((c) => c.id)
    }
    const withCustom = { ...settings, packs, customCardsEnabled: true }

    expect(ids(input({ pool, settings: withCustom, players: [off, off] }))).not.toContain('ad-1')
    const oneOn = ids(input({ pool, settings: withCustom, players: [on, off] }))
    expect(oneOn).not.toContain('ad-1')
    expect(oneOn).not.toContain('ad-w')
    expect(oneOn).not.toContain('custom-adult')
    expect(ids(input({ pool, settings: withCustom, players: [on] }))).not.toContain('ad-1')
    const both = ids(input({ pool, settings: withCustom, players: [on, on] }))
    expect(both).toContain('ad-1')
    expect(both).toContain('ad-w')
    expect(both).toContain('custom-adult')

    const packOff = ids(
      input({ pool, settings: { ...withCustom, packs: ['core'] }, players: [on, on] }),
    )
    expect(packOff).not.toContain('ad-1')
    expect(packOff).not.toContain('ad-w')
    expect(packOff).toContain('custom-adult')

    const customOff = ids(
      input({ pool, settings: { ...withCustom, customCardsEnabled: false }, players: [on, on] }),
    )
    expect(customOff).toContain('ad-1')
    expect(customOff).not.toContain('custom-adult')
  })

  it('excludes a card when either player excluded one of its tags', () => {
    const pool = [
      q('x', 1, 'core', ['a', 'b']),
      q('y', 1, 'core', ['c']),
      cur('w', ['async'], 'core', ['a']),
    ]
    const ids = (ps: DeckPlayer[]) => {
      const e = eligibleCards(input({ pool, players: ps }))
      return [...e.questions, ...e.currents].map((c) => c.id)
    }
    expect(ids(players)).toEqual(['x', 'y', 'w'])
    expect(
      ids([
        { afterDarkEnabled: false, excludeTags: [] },
        { afterDarkEnabled: false, excludeTags: ['b'] },
      ]),
    ).toEqual(['y', 'w'])
    expect(
      ids([
        { afterDarkEnabled: false, excludeTags: ['a'] },
        { afterDarkEnabled: false, excludeTags: ['c'] },
      ]),
    ).toEqual([])
  })

  it('filters Currents by the room mode and leaves questions alone', () => {
    const pool = [
      q('q1', 1),
      cur('both', ['live', 'async']),
      cur('live-only', ['live']),
      cur('async-only', ['async']),
    ]
    const turns = eligibleCards(input({ pool, settings: { ...settings, mode: 'turns' } }))
    expect(turns.currents.map((c) => c.id)).toEqual(['both', 'async-only'])
    expect(turns.questions.map((c) => c.id)).toEqual(['q1'])
    const live = eligibleCards(input({ pool, settings: { ...settings, mode: 'live' } }))
    expect(live.currents.map((c) => c.id)).toEqual(['both', 'live-only'])
  })

  it('excludes answered cards only while excludeAnswered is on', () => {
    const history: DeckHistory = {
      ...emptyHistory,
      answeredCardIds: new Set(['core-1-1', 'core-w-1']),
    }
    const on = eligibleCards(input({ history }))
    expect(on.questions.map((c) => c.id)).not.toContain('core-1-1')
    expect(on.currents.map((c) => c.id)).not.toContain('core-w-1')
    const off = eligibleCards(input({ history, settings: { ...settings, excludeAnswered: false } }))
    expect(off.questions.map((c) => c.id)).toContain('core-1-1')
    expect(off.currents.map((c) => c.id)).toContain('core-w-1')
  })

  it('always excludes explicitly excluded cards, even with excludeAnswered off', () => {
    const history: DeckHistory = { ...emptyHistory, excludedCardIds: new Set(['core-2-2']) }
    const e = eligibleCards(input({ history, settings: { ...settings, excludeAnswered: false } }))
    expect(e.questions.map((c) => c.id)).not.toContain('core-2-2')
  })

  it('excludes passed cards during the cooldown and deals them again afterwards', () => {
    const history: DeckHistory = {
      ...emptyHistory,
      passedCards: {
        'core-1-1': NOW - 29 * DAY,
        'core-1-2': NOW - 30 * DAY,
        'core-1-3': NOW - 31 * DAY,
        'core-w-1': NOW,
      },
    }
    const e = eligibleCards(input({ history }))
    const ids = e.questions.map((c) => c.id)
    expect(ids).not.toContain('core-1-1')
    expect(ids).toContain('core-1-2')
    expect(ids).toContain('core-1-3')
    expect(e.currents.map((c) => c.id)).not.toContain('core-w-1')

    const noCooldown = eligibleCards(
      input({ history, settings: { ...settings, passedCardCooldownDays: 0 } }),
    )
    expect(noCooldown.questions.map((c) => c.id)).toContain('core-1-1')
    expect(noCooldown.currents.map((c) => c.id)).toContain('core-w-1')
  })

  it('drops questions below the start level', () => {
    const e = eligibleCards(input({ settings: { ...settings, startLevel: 2 } }))
    expect(e.questions.every((c) => c.level >= 2)).toBe(true)
    expect(e.questions).toHaveLength(24)
    const deep = eligibleCards(input({ settings: { ...settings, startLevel: 3 } }))
    expect(deep.questions.every((c) => c.level === 3)).toBe(true)
  })
})

describe('buildDeck', () => {
  it('stores the seed, a dealt index of 0, and the build time', () => {
    const deck = buildDeck(input({ seed: 'abc', now: 123 }))
    expect(deck.seed).toBe('abc')
    expect(deck.dealt).toBe(0)
    expect(deck.builtAt).toBe(123)
  })

  it('is reproducible for the same seed and differs for another seed', () => {
    const a = buildDeck(input({ seed: 'one' }))
    const b = buildDeck(input({ seed: 'one' }))
    const c = buildDeck(input({ seed: 'two' }))
    expect(a.cards).toEqual(b.cards)
    expect(a.cards).not.toEqual(c.cards)
    const questions = (deck: { cards: readonly string[] }) =>
      deck.cards.filter((id) => !id.includes('-w-')).sort()
    expect(questions(a)).toEqual(questions(c))
    expect(a.cards.length).toBe(c.cards.length)
  })

  it('contains every eligible question exactly once and only eligible Currents, each once', () => {
    const i = input()
    const deck = buildDeck(i)
    const e = eligibleCards(i)
    const questionIds = deck.cards.filter((id) => !id.includes('-w-')).sort()
    expect(questionIds).toEqual(e.questions.map((c) => c.id).sort())
    const currentIds = deck.cards.filter((id) => id.includes('-w-'))
    const eligibleCurrents = new Set(e.currents.map((c) => c.id))
    for (const id of currentIds) expect(eligibleCurrents.has(id)).toBe(true)
    expect(currentIds).toHaveLength(7)
    expect(new Set(deck.cards).size).toBe(deck.cards.length)
  })

  it('orders questions by level in linear progression, each level shuffled', () => {
    const i = input()
    const deck = buildDeck(i)
    const levels = levelsOf(deck.cards, i.pool).filter((l): l is LevelId => l !== null)
    for (let k = 1; k < levels.length; k++)
      expect(levels[k]!).toBeGreaterThanOrEqual(levels[k - 1]!)
    const questionIds = deck.cards.filter((id) => !id.includes('-w-'))
    const level1 = questionIds.slice(0, 12)
    expect(level1).not.toEqual([...level1].sort())
  })

  it('shuffles all levels together in mixed progression', () => {
    const i = input({ settings: { ...settings, progression: 'mixed', currentEvery: 0 } })
    const deck = buildDeck(i)
    const levels = levelsOf(deck.cards, i.pool)
    expect(levels).toHaveLength(36)
    const sorted = [...levels].sort()
    expect(levels).not.toEqual(sorted)
    expect(new Set(levels)).toEqual(new Set([1, 2, 3]))
  })

  it('starts at the start level in mixed progression too', () => {
    const i = input({ settings: { ...settings, progression: 'mixed', startLevel: 2 } })
    const deck = buildDeck(i)
    expect(
      levelsOf(deck.cards, i.pool)
        .filter((l) => l !== null)
        .every((l) => l! >= 2),
    ).toBe(true)
  })

  it('splices one Current after every currentEvery questions, none before noCurrentsBefore', () => {
    const i = input()
    const deck = buildDeck(i)
    const isCurrent = deck.cards.map((id) => id.includes('-w-'))
    const positions = isCurrent.flatMap((c, idx) => (c ? [idx] : []))
    expect(positions).toEqual([5, 11, 17, 23, 29, 35, 41])
    expect(positions.every((p) => p >= 3)).toBe(true)
    expect(isCurrent.filter(Boolean)).toHaveLength(7)
    expect(deck.cards).toHaveLength(43)
  })

  it('respects noCurrentsBefore when it is larger than the interval', () => {
    const i = input({ settings: { ...settings, currentEvery: 2, noCurrentsBefore: 3 } })
    const deck = buildDeck(i)
    const positions = deck.cards.flatMap((id, idx) => (id.includes('-w-') ? [idx] : []))
    expect(positions[0]).toBe(3)
    expect(positions.slice(0, 4)).toEqual([3, 6, 9, 12])
  })

  it('deals no Currents when currentEvery is 0 or no Current is eligible', () => {
    const none = buildDeck(input({ settings: { ...settings, currentEvery: 0 } }))
    expect(none.cards.some((id) => id.includes('-w-'))).toBe(false)
    expect(none.cards).toHaveLength(36)
    const pool = smallPool().filter((c) => c.type === 'question')
    const noCurrents = buildDeck(input({ pool }))
    expect(noCurrents.cards).toHaveLength(36)
  })

  it('stops splicing when the Currents run out and never ends the deck with a Current', () => {
    const i = input({ settings: { ...settings, currentEvery: 1, noCurrentsBefore: 0 } })
    const deck = buildDeck(i)
    const currents = deck.cards.filter((id) => id.includes('-w-'))
    expect(currents).toHaveLength(8)
    expect(deck.cards[0]!.includes('-w-')).toBe(false)
    expect(deck.cards[deck.cards.length - 1]!.includes('-w-')).toBe(false)
    expect(deck.cards.slice(0, 16).filter((id) => id.includes('-w-'))).toHaveLength(8)
  })

  it('never ends with a Current even when the interval lands on the last question', () => {
    const pool: PoolCard[] = [q('a', 1), q('b', 1), q('c', 1), q('d', 1), cur('w1'), cur('w2')]
    const deck = buildDeck(
      input({ pool, settings: { ...settings, currentEvery: 2, noCurrentsBefore: 0 } }),
    )
    expect(deck.cards).toHaveLength(5)
    expect(deck.cards[2]).toMatch(/^w/)
    expect(deck.cards[4]).not.toMatch(/^w/)
  })

  it('builds an empty deck when nothing is eligible', () => {
    const deck = buildDeck(input({ pool: [] }))
    expect(deck.cards).toEqual([])
    const onlyCurrents = buildDeck(input({ pool: [cur('w1'), cur('w2')] }))
    expect(onlyCurrents.cards).toEqual([])
  })

  it('keeps invariants over random settings and histories', () => {
    const pool = smallPool()
    const ids = pool.map((c) => c.id)
    const arbPlayer = fc.record({
      afterDarkEnabled: fc.boolean(),
      excludeTags: fc.uniqueArray(fc.constantFrom('t1', 't2', 't3', 't4', 't5', 't6'), {
        maxLength: 3,
      }),
    })
    const arbSettings: fc.Arbitrary<DeckSettings> = fc.record({
      packs: fc.uniqueArray(fc.constantFrom('core', 'partner'), { maxLength: 2 }),
      startLevel: fc.constantFrom<LevelId>(1, 2, 3),
      progression: fc.constantFrom<'linear' | 'mixed'>('linear', 'mixed'),
      currentEvery: fc.integer({ min: 0, max: 7 }),
      noCurrentsBefore: fc.integer({ min: 0, max: 6 }),
      excludeAnswered: fc.boolean(),
      customCardsEnabled: fc.boolean(),
      mode: fc.constantFrom<'turns' | 'live'>('turns', 'live'),
      passedCardCooldownDays: fc.integer({ min: 0, max: 60 }),
    })
    const arbHistory: fc.Arbitrary<DeckHistory> = fc.record({
      answeredCardIds: fc
        .uniqueArray(fc.constantFrom(...ids), { maxLength: 10 })
        .map((a) => new Set(a)),
      excludedCardIds: fc
        .uniqueArray(fc.constantFrom(...ids), { maxLength: 3 })
        .map((a) => new Set(a)),
      passedCards: fc
        .uniqueArray(fc.tuple(fc.constantFrom(...ids), fc.integer({ min: 0, max: 60 })), {
          maxLength: 6,
          selector: (t) => t[0],
        })
        .map((entries) => Object.fromEntries(entries.map(([id, days]) => [id, NOW - days * DAY]))),
    })
    fc.assert(
      fc.property(
        arbSettings,
        fc.tuple(arbPlayer, arbPlayer),
        arbHistory,
        fc.string({ maxLength: 8 }),
        (s, ps, history, seed) => {
          const i = input({ settings: s, players: ps, history, seed })
          const deck = buildDeck(i)
          const e = eligibleCards(i)
          const eligibleIds = new Set([...e.questions, ...e.currents].map((c) => c.id))
          expect(new Set(deck.cards).size).toBe(deck.cards.length)
          for (const id of deck.cards) expect(eligibleIds.has(id)).toBe(true)
          const questionIds = deck.cards.filter((id) => !id.includes('-w-'))
          expect(questionIds.sort()).toEqual(e.questions.map((c) => c.id).sort())
          const levels = levelsOf(deck.cards, pool)
          for (const l of levels) if (l !== null) expect(l).toBeGreaterThanOrEqual(s.startLevel)
          if (s.progression === 'linear') {
            const qs = levels.filter((l): l is LevelId => l !== null)
            for (let k = 1; k < qs.length; k++) expect(qs[k]!).toBeGreaterThanOrEqual(qs[k - 1]!)
          }
          const isCurrent = deck.cards.map((id) => id.includes('-w-'))
          if (s.currentEvery === 0) expect(isCurrent.some(Boolean)).toBe(false)
          if (deck.cards.length) expect(isCurrent[deck.cards.length - 1]).toBe(false)
          isCurrent.forEach((c, idx) => {
            if (!c) return
            expect(idx).toBeGreaterThanOrEqual(s.noCurrentsBefore)
            expect(isCurrent[idx - 1]).toBe(false)
          })
        },
      ),
      { seed: 20261008, numRuns: 300 },
    )
  })
})

describe('buildDeck with the bundled content', () => {
  const content = getContent()
  const pool: readonly PoolCard[] = content.cards
  const defaults = content.shared.defaults
  const realSettings: DeckSettings = {
    packs: ['core', 'partner'],
    startLevel: defaults.startLevel,
    progression: defaults.progression,
    currentEvery: defaults.currentEvery,
    noCurrentsBefore: defaults.noCurrentsBefore,
    excludeAnswered: defaults.excludeAnswered,
    customCardsEnabled: false,
    mode: defaults.mode,
    passedCardCooldownDays: defaults.passedCardCooldownDays,
  }

  it('accepts the content pool cards without conversion', () => {
    const deck = buildDeck(input({ pool, settings: realSettings }))
    expect(deck.cards.length).toBeGreaterThan(100)
  })

  it('never deals After Dark when it is not enabled by both players', () => {
    const adultIds = new Set(pool.filter((c) => c.adult).map((c) => c.id))
    expect(adultIds.size).toBeGreaterThan(0)
    const withPack = { ...realSettings, packs: ['core', 'partner', 'afterdark'] }
    const one = buildDeck(
      input({
        pool,
        settings: withPack,
        players: [
          { afterDarkEnabled: true, excludeTags: [] },
          { afterDarkEnabled: false, excludeTags: [] },
        ],
      }),
    )
    expect(one.cards.some((id) => adultIds.has(id))).toBe(false)
    const both = buildDeck(
      input({
        pool,
        settings: withPack,
        players: [
          { afterDarkEnabled: true, excludeTags: [] },
          { afterDarkEnabled: true, excludeTags: [] },
        ],
      }),
    )
    expect(both.cards.filter((id) => adultIds.has(id))).toHaveLength(
      pool.filter((c) => c.adult && (c.type === 'question' || c.modes.includes('async'))).length,
    )
  })

  it('leaves out live only Currents in Turns mode', () => {
    const liveOnly = pool
      .filter((c) => c.type === 'current' && !c.modes.includes('async'))
      .map((c) => c.id)
    expect(liveOnly.length).toBeGreaterThan(0)
    const deck = buildDeck(input({ pool, settings: realSettings }))
    for (const id of liveOnly) expect(deck.cards).not.toContain(id)
    const live = buildDeck(input({ pool, settings: { ...realSettings, mode: 'live' } }))
    for (const id of liveOnly) expect(live.cards).toContain(id)
  })

  it('deals the default deck in level order with a Current every sixth card from the sixth', () => {
    const deck = buildDeck(input({ pool, settings: realSettings }))
    const byId = new Map(pool.map((c) => [c.id, c]))
    const levels = deck.cards.map((id) => byId.get(id)!.level).filter((l) => l !== null)
    for (let k = 1; k < levels.length; k++)
      expect(levels[k]!).toBeGreaterThanOrEqual(levels[k - 1]!)
    const positions = deck.cards.flatMap((id, idx) =>
      byId.get(id)!.type === 'current' ? [idx] : [],
    )
    expect(positions.slice(0, 3)).toEqual([5, 11, 17])
  })
})
