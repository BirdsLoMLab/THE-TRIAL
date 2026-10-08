import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import capacitorConfig from '../../capacitor.config'
import { getContent } from '../../src/content'

function token(css: string, name: string): string {
  const match = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`))
  if (!match?.[1]) throw new Error(`token --color-${name} missing from index.css`)
  return match[1].toLowerCase()
}

describe('theme tokens', () => {
  const css = readFileSync(resolve(import.meta.dirname, '../../src/index.css'), 'utf8')
  const shared = getContent().shared

  it('match the level colors in shared.json', () => {
    for (const level of shared.levels) {
      expect(token(css, `level-${level.id}`)).toBe(level.color.toLowerCase())
    }
  })

  it('match the native shell background in capacitor.config.ts and the Android resources', () => {
    const abyss = token(css, 'abyss')
    expect(capacitorConfig.backgroundColor?.toLowerCase()).toBe(abyss)
    const androidColors = readFileSync(
      resolve(import.meta.dirname, '../../android/app/src/main/res/values/fathoms_colors.xml'),
      'utf8',
    )
    const match = androidColors.match(/name="fathoms_abyss">(#[0-9a-fA-F]{6})</)
    expect(match?.[1]?.toLowerCase()).toBe(abyss)
  })

  it('match the Current and After Dark accents in shared.json', () => {
    expect(token(css, 'currents')).toBe(shared.currentColor.toLowerCase())
    expect(token(css, 'afterdark')).toBe(shared.afterDarkColor.toLowerCase())
  })
})
