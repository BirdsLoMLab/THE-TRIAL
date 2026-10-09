import { useEffect } from 'react'
import type { CardRecord, PlayerId } from '../game/types'
import { clock } from '../store/clock'
import { useGame } from './context'

/**
 * Stamps readBy for the reader on an After Dark card they are looking at, so
 * the hide after read retention can run (PLAN 4.8). Other cards are not
 * stamped. The reader defaults to the viewer; the reveal passes the closer,
 * since on one phone the viewer is whoever holds the ball.
 */
export function useMarkRead(card: CardRecord | null | undefined, reader?: PlayerId): void {
  const game = useGame()
  const by = reader ?? game.viewer
  const seq = card?.seq
  const needs =
    card !== null &&
    card !== undefined &&
    card.adult &&
    card.status === 'closed' &&
    !(by in card.readBy)
  useEffect(() => {
    if (!needs || seq === undefined) return
    void game.dispatch({ type: 'markRead', by, at: clock.now(), seq }).catch(() => undefined)
  }, [needs, seq, by, game])
}
