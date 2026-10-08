import { describe, expect, it } from 'vitest'
import { getContent, loadContent } from '../../src/content'
import {
  ContentError,
  countCards,
  LEVEL_IDS,
  MAX_CARD_TEXT,
  MIN_CARDS_PER_LEVEL,
  MODES,
  validateContent,
  type Content,
} from '../../src/content/schema'
import { defaultContentDir, readContentDir } from '../../scripts/content-node'

type Json = Record<string, unknown>
type RawPack = { pack: string; adult?: boolean; cards: Json[] }

function fresh(): { shared: Json; packs: Record<string, RawPack> } {
  const raw = readContentDir(defaultContentDir())
  return structuredClone(raw) as { shared: Json; packs: Record<string, RawPack> }
}

function expectInvalid(
  shared: unknown,
  packs: Record<string, unknown>,
  ...fragments: string[]
): void {
  let caught: unknown
  try {
    validateContent(shared, packs)
  } catch (error) {
    caught = error
  }
  expect(caught).toBeInstanceOf(ContentError)
  const message = (caught as ContentError).message
  for (const fragment of fragments) expect(message).toContain(fragment)
}

describe('bundled content', () => {
  const content: Content = loadContent()

  it('loads through the Vite bundle and from disk with the same result', () => {
    const raw = readContentDir(defaultContentDir())
    const fromDisk = validateContent(raw.shared, raw.packs)
    expect(countCards(content)).toEqual(countCards(fromDisk))
    expect(content.shared).toEqual(fromDisk.shared)
    expect(getContent()).toBe(getContent())
  })

  it('names the app and lists core, partner, and afterdark', () => {
    expect(content.shared.appName).toBe('Fathoms')
    expect(content.packs.map((p) => p.id)).toEqual(['core', 'partner', 'afterdark'])
  })

  it('keeps every card id unique across all packs', () => {
    const ids = content.cards.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives every question a level of 1 to 3', () => {
    for (const card of content.cards) {
      if (card.type === 'question') expect(LEVEL_IDS).toContain(card.level)
    }
  })

  it('gives every Current a null level and a non-empty modes array', () => {
    const currents = content.cards.filter((c) => c.type === 'current')
    expect(currents.length).toBeGreaterThan(0)
    for (const card of currents) {
      expect(card.level).toBeNull()
      expect(card.modes.length).toBeGreaterThan(0)
      for (const mode of card.modes) expect(MODES).toContain(mode)
    }
  })

  it('has no card text with a double quote or longer than the limit', () => {
    for (const card of content.cards) {
      expect(card.text, card.id).not.toContain('"')
      expect(card.text.length, card.id).toBeLessThanOrEqual(MAX_CARD_TEXT)
    }
  })

  it('has at least the minimum number of cards per level in every pack', () => {
    for (const pack of countCards(content)) {
      for (const level of LEVEL_IDS) {
        expect(pack.levels[level], `${pack.packId} level ${level}`).toBeGreaterThanOrEqual(
          MIN_CARDS_PER_LEVEL,
        )
      }
    }
  })

  it('marks only After Dark as adult, in both shared.json and the pack file', () => {
    const adultPacks = content.packs.filter((p) => p.adult).map((p) => p.id)
    expect(adultPacks).toEqual(['afterdark'])
    for (const card of content.cards) expect(card.adult).toBe(card.pack === 'afterdark')
  })

  it('counts cards per pack and level the same way a plain tally does', () => {
    const raw = fresh()
    for (const pack of countCards(content)) {
      const file = (raw.shared.packs as Array<{ id: string; file: string }>).find(
        (p) => p.id === pack.packId,
      )?.file
      const cards = raw.packs[file ?? '']?.cards ?? []
      for (const level of LEVEL_IDS) {
        expect(pack.levels[level]).toBe(
          cards.filter((c) => c.type === 'question' && c.level === level).length,
        )
      }
      expect(pack.currents).toBe(cards.filter((c) => c.type === 'current').length)
      expect(pack.total).toBe(cards.length)
    }
  })

  it('is frozen so nothing rewrites cards at runtime', () => {
    expect(Object.isFrozen(content)).toBe(true)
    expect(Object.isFrozen(content.cards)).toBe(true)
    expect(Object.isFrozen(content.cards[0])).toBe(true)
  })
})

