import { useMemo } from 'react'
import { Navigate, Outlet } from 'react-router'
import { clock } from '../store/clock'
import { useSameDevice } from '../store/sameDevice'
import { GameContext, type GameAdapter } from './context'

/** Provides the Same Device game to the screens under /same-device. */
export function SameDeviceLayout() {
  const room = useSameDevice((s) => s.room)
  const handoff = useSameDevice((s) => s.handoff)
  const reveal = useSameDevice((s) => s.reveal)
  const drafts = useSameDevice((s) => s.drafts)
  const setDraft = useSameDevice((s) => s.setDraft)
  const dispatch = useSameDevice((s) => s.dispatch)
  const sendTurn = useSameDevice((s) => s.sendTurn)
  const rebuildDeck = useSameDevice((s) => s.rebuildDeck)
  const finishReveal = useSameDevice((s) => s.finishReveal)
  const acknowledgeHandoff = useSameDevice((s) => s.acknowledgeHandoff)
  const endGame = useSameDevice((s) => s.endGame)

  const adapter = useMemo<GameAdapter | null>(() => {
    if (!room) return null
    return {
      mode: 'same-device',
      room,
      viewer: room.ball.holderUid,
      basePath: '/same-device',
      roomId: null,
      inviteUrl: null,
      partnerOnline: true,
      busy: false,
      drafts,
      setDraft,
      dispatch: async (action) => dispatch(action),
      sendTurn: async (input) => sendTurn(input, clock.now()),
      rebuildDeck: async () => rebuildDeck(room.ball.holderUid, clock.now()),
      reveal,
      finishReveal,
      handoff,
      acknowledgeHandoff,
      endGame: async () => endGame(),
    }
  }, [
    room,
    handoff,
    reveal,
    drafts,
    setDraft,
    dispatch,
    sendTurn,
    rebuildDeck,
    finishReveal,
    acknowledgeHandoff,
    endGame,
  ])

  if (!adapter) return <Navigate to="/" replace />
  return <GameContext value={adapter}>{<Outlet />}</GameContext>
}
