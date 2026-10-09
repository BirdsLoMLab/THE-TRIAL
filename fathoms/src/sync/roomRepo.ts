// Online rooms on Firestore (PLAN section 5). Every game action runs the pure
// reducer inside one transaction that checks the room version, then writes the
// room document and the card documents that changed. Blind close is kept by
// the private subcollection: an open card's opener answer is written there and
// copied into the card by the opener's own client once the card is closed.
import { FirebaseError } from 'firebase/app'
import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  writeBatch,
  type DocumentReference,
  type Firestore,
  type Transaction,
  type Unsubscribe,
} from 'firebase/firestore'
import { nanoid } from 'nanoid'
import { buildDeck } from '../game/deck'
import { newPlayer, reduce, validateSettings, type Action } from '../game/turns'
import type {
  Answer,
  CardLookup,
  CardRecord,
  CustomCard,
  PlayerId,
  PoolCard,
  RoomSettings,
  RoomState,
} from '../game/types'
import {
  cardDocId,
  fromRoomDoc,
  parseCardDoc,
  parseCustomCardDoc,
  parseRoomDoc,
  roomIsComplete,
  toCardDoc,
  toPlayerDoc,
  toRoomDoc,
  type CardDoc,
  type RoomDoc,
} from './model'

export const ROOM_ID_LENGTH = 20

export type SyncErrorCode = 'not-found' | 'full' | 'not-member' | 'invalid' | 'denied' | 'unknown'

export class SyncError extends Error {
  readonly code: SyncErrorCode

  constructor(code: SyncErrorCode, message: string) {
    super(message)
    this.name = 'SyncError'
    this.code = code
  }
}

/** Maps a Firestore permission error to a SyncError; rethrows everything else as is. */
export function asSyncError(error: unknown): Error {
  if (error instanceof SyncError) return error
  if (error instanceof FirebaseError) {
    if (error.code === 'permission-denied')
      return new SyncError('denied', 'This room is not yours to read or change.')
    if (error.code === 'not-found') return new SyncError('not-found', 'That room does not exist.')
  }
  return error instanceof Error ? error : new Error(String(error))
}

export function roomRef(db: Firestore, roomId: string) {
  return doc(db, 'rooms', roomId)
}

export function cardRef(db: Firestore, roomId: string, seq: number) {
  return doc(db, 'rooms', roomId, 'cards', cardDocId(seq))
}

export function privateRef(db: Firestore, roomId: string, seq: number, uid: PlayerId) {
  return doc(db, 'rooms', roomId, 'cards', cardDocId(seq), 'private', uid)
}

export function cardsQuery(db: Firestore, roomId: string) {
  return query(collection(db, 'rooms', roomId, 'cards'), orderBy('seq'))
}

export interface CreateOnlineRoomInput {
  readonly uid: PlayerId
  readonly name: string
  readonly color: string
  readonly settings: RoomSettings
  readonly rules: readonly [string, string]
  readonly pool: readonly PoolCard[]
  readonly seed: string
  readonly now: number
  readonly roomId?: string | undefined
}

/** Creates a room with the creator as its only player and a deck built for two players with default preferences. */
export async function createOnlineRoom(
  db: Firestore,
  input: CreateOnlineRoomInput,
): Promise<string> {
  const problems = validateSettings(input.settings)
  if (problems.length) throw new SyncError('invalid', problems.join('; '))
  const roomId = input.roomId ?? nanoid(ROOM_ID_LENGTH)
  const player = newPlayer({ name: input.name, color: input.color }, input.now)
  const deck = buildDeck({
    settings: input.settings,
    players: [player, { afterDarkEnabled: false, excludeTags: [] }],
    pool: input.pool,
    history: { answeredCardIds: new Set(), excludedCardIds: new Set(), passedCards: {} },
    seed: input.seed,
    now: input.now,
  })
  const room: RoomDoc = {
    createdAt: input.now,
    version: 1,
    rules: [input.rules[0], input.rules[1]],
    players: { [input.uid]: toPlayerDoc(player) },
    order: [input.uid],
    settings: { ...input.settings, packs: [...input.settings.packs] },
    deck: { ...deck, cards: [...deck.cards] },
    ball: { holderUid: input.uid, since: input.now, lastReminderAt: null, remindersSent: 0 },
    openSeq: 0,
    turn: 0,
    cardCount: 0,
    passes: { [input.uid]: input.settings.passesPerDeck },
    lighter: null,
    paused: null,
    nudge: null,
    deleteRequests: {},
    passedCards: {},
  }
  try {
    await setDoc(roomRef(db, roomId), room)
  } catch (error) {
    throw asSyncError(error)
  }
  return roomId
}

