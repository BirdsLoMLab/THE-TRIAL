// Firestore document shapes (PLAN section 5) and their conversion to and from
// the reducer state in src/game. Documents are validated with zod on read so a
// corrupt or older document fails loudly instead of crashing a screen.
import { z } from 'zod'
import type { CardRecord, Player, PlayerId, RoomSettings, RoomState } from '../game/types'

const answerSchema = z.object({ text: z.string(), at: z.number() })
const followUpSchema = z.object({
  text: z.string(),
  at: z.number(),
  reply: answerSchema.nullable(),
})

export const playerDocSchema = z.object({
  name: z.string(),
  color: z.string(),
  joinedAt: z.number(),
  lastSeen: z.number().nullable().default(null),
  fcmTokens: z.array(z.string()).default([]),
  quietHours: z
    .object({ start: z.string(), end: z.string(), tz: z.string() })
    .nullable()
    .default(null),
  excludeTags: z.array(z.string()).default([]),
  afterDarkEnabled: z.boolean().default(false),
  afterDarkConfirmedAt: z.number().nullable().default(null),
  lastTurnAt: z.number().nullable().default(null),
  rulesAgreedAt: z.number().nullable().default(null),
})

export const settingsDocSchema = z.object({
  packs: z.array(z.string()),
  startLevel: z.literal([1, 2, 3]),
  progression: z.enum(['linear', 'mixed']),
  currentEvery: z.number(),
  noCurrentsBefore: z.number(),
  excludeAnswered: z.boolean(),
  customCardsEnabled: z.boolean(),
  mode: z.enum(['turns', 'live']),
  passedCardCooldownDays: z.number(),
  passesPerDeck: z.number(),
  closerSeesOpener: z.boolean(),
  lighterWindowCards: z.number(),
  reminderHours: z.number(),
  reminderCap: z.number().nullable(),
  afterDarkRetention: z.enum(['keep', 'hide-after-read']),
})

export const roomDocSchema = z.object({
  createdAt: z.number(),
  version: z.number(),
  rules: z.tuple([z.string(), z.string()]),
  players: z.record(z.string(), playerDocSchema),
  order: z.array(z.string()).min(1).max(2),
  settings: settingsDocSchema,
  deck: z.object({
    seed: z.string(),
    cards: z.array(z.string()),
    dealt: z.number(),
    builtAt: z.number(),
  }),
  ball: z.object({
    holderUid: z.string(),
    since: z.number(),
    lastReminderAt: z.number().nullable(),
    remindersSent: z.number(),
  }),
  openSeq: z.number(),
  turn: z.number(),
  /** Number of dealt cards, kept on the room so a transaction can number the next one. */
  cardCount: z.number(),
  passes: z.record(z.string(), z.number()),
  lighter: z.object({ until: z.number() }).nullable(),
  paused: z.object({ by: z.string(), at: z.number(), note: z.string() }).nullable(),
  passedCards: z.record(z.string(), z.number()),
})

export const cardDocSchema = z.object({
  seq: z.number(),
  cardId: z.string(),
  cardText: z.string(),
  pack: z.string(),
  adult: z.boolean(),
  level: z.literal([1, 2, 3]).nullable(),
  type: z.enum(['question', 'current']),
  dealtAt: z.number(),
  openerUid: z.string(),
  closerUid: z.string(),
  answers: z.record(z.string(), answerSchema),
  followUps: z.record(z.string(), followUpSchema),
  reactions: z.record(z.string(), z.array(z.string())),
  favorite: z.boolean(),
  readBy: z.record(z.string(), z.number()),
  status: z.enum(['open', 'closed', 'passed']),
  closedAt: z.number().nullable(),
  passedBy: z.string().nullable(),
})

export const privateAnswerSchema = answerSchema

export type RoomDoc = z.infer<typeof roomDocSchema>
export type CardDoc = z.infer<typeof cardDocSchema>
export type PlayerDoc = z.infer<typeof playerDocSchema>

