// Journal views and export (PLAN 4.8). Pure: filters, text search, grouping by
// day, and a Markdown rendering of the whole room for a client side export.
import type { CardRecord, LevelId, PlayerId, RoomState } from './types'

export interface JournalFilter {
  readonly view: 'all' | 'favorites'
  readonly level: LevelId | 'currents' | null
  readonly pack: string | null
  readonly query: string
}

export const EMPTY_FILTER: JournalFilter = { view: 'all', level: null, pack: null, query: '' }

/** Case insensitive match over the card text, both answers, follow-ups, and replies. */
export function cardMatches(card: CardRecord, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  const parts = [card.cardText, ...Object.values(card.answers).map((a) => a.text)]
  for (const followUp of Object.values(card.followUps)) {
    parts.push(followUp.text)
    if (followUp.reply) parts.push(followUp.reply.text)
  }
  return parts.some((text) => text.toLowerCase().includes(needle))
}

/** Dealt cards newest first, through the filter. Hidden cards stay as tombstones unless a query or level filter is on. */
export function filterJournal(cards: readonly CardRecord[], filter: JournalFilter): CardRecord[] {
  const out: CardRecord[] = []
  for (let i = cards.length - 1; i >= 0; i--) {
    const card = cards[i] as CardRecord
    if (filter.view === 'favorites' && !card.favorite) continue
    if (
      filter.level === 'currents'
        ? card.type !== 'current'
        : filter.level !== null && card.level !== filter.level
    )
      continue
    if (filter.pack !== null && card.pack !== filter.pack) continue
    if (filter.query.trim() && (card.status === 'hidden' || !cardMatches(card, filter.query)))
      continue
    out.push(card)
  }
  return out
}

/** The pack ids present in the journal, in first seen order. */
export function journalPacks(cards: readonly CardRecord[]): string[] {
  const packs: string[] = []
  for (const card of cards) if (!packs.includes(card.pack)) packs.push(card.pack)
  return packs
}

export interface DayGroup {
  /** YYYY-MM-DD in the local time zone. */
  readonly day: string
  readonly cards: CardRecord[]
}

function localDay(at: number): string {
  const date = new Date(at)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const dayOfMonth = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${dayOfMonth}`
}

/** Groups cards by the local day they were dealt, keeping the given order. */
export function groupByDay(cards: readonly CardRecord[]): DayGroup[] {
  const groups: DayGroup[] = []
  for (const card of cards) {
    const day = localDay(card.dealtAt)
    const last = groups[groups.length - 1]
    if (last && last.day === day) last.cards.push(card)
    else groups.push({ day, cards: [card] })
  }
  return groups
}

export interface MarkdownOptions {
  readonly title?: string | undefined
  readonly levelNames?: Readonly<Record<LevelId, string>> | undefined
  readonly packNames?: Readonly<Record<string, string>> | undefined
}

function name(room: RoomState, uid: PlayerId): string {
  return room.players[uid]?.name ?? uid
}

function levelLabel(card: CardRecord, options: MarkdownOptions): string {
  if (card.type === 'current') return 'Current'
  const level = card.level ?? 1
  return options.levelNames?.[level] ?? `Level ${level}`
}

/**
 * The whole journal as Markdown, oldest card first: card text, both answers,
 * follow-ups with replies, reactions, and favorites. Hidden cards appear as a
 * one line note. No em dashes.
 */
export function journalToMarkdown(room: RoomState, options: MarkdownOptions = {}): string {
  const lines: string[] = []
  const players = room.order.map((uid) => name(room, uid)).join(' and ')
  lines.push(
    `# ${options.title ?? 'Fathoms journal'}`,
    '',
    `${players}. ${room.cards.length} cards.`,
    '',
  )
  for (const card of room.cards) {
    const pack = options.packNames?.[card.pack] ?? card.pack
    const star = card.favorite ? ' (favorite)' : ''
    if (card.status === 'hidden') {
      lines.push(
        `## Card ${card.seq}: ${pack}, ${levelLabel(card, options)}`,
        '',
        'An After Dark card, hidden after both read it.',
        '',
      )
      continue
    }
    lines.push(
      `## Card ${card.seq}: ${pack}, ${levelLabel(card, options)}${star}`,
      '',
      card.cardText,
      '',
    )
    if (card.status === 'passed')
      lines.push(`Passed by ${name(room, card.passedBy ?? card.closerUid)}.`, '')
    for (const uid of [card.openerUid, card.closerUid]) {
      const answer = card.answers[uid]
      if (answer) lines.push(`**${name(room, uid)}:** ${answer.text}`, '')
    }
    for (const uid of room.order) {
      const followUp = card.followUps[uid]
      if (!followUp) continue
      const other = room.order[0] === uid ? room.order[1] : room.order[0]
      lines.push(`> ${name(room, uid)} asked: ${followUp.text}`)
      lines.push(
        followUp.reply ? `> ${name(room, other)}: ${followUp.reply.text}` : '> Not answered.',
      )
      lines.push('')
    }
    const reactions = Object.entries(card.reactions)
      .filter(([, uids]) => uids.length > 0)
      .map(([emoji, uids]) => `${emoji} ${uids.map((uid) => name(room, uid)).join(', ')}`)
    if (reactions.length) lines.push(reactions.join('; '), '')
  }
  return (
    lines
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd() + '\n'
  )
}
