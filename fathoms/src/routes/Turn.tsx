import { useMemo, useState } from 'react'
import { Navigate } from 'react-router'
import { getContent } from '../content'
import { hashSeed } from '../game/deck'
import {
  cardBySeq,
  GameError,
  NUDGE_INTERVAL_MS,
  roomPhase,
  turnView,
  visibleAnswers,
  type PendingFollowUp,
  type TurnView,
} from '../game/turns'
import type { CardRecord, PlayerId, RoomState } from '../game/types'
import { useGame, type GameAdapter } from '../game-ui/context'
import { useMarkRead } from '../game-ui/useMarkRead'
import { timeAgo, useNow } from '../game-ui/useNow'
import { draftKey, nextDeckSize } from '../store/sameDevice'
import { clock } from '../store/clock'
import { playerColor, playerName } from '../components/cardMeta'
import { AnswerList, CardBlock } from '../components/cards'
import { ReactionRow } from '../components/ReactionRow'
import {
  Button,
  LinkButton,
  Notice,
  PlayerDot,
  Screen,
  SectionLabel,
  TextArea,
} from '../components/ui'

function errorText(caught: unknown): string {
  return caught instanceof GameError
    ? caught.message
    : caught instanceof Error
      ? caught.message
      : String(caught)
}

function otherPlayer(room: RoomState, uid: PlayerId): PlayerId {
  return room.order[0] === uid ? room.order[1] : room.order[0]
}

function NavRight({ game }: { readonly game: GameAdapter }) {
  return (
    <nav className="flex items-center gap-1" aria-label="More screens">
      {game.mode === 'online' && (
        <span
          aria-label={game.partnerOnline ? 'Partner online' : 'Partner offline'}
          title={game.partnerOnline ? 'Partner online' : 'Partner offline'}
          data-testid="presence-dot"
          data-online={game.partnerOnline ? 'true' : 'false'}
          className={`mr-1 inline-block h-2.5 w-2.5 rounded-full ${game.partnerOnline ? 'bg-level-1' : 'bg-edge'}`}
        />
      )}
      <LinkButton
        to={`${game.basePath}/journal`}
        variant="ghost"
        className="px-2 text-sm"
        data-testid="nav-journal"
      >
        Journal
      </LinkButton>
      <LinkButton
        to={`${game.basePath}/settings`}
        variant="ghost"
        className="px-2 text-sm"
        data-testid="nav-settings"
      >
        Settings
      </LinkButton>
    </nav>
  )
}

function HandoffView({ game }: { readonly game: GameAdapter }) {
  const { room } = game
  const holder = room.ball.holderUid
  return (
    <Screen title="Pass the phone" right={<NavRight game={game} />} testId="screen-handoff">
      <div className="flex flex-1 flex-col items-center justify-center gap-6 py-10 text-center">
        <span
          aria-hidden="true"
          className="h-20 w-20 rounded-full"
          style={{ backgroundColor: playerColor(room, holder) }}
        />
        <p className="text-2xl font-medium">
          Hand this to <span data-testid="handoff-name">{playerName(room, holder)}</span>.
        </p>
        <p className="text-ink-muted">Answers stay hidden until both of you have written one.</p>
      </div>
      <Button variant="primary" block onClick={game.acknowledgeHandoff} data-testid="handoff-ack">
        I am {playerName(room, holder)}
      </Button>
    </Screen>
  )
}

function PausedView({ game }: { readonly game: GameAdapter }) {
  const { room } = game
  const [error, setError] = useState<string | null>(null)
  const paused = room.paused
  if (!paused) return null
  async function resume() {
    try {
      await game.dispatch({ type: 'resume', by: game.viewer, at: clock.now() })
    } catch (caught) {
      setError(errorText(caught))
    }
  }
  return (
    <Screen title="Paused" right={<NavRight game={game} />} testId="screen-paused">
      <div className="bg-surface border-edge rounded-3xl border p-5">
        <p className="text-xl font-medium">Paused by {playerName(room, paused.by)}</p>
        {paused.note && <p className="text-ink-muted mt-2 whitespace-pre-wrap">{paused.note}</p>}
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="mt-8">
        <Button variant="primary" block onClick={resume} disabled={game.busy} data-testid="resume">
          Resume
        </Button>
      </div>
    </Screen>
  )
}