describe('content validation rejects', () => {
  it('a card text with a double quote', () => {
    const raw = fresh()
    const card = raw.packs['packs/core.json']!.cards[0]!
    card.text = 'What is your "real" answer?'
    expectInvalid(raw.shared, raw.packs, 'packs/core.json', 'double quote')
  })

  it('a card text longer than the limit', () => {
    const raw = fresh()
    const card = raw.packs['packs/partner.json']!.cards[0]!
    card.text = 'x'.repeat(MAX_CARD_TEXT + 1)
    expectInvalid(raw.shared, raw.packs, 'packs/partner.json', `${MAX_CARD_TEXT}`)
  })

  it('a question without a level of 1 to 3', () => {
    const raw = fresh()
    const cards = raw.packs['packs/core.json']!.cards
    cards[0]!.level = null
    cards[1]!.level = 4
    expectInvalid(
      raw.shared,
      raw.packs,
      'packs/core.json',
      'cards.0',
      'cards.1',
      'expected one of 1|2|3',
    )
  })

  it('a type error, a duplicate id, and a short level in one pack, all in one report', () => {
    const raw = fresh()
    const pack = raw.packs['packs/core.json']!
    pack.cards[0]!.level = '1'
    pack.cards[7]!.id = pack.cards[1]!.id as string
    let level2 = 0
    pack.cards = pack.cards.filter(
      (c) => !(c.type === 'question' && c.level === 2 && ++level2 > 15),
    )
    expectInvalid(
      raw.shared,
      raw.packs,
      'cards.0.level',
      `duplicate card id ${String(pack.cards[1]!.id)}`,
      `has 15 level 2 cards`,
    )
  })

  it('a Current with a level or without modes', () => {
    const raw = fresh()
    const cards = raw.packs['packs/core.json']!.cards
    const currents = cards.filter((c) => c.type === 'current')
    currents[0]!.level = 1
    currents[1]!.modes = []
    delete currents[2]!.modes
    expectInvalid(raw.shared, raw.packs, 'packs/core.json', 'at least one mode')
  })

  it('a Current with an unknown mode', () => {
    const raw = fresh()
    const current = raw.packs['packs/core.json']!.cards.find((c) => c.type === 'current')!
    current.modes = ['live', 'telepathy']
    expectInvalid(raw.shared, raw.packs, 'packs/core.json', 'modes')
  })

  it('a duplicate card id inside a pack', () => {
    const raw = fresh()
    raw.packs['packs/core.json']!.cards[1]!.id = raw.packs['packs/core.json']!.cards[0]!
      .id as string
    expectInvalid(raw.shared, raw.packs, 'packs/core.json at cards.1.id', 'duplicate card id')
  })

  it('a card id reused by another pack', () => {
    const raw = fresh()
    raw.packs['packs/partner.json']!.cards[0]!.id = 'c1-05'
    expectInvalid(raw.shared, raw.packs, 'packs/partner.json: card id c1-05 is also used in core')
  })

  it('a pack with fewer than the minimum cards in a level', () => {
    const raw = fresh()
    const pack = raw.packs['packs/afterdark.json']!
    pack.cards = pack.cards.filter(
      (c) => !(c.type === 'question' && c.level === 1 && c.id === 'a1-16'),
    )
    expectInvalid(raw.shared, raw.packs, `${MIN_CARDS_PER_LEVEL - 1} level 1 cards`)
  })

  it('an adult flag that disagrees between shared.json and the pack file', () => {
    const raw = fresh()
    raw.packs['packs/afterdark.json']!.adult = false
    expectInvalid(raw.shared, raw.packs, 'adult is false but shared.json says true')
  })

  it('a pack file that shared.json does not list, and a listed file that is missing', () => {
    const raw = fresh()
    raw.packs['packs/extra.json'] = structuredClone(raw.packs['packs/core.json']!)
    raw.packs['packs/extra.json']!.pack = 'extra'
    raw.packs['packs/extra.json']!.cards = raw.packs['packs/extra.json']!.cards.map((c) => ({
      ...c,
      id: `x-${c.id}`,
    }))
    delete raw.packs['packs/partner.json']
    expectInvalid(
      raw.shared,
      raw.packs,
      'packs/extra.json: pack file is not listed',
      'packs/partner.json, which was not loaded',
    )
  })

  it('a pack whose name does not match its shared.json id', () => {
    const raw = fresh()
    raw.packs['packs/core.json']!.pack = 'kore'
    expectInvalid(raw.shared, raw.packs, 'pack is kore but shared.json lists it as core')
  })

  it('an unknown card field, which keeps the shape fixed', () => {
    const raw = fresh()
    raw.packs['packs/core.json']!.cards[0]!.weight = 3
    expectInvalid(raw.shared, raw.packs, 'packs/core.json', 'weight')
  })

  it('broken shared.json fields', () => {
    const raw = fresh()
    raw.shared.rules = ['only one rule']
    raw.shared.appName = ''
    ;(raw.shared.levels as Array<{ color: string }>)[0]!.color = 'blue'
    ;(raw.shared.defaults as Json).maxPlayers = 3
    expectInvalid(
      raw.shared,
      raw.packs,
      'shared.json at rules',
      'appName',
      'levels.0.color',
      'defaults.maxPlayers',
    )
  })

  it('duplicate prompt ids across openers, closers, follow-ups, and daily', () => {
    const raw = fresh()
    ;(raw.shared.daily as Array<{ id: string }>)[0]!.id = 'fu-01'
    expectInvalid(raw.shared, raw.packs, 'duplicate prompt id fu-01')
  })

  it('shared.json that is not even an object, without touching the packs', () => {
    const raw = fresh()
    expectInvalid(null, raw.packs, 'shared.json')
  })
})
