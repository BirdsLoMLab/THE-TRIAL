// Online rooms (PLAN sections 5 and 6): one anonymous uid per device, one room
// at a time, state streamed from Firestore. Only the room id and the drafts
// are kept on the device; everything else comes from the listeners.
import type { Unsubscribe } from 'firebase/firestore'
import { nanoid } from 'nanoid'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { getContent } from '../content'
import { buildDeck } from '../game/deck'
import { deckHistory, type Action } from '../game/turns'
import type { RoomSettings, RoomState } from '../game/types'
import { cancelBackupReminders, scheduleBackupReminders } from '../notifications/localReminders'
import { registerForPush, type PushState } from '../notifications/push'
import { ensureSignedIn } from '../sync/auth'
import { getFirebaseServices } from '../sync/firebase'
import {
  addPushToken,
  createOnlineRoom,
  joinOnlineRoom,
  runRoomAction,
  subscribeRoom,
  SyncError,
  touchPresence,
  type RoomSnapshot,
} from '../sync/roomRepo'
import { clock } from './clock'
import { cardLookup, defaultRoomSettings } from './sameDevice'

export const ONLINE_STORAGE_KEY = 'fathoms.online'
export const PRESENCE_INTERVAL_MS = 60_000
/** A partner seen within this window counts as online. */
export const PRESENCE_WINDOW_MS = 2 * PRESENCE_INTERVAL_MS + 30_000

export type OnlineStatus = 'idle' | 'connecting' | 'live' | 'error' | 'unavailable'

export interface PlayerInput {
  readonly name: string
  readonly color: string
}

export interface OnlineData {
  readonly uid: string | null
  readonly roomId: string | null
  readonly status: OnlineStatus
  readonly error: string | null
  readonly snapshot: RoomSnapshot | null
  readonly busy: boolean
  readonly reveal: number | null
  readonly drafts: Readonly<Record<string, string>>
  /** Push registration on this device: unknown until asked. */
  readonly pushState: PushState | 'unknown'
}

export interface OnlineActions {
  /** Signs in and, when a room id is remembered, subscribes to it. Safe to call more than once. */
  connect(): Promise<void>
  createRoom(input: PlayerInput, settings?: Partial<RoomSettings>): Promise<string>
  joinRoom(roomId: string, input: PlayerInput): Promise<void>
  openRoom(roomId: string): Promise<void>
  leaveRoom(): void
  runAction(action: Action): Promise<void>
  sendTurn(input: {
    close?: string | undefined
    open?: string | undefined
    replies?: readonly { seq: number; text: string }[] | undefined
  }): Promise<void>
  rebuildDeck(): Promise<void>
  finishReveal(): void
  setDraft(key: string, text: string): void
  /** Asks for notification permission and registers this device for push. Safe to call again. */
  enablePush(): Promise<PushState>
}

export type OnlineStore = OnlineData & OnlineActions

const EMPTY: OnlineData = {
  uid: null,
  roomId: null,
  status: 'idle',
  error: null,
  snapshot: null,
  busy: false,
  reveal: null,
  drafts: {},
  pushState: 'unknown',
}

let unsubscribe: Unsubscribe | null = null
let presenceTimer: ReturnType<typeof setInterval> | null = null
let signingIn: Promise<string> | null = null
let pushRegistered = false
/** The ball holder seen last, to schedule and cancel the local reminder backup on changes. */
let lastHolderKey: string | null = null

/**
 * Keeps the local reminder backup in step with the ball: scheduled when the
 * ball lands on this device, cancelled when it leaves (PLAN 4.5).
 */
export async function syncBackupReminders(
  roomId: string,
  uid: string,
  state: RoomState,
  now: number,
): Promise<void> {
  const mine = state.ball.holderUid === uid && !state.paused
  const key = `${roomId}:${state.ball.holderUid}:${state.ball.since}:${mine}`
  if (key === lastHolderKey) return
  lastHolderKey = key
  if (mine) {
    const partner = state.order.find((id) => id !== uid)
    const partnerName = partner ? (state.players[partner]?.name ?? 'Your partner') : 'Your partner'
    await scheduleBackupReminders(roomId, partnerName, state.ball.since, now)
  } else {
    await cancelBackupReminders(roomId)
  }
}

