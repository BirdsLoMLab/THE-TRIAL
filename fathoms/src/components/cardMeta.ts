import { getContent } from '../content'
import type { CardType, LevelId, PlayerId, RoomState } from '../game/types'

export interface CardLike {
  readonly level: LevelId | null
  readonly type: CardType
  readonly adult: boolean
}

interface LevelStyle {
  readonly block: string
  readonly chip: string
}

// Tailwind only sees complete class names, so level styles are a static map.
const LEVEL_STYLE: Record<LevelId, LevelStyle> = {
  1: { block: 'bg-level-1 text-abyss', chip: 'bg-level-1 text-abyss' },
  2: { block: 'bg-level-2 text-ink', chip: 'bg-level-2 text-ink' },
  3: {
    block: 'bg-level-3 text-ink ring-1 ring-edge',
    chip: 'bg-level-3 text-ink ring-1 ring-edge',
  },
}
const CURRENT_STYLE: LevelStyle = {
  block: 'bg-currents text-abyss',
  chip: 'bg-currents text-abyss',
}

export function levelStyle(card: CardLike): LevelStyle {
  return card.type === 'current' ? CURRENT_STYLE : LEVEL_STYLE[card.level ?? 1]
}

/** Shallows, Open Water, The Deep, or Currents. */
export function levelName(card: CardLike): string {
  if (card.type === 'current') return 'Currents'
  return getContent().shared.levels.find((level) => level.id === card.level)?.name ?? ''
}

export function packName(packId: string): string {
  return getContent().packs.find((pack) => pack.id === packId)?.name ?? packId
}

export function playerName(room: RoomState, uid: PlayerId): string {
  return room.players[uid]?.name ?? uid
}

export function playerColor(room: RoomState, uid: PlayerId): string {
  return room.players[uid]?.color ?? '#9fb0c3'
}