export interface JoinOnlineRoomInput {
  readonly uid: PlayerId
  readonly name: string
  readonly color: string
  readonly now: number
}

/** Adds the second player. Resolves to 'already-member' when the uid is already in the room. */
export async function joinOnlineRoom(
  db: Firestore,
  roomId: string,
  input: JoinOnlineRoomInput,
): Promise<'joined' | 'already-member'> {
  const player = newPlayer({ name: input.name, color: input.color }, input.now)
  try {
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(roomRef(db, roomId))
      if (!snap.exists()) throw new SyncError('not-found', 'That room does not exist.')
      const room = parseRoomDoc(snap.data())
      if (input.uid in room.players) return 'already-member'
      if (room.order.length >= 2) throw new SyncError('full', 'That room already has two players.')
      tx.update(roomRef(db, roomId), {
        [`players.${input.uid}`]: toPlayerDoc(player),
        order: [...room.order, input.uid],
        [`passes.${input.uid}`]: room.settings.passesPerDeck,
        version: room.version + 1,
      })
      return 'joined'
    })
  } catch (error) {
    const mapped = asSyncError(error)
    // A full room is unreadable to outsiders, which surfaces as a permission error.
    if (mapped instanceof SyncError && mapped.code === 'denied') {
      throw new SyncError('full', 'That room is full or does not exist.')
    }
    throw mapped
  }
}

/** Seqs an action needs loaded inside its transaction, besides the open card. */
function seqsFor(action: Action): number[] {
  switch (action.type) {
    case 'send':
      return (action.replies ?? []).map((reply) => reply.seq)
    case 'askFollowUp':
    case 'replyFollowUp':
    case 'react':
    case 'favorite':
    case 'markRead':
      return [action.seq]
    default:
      return []
  }
}

async function loadCards(
  tx: Transaction,
  db: Firestore,
  roomId: string,
  seqs: Iterable<number>,
): Promise<Map<number, CardDoc>> {
  const refs: Array<[number, DocumentReference]> = []
  for (const seq of new Set(seqs)) if (seq > 0) refs.push([seq, cardRef(db, roomId, seq)])
  const snaps = await Promise.all(refs.map(([, ref]) => tx.get(ref)))
  const cards = new Map<number, CardDoc>()
  snaps.forEach((snap, index) => {
    if (snap.exists()) cards.set(refs[index]![0], parseCardDoc(snap.data()))
  })
  return cards
}

/**
 * A card list with real holes for the cards the transaction did not load.
 * The reducer only maps over the list (holes are skipped) and appends to it,
 * so a hole never reaches a property read. Do not fill the holes with
 * undefined: map would visit them.
 */
function sparseCards(count: number, loaded: Map<number, CardDoc>): (CardRecord | undefined)[] {
  const cards: (CardRecord | undefined)[] = new Array<CardRecord | undefined>(count)
  for (const [seq, card] of loaded) if (seq <= count) cards[seq - 1] = { ...card }
  return cards
}

/**
 * Runs one reducer action as a Firestore transaction. Reads the room and the
 * cards the action touches, applies the reducer, and writes the room, the
 * changed cards, and the private answer of a newly opened card.
 */
export async function runRoomAction(
  db: Firestore,
  roomId: string,
  action: Action,
  lookup: CardLookup,
): Promise<void> {
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(roomRef(db, roomId))
      if (!snap.exists()) throw new SyncError('not-found', 'That room does not exist.')
      const room = parseRoomDoc(snap.data())
      if (!roomIsComplete(room))
        throw new SyncError('invalid', 'The room is still waiting for the second player.')
      const loaded = await loadCards(tx, db, roomId, [room.openSeq, ...seqsFor(action)])
      const state = fromRoomDoc(room, sparseCards(room.cardCount, loaded))
      if (!state) throw new SyncError('invalid', 'The room is still waiting for the second player.')
      const next = reduce(state, action, lookup)

      tx.set(roomRef(db, roomId), toRoomDoc(next))
      next.cards.forEach((card, index) => {
        if (!card) return
        const seq = index + 1
        const before = loaded.get(seq)
        const after = toCardDoc(card)
        if (before && JSON.stringify(before) === JSON.stringify(after)) return
        tx.set(cardRef(db, roomId, seq), after)
        const own = card.status === 'open' ? card.answers[card.openerUid] : undefined
        if (!before && own)
          tx.set(privateRef(db, roomId, seq, card.openerUid), { text: own.text, at: own.at })
      })
    })
  } catch (error) {
    throw asSyncError(error)
  }
}

