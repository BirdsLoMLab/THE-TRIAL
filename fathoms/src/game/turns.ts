// Turn reducer for Turns mode and Same Device mode (PLAN sections 4.2, 4.4,
// 4.6, 4.7). Pure: every action carries its own timestamp, the card pool comes
// in as a lookup, and the state is never mutated. Turns mode persists the
// result through Firestore transactions; Same Device mode through localStorage.
import type { DeckHistory } from './deck'
import type {
  Answer,
  CardRecord,
  CardLookup,
  Deck,
  FollowUp,
  Lighter,
  Paused,
  Player,
  PlayerId,
  PoolCard,
  RoomSettings,
  RoomState,
} from './types'

export type GameErrorCode =
  | 'unknown-player'
  | 'unknown-action'
  | 'unknown-card'
  | 'not-holder'
  | 'paused'
  | 'not-paused'
  | 'already-paused'
  | 'rules-not-agreed'
  | 'nothing-to-send'
  | 'missing-answer'
  | 'unexpected-answer'
  | 'no-passes'
  | 'nothing-to-pass'
  | 'card-not-found'
  | 'card-not-closed'
  | 'no-follow-ups-on-currents'
  | 'follow-up-exists'
  | 'follow-up-missing'
  | 'already-replied'
  | 'empty-text'
  | 'invalid-settings'
  | 'invalid-player'
  | 'invalid-room'
  | 'invalid-deck'

/** Thrown for any action the rules do not allow. The UI shows `message`; Firestore transactions abort. */
export class GameError extends Error {
  readonly code: GameErrorCode

  constructor(code: GameErrorCode, message: string) {
    super(message)
    this.name = 'GameError'
    this.code = code
  }
}

function fail(code: GameErrorCode, message: string): never {
  throw new GameError(code, message)
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/
const MAX_NAME_LENGTH = 40
const LEVEL_IDS: readonly number[] = [1, 2, 3]

export interface NewPlayer {
  readonly uid: PlayerId
  readonly name: string
  readonly color: string
}

export interface CreateRoomInput {
  readonly createdAt: number
  readonly rules: readonly [string, string]
  /** Exactly two. The first holds the first ball. */
  readonly players: readonly NewPlayer[]
  readonly settings: RoomSettings
  readonly deck: Deck
}

export interface Reply {
  readonly seq: number
  readonly text: string
}

export type Action =
  | { readonly type: 'agreeRules'; readonly by: PlayerId; readonly at: number }
  | {
      readonly type: 'send'
      readonly by: PlayerId
      readonly at: number
      readonly closeAnswer?: string | undefined
      readonly openAnswer?: string | undefined
      readonly replies?: readonly Reply[] | undefined
    }
  | {
      readonly type: 'pass'
      readonly by: PlayerId
      readonly at: number
      readonly target: 'close' | 'open'
    }
  | { readonly type: 'lighter'; readonly by: PlayerId; readonly at: number }
  | {
      readonly type: 'pause'
      readonly by: PlayerId
      readonly at: number
      readonly note?: string | undefined
    }
  | { readonly type: 'resume'; readonly by: PlayerId; readonly at: number }
  | {
      readonly type: 'rebuildDeck'
      readonly by: PlayerId
      readonly at: number
      readonly deck: Deck
    }
  | {
      readonly type: 'askFollowUp'
      readonly by: PlayerId
      readonly at: number
      readonly seq: number
      readonly text: string
    }
  | {
      readonly type: 'replyFollowUp'
      readonly by: PlayerId
      readonly at: number
      readonly seq: number
      readonly text: string
    }
  | {
      readonly type: 'updateSettings'
      readonly by: PlayerId
      readonly at: number
      readonly patch: Partial<RoomSettings>
    }
  | {
      readonly type: 'updatePlayer'
      readonly by: PlayerId
      readonly at: number
      readonly patch: { readonly name?: string | undefined; readonly color?: string | undefined }
    }

export interface CatchUp {
  /** The card the holder opened last turn, now closed or passed by the partner. */
  readonly card: CardRecord
  readonly canAskFollowUp: boolean
}

export interface PendingFollowUp {
  readonly card: CardRecord
  readonly askedBy: PlayerId
  readonly followUp: FollowUp
}

export interface CloseStep {
  readonly card: CardRecord
  /** The opener answer, only when settings.closerSeesOpener is on. */
  readonly openerAnswer: string | null
}

export interface OpenStep {
  readonly seq: number
  readonly card: PoolCard
}

/** Everything the ball holder sees on the Turn screen, in order. */
export interface TurnView {
  readonly holder: PlayerId
  readonly partner: PlayerId
  readonly turn: number
  readonly paused: Paused | null
  readonly rulesAgreed: boolean
  readonly catchUp: CatchUp | null
  readonly pendingFollowUps: readonly PendingFollowUp[]
  readonly close: CloseStep | null
  readonly open: OpenStep | null
  /** No card left to deal. The holder may still have a card to close. */
  readonly deckExhausted: boolean
  readonly passesLeft: number
  readonly lighter: Lighter | null
  readonly canSend: boolean
}

export interface NextDeal {
  /** Index into deck.cards of the card that will be dealt. */
  readonly index: number
  readonly seq: number
  readonly card: PoolCard
}

export type RoomPhase = 'paused' | 'rules' | 'exhausted' | 'turn'

// Validation helpers

function isInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
}

