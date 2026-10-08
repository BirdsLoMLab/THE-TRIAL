import { describe, expect, it } from 'vitest'
import {
  customToPool,
  MAX_CUSTOM_TEXT,
  newCustomCard,
  validateCustomCard,
} from '../../../src/game/custom'

describe('custom cards', () => {
  it('validate like content cards', () => {
    expect(
      validateCustomCard({ text: 'A fine question?', type: 'question', level: 2, adult: false }),
    ).toEqual([])
    expect(validateCustomCard({ text: '   ', type: 'question', level: 1, adult: false })).toContain(
      'Write the card first.',
    )
    expect(
      validateCustomCard({
        text: 'x'.repeat(MAX_CUSTOM_TEXT + 1),
        type: 'question',
        level: 1,
        adult: false,
      })[0],
    ).toContain('characters')
    expect(
      validateCustomCard({ text: 'Say "hi"', type: 'question', level: 1, adult: false })[0],
    ).toContain('double quotes')
    expect(
      validateCustomCard({ text: 'No level', type: 'question', level: null, adult: false }),
    ).toContain('Pick a level.')
    expect(
      validateCustomCard({ text: 'Do a thing', type: 'current', level: 2, adult: false }),
    ).toContain('A Current has no level.')
    expect(
      validateCustomCard({ text: 'Do a thing', type: 'current', level: null, adult: true }),
    ).toEqual([])
  })

  it('build a card and its pool form', () => {
    const card = newCustomCard(
      { text: '  Trim me  ', type: 'question', level: 3, adult: true },
      'custom-1',
      'alice',
      5,
    )
    expect(card).toEqual({
      id: 'custom-1',
      text: 'Trim me',
      type: 'question',
      level: 3,
      adult: true,
      createdBy: 'alice',
      createdAt: 5,
    })
    expect(customToPool(card)).toEqual({
      id: 'custom-1',
      pack: 'custom',
      adult: true,
      type: 'question',
      level: 3,
      text: 'Trim me',
      tags: [],
    })
    const current = newCustomCard(
      { text: 'Send a photo.', type: 'current', level: null, adult: false },
      'custom-2',
      'bob',
      6,
    )
    expect(current.level).toBeNull()
    expect(customToPool(current)).toEqual({
      id: 'custom-2',
      pack: 'custom',
      adult: false,
      type: 'current',
      level: null,
      modes: ['async', 'live'],
      text: 'Send a photo.',
      tags: [],
    })
    expect(() =>
      newCustomCard({ text: '', type: 'question', level: 1, adult: false }, 'x', 'alice', 1),
    ).toThrow('Write the card first.')
  })

  it('fall back to level 1 for a question stored without one', () => {
    expect(
      customToPool({
        id: 'c',
        text: 'Q',
        type: 'question',
        level: null,
        adult: false,
        createdBy: 'a',
        createdAt: 1,
      }).level,
    ).toBe(1)
  })
})
