import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  HOUR_MS,
  inQuietHours,
  localMinutes,
  reminderDecision,
  type ReminderRoom,
} from '../src/reminders.js'

const T0 = Date.UTC(2026, 9, 8, 12, 0, 0)

function room(
  overrides: Partial<ReminderRoom> & { ball?: Partial<ReminderRoom['ball']> } = {},
): ReminderRoom {
  return {
    paused: null,
    settings: { reminderHours: 10, reminderCap: null },
    players: { a: { quietHours: null }, b: { quietHours: null } },
    ...overrides,
    ball: { holderUid: 'a', since: T0, lastReminderAt: null, remindersSent: 0, ...overrides.ball },
  }
}

describe('reminderDecision with fake timers', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(T0)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('is too soon until reminderHours have passed, then due, then too soon again until the next window', () => {
    expect(reminderDecision(room(), Date.now())).toMatchObject({
      send: false,
      skip: 'too-soon',
      hoursHeld: 0,
    })
    vi.advanceTimersByTime(9 * HOUR_MS + 59 * 60 * 1000)
    expect(reminderDecision(room(), Date.now()).skip).toBe('too-soon')
    vi.advanceTimersByTime(60 * 1000)
    expect(reminderDecision(room(), Date.now())).toEqual({ send: true, skip: null, hoursHeld: 10 })
    const stamped = room({ ball: { lastReminderAt: Date.now(), remindersSent: 1 } })
    vi.advanceTimersByTime(5 * HOUR_MS)
    expect(reminderDecision(stamped, Date.now())).toMatchObject({
      send: false,
      skip: 'too-soon',
      hoursHeld: 15,
    })
    vi.advanceTimersByTime(5 * HOUR_MS)
    expect(reminderDecision(stamped, Date.now())).toMatchObject({ send: true, hoursHeld: 20 })
  })

  it('never reminds a paused room', () => {
    vi.advanceTimersByTime(30 * HOUR_MS)
    expect(reminderDecision(room({ paused: { by: 'b', at: T0, note: '' } }), Date.now()).skip).toBe(
      'paused',
    )
  })

  it('stops at the cap', () => {
    vi.advanceTimersByTime(30 * HOUR_MS)
    const capped = room({
      settings: { reminderHours: 10, reminderCap: 2 },
      ball: { remindersSent: 2, lastReminderAt: T0 + 10 * HOUR_MS },
    })
    expect(reminderDecision(capped, Date.now()).skip).toBe('cap')
    const under = room({
      settings: { reminderHours: 10, reminderCap: 2 },
      ball: { remindersSent: 1, lastReminderAt: T0 + 10 * HOUR_MS },
    })
    expect(reminderDecision(under, Date.now()).send).toBe(true)
  })

  it('respects the holder quiet hours and ignores the partner ones', () => {
    vi.advanceTimersByTime(12 * HOUR_MS)
    const quiet = { start: '22:00', end: '08:00', tz: 'UTC' }
    expect(
      reminderDecision(room({ players: { a: { quietHours: quiet }, b: {} } }), Date.now()).skip,
    ).toBe('quiet')
    expect(
      reminderDecision(room({ players: { a: {}, b: { quietHours: quiet } } }), Date.now()).send,
    ).toBe(true)
  })

  it('uses a custom reminder interval', () => {
    vi.advanceTimersByTime(3 * HOUR_MS)
    expect(
      reminderDecision(room({ settings: { reminderHours: 2, reminderCap: null } }), Date.now())
        .send,
    ).toBe(true)
    expect(
      reminderDecision(room({ settings: { reminderHours: 4, reminderCap: null } }), Date.now())
        .send,
    ).toBe(false)
  })
})

describe('quiet hours', () => {
  it('reads local minutes in a time zone', () => {
    expect(localMinutes(Date.UTC(2026, 0, 1, 23, 30), 'UTC')).toBe(23 * 60 + 30)
    expect(localMinutes(Date.UTC(2026, 0, 1, 23, 30), 'America/New_York')).toBe(18 * 60 + 30)
    expect(localMinutes(Date.UTC(2026, 0, 1, 23, 30), 'Not/AZone')).toBeNull()
  })

  it('handles a same day window and one that wraps past midnight', () => {
    const day = { start: '09:00', end: '17:00', tz: 'UTC' }
    expect(inQuietHours(day, Date.UTC(2026, 0, 1, 12, 0))).toBe(true)
    expect(inQuietHours(day, Date.UTC(2026, 0, 1, 17, 0))).toBe(false)
    expect(inQuietHours(day, Date.UTC(2026, 0, 1, 8, 59))).toBe(false)
    const night = { start: '22:00', end: '07:00', tz: 'UTC' }
    expect(inQuietHours(night, Date.UTC(2026, 0, 1, 23, 0))).toBe(true)
    expect(inQuietHours(night, Date.UTC(2026, 0, 1, 3, 0))).toBe(true)
    expect(inQuietHours(night, Date.UTC(2026, 0, 1, 7, 0))).toBe(false)
    expect(inQuietHours(night, Date.UTC(2026, 0, 1, 12, 0))).toBe(false)
  })

  it('never mutes on a missing or broken window', () => {
    expect(inQuietHours(null, Date.UTC(2026, 0, 1, 3, 0))).toBe(false)
    expect(inQuietHours(undefined, Date.UTC(2026, 0, 1, 3, 0))).toBe(false)
    expect(
      inQuietHours({ start: '25:00', end: '07:00', tz: 'UTC' }, Date.UTC(2026, 0, 1, 3, 0)),
    ).toBe(false)
    expect(
      inQuietHours({ start: '22:00', end: '22:00', tz: 'UTC' }, Date.UTC(2026, 0, 1, 23, 0)),
    ).toBe(false)
    expect(
      inQuietHours(
        { start: '22:00', end: '07:00', tz: 'Nowhere/Nope' },
        Date.UTC(2026, 0, 1, 23, 0),
      ),
    ).toBe(false)
  })
})
