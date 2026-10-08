// Types shared by the pure game logic. Nothing here imports React, Firebase, or
// Capacitor (PLAN section 7). The shapes mirror the Firestore data model in
// PLAN section 5 so Turns mode can persist reducer output as room documents and
// Same Device mode can persist the same state in localStorage.

export type PlayerId = string

export type LevelId = 1 | 2 | 3
export type CardType = 'question' | 'current'
/** The modes a Current can be dealt in. */
export type PlayMode = 'live' | 'async'
/** How the room plays: Turns (async) or Live (both online). */
export type RoomMode = 'turns' | 'live'
export type Progression = 'linear' | 'mixed'
export type AfterDarkRetention = 'keep' | 'hide-after-read'

/** A question card as the game sees it. Structurally compatible with src/content PoolCard. */
export interface QuestionPoolCard {
  readonly id: string
  readonly pack: string
  readonly adult: boolean
  readonly type: 'question'
  readonly level: LevelId
  readonly text: string
  readonly tags: readonly string[]
}

/** A Current (action card). Dealt only in rooms whose mode its modes list allows. */
export interface CurrentPoolCard {
  readonly id: string
  readonly pack: string
  readonly adult: boolean
  readonly type: 'current'
  readonly level: null
  readonly modes: readonly PlayMode[]
  readonly text: string
  readonly tags: readonly string[]
}

export type PoolCard = QuestionPoolCard | CurrentPoolCard

/** Finds a pool card by id. Returns undefined for ids the pool no longer has. */
export type CardLookup = (cardId: string) => PoolCard | undefined

/** The settings the deck builder reads. */
export interface DeckSettings {
  /** Enabled pack ids. After Dark is dealt only if listed here and both players enabled it. */
  readonly packs: readonly string[]
  readonly startLevel: LevelId
  readonly progression: Progression
  /** One Current after this many questions. 0 disables Currents. */
  readonly currentEvery: number
  /** No Current inside the first this many cards of a deck. */
  readonly noCurrentsBefore: number
  readonly excludeAnswered: boolean
  readonly customCardsEnabled: boolean
  readonly mode: RoomMode
  /** Passed cards are not dealt again for this many days. */
  readonly passedCardCooldownDays: number
}

export interface RoomSettings extends DeckSettings {
  readonly passesPerDeck: number
  readonly closerSeesOpener: boolean
  /** How many cards Go lighter affects. */
  readonly lighterWindowCards: number
  readonly reminderHours: number
  readonly reminderCap: number | null
  readonly afterDarkRetention: AfterDarkRetention
}

/** The per player preferences the deck builder needs. */
export interface DeckPlayer {
  readonly afterDarkEnabled: boolean
  readonly excludeTags: readonly string[]
}

export interface Player extends DeckPlayer {
  readonly name: string
  readonly color: string
  readonly joinedAt: number
  readonly afterDarkConfirmedAt: number | null
  /** When this player last sent a turn. Drives catch up and pending follow-ups. */
  readonly lastTurnAt: number | null
  /** When this player agreed to the rules for the current deck. Reset on rebuild. */
  readonly rulesAgreedAt: number | null
}

export interface Deck {
  readonly seed: string
  /** Card ids in deal order. Go lighter may swap entries forward. */
  readonly cards: readonly string[]
  /** Index into cards of the next card to deal. */
  readonly dealt: number
  readonly builtAt: number
}

export interface Ball {
  readonly holderUid: PlayerId
  readonly since: number
  readonly lastReminderAt: number | null
  readonly remindersSent: number
}

export interface Answer {
  readonly text: string
  readonly at: number
}

export interface FollowUp {
  readonly text: string
  readonly at: number
  readonly reply: Answer | null
}

export type CardStatus = 'open' | 'closed' | 'passed'

/** One dealt card. seq is 1-based in deal order. */
export interface CardRecord {
  readonly seq: number
  readonly cardId: string
  /** Copied at deal time so later content edits never rewrite history. */
  readonly cardText: string
  readonly pack: string
  readonly adult: boolean
  readonly level: LevelId | null
  readonly type: CardType
  readonly dealtAt: number
  readonly openerUid: PlayerId
  readonly closerUid: PlayerId
  readonly answers: Readonly<Record<PlayerId, Answer>>
  /** Keyed by the asking player. At most one per player. */
  readonly followUps: Readonly<Record<PlayerId, FollowUp>>
  readonly reactions: Readonly<Record<string, readonly PlayerId[]>>
  readonly favorite: boolean
  readonly readBy: Readonly<Record<PlayerId, number>>
  readonly status: CardStatus
  /** When the card left the open state (closed or passed). */
  readonly closedAt: number | null
  /** Who passed the card, when status is passed. */
  readonly passedBy: PlayerId | null
}

export interface Paused {
  readonly by: PlayerId
  readonly at: number
  readonly note: string
}

export interface Lighter {
  /** Cards up to and including this seq are dealt one level lower. */
  readonly until: number
}

export interface RoomState {
  readonly version: number
  readonly createdAt: number
  readonly rules: readonly [string, string]
  readonly players: Readonly<Record<PlayerId, Player>>
  /** Player ids in join order. The first player holds the first ball. */
  readonly order: readonly [PlayerId, PlayerId]
  readonly settings: RoomSettings
  readonly deck: Deck
  readonly ball: Ball
  /** seq of the card currently open, or 0. */
  readonly openSeq: number
  /** Completed sends. */
  readonly turn: number
  /** Passes remaining this deck, per player. */
  readonly passes: Readonly<Record<PlayerId, number>>
  readonly lighter: Lighter | null
  readonly paused: Paused | null
  /** cardId to the time it was passed. */
  readonly passedCards: Readonly<Record<string, number>>
  /** Every dealt card, in seq order. A subcollection in Firestore. */
  readonly cards: readonly CardRecord[]
}
