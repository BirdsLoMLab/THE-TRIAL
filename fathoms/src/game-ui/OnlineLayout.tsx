import { useEffect, useMemo, useState } from 'react'
import { Navigate, Outlet, useParams } from 'react-router'
import { Button, LinkButton, Notice, Screen } from '../components/ui'
import type { PlayerId } from '../game/types'
import { lookupFor } from '../store/lookup'
import { inviteUrlFor, partnerIsOnline, readyState, useOnline } from '../store/online'
import type { RoomDoc } from '../sync/model'
import { GameContext, type GameAdapter } from './context'
import { useNow } from './useNow'

function Message({
  title,
  children,
  testId,
}: {
  readonly title: string
  readonly children: React.ReactNode
  readonly testId: string
}) {
  return (
    <Screen title={title} back="/" testId={testId}>
      <div className="text-ink-muted flex flex-col gap-4">{children}</div>
    </Screen>
  )
}

function InviteView({
  roomId,
  doc,
  uid,
}: {
  readonly roomId: string
  readonly doc: RoomDoc
  readonly uid: PlayerId
}) {
  const leave = useOnline((s) => s.leaveRoom)
  const url = inviteUrlFor(roomId)
  const [copied, setCopied] = useState(false)
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  const me = doc.players[uid]

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  async function share() {
    try {
      await navigator.share({ title: 'Fathoms', text: 'Play Fathoms with me.', url })
    } catch {
      // Cancelled. Nothing to do.
    }
  }

  return (
    <Screen title="Invite your partner" testId="screen-invite">
      <p className="text-ink-muted">
        {me ? `${me.name}, you` : 'You'} hold the first card. Send this link; the room opens the
        moment your partner joins.
      </p>
      <div className="bg-surface border-edge mt-6 rounded-3xl border p-4">
        <p className="text-ink-muted text-xs font-semibold tracking-widest uppercase">
          Invite link
        </p>
        <p className="mt-2 font-mono text-sm break-all" data-testid="invite-url">
          {url}
        </p>
        <p className="text-ink-muted mt-3 text-xs font-semibold tracking-widest uppercase">
          Room code
        </p>
        <p className="mt-1 font-mono text-lg" data-testid="invite-code">
          {roomId}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button onClick={copy} data-testid="invite-copy">
            {copied ? 'Copied' : 'Copy link'}
          </Button>
          {canShare ? (
            <Button variant="primary" onClick={share} data-testid="invite-share">
              Share
            </Button>
          ) : (
            <Button disabled>Share</Button>
          )}
        </div>
      </div>
      <p className="text-ink-muted mt-6 text-sm" data-testid="invite-waiting">
        Waiting for your partner. Keep this page open or come back later; the room remembers you.
      </p>
      <div className="mt-8">
        <LinkButton to="/" variant="ghost" block>
          Home
        </LinkButton>
        <Button variant="ghost" block onClick={leave} data-testid="invite-leave">
          Forget this room on this phone
        </Button>
      </div>
    </Screen>
  )
}

