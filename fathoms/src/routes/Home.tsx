import { getContent } from '../content'
import { roomPhase } from '../game/turns'
import { useSameDevice } from '../store/sameDevice'
import { playerName } from '../components/cardMeta'
import { LinkButton, Notice, SectionLabel } from '../components/ui'

export function Home() {
  const content = getContent()
  const room = useSameDevice((s) => s.room)

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

      <section className="mt-10 flex flex-col gap-4" aria-label="Play on this phone">
        <SectionLabel>On this phone</SectionLabel>
        {room ? (
          <article className="bg-surface border-edge rounded-3xl border p-4">
            <p className="text-ink-muted text-sm">Game in progress</p>
            <p data-testid="home-status" className="mt-1 text-lg font-medium">
              {status}
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <LinkButton
                to="/same-device/turn"
                variant="primary"
                block
                data-testid="home-continue"
              >
                Continue
              </LinkButton>
              <div className="grid grid-cols-2 gap-2">
                <LinkButton to="/same-device/journal" data-testid="home-journal">
                  Journal
                </LinkButton>
                <LinkButton to="/same-device/settings" data-testid="home-settings">
                  Settings
                </LinkButton>
              </div>
            </div>
          </article>
        ) : (
          <LinkButton to="/same-device/new" variant="primary" block data-testid="home-new">
            Play on this phone
          </LinkButton>
        )}
        {room && (
          <LinkButton to="/same-device/new" variant="ghost" block data-testid="home-new">
            Start a different game
          </LinkButton>
        )}
      </section>

      <section className="mt-10" aria-label="Play across two phones">
        <SectionLabel>Across two phones</SectionLabel>
        <Notice>
          Rooms with turn alerts arrive in Phase 2. Until then, pass one phone back and forth.
        </Notice>
      </section>

      <footer className="text-ink-muted mt-auto pt-10 text-xs">
        Content version {content.shared.version}. {content.cards.length} cards in{' '}
        {content.packs.length} packs.
      </footer>
    </main>
  )
}