/** Presence heartbeat: stamps players.{uid}.lastSeen with a plain update, outside the version sequence. */
export async function touchPresence(
  db: Firestore,
  roomId: string,
  uid: PlayerId,
  now: number,
): Promise<void> {
  try {
    await updateDoc(roomRef(db, roomId), { [`players.${uid}.lastSeen`]: now })
  } catch (error) {
    throw asSyncError(error)
  }
}

/** Adds a device push token to the player's list (PLAN 5: players[uid].fcmTokens). The functions prune dead ones. */
export async function addPushToken(
  db: Firestore,
  roomId: string,
  uid: PlayerId,
  token: string,
): Promise<void> {
  try {
    await updateDoc(roomRef(db, roomId), { [`players.${uid}.fcmTokens`]: arrayUnion(token) })
  } catch (error) {
    throw asSyncError(error)
  }
}

export function customCardsQuery(db: Firestore, roomId: string) {
  return query(collection(db, 'rooms', roomId, 'customCards'), orderBy('createdAt'))
}

/** Live list of the room's custom cards, in creation order. */
export function subscribeCustomCards(
  db: Firestore,
  roomId: string,
  onChange: (cards: CustomCard[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    customCardsQuery(db, roomId),
    (snap) => {
      try {
        onChange(snap.docs.map((d) => parseCustomCardDoc(d.id, d.data())))
      } catch (error) {
        onError(asSyncError(error))
      }
    },
    (error) => onError(asSyncError(error)),
  )
}

export async function addCustomCard(
  db: Firestore,
  roomId: string,
  card: CustomCard,
): Promise<void> {
  const { id, ...data } = card
  try {
    await setDoc(doc(db, 'rooms', roomId, 'customCards', id), data)
  } catch (error) {
    throw asSyncError(error)
  }
}

export async function deleteCustomCard(db: Firestore, roomId: string, id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'rooms', roomId, 'customCards', id))
  } catch (error) {
    throw asSyncError(error)
  }
}

/**
 * Delete Room (PLAN 4.8): removes every card, private answer, custom card, and
 * the room document itself. The caller checks that both players confirmed.
 */
export async function deleteRoom(db: Firestore, roomId: string): Promise<void> {
  try {
    const refs = []
    const cards = await getDocs(collection(db, 'rooms', roomId, 'cards'))
    for (const card of cards.docs) {
      const privates = await getDocs(collection(card.ref, 'private'))
      refs.push(...privates.docs.map((d) => d.ref))
      refs.push(card.ref)
    }
    const customs = await getDocs(collection(db, 'rooms', roomId, 'customCards'))
    refs.push(...customs.docs.map((d) => d.ref))
    for (let i = 0; i < refs.length; i += 400) {
      const batch = writeBatch(db)
      for (const ref of refs.slice(i, i + 400)) batch.delete(ref)
      await batch.commit()
    }
    await deleteDoc(roomRef(db, roomId))
  } catch (error) {
    throw asSyncError(error)
  }
}

export type RoomSnapshot =
  | { readonly kind: 'missing' }
  | { readonly kind: 'pending'; readonly doc: RoomDoc }
  | { readonly kind: 'ready'; readonly state: RoomState }

export interface RoomSubscriptionHandlers {
  onChange(snapshot: RoomSnapshot): void
  onError(error: Error): void
}

/**
 * Live view of a room for one player. Emits a consistent state only when the
 * cards collection has caught up with the room's cardCount. Fills in private
 * answers the player may see (their own on the open card, the partner's once
 * a card closed or when closerSeesOpener is on) and copies the player's own
 * private answer into closed cards so the journal is complete for both.
 */
