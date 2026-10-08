import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { getContent } from '../content'
import { roomPhase } from '../game/turns'
import { useOnline } from '../store/online'
import { useSameDevice } from '../store/sameDevice'
import { playerName } from '../components/cardMeta'
import { Button, LinkButton, Notice, SectionLabel, TextInput } from '../components/ui'

export function Home() {
  const navigate = useNavigate()
  const content = getContent()
  const room = useSameDevice((s) => s.room)
  const onlineRoomId = useOnline((s) => s.roomId)
  const [code, setCode] = useState('')

  let status = ''
  if (room) {
    const phase = roomPhase(room)
    const holder = playerName(room, room.ball.holderUid)
    status =
      phase === 'paused'
        ? `Paused by ${playerName(room, room.paused?.by ?? room.ball.holderUid)}`
        : phase === 'exhausted'
          ? 'The deck is finished'
          : phase === 'rules'
            ? `${holder} still has to agree to the rules`
            : `${holder}'s turn, ${room.cards.length} cards dealt`
  }

  function join(event: FormEvent) {
    event.preventDefault()
    const trimmed = code.trim().replace(/^.*#\/join\//, '')
    if (trimmed) navigate(`/join/${trimmed}`)
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pt-14 pb-12">
      <header>
        <h1 data-testid="app-name" className="text-5xl font-semibold tracking-tight">
          {content.shared.appName}
        </h1>
        <p className="text-ink-muted mt-3 text-lg">
          A conversation game for two. Three levels, a few Currents, no winner.
        </p>
      </header>

      <section className="mt-10 flex flex-col gap-4" aria-label="Play across two phones">
        <SectionLabel>Across two phones</SectionLabel>
        {onlineRoomId ? (
          <article className="bg-surface border-edge rounded-3xl border p-4">
            <p className="text-ink-muted text-sm">Your room</p>
            <p className="mt-1 font-mono text-sm break-all" data-testid="home-room-code">
              {onlineRoomId}
            </p>
            <div className="mt-4">
              <LinkButton
                to={`/room/${onlineRoomId}`}
                variant="primary"
                block
                data-testid="home-room-continue"
              >
                Open the room
              </LinkButton>
            </div>
          </article>
        ) : (
          <>
            <LinkButton to="/room/new" variant="primary" block data-testid="home-create-room">
              Create a room
            </LinkButton>
            <form onSubmit={join} className="flex gap-2">
              <label className="flex-1">
                <span className="sr-only">Room code or invite link</span>
                <TextInput
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Room code or invite link"
                  autoComplete="off"
                  data-testid="home-join-code"
                />
              </label>
              <Button type="submit" disabled={code.trim() === ''} data-testid="home-join">
                Join
              </Button>
            </form>
          </>
        )}
      </section>

      <section className="mt-10 flex flex-col gap-4" aria-label="Play on this phone">
        <SectionLabel>On this phone</SectionLabel>
        {room ? (
          <article className="bg-surface border-edge rounded-3xl border p-4">
            <p className="text-ink-muted text-sm">Game in progress</p>
            <p data-testid="home-status" className="mt-1 text-lg font-medium">
              {status}
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <LinkButton to="/same-device/turn" block data-testid="home-continue">
                Continue
              </LinkButton>
              <div className="grid grid-cols-2 gap-2">
                <LinkButton to="/same-device/journal" variant="ghost" data-testid="home-journal">
                  Journal
                </LinkButton>
                <LinkButton to="/same-device/settings" variant="ghost" data-testid="home-settings">
                  Settings
                </LinkButton>
              </div>
            </div>
          </article>
        ) : (
          <LinkButton to="/same-device/new" block data-testid="home-new">
            Play on this phone
          </LinkButton>
        )}
        {room && (
          <LinkButton to="/same-device/new" variant="ghost" block data-testid="home-new">
            Start a different game
          </LinkButton>
        )}
        <Notice>Pass and play. No account, nothing leaves the phone.</Notice>
      </section>

      <footer className="text-ink-muted mt-auto pt-10 text-xs">
        Content version {content.shared.version}. {content.cards.length} cards in{' '}
        {content.packs.length} packs.
      </footer>
    </main>
  )
}
