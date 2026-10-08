import { describe, expect, it } from 'vitest'
import { firebaseConfigFromEnv, getFirebaseApp } from '../../src/sync/firebase'

const full = {
  VITE_FIREBASE_API_KEY: 'key',
  VITE_FIREBASE_AUTH_DOMAIN: 'demo.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'demo',
  VITE_FIREBASE_STORAGE_BUCKET: 'demo.appspot.com',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '123',
  VITE_FIREBASE_APP_ID: '1:123:web:abc',
}

describe('firebase config', () => {
  it('is null until the required VITE_FIREBASE_* variables exist', () => {
    expect(firebaseConfigFromEnv({})).toBeNull()
    expect(firebaseConfigFromEnv({ ...full, VITE_FIREBASE_PROJECT_ID: '' })).toBeNull()
    expect(getFirebaseApp({})).toBeNull()
  })

  it('maps the variables onto Firebase options', () => {
    expect(firebaseConfigFromEnv(full)).toEqual({
      apiKey: 'key',
      authDomain: 'demo.firebaseapp.com',
      projectId: 'demo',
      storageBucket: 'demo.appspot.com',
      messagingSenderId: '123',
      appId: '1:123:web:abc',
    })
  })

  it('initializes one app and reuses it', () => {
    const first = getFirebaseApp(full)
    expect(first?.options.projectId).toBe('demo')
    expect(getFirebaseApp(full)).toBe(first)
  })
})