export function subscribeRoom(
  db: Firestore,
  roomId: string,
  uid: PlayerId,
  handlers: RoomSubscriptionHandlers,
): Unsubscribe {
  let room: RoomDoc | null = null
  let roomLoaded = false
  let cards: CardDoc[] | null = null
  const privateAnswers = new Map<number, Record<PlayerId, Answer>>()
  const fetched = new Set<string>()
  const privateUnsubs = new Map<string, Unsubscribe>()
  let closed = false

  function fail(error: unknown) {
    if (closed) return
    handlers.onError(asSyncError(error))
  }

  function remember(seq: number, owner: PlayerId, answer: Answer | null) {
    const entry = privateAnswers.get(seq) ?? {}
    if (answer) entry[owner] = answer
    privateAnswers.set(seq, entry)
  }

  function watchPrivate(seq: number, owner: PlayerId) {
    const key = `${seq}:${owner}`
    if (privateUnsubs.has(key)) return
    const stop = onSnapshot(
      privateRef(db, roomId, seq, owner),
      (snap) => {
        if (closed) return
        const data = snap.data()
        remember(seq, owner, data ? { text: String(data.text), at: Number(data.at) } : null)
        emit()
      },
      () => {
        // Not readable (yet). The parent card closing will let a later fetch through.
        privateUnsubs.get(key)?.()
        privateUnsubs.delete(key)
      },
    )
    privateUnsubs.set(key, stop)
  }

  function stopPrivateExcept(keep: Set<string>) {
    for (const [key, stop] of privateUnsubs) {
      if (!keep.has(key)) {
        stop()
        privateUnsubs.delete(key)
      }
    }
  }

  async function fetchPrivate(seq: number, owner: PlayerId, materialize: boolean) {
    const key = `${seq}:${owner}`
    if (fetched.has(key)) return
    fetched.add(key)
    try {
      const snap = await getDoc(privateRef(db, roomId, seq, owner))
      if (closed) return
      const data = snap.data()
      const answer = data ? { text: String(data.text), at: Number(data.at) } : null
      remember(seq, owner, answer)
      emit()
      if (materialize && answer) {
        await updateDoc(cardRef(db, roomId, seq), { [`answers.${owner}`]: answer })
      }
    } catch {
      fetched.delete(key)
    }
  }

  function reconcile() {
    if (!room || !cards || !roomIsComplete(room)) return
    const partner = room.order.find((id) => id !== uid) ?? uid
    const keep = new Set<string>()
    for (const card of cards) {
      if (card.status === 'open') {
        if (card.openerUid === uid) {
          keep.add(`${card.seq}:${uid}`)
          watchPrivate(card.seq, uid)
        } else if (room.settings.closerSeesOpener) {
          keep.add(`${card.seq}:${partner}`)
          watchPrivate(card.seq, partner)
        }
        continue
      }
      if (card.answers[card.openerUid]) continue
      if (card.openerUid === uid) void fetchPrivate(card.seq, uid, true)
      else if (card.status === 'closed' || card.passedBy === partner)
        void fetchPrivate(card.seq, partner, false)
    }
    stopPrivateExcept(keep)
  }

  function emit() {
    if (closed || !roomLoaded) return
    if (!room) {
      handlers.onChange({ kind: 'missing' })
      return
    }
    if (!roomIsComplete(room)) {
      handlers.onChange({ kind: 'pending', doc: room })
      return
    }
    if (!cards || cards.length !== room.cardCount) return
    const merged: CardRecord[] = cards.map((card) => {
      const extra = privateAnswers.get(card.seq)
      return extra ? { ...card, answers: { ...extra, ...card.answers } } : { ...card }
    })
    const state = fromRoomDoc(room, merged)
    if (state) handlers.onChange({ kind: 'ready', state })
  }

  let stopCards: Unsubscribe | null = null

  // Cards are readable by members only, so the collection is watched once the
  // room document shows a complete room. A missing or pending room keeps the
  // cards listener off instead of surfacing a permission error.
  function syncCardsListener() {
    const wanted = room !== null && roomIsComplete(room) && uid in room.players
    if (wanted && !stopCards) {
      stopCards = onSnapshot(
        cardsQuery(db, roomId),
        (snap) => {
          if (closed) return
          try {
            cards = snap.docs.map((d) => parseCardDoc(d.data()))
            reconcile()
            emit()
          } catch (error) {
            fail(error)
          }
        },
        fail,
      )
    } else if (!wanted && stopCards) {
      stopCards()
      stopCards = null
      cards = null
    }
  }

  const stopRoom = onSnapshot(
    roomRef(db, roomId),
    (snap) => {
      if (closed) return
      try {
        room = snap.exists() ? parseRoomDoc(snap.data()) : null
        roomLoaded = true
        syncCardsListener()
        reconcile()
        emit()
      } catch (error) {
        fail(error)
      }
    },
    fail,
  )

  return () => {
    closed = true
    stopRoom()
    stopCards?.()
    for (const stop of privateUnsubs.values()) stop()
    privateUnsubs.clear()
  }
}