function FollowUpBox({
  game,
  card,
  asker,
}: {
  readonly game: GameAdapter
  readonly card: CardRecord
  readonly asker: PlayerId
}) {
  const { room } = game
  const [error, setError] = useState<string | null>(null)
  const key = draftKey.followUp(card.seq)
  const text = game.drafts[key] ?? ''
  const mine = card.followUps[asker]
  const partner = otherPlayer(room, asker)

  if (mine) {
    return (
      <div className="bg-abyss/25 rounded-2xl p-3 text-sm">
        <p className="text-xs font-semibold tracking-wide uppercase opacity-80">You asked</p>
        <p className="mt-1 text-base">{mine.text}</p>
        {mine.reply ? (
          <p className="mt-2">
            <span className="font-semibold">{playerName(room, partner)}:</span> {mine.reply.text}
          </p>
        ) : (
          <p className="mt-2 opacity-80">
            {playerName(room, partner)} answers at the start of their next turn.
          </p>
        )}
      </div>
    )
  }
  if (card.status !== 'closed' || card.type !== 'question') return null

  async function ask() {
    setError(null)
    try {
      await game.dispatch({ type: 'askFollowUp', by: asker, at: clock.now(), seq: card.seq, text })
      game.setDraft(key, '')
    } catch (caught) {
      setError(errorText(caught))
    }
  }

  const suggestions = getContent().shared.followUps
  const suggestion = suggestions[hashSeed(`${room.deck.seed}:${card.seq}`) % suggestions.length]

  return (
    <div>
      <label
        className="block text-xs font-semibold tracking-wide uppercase opacity-80"
        htmlFor={`follow-up-${card.seq}`}
      >
        Ask one follow-up about {playerName(room, partner)}&apos;s answer
      </label>
      <TextArea
        id={`follow-up-${card.seq}`}
        data-testid={`follow-up-${card.seq}`}
        rows={2}
        className="mt-1"
        value={text}
        placeholder={suggestion?.text ?? 'Your question'}
        onChange={(e) => game.setDraft(key, e.target.value)}
      />
      {error && <Notice tone="error">{error}</Notice>}
      <div className="mt-2 flex justify-end">
        <Button
          onClick={ask}
          disabled={text.trim() === '' || game.busy}
          data-testid={`follow-up-ask-${card.seq}`}
        >
          Ask
        </Button>
      </div>
    </div>
  )
}

function RevealView({ game, seq }: { readonly game: GameAdapter; readonly seq: number }) {
  const { room } = game
  const card = cardBySeq(room, seq)
  // The sender is the player who no longer holds the ball.
  const sender = otherPlayer(room, room.ball.holderUid)
  useMarkRead(card)
  if (!card) return null
  const answers = visibleAnswers(room, card, sender)
  const waitingForOpener = card.status === 'closed' && !answers[card.openerUid]
  return (
    <Screen title="Reveal" testId="screen-reveal">
      <CardBlock card={card} label="Both answers" animate="reveal" testId="reveal-card">
        <AnswerList room={room} answers={answers} order={[card.openerUid, card.closerUid]} />
        {waitingForOpener && (
          <p className="mt-2 text-sm opacity-80">
            Fetching {playerName(room, card.openerUid)}&apos;s answer.
          </p>
        )}
        <div className="mt-4">
          <FollowUpBox game={game} card={card} asker={sender} />
        </div>
      </CardBlock>
      <p className="text-ink-muted mt-4 text-sm">
        {playerName(room, room.ball.holderUid)} sees this at the start of their turn.
      </p>
      <div className="mt-8">
        <Button variant="primary" block onClick={game.finishReveal} data-testid="reveal-done">
          Done
        </Button>
      </div>
    </Screen>
  )
}

