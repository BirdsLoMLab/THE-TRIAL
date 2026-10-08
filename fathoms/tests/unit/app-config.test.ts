import { describe, expect, it } from 'vitest'
import capacitorConfig from '../../capacitor.config'
import { APP_ID, APP_NAME } from '../../src/config/app'
import { getContent } from '../../src/content'

describe('app identity', () => {
  it('uses one app name in src/config, capacitor.config.ts, and shared.json', () => {
    expect(getContent().shared.appName).toBe(APP_NAME)
    expect(capacitorConfig.appName).toBe(APP_NAME)
  })

  it('uses one Android application id', () => {
    expect(capacitorConfig.appId).toBe(APP_ID)
    expect(APP_ID).toMatch(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/)
  })

  it('points Capacitor at the Vite output directory', () => {
    expect(capacitorConfig.webDir).toBe('dist')
  })
})
