import { useEffect } from 'react'
import { clock } from '../store/clock'
import { useLock } from './lock'

/** Locks the app again after it spent LOCK_AFTER_MS in the background. Mount once. */
export function useLockOnResume(): void {
  const noteHidden = useLock((s) => s.noteHidden)
  const noteVisible = useLock((s) => s.noteVisible)
  useEffect(() => {
    const onChange = () => {
      if (document.visibilityState === 'hidden') noteHidden(clock.now())
      else noteVisible(clock.now())
    }
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [noteHidden, noteVisible])
}
