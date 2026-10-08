// Custom cards (PLAN 4.6 and Phase 4): written by the players, dealt like pack
// cards under the pack id "custom". Pure validation and conversion.
import type { CardType, CustomCard, LevelId, PlayerId, PoolCard } from './types'

export const MAX_CUSTOM_TEXT = 220

export interface CustomCardInput {
  readonly text: string
  readonly type: CardType
  readonly level: LevelId | null
  readonly adult: boolean
}

/** The same rules as the content schema: 1 to 220 characters, no double quote, a level for a question. */
export function validateCustomCard(input: CustomCardInput): string[] {
  const problems: string[] = []
  const text = input.text.trim()
  if (!text) problems.push('Write the card first.')
  if (text.length > MAX_CUSTOM_TEXT) problems.push(`Keep it under ${MAX_CUSTOM_TEXT} characters.`)
  if (text.includes('"')) problems.push('No double quotes; use single quotes if you need them.')
  if (input.type === 'question' && ![1, 2, 3].includes(input.level ?? 0))
    problems.push('Pick a level.')
  if (input.type === 'current' && input.level !== null) problems.push('A Current has no level.')
  return problems
}

export function newCustomCard(
  input: CustomCardInput,
  id: string,
  createdBy: PlayerId,
  createdAt: number,
): CustomCard {
  const problems = validateCustomCard(input)
  if (problems.length) throw new Error(problems.join(' '))
  return {
    id,
    text: input.text.trim(),
    type: input.type,
    level: input.type === 'current' ? null : input.level,
    adult: input.adult,
    createdBy,
    createdAt,
  }
}

/** A custom card as the deck builder and the reducer see it. */
export function customToPool(card: CustomCard): PoolCard {
  if (card.type === 'current') {
    return {
      id: card.id,
      pack: 'custom',
      adult: card.adult,
      type: 'current',
      level: null,
      modes: ['async', 'live'],
      text: card.text,
      tags: [],
    }
  }
  return {
    id: card.id,
    pack: 'custom',
    adult: card.adult,
    type: 'question',
    level: card.level ?? 1,
    text: card.text,
    tags: [],
  }
}
