import { useMemo, useState } from 'react'
import { Navigate } from 'react-router'
import { getContent } from '../content'
import { hashSeed } from '../game/deck'
import {
  cardBySeq,
  GameError,
  roomPhase,
  turnView,
  visibleAnswers,
  type PendingFollowUp,
  type TurnView,
} from '../game/turns'
import type { CardRecord, PlayerId, RoomState } from '../game/types'
import { cardLookup, draftKey, nextDeckSize, useSameDevice } from '../store/sameDevice'
import { clock } from '../store/clock'
import { playerColor, playerName } from '../components/cardMeta'
import { AnswerList, CardBlock } from '../components/cards'
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
  return caught instanceof GameError ? caught.message : String(caught)
}

function NavRight() {
  return (
    <nav className="flex gap-1" aria-label="More screens">
      <LinkButton
        to="/same-device/journal"
        variant="ghost"
        className="px-3"
        data-testid="nav-journal"
      >
        Journal
      </LinkButton>
      <LinkButton
        to="/same-device/settings"
        variant="ghost"
        className="px-3"
        data-testid="nav-settings"
      >
        Settings
      </LinkButton>
    </nav>
  )
}

function HandoffView({ room }: { readonly room: RoomState }) {
  const acknowledge = useSameDevice((s) => s.acknowledgeHandoff)
  const holder = room.ball.holderUid
  return (
    <Screen title="Pass the phone" right={<NavRight />} testId="screen-handoff">
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
      <Button variant="primary" block onClick={acknowledge} data-testid="handoff-ack">
        I am {playerName(room, holder)}
      </Button>
    </Screen>
  )
}

function PausedView({ room }: { readonly room: RoomState }) {
  const dispatch = useSameDevice((s) => s.dispatch)
  const [error, setError] = useState<string | null>(null)
  const paused = room.paused
  if (!paused) return null
  function resume() {
    try {
      dispatch({ type: 'resume', by: room.ball.holderUid, at: clock.now() })
    } catch (caught) {
      setError(errorText(caught))
    }
  }
  return (
    <Screen title="Paused" right={<NavRight />} testId="screen-paused">
      <div className="bg-surface border-edge rounded-3xl border p-5">
        <p className="text-xl font-medium">Paused by {playerName(room, paused.by)}</p>
        {paused.note && <p className="text-ink-muted mt-2 whitespace-pre-wrap">{paused.note}</p>}
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="mt-8">
        <Button variant="primary" block onClick={resume} data-testid="resume">
          Resume
        </Button>
      </div>
    </Screen>
  )
}

function FollowUpBox({
  room,
  card,
  asker,
  onDone,
}: {
  readonly room: RoomState
  readonly card: CardRecord
  readonly asker: PlayerId
  readonly onDone?: (() => void) | undefined
}) {
  const dispatch = useSameDevice((s) => s.dispatch)
  const drafts = useSameDevice((s) => s.drafts)
  const setDraft = useSameDevice((s) => s.setDraft)
  const [error, setError] = useState<string | null>(null)
  const key = draftKey.followUp(card.seq)
  const text = drafts[key] ?? ''
  const mine = card.followUps[asker]
  const partner = room.order[0] === asker ? room.order[1] : room.order[0]

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

  function ask() {
    setError(null)
    try {
      dispatch({ type: 'askFollowUp', by: asker, at: clock.now(), seq: card.seq, text })
      setDraft(key, '')
      onDone?.()
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
        onChange={(e) => setDraft(key, e.target.value)}
      />
      {error && <Notice tone="error">{error}</Notice>}
      <div className="mt-2 flex justify-end">
        <Button
          onClick={ask}
          disabled={text.trim() === ''}
          data-testid={`follow-up-ask-${card.seq}`}
        >
          Ask
        </Button>
      </div>
    </div>
  )
}

function RevealView({ room, seq }: { readonly room: RoomState; readonly seq: number }) {
  const finish = useSameDevice((s) => s.finishReveal)
  const card = cardBySeq(room, seq)
  const sender = room.order[0] === room.ball.holderUid ? room.order[1] : room.order[0]
  if (!card) return null
  return (
    <Screen title="Reveal" testId="screen-reveal">
      <CardBlock card={card} label="Both answers" animate="reveal" testId="reveal-card">
        <AnswerList
          room={room}
          answers={visibleAnswers(room, card, sender)}
          order={[card.openerUid, card.closerUid]}
        />
        <div className="mt-4">
          <FollowUpBox room={room} card={card} asker={sender} />
        </div>
      </CardBlock>
      <p className="text-ink-muted mt-4 text-sm">
        {playerName(room, room.ball.holderUid)} sees this at the start of their turn.
      </p>
      <div className="mt-8">
        <Button variant="primary" block onClick={finish} data-testid="reveal-done">
          Done
        </Button>
      </div>
    </Screen>
  )
}

function CatchUpBlock({ room, view }: { readonly room: RoomState; readonly view: TurnView }) {
  const catchUp = view.catchUp
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
      {!passed && (
        <div className="mt-4">
          <FollowUpBox room={room} card={card} asker={view.holder} />
        </div>
      )}
    </CardBlock>
  )
}

