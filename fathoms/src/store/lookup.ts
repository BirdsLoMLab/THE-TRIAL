import { getContent } from '../content'
import { customToPool } from '../game/custom'
import type { CardLookup, CustomCard, PoolCard } from '../game/types'

let contentById: Map<string, PoolCard> | null = null

function contentMap(): Map<string, PoolCard> {
  contentById ??= new Map(getContent().cards.map((card) => [card.id, card]))
  return contentById
}

/** Bundled cards plus a room's custom cards, as the reducer and the deck builder see them. */
export function poolFor(custom: readonly CustomCard[]): PoolCard[] {
  return [...getContent().cards, ...custom.map(customToPool)]
}

export function lookupFor(custom: readonly CustomCard[]): CardLookup {
  const customById = new Map(custom.map((card) => [card.id, customToPool(card)]))
  return (id) => customById.get(id) ?? contentMap().get(id)
}
