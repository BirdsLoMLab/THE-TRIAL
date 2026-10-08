import { describe, expect, it } from 'vitest'
import {
  cardMatches,
  EMPTY_FILTER,
  filterJournal,
  groupByDay,
  journalPacks,
  journalToMarkdown,
} from '../../../src/game/journal'
import { createRoom, reduce } from '../../../src/game/turns'
import type { CardLookup, CardRecord, PoolCard, RoomState } from '../../../src/game/types'
import { defaultSettings } from './helpers'

const A = 'alice'
const B = 'bob'
const POOL: PoolCard[] = [
  {
    id: 'q1',
    pack: 'core',
    adult: false,
    type: 'question',
    level: 1,
    text: 'Smell that takes you back?',
    tags: [],
  },
  {
    id: 'q2',
    pack: 'partner',
    adult: false,
    type: 'question',
    level: 2,
    text: 'What do you avoid saying?',
    tags: [],
  },
  {
    id: 'w1',
    pack: 'core',
    adult: false,
    type: 'current',
    level: null,
    modes: ['async'],
    text: 'Send a song.',
    tags: [],
  },
  {
    id: 'q3',
    pack: 'core',
    adult: false,
    type: 'question',
    level: 3,
    text: 'What shaped you?',
    tags: [],
  },
]
const lookup: CardLookup = (id) => POOL.find((c) => c.id === id)
const DAY = 86_400_000

function played(): RoomState {
  let state = createRoom({
    createdAt: 1,
    rules: ['a', 'b'],
    players: [
      { uid: A, name: 'Ada', color: '#4fb3d9' },
      { uid: B, name: 'Ben', color: '#e0a030' },
    ],
    settings: defaultSettings({ currentEvery: 0 }),
    deck: { seed: 's', cards: ['q1', 'q2', 'w1', 'q3'], dealt: 0, builtAt: 1 },
  })
  state = reduce(state, { type: 'agreeRules', by: A, at: 2 }, lookup)
  state = reduce(state, { type: 'agreeRules', by: B, at: 3 }, lookup)
  state = reduce(state, { type: 'send', by: A, at: DAY, openAnswer: 'Rain on asphalt' }, lookup)
  state = reduce(
    state,
    { type: 'send', by: B, at: DAY + 1000, closeAnswer: 'Fresh bread', openAnswer: 'The truth' },
    lookup,
  )
  state = reduce(
    state,
    { type: 'askFollowUp', by: B, at: DAY + 2000, seq: 1, text: 'Where?' },
    lookup,
  )
  state = reduce(
    state,
    {
      type: 'send',
      by: A,
      at: 2 * DAY,
      closeAnswer: 'My fear',
      openAnswer: 'Done',
      replies: [{ seq: 1, text: 'Lisbon' }],
    },
    lookup,
  )
  state = reduce(state, { type: 'pass', by: B, at: 2 * DAY + 10, target: 'close' }, lookup)
  state = reduce(state, { type: 'send', by: B, at: 2 * DAY + 20, openAnswer: 'Everything' }, lookup)
  state = reduce(state, { type: 'favorite', by: A, at: 2 * DAY + 30, seq: 2, on: true }, lookup)
  state = reduce(state, { type: 'react', by: B, at: 2 * DAY + 40, seq: 1, emoji: '❤️' }, lookup)
  state = reduce(state, { type: 'react', by: A, at: 2 * DAY + 41, seq: 1, emoji: '❤️' }, lookup)
  state = reduce(
    state,
    { type: 'askFollowUp', by: A, at: 2 * DAY + 50, seq: 1, text: 'And now?' },
    lookup,
  )
  return state
}