function CatchUpBlock({ game, view }: { readonly game: GameAdapter; readonly view: TurnView }) {
  const { room } = game
  const catchUp = view.catchUp
  useMarkRead(catchUp?.card)
  if (!catchUp) return null
  const { card } = catchUp
  const passed = card.status === 'passed'
  return (
    <CardBlock card={card} label="Catch up" animate="reveal" testId="catch-up">
      {passed ? (
        <p className="bg-abyss/25 rounded-2xl p-3 text-base">
          {playerName(room, card.passedBy ?? view.partner)} passed on this card.
          {card.answers[view.holder] ? ' Your answer stays in the journal.' : ''}
        </p>
      ) : (
        <AnswerList
          room={room}
          answers={visibleAnswers(room, card, view.holder)}
          order={[card.openerUid, card.closerUid]}
        />
      )}
      <ReactionRow card={card} viewer={view.holder} />
      {!passed && (
        <div className="mt-4">
          <FollowUpBox game={game} card={card} asker={view.holder} />
        </div>
      )}
    </CardBlock>
  )
}

function PendingFollowUpBlock({
  game,
  pending,
  view,
}: {
  readonly game: GameAdapter
  readonly pending: PendingFollowUp
  readonly view: TurnView
}) {
  const { room } = game
  const key = draftKey.reply(pending.card.seq)
  const own = pending.card.answers[view.holder]
  return (
    <section
      className="bg-surface border-edge rounded-3xl border p-4"
      data-testid={`pending-${pending.card.seq}`}
    >
      <p className="text-ink-muted text-xs font-semibold tracking-widest uppercase">
        {playerName(room, pending.askedBy)} asked about card {pending.card.seq}
      </p>
      <p className="text-ink-muted mt-2 text-sm">{pending.card.cardText}</p>
      {own && (
        <p className="mt-2 text-sm">
          <span className="text-ink-muted">You wrote:</span> {own.text}
        </p>
      )}
      <p className="mt-3 text-lg font-medium">{pending.followUp.text}</p>
      <TextArea
        aria-label={`Reply to ${playerName(room, pending.askedBy)}`}
        data-testid={`reply-${pending.card.seq}`}
        rows={2}
        className="mt-3"
        value={game.drafts[key] ?? ''}
        placeholder="Reply, or leave it"
        onChange={(e) => game.setDraft(key, e.target.value)}
      />
    </section>
  )
}

