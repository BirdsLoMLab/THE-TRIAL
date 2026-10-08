import { useEffect } from 'react'
import type { CardRecord } from '../game/types'
import { clock } from '../store/clock'
import { useGame } from './context'

/**
 * Stamps readBy for the viewer on an After Dark card they are looking at, so
 * the hide after read retention can run (PLAN 4.8). Other cards are not stamped.
 */
export function useMarkRead(card: CardRecord | null | undefined): void {
  const game = useGame()
  const seq = card?.seq
  const needs =
    card !== null &&
    card !== undefined &&
    card.adult &&
    card.status === 'closed' &&
    !(game.viewer in card.readBy)
  useEffect(() => {
    if (!needs || seq === undefined) return
    void game
      .dispatch({ type: 'markRead', by: game.viewer, at: clock.now(), seq })
      .catch(() => undefined)
  }, [needs, seq, game])
}
