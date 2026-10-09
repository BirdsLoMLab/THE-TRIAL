// Deck builder (PLAN section 4.6). Pure: no clock, no randomness beyond the seed.
import type {
  CurrentPoolCard,
  Deck,
  DeckPlayer,
  DeckSettings,
  LevelId,
  PlayMode,
  PoolCard,
  QuestionPoolCard,
} from './types'

const DAY_MS = 24 * 60 * 60 * 1000
const LEVELS: readonly LevelId[] = [1, 2, 3]

/** What the room already knows about its cards. */
export interface DeckHistory {
  /** Cards both players answered. Excluded while settings.excludeAnswered is on. */
  readonly answeredCardIds: ReadonlySet<string>
  /** Cards that must never be dealt by this build, for example the card that is open right now. */
  readonly excludedCardIds: ReadonlySet<string>
  /** cardId to the time it was passed. Excluded until the cooldown has run. */
  readonly passedCards: Readonly<Record<string, number>>
}

export interface BuildDeckInput {
  readonly settings: DeckSettings
  readonly players: readonly DeckPlayer[]
  readonly pool: readonly PoolCard[]
  readonly history: DeckHistory
  readonly seed: string
  readonly now: number
}

export interface EligibleCards {
  readonly questions: readonly QuestionPoolCard[]
  readonly currents: readonly CurrentPoolCard[]
}

/** FNV-1a, 32 bit. Same seed, same number, on every platform. */
export function hashSeed(seed: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** mulberry32 seeded from the string. Yields numbers in [0, 1). */
export function createRng(seed: string): () => number {
  let state = hashSeed(seed)
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Fisher-Yates with the seeded generator. Returns a new array. */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const out = [...items]
  const rng = createRng(seed)
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const swap = out[i] as T
    out[i] = out[j] as T
    out[j] = swap
  }
  return out
}

/** After Dark is dealt only when the room has two players and both enabled it (PLAN 4.9). */
export function afterDarkAllowed(players: readonly DeckPlayer[]): boolean {
  return players.length === 2 && players.every((player) => player.afterDarkEnabled)
}

/** Anything either player excluded is excluded for the room (PLAN 4.9). */
export function roomExcludeTags(players: readonly DeckPlayer[]): Set<string> {
  return new Set(players.flatMap((player) => player.excludeTags))
}

/** Applies every filter from PLAN 4.6, 4.7, and 4.9 to the pool. */
export function eligibleCards(input: BuildDeckInput): EligibleCards {
  const { settings, pool, history, now } = input
  const adultAllowed = afterDarkAllowed(input.players)
  const excludedTags = roomExcludeTags(input.players)
  const packs = new Set(settings.packs)
  const wantedMode: PlayMode = settings.mode === 'live' ? 'live' : 'async'
  const cooldownMs = settings.passedCardCooldownDays * DAY_MS
  const questions: QuestionPoolCard[] = []
  const currents: CurrentPoolCard[] = []

  for (const card of pool) {
    const packOn = card.pack === 'custom' ? settings.customCardsEnabled : packs.has(card.pack)
    if (!packOn) continue
    if (card.adult && !adultAllowed) continue
    if (card.tags.some((tag) => excludedTags.has(tag))) continue
    if (history.excludedCardIds.has(card.id)) continue
    if (settings.excludeAnswered && history.answeredCardIds.has(card.id)) continue
    const passedAt = history.passedCards[card.id]
    if (passedAt !== undefined && passedAt + cooldownMs > now) continue
    if (card.type === 'question') {
      if (card.level >= settings.startLevel) questions.push(card)
    } else if (card.modes.includes(wantedMode)) {
      currents.push(card)
    }
  }
  return { questions, currents }
}

/**
 * The questions between Currents: at least `currentEvery`, and more when the
 * deck has more questions than the Currents could cover at that spacing, so
 * the Currents spread over the whole deck instead of bunching at the start.
 * Rounds down, so when the spread decides the gap every eligible Current still
 * finds a slot; when `currentEvery` or `noCurrentsBefore` decides it, the
 * Currents that do not fit are left out, as before.
 */
export function currentInterval(
  settings: Pick<DeckSettings, 'currentEvery'>,
  questionCount: number,
  currentCount: number,
): number {
  if (settings.currentEvery <= 0) return 0
  return Math.max(settings.currentEvery, Math.floor(questionCount / (currentCount + 1)))
}

/**
 * filter, group by level, seeded shuffle each group, concatenate in level
 * order (or shuffle everything together for mixed progression), then splice
 * one Current after every `currentInterval` questions, none inside the first
 * `noCurrentsBefore` cards and never as the last card.
 */
export function buildDeck(input: BuildDeckInput): Deck {
  const { settings, seed, now } = input
  const { questions, currents } = eligibleCards(input)

  const ordered: QuestionPoolCard[] =
    settings.progression === 'mixed'
      ? seededShuffle(questions, `${seed}:mixed`)
      : LEVELS.flatMap((level) =>
          seededShuffle(
            questions.filter((card) => card.level === level),
            `${seed}:level:${level}`,
          ),
        )
  const currentQueue = seededShuffle(currents, `${seed}:currents`)

  const interval = currentInterval(settings, ordered.length, currentQueue.length)
  const cards: string[] = []
  let sinceCurrent = 0
  let nextCurrent = 0
  ordered.forEach((card, index) => {
    cards.push(card.id)
    sinceCurrent += 1
    const moreQuestions = index < ordered.length - 1
    const due = interval > 0 && sinceCurrent >= interval
    const allowed = cards.length >= settings.noCurrentsBefore && nextCurrent < currentQueue.length
    if (due && allowed && moreQuestions) {
      cards.push((currentQueue[nextCurrent] as CurrentPoolCard).id)
      nextCurrent += 1
      sinceCurrent = 0
    }
  })

  return { seed, cards, dealt: 0, builtAt: now }
}
