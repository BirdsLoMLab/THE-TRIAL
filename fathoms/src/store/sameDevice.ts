// Same Device mode (PLAN 4.11, 6.10): pass and play on one phone, no backend.
// The whole room lives in localStorage. The reducer in src/game does the rules;
// this store adds what one phone needs on top: the hand off between players,
// the reveal after a send, and drafts that survive a reload.
import { nanoid } from 'nanoid'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { getContent } from '../content'
import { newCustomCard, type CustomCardInput } from '../game/custom'
import { buildDeck } from '../game/deck'
import { createRoom, deckHistory, reduce, type Action, type Reply } from '../game/turns'
import type { CardLookup, CustomCard, PlayerId, RoomSettings, RoomState } from '../game/types'
import { lookupFor, poolFor } from './lookup'

export const SAME_DEVICE_STORAGE_KEY = 'fathoms.same-device'
export const PLAYER_IDS: readonly [PlayerId, PlayerId] = ['p1', 'p2']

/** Preset player colors. Hex values, dark theme friendly. */
export const PLAYER_COLORS: readonly {
  readonly id: string
  readonly name: string
  readonly hex: string
}[] = [
  { id: 'sea', name: 'Sea', hex: '#4fb3d9' },
  { id: 'amber', name: 'Amber', hex: '#e0a030' },
  { id: 'coral', name: 'Coral', hex: '#e8735a' },
  { id: 'moss', name: 'Moss', hex: '#7bb662' },
  { id: 'lilac', name: 'Lilac', hex: '#b48ee0' },
  { id: 'rose', name: 'Rose', hex: '#e07aa8' },
]

export interface NewPlayerInput {
  readonly name: string
  readonly color: string
}

export interface NewGameInput {
  readonly players: readonly [NewPlayerInput, NewPlayerInput]
  readonly settings?: Partial<RoomSettings>
  readonly seed?: string
  readonly now?: number
}

export interface SendInput {
  readonly close?: string | undefined
  readonly open?: string | undefined
  readonly replies?: readonly Reply[] | undefined
}

export interface SameDeviceData {
  readonly room: RoomState | null
  /** Cards the players wrote on this phone. */
  readonly customCards: readonly CustomCard[]
  /** The phone must be handed to the ball holder before the Turn screen shows. */
  readonly handoff: boolean
  /** seq of the card the sender just closed, shown on the Reveal screen. */
  readonly reveal: number | null
  /** Unsent text per card and step, so a turn can be written across sittings. */
  readonly drafts: Readonly<Record<string, string>>
}

export interface SameDeviceActions {
  newGame(input: NewGameInput): void
  /** Applies a reducer action. Throws GameError for anything the rules forbid. */
  dispatch(action: Action): void
  sendTurn(input: SendInput, at?: number): void
  finishReveal(): void
  acknowledgeHandoff(): void
  /** Builds a new deck from the current settings and the room history, then applies it. */
  rebuildDeck(by: PlayerId, at?: number, seed?: string): void
  setDraft(key: string, text: string): void
  endGame(): void
  addCustomCard(input: CustomCardInput, by: PlayerId, at?: number, id?: string): CustomCard
  removeCustomCard(id: string): void
}

export type SameDeviceStore = SameDeviceData & SameDeviceActions

const EMPTY: SameDeviceData = {
  room: null,
  customCards: [],
  handoff: false,
  reveal: null,
  drafts: {},
}

let bundledLookup: CardLookup | null = null

/** Finds bundled cards by id. Screens with custom cards use the game adapter's lookup instead. */
export function cardLookup(): CardLookup {
  bundledLookup ??= lookupFor([])
  return bundledLookup
}

/** Room settings from content/shared.json defaults with every non adult pack enabled. */
export function defaultRoomSettings(): RoomSettings {
  const { shared } = getContent()
  const d = shared.defaults
  return {
    packs: shared.packs.filter((pack) => !pack.adult).map((pack) => pack.id),
    startLevel: d.startLevel,
    progression: d.progression,
    currentEvery: d.currentEvery,
    noCurrentsBefore: d.noCurrentsBefore,
    excludeAnswered: d.excludeAnswered,
    customCardsEnabled: false,
    mode: d.mode,
    passedCardCooldownDays: d.passedCardCooldownDays,
    passesPerDeck: d.passesPerDeck,
    closerSeesOpener: d.closerSeesOpener,
    lighterWindowCards: d.lighterWindowCards,
    reminderHours: d.reminderHours,
    reminderCap: d.reminderCap,
    afterDarkRetention: d.afterDarkRetention,
  }
}