function services() {
  const found = getFirebaseServices()
  if (!found)
    throw new SyncError(
      'unknown',
      'No Firebase config on this build. Rooms need .env.local (README, Firebase).',
    )
  return found
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function readyState(snapshot: RoomSnapshot | null): RoomState | null {
  return snapshot?.kind === 'ready' ? snapshot.state : null
}

export const useOnline = create<OnlineStore>()(
  persist(
    (set, get) => {
      function stopRoom() {
        unsubscribe?.()
        unsubscribe = null
        if (presenceTimer) clearInterval(presenceTimer)
        presenceTimer = null
      }

      async function signIn(): Promise<string> {
        const known = get().uid
        if (known) return known
        signingIn ??= ensureSignedIn(services().auth).then((uid) => {
          set({ uid })
          return uid
        })
        try {
          return await signingIn
        } finally {
          signingIn = null
        }
      }

      function startRoom(roomId: string, uid: string) {
        stopRoom()
        const { db } = services()
        set({ roomId, status: 'connecting', error: null, snapshot: null, reveal: null })
        unsubscribe = subscribeRoom(db, roomId, uid, {
          onChange: (snapshot) => {
            set({ snapshot, status: 'live', error: null })
            const state = readyState(snapshot)
            if (state) {
              void syncBackupReminders(roomId, uid, state, clock.now()).catch(() => undefined)
              if (!pushRegistered)
                void get()
                  .enablePush()
                  .catch(() => undefined)
            }
          },
          onError: (error) => set({ status: 'error', error: errorText(error) }),
        })
        const beat = () => {
          if (readyState(get().snapshot))
            void touchPresence(db, roomId, uid, clock.now()).catch(() => undefined)
        }
        presenceTimer = setInterval(beat, PRESENCE_INTERVAL_MS)
        setTimeout(beat, 1500)
      }

      return {
        ...EMPTY,

        async connect() {
          if (!getFirebaseServices()) {
            set({ status: 'unavailable', error: 'No Firebase config on this build.' })
            return
          }
          try {
            const uid = await signIn()
            const roomId = get().roomId
            if (roomId && !unsubscribe) startRoom(roomId, uid)
            else if (!roomId) set({ status: 'idle' })
          } catch (error) {
            set({ status: 'error', error: errorText(error) })
          }
        },

        async createRoom(input, settings) {
          const uid = await signIn()
          const { db } = services()
          const { shared } = getContent()
          const roomId = await createOnlineRoom(db, {
            uid,
            name: input.name,
            color: input.color,
            settings: { ...defaultRoomSettings(), ...settings },
            rules: shared.rules,
            pool: getContent().cards,
            seed: nanoid(),
            now: clock.now(),
          })
          startRoom(roomId, uid)
          return roomId
        },

        async joinRoom(roomId, input) {
          const uid = await signIn()
          const { db } = services()
          await joinOnlineRoom(db, roomId, {
            uid,
            name: input.name,
            color: input.color,
            now: clock.now(),
          })
          startRoom(roomId, uid)
        },

        async openRoom(roomId) {
          const uid = await signIn()
          if (get().roomId === roomId && unsubscribe) return
          startRoom(roomId, uid)
        },

        leaveRoom() {
          stopRoom()
          set({
            roomId: null,
            snapshot: null,
            status: get().uid ? 'idle' : get().status,
            error: null,
            reveal: null,
          })
        },

        async runAction(action) {
          const { roomId } = get()
          if (!roomId) throw new SyncError('not-found', 'No room is open.')
          set({ busy: true })
          try {
            await runRoomAction(services().db, roomId, action, cardLookup())
          } finally {
            set({ busy: false })
          }
        },

        async sendTurn(input) {
          const state = readyState(get().snapshot)
          const uid = get().uid
          if (!state || !uid) throw new SyncError('not-found', 'No room is open.')
          const closing = state.openSeq
          await get().runAction({
            type: 'send',
            by: uid,
            at: clock.now(),
            closeAnswer: input.close,
            openAnswer: input.open,
            replies: input.replies,
          })
          const roomId = get().roomId ?? ''
          const drafts = Object.fromEntries(
            Object.entries(get().drafts).filter(([key]) => !key.startsWith(`${roomId}:`)),
          )
          set({ reveal: closing > 0 ? closing : null, drafts })
        },

        async rebuildDeck() {
          const state = readyState(get().snapshot)
          const uid = get().uid
          if (!state || !uid) throw new SyncError('not-found', 'No room is open.')
          const now = clock.now()
          const deck = buildDeck({
            settings: state.settings,
            players: state.order.map((id) => {
              const player = state.players[id]
              return {
                afterDarkEnabled: player?.afterDarkEnabled ?? false,
                excludeTags: player?.excludeTags ?? [],
              }
            }),
            pool: getContent().cards,
            history: deckHistory(state),
            seed: nanoid(),
            now,
          })
          await get().runAction({ type: 'rebuildDeck', by: uid, at: now, deck })
        },

        finishReveal() {
          set({ reveal: null })
        },

        setDraft(key, text) {
          const drafts = { ...get().drafts }
          if (text) drafts[key] = text
          else delete drafts[key]
          set({ drafts })
        },

        async enablePush() {
          pushRegistered = true
          const state = await registerForPush({
            onToken: (token) => {
              const { roomId, uid } = get()
              if (roomId && uid)
                void addPushToken(services().db, roomId, uid, token).catch(() => undefined)
            },
            onError: (error) => set({ error: error.message }),
          })
          if (state === 'denied') pushRegistered = false
          set({ pushState: state })
          return state
        },
      }
    },
    {
      name: ONLINE_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ roomId: state.roomId, drafts: state.drafts }),
    },
  ),
)

/** True when the partner's presence stamp is recent. */
export function partnerIsOnline(state: RoomState, viewer: string, now: number): boolean {
  const partner = state.order.find((uid) => uid !== viewer)
  const seen = partner ? state.players[partner]?.lastSeen : null
  return typeof seen === 'number' && now - seen <= PRESENCE_WINDOW_MS
}

/** The invite link for a room, as a hash route on this origin. */
export function inviteUrlFor(
  roomId: string,
  origin = window.location.origin + window.location.pathname,
): string {
  return `${origin}#/join/${roomId}`
}
