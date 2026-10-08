import { onAuthStateChanged, signInAnonymously, type Auth } from 'firebase/auth'

/** Resolves the anonymous uid, signing in on first use. The uid is stable per device until the app data is cleared. */
export function ensureSignedIn(auth: Auth): Promise<string> {
  return new Promise((resolve, reject) => {
    const stop = onAuthStateChanged(
      auth,
      (user) => {
        if (user) {
          stop()
          resolve(user.uid)
          return
        }
        signInAnonymously(auth).catch((error: unknown) => {
          stop()
          reject(error instanceof Error ? error : new Error(String(error)))
        })
      },
      (error) => {
        stop()
        reject(error)
      },
    )
  })
}
