// Pure reminder math (PLAN 4.5). No Firestore, no clock: everything comes in.

export interface QuietHours {
  readonly start: string
  readonly end: string
  readonly tz: string
}

export interface ReminderRoom {
  readonly paused: unknown
  readonly ball: {
    readonly holderUid: string
    readonly since: number
    readonly lastReminderAt: number | null
    readonly remindersSent: number
  }
  readonly settings: {
    readonly reminderHours: number
    readonly reminderCap: number | null
  }
  readonly players: Readonly<Record<string, { readonly quietHours?: QuietHours | null }>>
}

export const HOUR_MS = 60 * 60 * 1000

/** Minutes since midnight in `tz` for an instant. Null when the zone is unknown. */
export function localMinutes(at: number, tz: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(at))
    const hour = Number(parts.find((p) => p.type === 'hour')?.value)
    const minute = Number(parts.find((p) => p.type === 'minute')?.value)
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null
    return hour * 60 + minute
  } catch {
    return null
  }
}

function minutesOf(hhmm: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm)
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

/**
 * True when `at` falls inside the quiet window. A window that ends before it
 * starts wraps past midnight (22:00 to 07:00). An invalid window never mutes.
 */
export function inQuietHours(quiet: QuietHours | null | undefined, at: number): boolean {
  if (!quiet) return false
  const start = minutesOf(quiet.start)
  const end = minutesOf(quiet.end)
  const now = localMinutes(at, quiet.tz)
  if (start === null || end === null || now === null || start === end) return false
  return start < end ? now >= start && now < end : now >= start || now < end
}

export type ReminderSkip = 'paused' | 'too-soon' | 'cap' | 'quiet'

export interface ReminderDecision {
  readonly send: boolean
  readonly skip: ReminderSkip | null
  /** Whole hours the holder has held the ball. */
  readonly hoursHeld: number
}

/**
 * Whether a room is due a "Still your turn" push: not paused, the ball held for
 * at least reminderHours since the later of ball.since and lastReminderAt, the
 * cap not hit, and the holder outside their quiet hours.
 */
export function reminderDecision(room: ReminderRoom, now: number): ReminderDecision {
  const { ball, settings } = room
  const hoursHeld = Math.floor(Math.max(0, now - ball.since) / HOUR_MS)
  const decide = (skip: ReminderSkip | null): ReminderDecision => ({
    send: skip === null,
    skip,
    hoursHeld,
  })
  if (room.paused !== null && room.paused !== undefined) return decide('paused')
  const last = Math.max(ball.since, ball.lastReminderAt ?? ball.since)
  if (now - last < settings.reminderHours * HOUR_MS) return decide('too-soon')
  if (settings.reminderCap !== null && ball.remindersSent >= settings.reminderCap)
    return decide('cap')
  if (inQuietHours(room.players[ball.holderUid]?.quietHours, now)) return decide('quiet')
  return decide(null)
}