function requireRoom(room: RoomState | null): RoomState {
  if (!room) throw new Error('No game on this phone')
  return room
}

function deckFor(room: RoomState, custom: readonly CustomCard[], seed: string, now: number) {
  return buildDeck({
    settings: room.settings,
    players: room.order.map((uid) => {
      const player = room.players[uid]
      return {
        afterDarkEnabled: player?.afterDarkEnabled ?? false,
        excludeTags: player?.excludeTags ?? [],
      }
    }),
    pool: poolFor(custom),
    history: deckHistory(room),
    seed,
    now,
  })
}

/** How many cards a rebuild with the current settings would deal. Informational, so `now` may be approximate. */
export function nextDeckSize(
  room: RoomState,
  now: number,
  custom: readonly CustomCard[] = [],
): number {
  return deckFor(room, custom, 'preview', now).cards.length
}

export const useSameDevice = create<SameDeviceStore>()(
  persist(
    (set, get) => ({
      ...EMPTY,

      newGame(input) {
        const now = input.now ?? Date.now()
        const settings: RoomSettings = { ...defaultRoomSettings(), ...input.settings }
        const seed = input.seed ?? nanoid()
        const { shared } = getContent()
        const players = PLAYER_IDS.map((uid, i) => ({ uid, ...input.players[i] })) as [
          { uid: PlayerId; name: string; color: string },
          { uid: PlayerId; name: string; color: string },
        ]
        const draft = createRoom({
          createdAt: now,
          rules: shared.rules,
          players,
          settings,
          deck: { seed, cards: [], dealt: 0, builtAt: now },
        })
        const room = { ...draft, deck: deckFor(draft, get().customCards, seed, now) }
        set({ room, handoff: false, reveal: null, drafts: {} })
      },

      dispatch(action) {
        const room = requireRoom(get().room)
        set({ room: reduce(room, action, lookupFor(get().customCards)) })
      },

      sendTurn(input, at = Date.now()) {
        const room = requireRoom(get().room)
        const closing = room.openSeq
        const next = reduce(
          room,
          {
            type: 'send',
            by: room.ball.holderUid,
            at,
            closeAnswer: input.close,
            openAnswer: input.open,
            replies: input.replies,
          },
          lookupFor(get().customCards),
        )
        const reveal = closing > 0 ? closing : null
        set({ room: next, reveal, handoff: reveal === null, drafts: {} })
      },

      finishReveal() {
        set({ reveal: null, handoff: true })
      },

      acknowledgeHandoff() {
        set({ handoff: false })
      },

      rebuildDeck(by, at = Date.now(), seed = nanoid()) {
        const room = requireRoom(get().room)
        const deck = deckFor(room, get().customCards, seed, at)
        set({
          room: reduce(room, { type: 'rebuildDeck', by, at, deck }, lookupFor(get().customCards)),
          drafts: {},
        })
      },

      setDraft(key, text) {
        const drafts = { ...get().drafts }
        if (text) drafts[key] = text
        else delete drafts[key]
        set({ drafts })
      },

      endGame() {
        set({ ...EMPTY })
      },

      addCustomCard(input, by, at = Date.now(), id = `custom-${nanoid(10)}`) {
        const card = newCustomCard(input, id, by, at)
        set({ customCards: [...get().customCards, card] })
        return card
      },

      removeCustomCard(id) {
        set({ customCards: get().customCards.filter((card) => card.id !== id) })
      },
    }),
    {
      name: SAME_DEVICE_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        room: state.room,
        customCards: state.customCards,
        handoff: state.handoff,
        reveal: state.reveal,
        drafts: state.drafts,
      }),
    },
  ),
)

/** Draft keys, one per card and step. */
export const draftKey = {
  close: (seq: number) => `close:${seq}`,
  open: (seq: number) => `open:${seq}`,
  reply: (seq: number) => `reply:${seq}`,
  followUp: (seq: number) => `followUp:${seq}`,
}