function isBool(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

/** Returns one problem per invalid field, or an empty list. */
export function validateSettings(s: RoomSettings): string[] {
  const problems: string[] = []
  const packsOk =
    Array.isArray(s.packs) &&
    s.packs.length > 0 &&
    s.packs.every((p) => typeof p === 'string' && p.length > 0)
  if (!packsOk) problems.push('packs: at least one pack id')
  if (!LEVEL_IDS.includes(s.startLevel)) problems.push('startLevel: 1, 2, or 3')
  if (s.progression !== 'linear' && s.progression !== 'mixed')
    problems.push('progression: linear or mixed')
  if (!isInt(s.currentEvery) || s.currentEvery < 0)
    problems.push('currentEvery: a whole number, 0 or more')
  if (!isInt(s.noCurrentsBefore) || s.noCurrentsBefore < 0)
    problems.push('noCurrentsBefore: a whole number, 0 or more')
  if (!isInt(s.passesPerDeck) || s.passesPerDeck < 0)
    problems.push('passesPerDeck: a whole number, 0 or more')
  if (!isInt(s.passedCardCooldownDays) || s.passedCardCooldownDays < 0)
    problems.push('passedCardCooldownDays: a whole number, 0 or more')
  if (!isInt(s.lighterWindowCards) || s.lighterWindowCards < 1)
    problems.push('lighterWindowCards: a whole number, 1 or more')
  if (typeof s.reminderHours !== 'number' || !(s.reminderHours > 0))
    problems.push('reminderHours: more than 0')
  if (s.reminderCap !== null && (!isInt(s.reminderCap) || s.reminderCap < 1))
    problems.push('reminderCap: null or 1 or more')
  if (s.mode !== 'turns' && s.mode !== 'live') problems.push('mode: turns or live')
  if (s.afterDarkRetention !== 'keep' && s.afterDarkRetention !== 'hide-after-read')
    problems.push('afterDarkRetention: keep or hide-after-read')
  if (!isBool(s.excludeAnswered)) problems.push('excludeAnswered: true or false')
  if (!isBool(s.customCardsEnabled)) problems.push('customCardsEnabled: true or false')
  if (!isBool(s.closerSeesOpener)) problems.push('closerSeesOpener: true or false')
  return problems
}

function cleanName(name: unknown): string {
  const trimmed = typeof name === 'string' ? name.trim() : ''
  if (!trimmed || trimmed.length > MAX_NAME_LENGTH) {
    fail('invalid-player', `a name is 1 to ${MAX_NAME_LENGTH} characters`)
  }
  return trimmed
}

function cleanColor(color: unknown): string {
  if (typeof color !== 'string' || !HEX_COLOR.test(color))
    fail('invalid-player', 'a color is a 6 digit hex value')
  return color
}

function cleanText(text: string | undefined, code: GameErrorCode): string {
  const trimmed = text?.trim() ?? ''
  if (!trimmed)
    fail(code, code === 'missing-answer' ? 'write an answer first' : 'write something first')
  return trimmed
}

// State helpers

function requirePlayer(state: RoomState, uid: PlayerId): Player {
  const player = state.players[uid]
  if (!player) fail('unknown-player', 'not a player in this room')
  return player
}

/** The other player. */
export function partnerOf(state: RoomState, uid: PlayerId): PlayerId {
  requirePlayer(state, uid)
  return state.order[0] === uid ? state.order[1] : state.order[0]
}

/** The dealt card with this seq, if any. */
export function cardBySeq(state: RoomState, seq: number): CardRecord | undefined {
  return isInt(seq) && seq >= 1 ? state.cards[seq - 1] : undefined
}

function requireCard(state: RoomState, seq: number): CardRecord {
  const card = cardBySeq(state, seq)
  if (!card) fail('card-not-found', `no card ${seq} in this room`)
  return card
}

function openCard(state: RoomState): CardRecord | null {
  return state.openSeq > 0 ? (cardBySeq(state, state.openSeq) ?? null) : null
}

function requirePoolCard(lookup: CardLookup, cardId: string | undefined): PoolCard {
  const card = cardId === undefined ? undefined : lookup(cardId)
  if (!card) fail('unknown-card', `card ${cardId} is not in the pool`)
  return card
}

function replaceCard(cards: readonly CardRecord[], card: CardRecord): CardRecord[] {
  return cards.map((c) => (c.seq === card.seq ? card : c))
}

function patchPlayer(state: RoomState, uid: PlayerId, patch: Partial<Player>): RoomState {
  const player = requirePlayer(state, uid)
  return { ...state, players: { ...state.players, [uid]: { ...player, ...patch } } }
}

/** Who still has to agree to the rules for this deck, in join order. */
export function playersNeedingRules(state: RoomState): PlayerId[] {
  return state.order.filter((uid) => state.players[uid]?.rulesAgreedAt === null)
}

/** Which screen the room is on for the ball holder. */
export function roomPhase(state: RoomState): RoomPhase {
  if (state.paused) return 'paused'
  if (requirePlayer(state, state.ball.holderUid).rulesAgreedAt === null) return 'rules'
  if (state.openSeq === 0 && state.deck.dealt >= state.deck.cards.length) return 'exhausted'
  return 'turn'
}

/** What a rebuild must exclude: answered cards, the open card, and passed cards. */
export function deckHistory(state: RoomState): DeckHistory {
  return {
    answeredCardIds: new Set(state.cards.filter((c) => c.status === 'closed').map((c) => c.cardId)),
    excludedCardIds: new Set(state.cards.filter((c) => c.status === 'open').map((c) => c.cardId)),
    passedCards: state.passedCards,
  }
}

/**
 * The answers `viewer` may see on a card. Blind close: while a card is open,
 * only its opener sees the opener answer, unless settings.closerSeesOpener is on.
 */
export function visibleAnswers(
  state: RoomState,
  card: CardRecord,
  viewer: PlayerId,
): Readonly<Record<PlayerId, Answer>> {
  if (card.status !== 'open') return card.answers
  if (viewer === card.openerUid || state.settings.closerSeesOpener) return card.answers
  return {}
}

/**
 * The card that would be dealt next, with Go lighter applied: inside the
 * lighter window a question is replaced by the first undealt question one
 * level lower, when there is one. Pure, so the preview and the deal agree.
 */
export function nextDeal(state: RoomState, lookup: CardLookup): NextDeal | null {
  const { deck, lighter } = state
  if (deck.dealt >= deck.cards.length) return null
  const seq = state.cards.length + 1
  const card = requirePoolCard(lookup, deck.cards[deck.dealt])
  if (lighter && seq <= lighter.until && card.type === 'question' && card.level > 1) {
    const wanted = card.level - 1
    for (let i = deck.dealt; i < deck.cards.length; i++) {
      const candidate = requirePoolCard(lookup, deck.cards[i])
      if (candidate.type === 'question' && candidate.level === wanted)
        return { index: i, seq, card: candidate }
    }
  }
  return { index: deck.dealt, seq, card }
}

/** The Turn screen for the ball holder. */
export function turnView(state: RoomState, lookup: CardLookup): TurnView {
  const holder = state.ball.holderUid
  const partner = partnerOf(state, holder)
  const me = requirePlayer(state, holder)
  const lastTurnAt = me.lastTurnAt ?? -Infinity

  let catchUp: CatchUp | null = null
  for (let i = state.cards.length - 1; i >= 0; i--) {
    const card = state.cards[i] as CardRecord
    if (card.openerUid !== holder || card.status === 'open') continue
    if ((card.closedAt ?? -Infinity) > lastTurnAt) {
      catchUp = {
        card,
        canAskFollowUp:
          card.status === 'closed' && card.type === 'question' && !(holder in card.followUps),
      }
    }
    break
  }

  const pendingFollowUps: PendingFollowUp[] = []
  for (const card of state.cards) {
    const followUp = card.followUps[partner]
    if (followUp && followUp.reply === null && followUp.at > lastTurnAt) {
      pendingFollowUps.push({ card, askedBy: partner, followUp })
    }
  }

  const open = openCard(state)
  const close: CloseStep | null = open
    ? {
        card: open,
        openerAnswer: state.settings.closerSeesOpener
          ? (open.answers[open.openerUid]?.text ?? null)
          : null,
      }
    : null
  const deal = nextDeal(state, lookup)
  const openStep: OpenStep | null = deal ? { seq: deal.seq, card: deal.card } : null
  const rulesAgreed = me.rulesAgreedAt !== null

  return {
    holder,
    partner,
    turn: state.turn,
    paused: state.paused,
    rulesAgreed,
    catchUp,
    pendingFollowUps,
    close,
    open: openStep,
    deckExhausted: deal === null,
    passesLeft: state.passes[holder] ?? 0,
    lighter: state.lighter,
    canSend: state.paused === null && rulesAgreed && (close !== null || openStep !== null),
  }
}

// Room creation

export function createRoom(input: CreateRoomInput): RoomState {
  const { players, createdAt, settings } = input
  if (players.length !== 2) fail('invalid-room', 'a room has exactly two players')
  const [first, second] = players as [NewPlayer, NewPlayer]
  if (!first.uid || !second.uid || first.uid === second.uid)
    fail('invalid-room', 'players need two different ids')
  if (!input.rules[0].trim() || !input.rules[1].trim()) fail('invalid-room', 'both rules need text')
  const problems = validateSettings(settings)
  if (problems.length) fail('invalid-settings', problems.join('; '))
  if (input.deck.dealt !== 0) fail('invalid-deck', 'a new deck starts undealt')

  const playerRecords: Record<PlayerId, Player> = {}
  const passes: Record<PlayerId, number> = {}
  for (const player of [first, second]) {
    playerRecords[player.uid] = {
      name: cleanName(player.name),
      color: cleanColor(player.color),
      joinedAt: createdAt,
      excludeTags: [],
      afterDarkEnabled: false,
      afterDarkConfirmedAt: null,
      lastTurnAt: null,
      rulesAgreedAt: null,
    }
    passes[player.uid] = settings.passesPerDeck
  }

  return {
    version: 1,
    createdAt,
    rules: [input.rules[0], input.rules[1]],
    players: playerRecords,
    order: [first.uid, second.uid],
    settings,
    deck: input.deck,
    ball: { holderUid: first.uid, since: createdAt, lastReminderAt: null, remindersSent: 0 },
    openSeq: 0,
    turn: 0,
    passes,
    lighter: null,
    paused: null,
    passedCards: {},
    cards: [],
  }
}

// Actions

/** Checks that `by` may take a turn action right now. */
function requireTurn(state: RoomState, by: PlayerId): Player {
  const player = requirePlayer(state, by)
  if (state.paused) fail('paused', 'the room is paused')
  if (state.ball.holderUid !== by) fail('not-holder', 'it is not your turn')
  if (player.rulesAgreedAt === null) fail('rules-not-agreed', 'agree to the rules first')
  return player
}

interface Dealt {
  readonly state: RoomState
  readonly card: CardRecord
}

/** Deals the next card (with Go lighter applied) as open with the opener answer, or as passed. */
function dealCard(
  state: RoomState,
  lookup: CardLookup,
  at: number,
  by: PlayerId,
  answer: Answer | null,
): Dealt {
  const deal = nextDeal(state, lookup) as NextDeal
  const cards = [...state.deck.cards]
  const swap = cards[state.deck.dealt] as string
  cards[state.deck.dealt] = cards[deal.index] as string
  cards[deal.index] = swap
  const passed = answer === null
  const record: CardRecord = {
    seq: deal.seq,
    cardId: deal.card.id,
    cardText: deal.card.text,
    pack: deal.card.pack,
    adult: deal.card.adult,
    level: deal.card.level,
    type: deal.card.type,
    dealtAt: at,
    openerUid: by,
    closerUid: partnerOf(state, by),
    answers: answer ? { [by]: answer } : {},
    followUps: {},
    reactions: {},
    favorite: false,
    readBy: {},
    status: passed ? 'passed' : 'open',
    closedAt: passed ? at : null,
    passedBy: passed ? by : null,
  }
  const lighter = state.lighter && deal.seq >= state.lighter.until ? null : state.lighter
  return {
    state: {
      ...state,
      deck: { ...state.deck, cards, dealt: state.deck.dealt + 1 },
      lighter,
      cards: [...state.cards, record],
    },
    card: record,
  }
}

function applyReply(
  state: RoomState,
  by: PlayerId,
  at: number,
  seq: number,
  text: string,
): RoomState {
  const card = requireCard(state, seq)
  const asker = partnerOf(state, by)
  const followUp = card.followUps[asker]
  if (!followUp) fail('follow-up-missing', `no question from your partner on card ${seq}`)
  if (followUp.reply) fail('already-replied', `card ${seq} already has your reply`)
  const reply: Answer = { text: cleanText(text, 'empty-text'), at }
  return {
    ...state,
    cards: replaceCard(state.cards, {
      ...card,
      followUps: { ...card.followUps, [asker]: { ...followUp, reply } },
    }),
  }
}

function agreeRules(state: RoomState, action: Extract<Action, { type: 'agreeRules' }>): RoomState {
  const player = requirePlayer(state, action.by)
  if (player.rulesAgreedAt !== null) return state
  return patchPlayer(state, action.by, { rulesAgreedAt: action.at })
}

function sendTurn(
  state: RoomState,
  action: Extract<Action, { type: 'send' }>,
  lookup: CardLookup,
): RoomState {
  const { by, at } = action
  requireTurn(state, by)
  const partner = partnerOf(state, by)
  const open = openCard(state)
  const deal = nextDeal(state, lookup)
  if (action.closeAnswer !== undefined && !open)
    fail('unexpected-answer', 'there is no card to close')
  if (action.openAnswer !== undefined && !deal)
    fail('unexpected-answer', 'there is no card to open')
  if (!open && !deal) fail('nothing-to-send', 'the deck is finished')

  let next = state
  if (open) {
    const text = cleanText(action.closeAnswer, 'missing-answer')
    next = {
      ...next,
      openSeq: 0,
      cards: replaceCard(next.cards, {
        ...open,
        answers: { ...open.answers, [by]: { text, at } },
        status: 'closed',
        closedAt: at,
      }),
    }
  }
  for (const reply of action.replies ?? []) next = applyReply(next, by, at, reply.seq, reply.text)
  if (deal) {
    const text = cleanText(action.openAnswer, 'missing-answer')
    const dealt = dealCard(next, lookup, at, by, { text, at })
    next = { ...dealt.state, openSeq: dealt.card.seq }
  }
  next = patchPlayer(next, by, { lastTurnAt: at })
  return {
    ...next,
    ball: { holderUid: partner, since: at, lastReminderAt: null, remindersSent: 0 },
    turn: state.turn + 1,
  }
}

function spendPass(
  state: RoomState,
  by: PlayerId,
  free: boolean,
): Readonly<Record<PlayerId, number>> {
  if (free) return state.passes
  const left = state.passes[by] ?? 0
  if (left <= 0) fail('no-passes', 'no passes left this deck')
  return { ...state.passes, [by]: left - 1 }
}

function pass(
  state: RoomState,
  action: Extract<Action, { type: 'pass' }>,
  lookup: CardLookup,
): RoomState {
  const { by, at } = action
  requireTurn(state, by)
  if (action.target === 'close') {
    const open = openCard(state)
    if (!open) fail('nothing-to-pass', 'there is no card to close')
    const passes = spendPass(state, by, open.adult)
    return {
      ...state,
      openSeq: 0,
      passes,
      passedCards: { ...state.passedCards, [open.cardId]: at },
      cards: replaceCard(state.cards, { ...open, status: 'passed', closedAt: at, passedBy: by }),
    }
  }
  const deal = nextDeal(state, lookup)
  if (!deal) fail('nothing-to-pass', 'there is no card to open')
  const passes = spendPass(state, by, deal.card.adult)
  const dealt = dealCard(state, lookup, at, by, null)
  return { ...dealt.state, passes, passedCards: { ...state.passedCards, [deal.card.id]: at } }
}

function goLighter(state: RoomState, action: Extract<Action, { type: 'lighter' }>): RoomState {
  requireTurn(state, action.by)
  return { ...state, lighter: { until: state.cards.length + state.settings.lighterWindowCards } }
}

function pause(state: RoomState, action: Extract<Action, { type: 'pause' }>): RoomState {
  requirePlayer(state, action.by)
  if (state.paused) fail('already-paused', 'the room is already paused')
  return { ...state, paused: { by: action.by, at: action.at, note: (action.note ?? '').trim() } }
}

function resume(state: RoomState, action: Extract<Action, { type: 'resume' }>): RoomState {
  requirePlayer(state, action.by)
  if (!state.paused) fail('not-paused', 'the room is not paused')
  return { ...state, paused: null }
}

function rebuildDeck(
  state: RoomState,
  action: Extract<Action, { type: 'rebuildDeck' }>,
): RoomState {
  requirePlayer(state, action.by)
  if (action.deck.dealt !== 0) fail('invalid-deck', 'a new deck starts undealt')
  const open = openCard(state)
  const cards = open ? action.deck.cards.filter((id) => id !== open.cardId) : action.deck.cards
  const passes: Record<PlayerId, number> = {}
  const players: Record<PlayerId, Player> = {}
  for (const uid of state.order) {
    passes[uid] = state.settings.passesPerDeck
    players[uid] = { ...requirePlayer(state, uid), rulesAgreedAt: null }
  }
  return { ...state, deck: { ...action.deck, cards }, passes, lighter: null, players }
}

function askFollowUp(
  state: RoomState,
  action: Extract<Action, { type: 'askFollowUp' }>,
): RoomState {
  const { by, at, seq } = action
  requirePlayer(state, by)
  const card = requireCard(state, seq)
  if (card.type === 'current')
    fail('no-follow-ups-on-currents', 'Currents take no follow-up questions')
  if (card.status !== 'closed') fail('card-not-closed', `card ${seq} has no reveal yet`)
  if (card.followUps[by]) fail('follow-up-exists', `you already asked a follow-up on card ${seq}`)
  const text = cleanText(action.text, 'empty-text')
  return {
    ...state,
    cards: replaceCard(state.cards, {
      ...card,
      followUps: { ...card.followUps, [by]: { text, at, reply: null } },
    }),
  }
}

function replyFollowUp(
  state: RoomState,
  action: Extract<Action, { type: 'replyFollowUp' }>,
): RoomState {
  requirePlayer(state, action.by)
  return applyReply(state, action.by, action.at, action.seq, action.text)
}

function updateSettings(
  state: RoomState,
  action: Extract<Action, { type: 'updateSettings' }>,
): RoomState {
  requirePlayer(state, action.by)
  const settings: RoomSettings = { ...state.settings, ...action.patch }
  const problems = validateSettings(settings)
  if (problems.length) fail('invalid-settings', problems.join('; '))
  return { ...state, settings }
}

function updatePlayer(
  state: RoomState,
  action: Extract<Action, { type: 'updatePlayer' }>,
): RoomState {
  requirePlayer(state, action.by)
  const { name, color } = action.patch
  return patchPlayer(state, action.by, {
    ...(name !== undefined ? { name: cleanName(name) } : {}),
    ...(color !== undefined ? { color: cleanColor(color) } : {}),
  })
}

function apply(state: RoomState, action: Action, lookup: CardLookup): RoomState {
  switch (action.type) {
    case 'agreeRules':
      return agreeRules(state, action)
    case 'send':
      return sendTurn(state, action, lookup)
    case 'pass':
      return pass(state, action, lookup)
    case 'lighter':
      return goLighter(state, action)
    case 'pause':
      return pause(state, action)
    case 'resume':
      return resume(state, action)
    case 'rebuildDeck':
      return rebuildDeck(state, action)
    case 'askFollowUp':
      return askFollowUp(state, action)
    case 'replyFollowUp':
      return replyFollowUp(state, action)
    case 'updateSettings':
      return updateSettings(state, action)
    case 'updatePlayer':
      return updatePlayer(state, action)
    default:
      return fail('unknown-action', `unknown action ${String((action as { type?: unknown }).type)}`)
  }
}

/**
 * Applies one action and bumps `version`. Throws GameError for anything the
 * rules forbid; the input state is left untouched either way.
 */
export function reduce(state: RoomState, action: Action, lookup: CardLookup): RoomState {
  const next = apply(state, action, lookup)
  return { ...next, version: state.version + 1 }
}
