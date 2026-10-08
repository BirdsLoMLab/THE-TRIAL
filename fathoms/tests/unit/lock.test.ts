import { beforeEach, describe, expect, it } from 'vitest'
import {
  biometricsAvailable,
  hashPin,
  LOCK_AFTER_MS,
  randomSalt,
  useLock,
  validPin,
} from '../../src/lock/lock'

function lock() {
  return useLock.getState()
}

describe('app lock', () => {
  beforeEach(() => {
    useLock.setState({
      enabled: false,
      pinHash: null,
      salt: '',
      biometrics: false,
      locked: false,
      attempts: 0,
      hiddenAt: null,
    })
    localStorage.clear()
  })

  it('accepts 4 to 8 digit PINs only', () => {
    expect(validPin('1234')).toBe(true)
    expect(validPin('12345678')).toBe(true)
    expect(validPin('123')).toBe(false)
    expect(validPin('123456789')).toBe(false)
    expect(validPin('12a4')).toBe(false)
  })

  it('hashes with a salt so the same PIN differs per device', async () => {
    const a = randomSalt()
    const b = randomSalt()
    expect(a).not.toBe(b)
    expect(await hashPin('1234', a)).not.toBe(await hashPin('1234', b))
    expect(await hashPin('1234', a)).toBe(await hashPin('1234', a))
    expect(await hashPin('1234', a)).toMatch(/^[0-9a-f]{64}$/)
  })

  it('enables, unlocks with the right PIN, counts wrong tries, and disables with the PIN', async () => {
    await expect(lock().enable('12', false)).rejects.toThrow('4 to 8 digits')
    await lock().enable('2468', false)
    expect(lock().enabled).toBe(true)
    expect(lock().locked).toBe(false)
    lock().lock()
    expect(lock().locked).toBe(true)
    expect(await lock().unlockWithPin('0000')).toBe(false)
    expect(lock().attempts).toBe(1)
    expect(await lock().unlockWithPin('2468')).toBe(true)
    expect(lock().locked).toBe(false)
    expect(lock().attempts).toBe(0)
    expect(await lock().disable('1111')).toBe(false)
    expect(lock().enabled).toBe(true)
    expect(await lock().disable('2468')).toBe(true)
    expect(lock().enabled).toBe(false)
    expect(lock().pinHash).toBeNull()
  })

  it('locks again after the app was hidden long enough', async () => {
    await lock().enable('2468', false)
    lock().noteHidden(1000)
    lock().noteVisible(1000 + LOCK_AFTER_MS - 1)
    expect(lock().locked).toBe(false)
    lock().noteHidden(5000)
    lock().noteVisible(5000 + LOCK_AFTER_MS)
    expect(lock().locked).toBe(true)
    expect(lock().hiddenAt).toBeNull()
    useLock.setState({ enabled: false, locked: false })
    lock().lock()
    expect(lock().locked).toBe(false)
  })

  it('starts locked when the stored state says enabled', async () => {
    await lock().enable('2468', true)
    const raw = localStorage.getItem('fathoms.lock')
    useLock.setState({ enabled: false, pinHash: null, locked: false })
    localStorage.setItem('fathoms.lock', raw ?? '')
    await useLock.persist.rehydrate()
    expect(lock().enabled).toBe(true)
    expect(lock().locked).toBe(true)
    expect(lock().biometrics).toBe(true)
  })

  it('has no biometrics on the web', async () => {
    expect(await biometricsAvailable()).toBe(false)
    await lock().enable('2468', true)
    expect(await lock().unlockWithBiometrics()).toBe(false)
  })
})