/** Connects to /room/:roomId and provides the game to the screens under it. */
export function OnlineLayout() {
  const { roomId } = useParams()
  const uid = useOnline((s) => s.uid)
  const status = useOnline((s) => s.status)
  const error = useOnline((s) => s.error)
  const snapshot = useOnline((s) => s.snapshot)
  const currentRoomId = useOnline((s) => s.roomId)
  const busy = useOnline((s) => s.busy)
  const reveal = useOnline((s) => s.reveal)
  const allDrafts = useOnline((s) => s.drafts)
  const openRoom = useOnline((s) => s.openRoom)
  const runAction = useOnline((s) => s.runAction)
  const sendTurn = useOnline((s) => s.sendTurn)
  const rebuildDeck = useOnline((s) => s.rebuildDeck)
  const finishReveal = useOnline((s) => s.finishReveal)
  const setDraftRaw = useOnline((s) => s.setDraft)
  const leaveRoom = useOnline((s) => s.leaveRoom)
  const customCards = useOnline((s) => s.customCards)
  const addCustomCard = useOnline((s) => s.addCustomCard)
  const removeCustomCard = useOnline((s) => s.removeCustomCard)
  const deleteRoom = useOnline((s) => s.deleteRoom)
  const now = useNow()

  useEffect(() => {
    if (roomId) void openRoom(roomId).catch(() => undefined)
  }, [roomId, openRoom])

  const state = readyState(snapshot)
  const drafts = useMemo(() => {
    const prefix = `${roomId ?? ''}:`
    const scoped: Record<string, string> = {}
    for (const [key, text] of Object.entries(allDrafts)) {
      if (key.startsWith(prefix)) scoped[key.slice(prefix.length)] = text
    }
    return scoped
  }, [allDrafts, roomId])

  const adapter = useMemo<GameAdapter | null>(() => {
    if (!state || !uid || !roomId) return null
    return {
      mode: 'online',
      room: state,
      viewer: uid,
      basePath: `/room/${roomId}`,
      roomId,
      inviteUrl: inviteUrlFor(roomId),
      partnerOnline: partnerIsOnline(state, uid, now),
      busy,
      drafts,
      setDraft: (key, text) => setDraftRaw(`${roomId}:${key}`, text),
      dispatch: runAction,
      sendTurn,
      rebuildDeck,
      reveal,
      finishReveal,
      handoff: false,
      acknowledgeHandoff: () => undefined,
      endGame: async () => leaveRoom(),
      lookup: lookupFor(customCards),
      customCards,
      addCustomCard,
      removeCustomCard,
      deleteRoom,
    }
  }, [
    state,
    uid,
    roomId,
    customCards,
    addCustomCard,
    removeCustomCard,
    deleteRoom,
    now,
    busy,
    drafts,
    setDraftRaw,
    runAction,
    sendTurn,
    rebuildDeck,
    reveal,
    finishReveal,
    leaveRoom,
  ])

  if (!roomId) return <Navigate to="/" replace />
  if (status === 'unavailable') {
    return (
      <Message title="Rooms are off" testId="screen-room-unavailable">
        <p>{error ?? 'No Firebase config on this build.'}</p>
        <p>
          Add the Firebase web config to .env.local (README, Firebase) and rebuild. Same Device mode
          works without it.
        </p>
      </Message>
    )
  }
  if (status === 'error') {
    return (
      <Message title="Could not open the room" testId="screen-room-error">
        <p data-testid="room-error">{error}</p>
        <Notice>If this room is full or not yours, forget it and create or join another.</Notice>
        <Button variant="ghost" block onClick={leaveRoom} data-testid="room-forget">
          Forget this room on this phone
        </Button>
      </Message>
    )
  }
  if (!snapshot || currentRoomId !== roomId) {
    return (
      <Message title="Connecting" testId="screen-room-connecting">
        <p>Opening room {roomId}.</p>
      </Message>
    )
  }
  if (snapshot.kind === 'missing') {
    return (
      <Message title="No such room" testId="screen-room-missing">
        <p>Room {roomId} does not exist. Check the link, or create a new room.</p>
        <Button variant="ghost" block onClick={leaveRoom} data-testid="room-forget">
          Forget it
        </Button>
      </Message>
    )
  }
  if (snapshot.kind === 'pending') {
    if (uid && !(uid in snapshot.doc.players)) return <Navigate to={`/join/${roomId}`} replace />
    return <InviteView roomId={roomId} doc={snapshot.doc} uid={uid ?? ''} />
  }
  if (!adapter) return null
  return <GameContext value={adapter}>{<Outlet />}</GameContext>
}

/** /room/:roomId lands on the turn screen once the room is ready. */
export function RoomIndex() {
  const { roomId } = useParams()
  return <Navigate to={`/room/${roomId}/turn`} replace />
}
