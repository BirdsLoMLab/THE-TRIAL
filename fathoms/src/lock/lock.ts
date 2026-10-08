// App lock (PLAN 4.9): a PIN with biometric unlock when the phone has it.
// Blocks the Turn and Journal screens cold: on start and after the app has
// been in the background for a while. The PIN never leaves the device; only a
// salted SHA-256 hash is stored.
import { BiometricAuth } from '@aparajita/capacitor-biometric-auth'
import { Capacitor } from '@capacitor/core'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export const LOCK_STORAGE_KEY = 'fathoms.lock'
/** Background time after which the app locks again. */
export const LOCK_AFTER_MS = 30_000
export const PIN_PATTERN = /^\d{4,8}$/
export const MAX_ATTEMPTS = 5

export function randomSalt(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function hashPin(pin: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${pin}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

export function validPin(pin: string): boolean {
  return PIN_PATTERN.test(pin)
}

/** Whether the phone can unlock with biometrics. Always false on the web. */
export async function biometricsAvailable(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  try {
    const result = await BiometricAuth.checkBiometry()
    return result.isAvailable
  } catch {
    return false
  }
}

export interface LockData {
  readonly enabled: boolean
  readonly pinHash: string | null
  readonly salt: string
  readonly biometrics: boolean
  /** Not persisted: true whenever the app starts with the lock on. */
  readonly locked: boolean
  readonly attempts: number
  readonly hiddenAt: number | null
}

export interface LockActions {
  enable(pin: string, biometrics: boolean): Promise<void>
  /** Turns the lock off after checking the PIN. False when the PIN is wrong. */
  disable(pin: string): Promise<boolean>
  setBiometrics(on: boolean): void
  unlockWithPin(pin: string): Promise<boolean>
  unlockWithBiometrics(): Promise<boolean>
  lock(): void
  /** The app went to the background. */
  noteHidden(now: number): void
  /** The app came back; locks when it was away long enough. */
  noteVisible(now: number): void
}

export type LockStore = LockData & LockActions

export const useLock = create<LockStore>()(
  persist(
    (set, get) => ({
      enabled: false,
      pinHash: null,
      salt: '',
      biometrics: false,
      locked: false,
      attempts: 0,
      hiddenAt: null,

      async enable(pin, biometrics) {
        if (!validPin(pin)) throw new Error('A PIN is 4 to 8 digits.')
        const salt = randomSalt()
        const pinHash = await hashPin(pin, salt)
        set({ enabled: true, pinHash, salt, biometrics, locked: false, attempts: 0 })
      },

      async disable(pin) {
        const { pinHash, salt } = get()
        if (!pinHash || (await hashPin(pin, salt)) !== pinHash) return false
        set({
          enabled: false,
          pinHash: null,
          salt: '',
          biometrics: false,
          locked: false,
          attempts: 0,
        })
        return true
      },

      setBiometrics(on) {
        set({ biometrics: on })
      },

      async unlockWithPin(pin) {
        const { pinHash, salt, attempts } = get()
        if (pinHash && (await hashPin(pin, salt)) === pinHash) {
          set({ locked: false, attempts: 0 })
          return true
        }
        set({ attempts: attempts + 1 })
        return false
      },

      async unlockWithBiometrics() {
        if (!get().biometrics || !(await biometricsAvailable())) return false
        try {
          await BiometricAuth.authenticate({
            reason: 'Unlock Fathoms',
            allowDeviceCredential: true,
          })
          set({ locked: false, attempts: 0 })
          return true
        } catch {
          return false
        }
      },

      lock() {
        if (get().enabled) set({ locked: true })
      },

      noteHidden(now) {
        set({ hiddenAt: now })
      },

      noteVisible(now) {
        const { enabled, hiddenAt } = get()
        if (enabled && hiddenAt !== null && now - hiddenAt >= LOCK_AFTER_MS) set({ locked: true })
        set({ hiddenAt: null })
      },
    }),
    {
      name: LOCK_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        enabled: state.enabled,
        pinHash: state.pinHash,
        salt: state.salt,
        biometrics: state.biometrics,
      }),
      // A locked start: the lock is on whenever the stored state says enabled.
      merge: (persisted, current) => {
        const stored = (persisted ?? {}) as Partial<LockData>
        return {
          ...current,
          ...stored,
          locked: stored.enabled === true,
          attempts: 0,
          hiddenAt: null,
        }
      },
    },
  ),
)
