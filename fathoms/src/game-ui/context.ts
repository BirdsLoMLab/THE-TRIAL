import { createContext, useContext } from 'react'
import type { Action, Reply } from '../game/turns'
import type { PlayerId, RoomState } from '../game/types'

export interface SendInput {
  readonly close?: string | undefined
  readonly open?: string | undefined
  readonly replies?: readonly Reply[] | undefined
}

/**
 * What a game screen needs, whatever carries the room: the Same Device store
 * (localStorage) or an online room (Firestore). Methods are async so the
 * online version can wait for its transaction; the Same Device version
 * resolves at once.
 */
export interface GameAdapter {
  readonly mode: 'same-device' | 'online'
  readonly room: RoomState
  /** Who is looking at the screen: the ball holder on one phone, me online. */
  readonly viewer: PlayerId
  /** Where this game's screens live, for example /same-device or /room/abc. */
  readonly basePath: string
  readonly roomId: string | null
  readonly inviteUrl: string | null
  readonly partnerOnline: boolean
  readonly busy: boolean
  readonly drafts: Readonly<Record<string, string>>
  setDraft(key: string, text: string): void
  dispatch(action: Action): Promise<void>
  sendTurn(input: SendInput): Promise<void>
  rebuildDeck(): Promise<void>
  readonly reveal: number | null
  finishReveal(): void
  readonly handoff: boolean
  acknowledgeHandoff(): void
  /** Same Device: delete the game. Online: forget the room on this device. */
  endGame(): Promise<void>
}

export const GameContext = createContext<GameAdapter | null>(null)

export function useGame(): GameAdapter {
  const game = useContext(GameContext)
  if (!game) throw new Error('useGame needs a game provider above it')
  return game
}
