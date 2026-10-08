import { getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app'

const REQUIRED_KEYS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
] as const

export type FirebaseEnv = Readonly<Record<string, string | undefined>>

/** Build the Firebase web config from VITE_FIREBASE_* variables, or null if incomplete. */
export function firebaseConfigFromEnv(env: FirebaseEnv): FirebaseOptions | null {
  if (REQUIRED_KEYS.some((key) => !env[key])) return null
  return {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  }
}

/** The Firebase app, or null when .env.local has no config yet (Phase 0 and Phase 1 run without it). */
export function getFirebaseApp(env: FirebaseEnv = import.meta.env): FirebaseApp | null {
  const config = firebaseConfigFromEnv(env)
  if (!config) return null
  return getApps()[0] ?? initializeApp(config)
}
