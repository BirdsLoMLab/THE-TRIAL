import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { applyBump, nextVersion, versionCodeFor } from '../../scripts/bump-version'

describe('version bump', () => {
  it('computes the next version', () => {
    expect(nextVersion('0.1.0', 'patch')).toBe('0.1.1')
    expect(nextVersion('0.1.9', 'minor')).toBe('0.2.0')
    expect(nextVersion('1.2.3', 'major')).toBe('2.0.0')
    expect(nextVersion('1.2.3', '3.0.1')).toBe('3.0.1')
    expect(() => nextVersion('1.2', 'patch')).toThrow('not x.y.z')
    expect(() => nextVersion('1.2.3', 'huge')).toThrow('bump must be')
  })

  it('derives a strictly increasing Android versionCode', () => {
    expect(versionCodeFor('0.1.0')).toBe(100)
    expect(versionCodeFor('0.1.1')).toBe(101)
    expect(versionCodeFor('1.2.3')).toBe(10_203)
    expect(versionCodeFor('1.2.3')).toBeGreaterThan(versionCodeFor('1.1.99'))
  })

  it('rewrites package.json, app.ts, and the Android gradle file together', () => {
    const root = mkdtempSync(join(tmpdir(), 'fathoms-bump-'))
    mkdirSync(join(root, 'src', 'config'), { recursive: true })
    mkdirSync(join(root, 'android', 'app'), { recursive: true })
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ name: 'x', version: '0.1.0' }, null, 2) + '\n',
    )
    writeFileSync(join(root, 'src', 'config', 'app.ts'), "export const APP_VERSION = '0.1.0'\n")
    writeFileSync(
      join(root, 'android', 'app', 'build.gradle'),
      'versionCode 1\n        versionName "1.0"\n',
    )
    const result = applyBump(root, 'minor')
    expect(result).toEqual({ from: '0.1.0', to: '0.2.0', versionCode: 200 })
    expect(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))).toEqual({
      name: 'x',
      version: '0.2.0',
    })
    expect(readFileSync(join(root, 'src', 'config', 'app.ts'), 'utf8')).toBe(
      "export const APP_VERSION = '0.2.0'\n",
    )
    expect(readFileSync(join(root, 'android', 'app', 'build.gradle'), 'utf8')).toBe(
      'versionCode 200\n        versionName "0.2.0"\n',
    )
  })
})
