// Local reminder backup (PLAN 4.5): when the ball is mine, the phone itself
// schedules "Still your turn" at +10 h, +20 h, +30 h in case the server is
// down or the function lapsed. Cancelled on Send.
import { LocalNotifications } from '@capacitor/local-notifications'
import { hashSeed } from '../game/deck'
import { isNative, TURN_CHANNEL_ID } from './push'

export const BACKUP_OFFSETS_HOURS: readonly number[] = [10, 20, 30]
const HOUR_MS = 60 * 60 * 1000

export interface BackupReminder {
  readonly id: number
  readonly hours: number
  readonly at: number
}

/** Stable notification ids per room, one per offset. Android ids are 32 bit signed. */
export function backupIds(roomId: string): number[] {
  const base = (hashSeed(roomId) % 100_000_000) * 10
  return BACKUP_OFFSETS_HOURS.map((_, index) => base + index + 1)
}

/** The reminders still in the future for a ball held since `since`. Pure, for tests. */
export function backupSchedule(roomId: string, since: number, now: number): BackupReminder[] {
  const ids = backupIds(roomId)
  return BACKUP_OFFSETS_HOURS.flatMap((hours, index) => {
    const at = since + hours * HOUR_MS
    return at > now ? [{ id: ids[index] as number, hours, at }] : []
  })
}

export async function cancelBackupReminders(roomId: string): Promise<void> {
  if (!isNative()) return
  await LocalNotifications.cancel({ notifications: backupIds(roomId).map((id) => ({ id })) })
}

/** Replaces the backup reminders for a room. No op on the web. */
export async function scheduleBackupReminders(
  roomId: string,
  partnerName: string,
  since: number,
  now: number,
): Promise<BackupReminder[]> {
  const planned = backupSchedule(roomId, since, now)
  if (!isNative()) return planned
  await cancelBackupReminders(roomId)
  const permission = await LocalNotifications.checkPermissions()
  if (permission.display !== 'granted') return []
  if (planned.length === 0) return []
  await LocalNotifications.schedule({
    notifications: planned.map((reminder) => ({
      id: reminder.id,
      title: 'Still your turn',
      body: `${partnerName} has been waiting ${reminder.hours} hours`,
      schedule: { at: new Date(reminder.at), allowWhileIdle: true },
      channelId: TURN_CHANNEL_ID,
      extra: { roomId },
    })),
  })
  return planned
}
