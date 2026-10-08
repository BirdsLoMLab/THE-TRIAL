import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Button, Notice, Screen, TextInput } from '../components/ui'
import { biometricsAvailable, MAX_ATTEMPTS, useLock } from './lock'

function LockScreen() {
  const unlockWithPin = useLock((s) => s.unlockWithPin)
  const unlockWithBiometrics = useLock((s) => s.unlockWithBiometrics)
  const biometrics = useLock((s) => s.biometrics)
  const attempts = useLock((s) => s.attempts)
  const [pin, setPin] = useState('')
  const [wrong, setWrong] = useState(false)
  const [canBiometrics, setCanBiometrics] = useState(false)

  useEffect(() => {
    let active = true
    void biometricsAvailable().then((ok) => {
      if (!active) return
      setCanBiometrics(ok && biometrics)
      if (ok && biometrics) void unlockWithBiometrics()
    })
    return () => {
      active = false
    }
  }, [biometrics, unlockWithBiometrics])

  async function submit(event: FormEvent) {
    event.preventDefault()
    const ok = await unlockWithPin(pin)
    setWrong(!ok)
    setPin('')
  }

  const tooMany = attempts >= MAX_ATTEMPTS

  return (
    <Screen title="Locked" testId="screen-lock">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <p className="text-ink-muted">Enter your PIN to open Fathoms.</p>
        <label className="block">
          <span className="sr-only">PIN</span>
          <TextInput
            type="password"
            inputMode="numeric"
            autoComplete="off"
            pattern="[0-9]*"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
            placeholder="PIN"
            data-testid="lock-pin"
            className="text-center text-2xl tracking-[0.5em]"
          />
        </label>
        {wrong && (
          <Notice tone="error">
            {tooMany ? 'Too many tries. Wait a moment, then try again.' : 'That PIN is not right.'}
          </Notice>
        )}
        <Button
          type="submit"
          variant="primary"
          block
          disabled={pin.length < 4}
          data-testid="lock-unlock"
        >
          Unlock
        </Button>
        {canBiometrics && (
          <Button block onClick={() => void unlockWithBiometrics()} data-testid="lock-biometrics">
            Use fingerprint or face
          </Button>
        )}
      </form>
    </Screen>
  )
}

/** Shows the lock screen instead of its children while the app lock is on and locked. */
export function LockGate({ children }: { readonly children: ReactNode }) {
  const enabled = useLock((s) => s.enabled)
  const locked = useLock((s) => s.locked)
  if (enabled && locked) return <LockScreen />
  return <>{children}</>
}
