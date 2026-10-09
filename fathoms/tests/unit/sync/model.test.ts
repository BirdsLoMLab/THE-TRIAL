import { describe, expect, it } from 'vitest'
import { createRoom, reduce } from '../../../src/game/turns'
import type { CardLookup, PoolCard } from '../../../src/game/types'
import {
  cardDocId,
  fromRoomDoc,
  parseCardDoc,
  parseRoomDoc,
  roomIsComplete,
  toCardDoc,
  toRoomDoc,
} from '../../../src/sync/model'
import { defaultSettings } from '../game/helpers'

const POOL: PoolCard[] = [
  { id: 'q1', pack: 'core', adult: false, type: 'question', level: 1, text: 'One', tags: [] },
  { id: 'q2', pack: 'core', adult: false, type: 'question', level: 1, text: 'Two', tags: [] },
]
const lookup: CardLookup = (id) => POOL.find((c) => c.id === id)

function room() {
  let state = createRoom({
    createdAt: 1,
    rules: ['a', 'b'],
    players: [
      { uid: 'p1', name: 'Ada', color: '#4fb3d9' },
      { uid: 'p2', name: 'Ben', color: '#e0a030' },
    ],
    settings: defaultSettings(),
    deck: { seed: 's', cards: ['q1', 'q2'], dealt: 0, builtAt: 1 },
  })
  state = reduce(state, { type: 'agreeRules', by: 'p1', at: 2 }, lookup)
  state = reduce(state, { type: 'agreeRules', by: 'p2', at: 3 }, lookup)
  return state
}

describe('sync model', () => {
  it('pads card ids so they sort in deal order', () => {
    expect(cardDocId(1)).toBe('0001')
    expect(cardDocId(123)).toBe('0123')
    expect(['0010', '0002', '0001'].sort()).toEqual(['0001', '0002', '0010'])
  })

  it('round trips a room through its document and keeps cardCount', () => {
    const state = reduce(room(), { type: 'send', by: 'p1', at: 10, openAnswer: 'blind' }, lookup)
    const doc = toRoomDoc(state)
    expect(doc.cardCount).toBe(1)
    expect(doc.order).toEqual(['p1', 'p2'])
    expect(parseRoomDoc(JSON.parse(JSON.stringify(doc)))).toEqual(doc)
    const back = fromRoomDoc(doc, state.cards)
    expect(back).toEqual(state)
  })

  it('keeps the opener answer out of an open card document and in a closed one', () => {
    let state = reduce(room(), { type: 'send', by: 'p1', at: 10, openAnswer: 'blind' }, lookup)
    const open = toCardDoc(state.cards[0]!)
    expect(open.answers).toEqual({})
    expect(open.status).toBe('open')
    expect(parseCardDoc(JSON.parse(JSON.stringify(open)))).toEqual(open)
    state = reduce(
      state,
      { type: 'send', by: 'p2', at: 20, closeAnswer: 'closing', openAnswer: 'next' },
      lookup,
    )
    const closed = toCardDoc(state.cards[0]!)
    expect(Object.keys(closed.answers).sort()).toEqual(['p1', 'p2'])
    expect(closed.closedAt).toBe(20)
  })

  it('fills the turn counters on documents written before they existed', () => {
    const state = reduce(room(), { type: 'send', by: 'p1', at: 10, openAnswer: 'blind' }, lookup)
    const roomDoc = JSON.parse(JSON.stringify(toRoomDoc(state))) as {
      players: Record<string, Record<string, unknown>>
    }
    delete roomDoc.players['p1']!['lastTurn']
    expect(parseRoomDoc(roomDoc).players['p1']?.lastTurn).toBeNull()
    const cardDoc = JSON.parse(JSON.stringify(toCardDoc(state.cards[0]!))) as Record<
      string,
      unknown
    >
    delete cardDoc['closedTurn']
    cardDoc['followUps'] = { p2: { text: 'Why?', at: 11, reply: null } }
    const parsed = parseCardDoc(cardDoc)
    expect(parsed.closedTurn).toBeNull()
    // An old question is never pending again (askedTurn below any lastTurn); it stays in the journal.
    expect(parsed.followUps['p2']?.askedTurn).toBe(-1)
  })

  it('round trips a follow-up with its turn count', () => {
    let state = reduce(room(), { type: 'send', by: 'p1', at: 10, openAnswer: 'blind' }, lookup)
    state = reduce(
      state,
      { type: 'send', by: 'p2', at: 20, closeAnswer: 'closing', openAnswer: 'next' },
      lookup,
    )
    state = reduce(state, { type: 'askFollowUp', by: 'p2', at: 21, seq: 1, text: 'Why?' }, lookup)
    const doc = parseCardDoc(JSON.parse(JSON.stringify(toCardDoc(state.cards[0]!))))
    expect(doc.closedTurn).toBe(1)
    expect(doc.followUps['p2']).toEqual({ text: 'Why?', at: 21, askedTurn: 2, reply: null })
    expect(fromRoomDoc(toRoomDoc(state), state.cards)).toEqual(state)
  })

  it('treats a one player room as pending', () => {
    const doc = toRoomDoc(room())
    const pending = { ...doc, players: { p1: doc.players['p1']! }, order: ['p1'] }
    expect(roomIsComplete(pending)).toBe(false)
    expect(fromRoomDoc(pending, [])).toBeNull()
    expect(roomIsComplete(doc)).toBe(true)
  })

  it('rejects a document with a broken shape', () => {
    const doc = toRoomDoc(room())
    expect(() => parseRoomDoc({ ...doc, ball: null })).toThrow()
    expect(() => parseCardDoc({ seq: 'one' })).toThrow()
  })
})