function OverflowMenu({ game, view }: { readonly game: GameAdapter; readonly view: TurnView }) {
  const { room } = game
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pauseNote, setPauseNote] = useState('')
  const [pausing, setPausing] = useState(false)

  async function run(label: string, action: Parameters<GameAdapter['dispatch']>[0]) {
    setError(null)
    try {
      await game.dispatch(action)
      setOpen(false)
    } catch (caught) {
      setError(`${label}: ${errorText(caught)}`)
    }
  }
  const at = () => clock.now()
  const holder = view.holder
  const lighterActive = view.lighter !== null && room.cards.length < view.lighter.until

  return (
    <div className="relative">
      <Button
        variant="ghost"
        className="px-2 text-sm"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        data-testid="turn-menu"
      >
        More
      </Button>
      {open && (
        <div
          role="menu"
          className="bg-surface border-edge absolute right-0 z-10 mt-1 flex w-64 flex-col gap-1 rounded-2xl border p-2 shadow-xl"
        >
          <p className="text-ink-muted px-3 py-1 text-xs">
            {view.passesLeft} {view.passesLeft === 1 ? 'pass' : 'passes'} left this deck
          </p>
          {view.close && (
            <Button
              role="menuitem"
              variant="ghost"
              className="justify-start text-left"
              onClick={() => run('Pass', { type: 'pass', by: holder, at: at(), target: 'close' })}
              data-testid="menu-pass-close"
            >
              Pass the card to close
            </Button>
          )}
          {view.open && (
            <Button
              role="menuitem"
              variant="ghost"
              className="justify-start text-left"
              onClick={() => run('Pass', { type: 'pass', by: holder, at: at(), target: 'open' })}
              data-testid="menu-pass-open"
            >
              Pass the next card
            </Button>
          )}
          <Button
            role="menuitem"
            variant="ghost"
            className="justify-start text-left"
            onClick={() => run('Go lighter', { type: 'lighter', by: holder, at: at() })}
            data-testid="menu-lighter"
          >
            {lighterActive
              ? 'Going lighter: extend'
              : `Go lighter for ${room.settings.lighterWindowCards} cards`}
          </Button>
          {pausing ? (
            <div className="px-2 py-1">
              <TextArea
                rows={2}
                value={pauseNote}
                placeholder="Note for your partner (optional)"
                aria-label="Pause note"
                onChange={(e) => setPauseNote(e.target.value)}
                data-testid="pause-note"
              />
              <Button
                block
                className="mt-2"
                onClick={() =>
                  run('Pause', { type: 'pause', by: holder, at: at(), note: pauseNote })
                }
                data-testid="menu-pause-confirm"
              >
                Pause the game
              </Button>
            </div>
          ) : (
            <Button
              role="menuitem"
              variant="ghost"
              className="justify-start text-left"
              onClick={() => setPausing(true)}
              data-testid="menu-pause"
            >
              Pause
            </Button>
          )}
          {error && <Notice tone="error">{error}</Notice>}
        </div>
      )}
    </div>
  )
}

function ExhaustedView({ game, view }: { readonly game: GameAdapter; readonly view: TurnView }) {
  const { room } = game
  const [error, setError] = useState<string | null>(null)
  const closers = getContent().shared.closers
  const closer = closers[hashSeed(room.deck.seed) % closers.length]
  // The ball passed at ball.since, close enough to now for a count that only informs.
  const size = nextDeckSize(room, room.ball.since, game.customCards)
  async function newDeck() {
    setError(null)
    try {
      await game.rebuildDeck()
    } catch (caught) {
      setError(errorText(caught))
    }
  }
  return (
    <Screen title="Deck finished" right={<NavRight game={game} />} testId="screen-exhausted">
      <CatchUpBlock game={game} view={view} />
      <section className="bg-surface border-edge mt-4 rounded-3xl border p-5">
        <SectionLabel>Before you go</SectionLabel>
        <p className="text-xl leading-snug font-medium" data-testid="closer-text">
          {closer?.text}
        </p>
        <p className="text-ink-muted mt-3 text-sm">
          Talk it through, then deal again whenever you like.
        </p>
      </section>
      <p className="text-ink-muted mt-4 text-sm" data-testid="next-deck-note">
        {room.cards.length} cards in the journal.{' '}
        {size > 0
          ? `A new deck has ${size} cards, skips the ones you already answered, and asks for the rules again.`
          : 'Every card in the enabled packs has been answered. Add a pack, start lower, or deal answered cards again in Settings.'}
      </p>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="mt-6 flex flex-col gap-2">
        <Button
          variant="primary"
          block
          onClick={newDeck}
          disabled={size === 0 || game.busy}
          data-testid="new-deck"
        >
          {size > 0 ? `New deck (${size} cards)` : 'New deck'}
        </Button>
        <LinkButton to={`${game.basePath}/settings`} block data-testid="exhausted-settings">
          Settings
        </LinkButton>
        <LinkButton to={`${game.basePath}/journal`} variant="ghost" block>
          Read the journal
        </LinkButton>
      </div>
    </Screen>
  )
}