function PendingFollowUpBlock({
  room,
  pending,
  view,
}: {
  readonly room: RoomState
  readonly pending: PendingFollowUp
  readonly view: TurnView
}) {
  const drafts = useSameDevice((s) => s.drafts)
  const setDraft = useSameDevice((s) => s.setDraft)
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
        value={drafts[key] ?? ''}
        placeholder="Reply, or leave it"
        onChange={(e) => setDraft(key, e.target.value)}
      />
    </section>
  )
}

function OverflowMenu({ room, view }: { readonly room: RoomState; readonly view: TurnView }) {
  const dispatch = useSameDevice((s) => s.dispatch)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pauseNote, setPauseNote] = useState('')
  const [pausing, setPausing] = useState(false)

  function run(label: string, action: Parameters<typeof dispatch>[0]) {
    setError(null)
    try {
      dispatch(action)
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

function ExhaustedView({ room, view }: { readonly room: RoomState; readonly view: TurnView }) {
  const rebuild = useSameDevice((s) => s.rebuildDeck)
  const [error, setError] = useState<string | null>(null)
  const closers = getContent().shared.closers
  const closer = closers[hashSeed(room.deck.seed) % closers.length]
  // The ball passed at ball.since, close enough to now for a count that only informs.
  const size = nextDeckSize(room, room.ball.since)
  function newDeck() {
    setError(null)
    try {
      rebuild(view.holder)
    } catch (caught) {
      setError(errorText(caught))
    }
  }
  return (
    <Screen title="Deck finished" right={<NavRight />} testId="screen-exhausted">
      <CatchUpBlock room={room} view={view} />
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
          disabled={size === 0}
          data-testid="new-deck"
        >
          {size > 0 ? `New deck (${size} cards)` : 'New deck'}
        </Button>
        <LinkButton to="/same-device/settings" block data-testid="exhausted-settings">
          Settings
        </LinkButton>
        <LinkButton to="/same-device/journal" variant="ghost" block>
          Read the journal
        </LinkButton>
      </div>
    </Screen>
  )
}

function TurnStack({ room, view }: { readonly room: RoomState; readonly view: TurnView }) {
  const drafts = useSameDevice((s) => s.drafts)
  const setDraft = useSameDevice((s) => s.setDraft)
  const sendTurn = useSameDevice((s) => s.sendTurn)
  const [error, setError] = useState<string | null>(null)
  const closeKey = view.close ? draftKey.close(view.close.card.seq) : null
  const openKey = view.open ? draftKey.open(view.open.seq) : null
  const closeText = closeKey ? (drafts[closeKey] ?? '') : ''
  const openText = openKey ? (drafts[openKey] ?? '') : ''
  const ready = (!view.close || closeText.trim() !== '') && (!view.open || openText.trim() !== '')
  const stepsLeft = (view.close ? 1 : 0) + (view.open ? 1 : 0)

  function send() {
    setError(null)
    const replies = view.pendingFollowUps.flatMap((p) => {
      const text = drafts[draftKey.reply(p.card.seq)]?.trim() ?? ''
      return text ? [{ seq: p.card.seq, text }] : []
    })
    try {
      sendTurn({
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
          <NavRight />
          <OverflowMenu room={room} view={view} />
        </div>
      }
      testId="screen-turn"
    >
      <p className="text-ink-muted -mt-3 mb-4 text-sm" data-testid="turn-holder">
        <PlayerDot color={playerColor(room, view.holder)} name={playerName(room, view.holder)} />{' '}
        Turn {view.turn + 1}
        {view.lighter && room.cards.length < view.lighter.until ? ', going lighter' : ''}
      </p>
      <div className="flex flex-col gap-4">
        <CatchUpBlock room={room} view={view} />
        {view.pendingFollowUps.map((pending) => (
          <PendingFollowUpBlock key={pending.card.seq} room={room} pending={pending} view={view} />
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
              onChange={(e) => setDraft(closeKey, e.target.value)}
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
              onChange={(e) => setDraft(openKey, e.target.value)}
            />
          </CardBlock>
        )}
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="mt-8">
        <Button
          variant="primary"
          block
          disabled={!ready || !view.canSend}
          onClick={send}
          data-testid="send"
        >
          {stepsLeft === 0 ? 'Nothing to send' : 'Send turn'}
        </Button>
        <p className="text-ink-muted mt-2 text-center text-xs">
          Drafts are saved on this phone until you send.
        </p>
      </div>
    </Screen>
  )
}

export function Turn() {
  const room = useSameDevice((s) => s.room)
  const handoff = useSameDevice((s) => s.handoff)
  const reveal = useSameDevice((s) => s.reveal)
  const view = useMemo(() => (room ? turnView(room, cardLookup()) : null), [room])

  if (!room || !view) return <Navigate to="/" replace />
  const phase = roomPhase(room)
  if (phase === 'paused') return <PausedView room={room} />
  if (reveal !== null) return <RevealView room={room} seq={reveal} />
  if (handoff) return <HandoffView room={room} />
  if (phase === 'rules') return <Navigate to="/same-device/rules" replace />
  if (phase === 'exhausted') return <ExhaustedView room={room} view={view} />
  return <TurnStack room={room} view={view} />
}
