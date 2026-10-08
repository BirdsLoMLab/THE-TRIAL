import { beforeEach, describe, expect, it } from 'vitest'
import { getContent } from '../../../src/content'
import { GameError, roomPhase, turnView } from '../../../src/game/turns'
import {
  cardLookup,
  defaultRoomSettings,
  draftKey,
  PLAYER_IDS,
  SAME_DEVICE_STORAGE_KEY,
  useSameDevice,
} from '../../../src/store/sameDevice'

const players = [
  { name: 'Ada', color: '#4fb3d9' },
  { name: 'Ben', color: '#e0a030' },
] as const

function reset() {
  useSameDevice.setState({ room: null, handoff: false, reveal: null, drafts: {} })
  localStorage.clear()
}

function store() {
  return useSameDevice.getState()
}

function agreeBoth() {
  for (const uid of PLAYER_IDS) store().dispatch({ type: 'agreeRules', by: uid, at: 5 })
}

describe('same device store', () => {
  beforeEach(reset)

  it('builds default settings from shared.json with the non adult packs on', () => {
    const settings = defaultRoomSettings()
    const d = getContent().shared.defaults
    expect(settings.packs).toEqual(['core', 'partner'])
    expect(settings.startLevel).toBe(d.startLevel)
    expect(settings.currentEvery).toBe(d.currentEvery)
    expect(settings.passesPerDeck).toBe(d.passesPerDeck)
    expect(settings.closerSeesOpener).toBe(d.closerSeesOpener)
    expect(settings.customCardsEnabled).toBe(false)
  })

  it('looks up bundled cards by id and returns undefined otherwise', () => {
    expect(cardLookup()('c1-01')?.text).toContain('small thing')
    expect(cardLookup()('nope')).toBeUndefined()
    expect(cardLookup()).toBe(cardLookup())
  })

  it('creates a room with two players, a full deck, and saves it to localStorage', () => {
    store().newGame({ players, seed: 'seed', now: 1000 })
    const room = store().room
    expect(room).not.toBeNull()
    expect(room?.order).toEqual(['p1', 'p2'])
    expect(room?.players.p1?.name).toBe('Ada')
    expect(room?.players.p2?.color).toBe('#e0a030')
    expect(room?.createdAt).toBe(1000)
    expect(room?.deck.seed).toBe('seed')
    expect(room?.deck.cards.length).toBeGreaterThan(150)
    expect(room?.rules).toEqual(getContent().shared.rules)
    const saved = JSON.parse(localStorage.getItem(SAME_DEVICE_STORAGE_KEY) ?? '{}') as {
      state: { room: { deck: { seed: string } } }
    }
    expect(saved.state.room.deck.seed).toBe('seed')
  })

  it('accepts settings overrides and surfaces reducer errors', () => {
    store().newGame({
      players,
      settings: { packs: ['core'], startLevel: 3, currentEvery: 0 },
      seed: 's',
    })
    expect(store().room?.deck.cards).toHaveLength(32)
    expect(() =>
      store().newGame({ players: [{ name: ' ', color: '#4fb3d9' }, players[1]] }),
    ).toThrow(GameError)
  })

  it('hands the phone over after the first send and reveals after a close', () => {
    store().newGame({
      players,
      settings: { packs: ['core'], startLevel: 3, currentEvery: 0 },
      seed: 's',
      now: 1,
    })
    agreeBoth()
    store().setDraft(draftKey.open(1), 'draft')
    store().sendTurn({ open: 'Ada opens' }, 10)
    expect(store().handoff).toBe(true)
    expect(store().reveal).toBeNull()
    expect(store().drafts).toEqual({})
    expect(store().room?.ball.holderUid).toBe('p2')
    store().acknowledgeHandoff()
    expect(store().handoff).toBe(false)
    store().sendTurn({ close: 'Ben closes', open: 'Ben opens' }, 20)
    expect(store().reveal).toBe(1)
    expect(store().handoff).toBe(false)
    store().finishReveal()
    expect(store().reveal).toBeNull()
    expect(store().handoff).toBe(true)
    expect(store().room?.cards[0]?.status).toBe('closed')
  })

  it('keeps the phone with whoever closes the last card of a deck', () => {
    store().newGame({
      players,
      settings: { packs: ['core'], startLevel: 3, currentEvery: 0 },
      seed: 's',
      now: 1,
    })
    agreeBoth()
    const room = store().room!
    useSameDevice.setState({
      room: { ...room, deck: { ...room.deck, cards: room.deck.cards.slice(0, 1) } },
    })
    store().sendTurn({ open: 'Ada opens' }, 10)
    expect(store().handoff).toBe(true)
    store().acknowledgeHandoff()
    store().sendTurn({ close: 'Ben closes' }, 20)
    expect(store().reveal).toBe(1)
    expect(store().handoff).toBe(false)
    store().finishReveal()
    expect(store().handoff).toBe(false)
    expect(store().room?.ball.holderUid).toBe('p2')
    expect(roomPhase(store().room!)).toBe('exhausted')
  })

  it('rejects a send that breaks the rules without touching the room', () => {
    store().newGame({ players, seed: 's', now: 1 })
    const before = store().room
    expect(() => store().sendTurn({ open: 'x' }, 10)).toThrow(GameError)
    expect(store().room).toBe(before)
    expect(() => store().dispatch({ type: 'pause', by: 'nobody', at: 1 })).toThrow(GameError)
  })

  it('throws when there is no game', () => {
    expect(() => store().sendTurn({ open: 'x' })).toThrow('No game on this phone')
    expect(() => store().dispatch({ type: 'pause', by: 'p1', at: 1 })).toThrow(
      'No game on this phone',
    )
    expect(() => store().rebuildDeck('p1')).toThrow('No game on this phone')
  })

  it('keeps drafts until they are cleared', () => {
    store().setDraft('close:1', 'hello')
    store().setDraft('open:2', 'there')
    expect(store().drafts).toEqual({ 'close:1': 'hello', 'open:2': 'there' })
    store().setDraft('close:1', '')
    expect(store().drafts).toEqual({ 'open:2': 'there' })
  })

  it('rebuilds a deck that skips answered cards and asks for the rules again', () => {
    store().newGame({
      players,
      settings: { packs: ['core'], startLevel: 3, currentEvery: 0 },
      seed: 's',
      now: 1,
    })
    agreeBoth()
    store().sendTurn({ open: 'a' }, 10)
    store().sendTurn({ close: 'b', open: 'c' }, 20)
    const answered = store().room?.cards[0]?.cardId
    const open = store().room?.cards[1]?.cardId
    store().rebuildDeck('p1', 30, 'new-seed')
    const room = store().room
    expect(room?.deck.seed).toBe('new-seed')
    expect(room?.deck.cards).not.toContain(answered)
    expect(room?.deck.cards).not.toContain(open)
    expect(room?.deck.cards).toHaveLength(30)
    expect(roomPhase(room!)).toBe('rules')
    expect(store().drafts).toEqual({})
  })

  it('ends the game and clears storage', () => {
    store().newGame({ players, seed: 's' })
    store().endGame()
    expect(store().room).toBeNull()
    const saved = JSON.parse(localStorage.getItem(SAME_DEVICE_STORAGE_KEY) ?? '{}') as {
      state: { room: unknown }
    }
    expect(saved.state.room).toBeNull()
  })

  it('rehydrates from localStorage so the journal survives a reload', async () => {
    store().newGame({
      players,
      settings: { packs: ['core'], startLevel: 3, currentEvery: 0 },
      seed: 's',
      now: 1,
    })
    agreeBoth()
    store().sendTurn({ open: 'a' }, 10)
    store().setDraft('close:1', 'unsent')
    const raw = localStorage.getItem(SAME_DEVICE_STORAGE_KEY)
    useSameDevice.setState({ room: null, handoff: false, reveal: null, drafts: {} })
    expect(store().room).toBeNull()
    localStorage.setItem(SAME_DEVICE_STORAGE_KEY, raw ?? '')
    await useSameDevice.persist.rehydrate()
    expect(store().room?.cards).toHaveLength(1)
    expect(store().handoff).toBe(true)
    expect(store().drafts).toEqual({ 'close:1': 'unsent' })
    expect(turnView(store().room!, cardLookup()).holder).toBe('p2')
  })
})
