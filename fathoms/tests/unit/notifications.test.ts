import { describe, expect, it } from 'vitest'
import {
  BACKUP_OFFSETS_HOURS,
  backupIds,
  backupSchedule,
  cancelBackupReminders,
  scheduleBackupReminders,
} from '../../src/notifications/localReminders'
import {
  ensureChannel,
  isNative,
  onNotificationTap,
  registerForPush,
} from '../../src/notifications/push'

const HOUR = 60 * 60 * 1000

describe('local reminder backup', () => {
  it('schedules +10, +20, +30 hours from the ball pass, skipping offsets already past', () => {
    expect(BACKUP_OFFSETS_HOURS).toEqual([10, 20, 30])
    const all = backupSchedule('room-a', 1_000_000, 1_000_000)
    expect(all.map((r) => r.hours)).toEqual([10, 20, 30])
    expect(all.map((r) => r.at)).toEqual([
      1_000_000 + 10 * HOUR,
      1_000_000 + 20 * HOUR,
      1_000_000 + 30 * HOUR,
    ])
    const later = backupSchedule('room-a', 1_000_000, 1_000_000 + 15 * HOUR)
    expect(later.map((r) => r.hours)).toEqual([20, 30])
    expect(backupSchedule('room-a', 0, 31 * HOUR)).toEqual([])
  })

  it('gives each room stable, distinct, 32 bit ids', () => {
    const ids = backupIds('room-a')
    expect(ids).toEqual(backupIds('room-a'))
    expect(new Set(ids).size).toBe(3)
    expect(ids).not.toEqual(backupIds('room-b'))
    for (const id of ids) {
      expect(Number.isInteger(id)).toBe(true)
      expect(id).toBeGreaterThan(0)
      expect(id).toBeLessThan(2 ** 31)
    }
  })

  it('is a no op on the web but still reports the plan', async () => {
    expect(isNative()).toBe(false)
    const planned = await scheduleBackupReminders('room-a', 'Ada', 5_000, 5_000)
    expect(planned.map((r) => r.hours)).toEqual([10, 20, 30])
    await expect(cancelBackupReminders('room-a')).resolves.toBeUndefined()
  })
})

describe('push on the web', () => {
  it('reports unsupported and does not throw', async () => {
    const result = await registerForPush({ onToken: () => undefined, onError: () => undefined })
    expect(result).toBe('unsupported')
    await expect(ensureChannel()).resolves.toBeUndefined()
    await expect(onNotificationTap(() => undefined)).resolves.toBeUndefined()
  })
})