describe('journal filters', () => {
  const state = played()

  it('lists newest first with no filter', () => {
    expect(filterJournal(state.cards, EMPTY_FILTER).map((c) => c.seq)).toEqual([4, 3, 2, 1])
  })

  it('filters favorites, levels, Currents, and packs', () => {
    expect(
      filterJournal(state.cards, { ...EMPTY_FILTER, view: 'favorites' }).map((c) => c.seq),
    ).toEqual([2])
    expect(filterJournal(state.cards, { ...EMPTY_FILTER, level: 1 }).map((c) => c.seq)).toEqual([1])
    expect(
      filterJournal(state.cards, { ...EMPTY_FILTER, level: 'currents' }).map((c) => c.seq),
    ).toEqual([3])
    expect(
      filterJournal(state.cards, { ...EMPTY_FILTER, pack: 'partner' }).map((c) => c.seq),
    ).toEqual([2])
    expect(journalPacks(state.cards)).toEqual(['core', 'partner'])
  })

  it('searches card text, answers, follow-ups, and replies, ignoring case', () => {
    expect(
      filterJournal(state.cards, { ...EMPTY_FILTER, query: 'BREAD' }).map((c) => c.seq),
    ).toEqual([1])
    expect(
      filterJournal(state.cards, { ...EMPTY_FILTER, query: 'lisbon' }).map((c) => c.seq),
    ).toEqual([1])
    expect(
      filterJournal(state.cards, { ...EMPTY_FILTER, query: 'where?' }).map((c) => c.seq),
    ).toEqual([1])
    expect(
      filterJournal(state.cards, { ...EMPTY_FILTER, query: 'avoid' }).map((c) => c.seq),
    ).toEqual([2])
    expect(filterJournal(state.cards, { ...EMPTY_FILTER, query: 'nothing here' })).toEqual([])
    expect(cardMatches(state.cards[0]!, '   ')).toBe(true)
  })

  it('keeps hidden tombstones in the plain list but out of searches', () => {
    const hidden: CardRecord = {
      ...state.cards[0]!,
      status: 'hidden',
      cardText: '',
      answers: {},
      followUps: {},
      reactions: {},
    }
    const cards = [hidden, ...state.cards.slice(1)]
    expect(filterJournal(cards, EMPTY_FILTER).map((c) => c.seq)).toEqual([4, 3, 2, 1])
    expect(filterJournal(cards, { ...EMPTY_FILTER, query: 'a' }).map((c) => c.seq)).toEqual([
      4, 3, 2,
    ])
  })

  it('groups by local day in the given order', () => {
    const groups = groupByDay(filterJournal(state.cards, EMPTY_FILTER))
    expect(groups.map((g) => g.cards.map((c) => c.seq))).toEqual([
      [4, 3],
      [2, 1],
    ])
    expect(groups[0]?.day).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(groupByDay([])).toEqual([])
  })
})

describe('journalToMarkdown', () => {
  it('renders every card with answers, follow-ups, reactions, favorites, passes, and tombstones', () => {
    const state = played()
    const hidden: CardRecord = {
      ...state.cards[3]!,
      adult: true,
      status: 'hidden',
      cardText: '',
      answers: {},
      followUps: {},
      reactions: {},
    }
    const room = { ...state, cards: [...state.cards.slice(0, 3), hidden] }
    const md = journalToMarkdown(room, {
      title: 'Ada and Ben',
      levelNames: { 1: 'Shallows', 2: 'Open Water', 3: 'The Deep' },
      packNames: { core: 'Core', partner: 'Partner' },
    })
    expect(md.startsWith('# Ada and Ben\n\nAda and Ben. 4 cards.\n')).toBe(true)
    expect(md).toContain(
      '## Card 1: Core, Shallows\n\nSmell that takes you back?\n\n**Ada:** Rain on asphalt\n\n**Ben:** Fresh bread\n',
    )
    expect(md).toContain('> Ben asked: Where?\n> Ada: Lisbon\n')
    expect(md).toContain('> Ada asked: And now?\n> Not answered.\n')
    expect(md).toContain('❤️ Ben, Ada')
    expect(md).toContain('## Card 2: Partner, Open Water (favorite)')
    expect(md).toContain('## Card 3: Core, Current\n\nSend a song.\n\nPassed by Ben.\n')
    expect(md).toContain(
      '## Card 4: Core, The Deep\n\nAn After Dark card, hidden after both read it.',
    )
    expect(md).not.toMatch(new RegExp('[' + String.fromCharCode(0x2013, 0x2014) + ']'))
    expect(md.endsWith('\n')).toBe(true)
    expect(md).not.toContain('\n\n\n')
    const plain = journalToMarkdown(state)
    expect(plain).toContain('# Fathoms journal')
    expect(plain).toContain('## Card 1: core, Level 1')
    expect(plain).toContain('> Not answered.')
  })
})