/** Card documents are keyed by zero padded seq so they sort in deal order. */
export function cardDocId(seq: number): string {
  return String(seq).padStart(4, '0')
}

export function parseRoomDoc(data: unknown): RoomDoc {
  return roomDocSchema.parse(data)
}

export function parseCardDoc(data: unknown): CardDoc {
  return cardDocSchema.parse(data)
}

/** The room document for a state. Cards live in their subcollection. */
export function toRoomDoc(state: RoomState): RoomDoc {
  return {
    createdAt: state.createdAt,
    version: state.version,
    rules: [state.rules[0], state.rules[1]],
    players: Object.fromEntries(
      Object.entries(state.players).map(([uid, player]) => [uid, toPlayerDoc(player)]),
    ),
    order: [...state.order],
    settings: { ...state.settings, packs: [...state.settings.packs] },
    deck: { ...state.deck, cards: [...state.deck.cards] },
    ball: { ...state.ball },
    openSeq: state.openSeq,
    turn: state.turn,
    cardCount: state.cards.length,
    passes: { ...state.passes },
    lighter: state.lighter ? { ...state.lighter } : null,
    paused: state.paused ? { ...state.paused } : null,
    passedCards: { ...state.passedCards },
  }
}

export function toPlayerDoc(player: Player): PlayerDoc {
  return {
    ...player,
    fcmTokens: [...player.fcmTokens],
    excludeTags: [...player.excludeTags],
    quietHours: player.quietHours ? { ...player.quietHours } : null,
  }
}

/**
 * The card document for a record. While the card is open the opener answer
 * stays out of it: it lives in cards/{seq}/private/{opener} until the close.
 */
export function toCardDoc(card: CardRecord): CardDoc {
  const answers =
    card.status === 'open'
      ? {}
      : Object.fromEntries(Object.entries(card.answers).map(([uid, a]) => [uid, { ...a }]))
  return {
    seq: card.seq,
    cardId: card.cardId,
    cardText: card.cardText,
    pack: card.pack,
    adult: card.adult,
    level: card.level,
    type: card.type,
    dealtAt: card.dealtAt,
    openerUid: card.openerUid,
    closerUid: card.closerUid,
    answers,
    followUps: Object.fromEntries(
      Object.entries(card.followUps).map(([uid, f]) => [
        uid,
        { ...f, reply: f.reply ? { ...f.reply } : null },
      ]),
    ),
    reactions: Object.fromEntries(Object.entries(card.reactions).map(([k, v]) => [k, [...v]])),
    favorite: card.favorite,
    readBy: { ...card.readBy },
    status: card.status,
    closedAt: card.closedAt,
    passedBy: card.passedBy,
  }
}

export function fromCardDoc(doc: CardDoc): CardRecord {
  return { ...doc }
}

/** True once two players are in the room. */
export function roomIsComplete(doc: RoomDoc): boolean {
  return doc.order.length === 2 && doc.order.every((uid) => uid in doc.players)
}

/**
 * Builds the reducer state from a room document and its cards. `cards` may be
 * sparse (holes for cards a transaction did not load); its length must equal
 * cardCount. Returns null while the room still waits for its second player.
 */
export function fromRoomDoc(
  doc: RoomDoc,
  cards: readonly (CardRecord | undefined)[],
): RoomState | null {
  if (!roomIsComplete(doc)) return null
  const [first, second] = doc.order as [PlayerId, PlayerId]
  const players: Record<PlayerId, Player> = {}
  for (const [uid, player] of Object.entries(doc.players)) players[uid] = player
  const settings: RoomSettings = doc.settings
  return {
    version: doc.version,
    createdAt: doc.createdAt,
    rules: doc.rules,
    players,
    order: [first, second],
    settings,
    deck: doc.deck,
    ball: doc.ball,
    openSeq: doc.openSeq,
    turn: doc.turn,
    passes: doc.passes,
    lighter: doc.lighter,
    paused: doc.paused,
    passedCards: doc.passedCards,
    cards: cards as readonly CardRecord[],
  }
}
