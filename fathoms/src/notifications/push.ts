// Push registration, the notification channel, and notification taps (PLAN 4.5
// and Phase 3). Everything is a no op on the web; the Android build goes
// through FCM via @capacitor/push-notifications.
import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { PushNotifications } from '@capacitor/push-notifications'

export const TURN_CHANNEL_ID = 'turns'

export type PushState = 'granted' | 'denied' | 'unsupported'

export function isNative(): boolean {
  return Capacitor.isNativePlatform()
}

/** The high importance channel both push and local reminders post to. Idempotent. */
export async function ensureChannel(): Promise<void> {
  if (!isNative()) return
  const channel = {
    id: TURN_CHANNEL_ID,
    name: 'Turns',
    description: 'Your turn, nudges, and reminders',
    importance: 5 as const,
    visibility: 1 as const,
    vibration: true,
  }
  await PushNotifications.createChannel(channel)
  await LocalNotifications.createChannel(channel)
}

export interface PushHandlers {
  onToken(token: string): void
  onError(error: Error): void
}

/**
 * Asks for POST_NOTIFICATIONS on first use, creates the channel, and registers
 * with FCM. The token arrives through onToken, also on later refreshes.
 */
export async function registerForPush(handlers: PushHandlers): Promise<PushState> {
  if (!isNative()) return 'unsupported'
  let { receive } = await PushNotifications.checkPermissions()
  if (receive === 'prompt' || receive === 'prompt-with-rationale') {
    receive = (await PushNotifications.requestPermissions()).receive
  }
  if (receive !== 'granted') return 'denied'
  await ensureChannel()
  await PushNotifications.addListener('registration', (token) => handlers.onToken(token.value))
  await PushNotifications.addListener('registrationError', (error) =>
    handlers.onError(new Error(`Push registration failed: ${JSON.stringify(error)}`)),
  )
  await PushNotifications.register()
  return 'granted'
}

/** A tapped notification carries data.roomId (push) or extra.roomId (local); open that room's Turn screen. */
export async function onNotificationTap(handler: (roomId: string) => void): Promise<void> {
  if (!isNative()) return
  await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    const roomId = (action.notification.data as Record<string, unknown> | undefined)?.['roomId']
    if (typeof roomId === 'string') handler(roomId)
  })
  await LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
    const roomId = (action.notification.extra as Record<string, unknown> | undefined)?.['roomId']
    if (typeof roomId === 'string') handler(roomId)
  })
}