/** Online only: the other player holds the ball. */
function WaitingView({ game }: { readonly game: GameAdapter }) {
  const { room, viewer } = game
  const now = useNow()
  const [error, setError] = useState<string | null>(null)
  const [nudged, setNudged] = useState(false)
  const holder = room.ball.holderUid
  const open = room.openSeq > 0 ? cardBySeq(room, room.openSeq) : undefined
  const recent = room.cards
    .filter((card) => card.status !== 'open')
    .slice(-3)
    .reverse()
  const nextNudgeAt = room.nudge ? room.nudge.at + NUDGE_INTERVAL_MS : 0
  const canNudge = now >= nextNudgeAt && !game.busy

  async function nudge() {
    setError(null)
    try {
      await game.dispatch({ type: 'nudge', by: viewer, at: clock.now() })
      setNudged(true)
    } catch (caught) {
      setError(errorText(caught))
    }
  }

  return (
    <Screen title="Waiting" right={<NavRight game={game} />} testId="screen-waiting">
      <p className="text-base" data-testid="waiting-holder">
        <PlayerDot color={playerColor(room, holder)} name={`${playerName(room, holder)}'s turn`} />
        <span className="text-ink-muted text-sm">
          {' '}
          {'\u00b7'} since {timeAgo(room.ball.since, now)}
        </span>
      </p>
      {open ? (
        <div className="mt-4">
          <CardBlock
            card={open}
            label={`${playerName(room, holder)} is closing this`}
            testId="waiting-card"
          >
            <AnswerList
              room={room}
              answers={visibleAnswers(room, open, viewer)}
              order={[open.openerUid, open.closerUid]}
            />
          </CardBlock>
        </div>
      ) : (
        <Notice>{playerName(room, holder)} opens the next card.</Notice>
      )}
      <div className="mt-4">
        <Button block disabled={!canNudge} onClick={nudge} data-testid="nudge">
          {nudged && !canNudge ? 'Nudged' : 'Nudge now'}
        </Button>
        <p className="text-ink-muted mt-1 text-center text-xs">
          {canNudge
            ? 'One extra push to your partner, at most once every 10 hours.'
            : `Next nudge ${timeAgo(nextNudgeAt, now) === 'just now' ? 'soon' : 'in ' + timeAgo(now, nextNudgeAt).replace(' ago', '')}.`}
        </p>
        {error && <Notice tone="error">{error}</Notice>}
      </div>
      {recent.length > 0 && (
        <section className="mt-8">
          <SectionLabel>Latest in the journal</SectionLabel>
          <ul className="flex flex-col gap-3">
            {recent.map((card) => (
              <li key={card.seq}>
                <CardBlock card={card} testId={`waiting-recent-${card.seq}`}>
                  <AnswerList
                    room={room}
                    answers={visibleAnswers(room, card, viewer)}
                    order={[card.openerUid, card.closerUid]}
                  />
                </CardBlock>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Screen>
  )
}

function TurnStack({ game, view }: { readonly game: GameAdapter; readonly view: TurnView }) {
  const { room } = game
  const [error, setError] = useState<string | null>(null)
  const closeKey = view.close ? draftKey.close(view.close.card.seq) : null
  const openKey = view.open ? draftKey.open(view.open.seq) : null
  const closeText = closeKey ? (game.drafts[closeKey] ?? '') : ''
  const openText = openKey ? (game.drafts[openKey] ?? '') : ''
  const ready = (!view.close || closeText.trim() !== '') && (!view.open || openText.trim() !== '')
  const stepsLeft = (view.close ? 1 : 0) + (view.open ? 1 : 0)

  async function send() {
    setError(null)
    const replies = view.pendingFollowUps.flatMap((p) => {
      const text = game.drafts[draftKey.reply(p.card.seq)]?.trim() ?? ''
      return text ? [{ seq: p.card.seq, text }] : []
    })
    try {
      await game.sendTurn({
        close: view.close ? closeText : undefined,
        open: view.open ? openText : undefined,
        replies,
      })
    } catch (caught) {
      setError(errorText(caught))
    }
  }

  return (
    <Screen
      title={`Turn ${view.turn + 1}`}
      right={
        <div className="flex items-center gap-1">
          <NavRight game={game} />
          <OverflowMenu game={game} view={view} />
        </div>
      }
      testId="screen-turn"
    >
      <p className="-mt-3 mb-4 text-base" data-testid="turn-holder">
        <PlayerDot
          color={playerColor(room, view.holder)}
          name={`${playerName(room, view.holder)}'s turn`}
        />
        <span className="text-ink-muted text-sm">
          {' '}
          {'·'} Turn {view.turn + 1}
          {view.lighter && room.cards.length < view.lighter.until ? ', going lighter' : ''}
        </span>
      </p>
      <div className="flex flex-col gap-4">
        <CatchUpBlock game={game} view={view} />
        {view.pendingFollowUps.map((pending) => (
          <PendingFollowUpBlock key={pending.card.seq} game={game} pending={pending} view={view} />
        ))}
        {view.close && closeKey && (
          <CardBlock
            card={view.close.card}
            label={
              view.close.card.type === 'current'
                ? 'Your turn on this Current'
                : `Close: ${playerName(room, view.partner)} opened this`
            }
            testId="close-card"
          >
            {view.close.openerAnswer !== null && (
              <AnswerList
                room={room}
                answers={{ [view.partner]: { text: view.close.openerAnswer, at: 0 } }}
                order={[view.partner]}
              />
            )}
            <TextArea
              aria-label={view.close.card.type === 'current' ? 'Your note' : 'Your answer'}
              data-testid="close-answer"
              className="mt-3"
              value={closeText}
              placeholder={
                view.close.card.type === 'current'
                  ? 'One line about what you did'
                  : view.close.openerAnswer === null
                    ? 'Your answer, written blind'
                    : 'Your answer'
              }
              onChange={(e) => game.setDraft(closeKey, e.target.value)}
            />
          </CardBlock>
        )}
        {view.open && openKey && (
          <CardBlock
            card={view.open.card}
            label={
              view.open.card.type === 'current'
                ? 'A Current: do this, then note it'
                : 'Open: your partner closes this next'
            }
            animate="deal"
            testId="open-card"
          >
            <TextArea
              aria-label={view.open.card.type === 'current' ? 'Your note' : 'Your answer'}
              data-testid="open-answer"
              value={openText}
              placeholder={
                view.open.card.type === 'current'
                  ? 'One line about what you did'
                  : 'Your answer, written blind'
              }
              onChange={(e) => game.setDraft(openKey, e.target.value)}
            />
          </CardBlock>
        )}
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="mt-8">
        <Button
          variant="primary"
          block
          disabled={!ready || !view.canSend || game.busy}
          onClick={send}
          data-testid="send"
        >
          {game.busy ? 'Sending' : stepsLeft === 0 ? 'Nothing to send' : 'Send turn'}
        </Button>
        <p className="text-ink-muted mt-2 text-center text-xs">
          Drafts are saved on this phone until you send.
        </p>
      </div>
    </Screen>
  )
}

export function Turn() {
  const game = useGame()
  const { room } = game
  const view = useMemo(() => turnView(room, game.lookup), [room, game.lookup])
  const phase = roomPhase(room)
  if (phase === 'paused') return <PausedView game={game} />
  if (game.reveal !== null) return <RevealView game={game} seq={game.reveal} />
  if (game.handoff) return <HandoffView game={game} />
  if (game.mode === 'online' && game.viewer !== room.ball.holderUid) {
    if (game.room.players[game.viewer]?.rulesAgreedAt === null)
      return <Navigate to={`${game.basePath}/rules`} replace />
    return <WaitingView game={game} />
  }
  if (phase === 'rules') return <Navigate to={`${game.basePath}/rules`} replace />
  if (phase === 'exhausted') return <ExhaustedView game={game} view={view} />
  return <TurnStack game={game} view={view} />
}
