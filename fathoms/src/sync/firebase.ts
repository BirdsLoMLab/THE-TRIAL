import { getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app'
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore'

const REQUIRED_KEYS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
] as const

export type FirebaseEnv = Readonly<Record<string, string | undefined>>

export const EMULATOR_HOST = '127.0.0.1'
export const AUTH_EMULATOR_PORT = 9099
export const FIRESTORE_EMULATOR_PORT = 8080

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

/** True when VITE_FIREBASE_EMULATORS is set, so the app talks to the local emulators. */
export function emulatorsEnabled(env: FirebaseEnv): boolean {
  const value = env.VITE_FIREBASE_EMULATORS
  return value === '1' || value === 'true'
}

/** The Firebase app, or null when .env.local has no config yet (Phase 0 and Phase 1 run without it). */
export function getFirebaseApp(env: FirebaseEnv = import.meta.env): FirebaseApp | null {
  const config = firebaseConfigFromEnv(env)
  if (!config) return null
  return getApps()[0] ?? initializeApp(config)
}

const connected = new WeakSet<FirebaseApp>()

/** Firestore and Auth for the app, pointed at the emulators when the env says so. Null without a config. */
export function getFirebaseServices(
  env: FirebaseEnv = import.meta.env,
): { db: Firestore; auth: Auth } | null {
  const app = getFirebaseApp(env)
  if (!app) return null
  const db = getFirestore(app)
  const auth = getAuth(app)
  if (emulatorsEnabled(env) && !connected.has(app)) {
    connected.add(app)
    connectFirestoreEmulator(db, EMULATOR_HOST, FIRESTORE_EMULATOR_PORT)
    connectAuthEmulator(auth, `http://${EMULATOR_HOST}:${AUTH_EMULATOR_PORT}`, {
      disableWarnings: true,
    })
  }
  return { db, auth }
}
