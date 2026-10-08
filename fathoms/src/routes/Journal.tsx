import { useMemo, useState } from 'react'
import {
  EMPTY_FILTER,
  filterJournal,
  groupByDay,
  journalPacks,
  journalToMarkdown,
  type JournalFilter,
} from '../game/journal'
import { visibleAnswers } from '../game/turns'
import type { CardRecord, LevelId, PlayerId, RoomState } from '../game/types'
import { useGame } from '../game-ui/context'
import { useMarkRead } from '../game-ui/useMarkRead'
import { getContent } from '../content'
import { packName, playerName } from '../components/cardMeta'
import { AnswerList, LevelChip } from '../components/cards'
import { ReactionRow } from '../components/ReactionRow'
import { Button, Notice, Screen, TextInput } from '../components/ui'

function Entry({
  room,
  card,
  viewer,
}: {
  readonly room: RoomState
  readonly card: CardRecord
  readonly viewer: PlayerId
}) {
  useMarkRead(card)
  if (card.status === 'hidden') {
    return (
      <li
        className="bg-surface border-edge rounded-3xl border p-4"
        data-testid="journal-entry"
        data-seq={card.seq}
        data-hidden="true"
      >
        <div className="flex items-center justify-between gap-2">
          <LevelChip card={card} />
          <span className="text-ink-muted text-xs">card {card.seq}</span>
        </div>
        <p className="text-ink-muted mt-3 text-sm">
          An After Dark card, hidden after you both read it.
        </p>
      </li>
    )
  }
  const answers = visibleAnswers(room, card, viewer)
  const followUps = room.order.flatMap((uid) => {
    const followUp = card.followUps[uid]
    return followUp ? [{ uid, followUp }] : []
  })
  return (
    <li
      className="bg-surface border-edge rounded-3xl border p-4"
      data-testid="journal-entry"
      data-seq={card.seq}
    >
      <div className="flex items-center justify-between gap-2">
        <LevelChip card={card} />
        <span className="text-ink-muted text-xs">
          {packName(card.pack)} {'·'} card {card.seq}
        </span>
      </div>
      <p className="mt-3 text-lg leading-snug font-medium">{card.cardText}</p>
      <div className="mt-3">
        <AnswerList
          room={room}
          answers={answers}
          order={[card.openerUid, card.closerUid]}
          tone="onSurface"
        />
      </div>
      {card.status === 'open' && (
        <p className="text-ink-muted mt-2 text-sm">
          Open. Waiting on {playerName(room, card.closerUid)}.
        </p>
      )}
      {card.status === 'passed' && (
        <p className="text-ink-muted mt-2 text-sm" data-testid="journal-passed">
          Passed by {playerName(room, card.passedBy ?? card.closerUid)}.
        </p>
      )}
      {followUps.length > 0 && (
        <ul className="border-edge mt-3 flex flex-col gap-2 border-t pt-3" aria-label="Follow-ups">
          {followUps.map(({ uid, followUp }) => {
            const other = room.order[0] === uid ? room.order[1] : room.order[0]
            return (
              <li key={uid} className="text-sm">
                <p>
                  <span className="text-ink-muted">{playerName(room, uid)} asked:</span>{' '}
                  {followUp.text}
                </p>
                <p className="mt-1">
                  {followUp.reply ? (
                    <>
                      <span className="text-ink-muted">{playerName(room, other)}:</span>{' '}
                      {followUp.reply.text}
                    </>
                  ) : (
                    <span className="text-ink-muted">Not answered.</span>
                  )}
                </p>
              </li>
            )
          })}
        </ul>
      )}
      <ReactionRow card={card} viewer={viewer} />
    </li>
  )
}

function Chip({
  on,
  onClick,
  children,
  testId,
}: {
  readonly on: boolean
  readonly onClick: () => void
  readonly children: React.ReactNode
  readonly testId: string
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      data-testid={testId}
      className={`min-h-10 rounded-full border px-3 text-sm whitespace-nowrap ${on ? 'border-level-1 text-ink' : 'border-edge text-ink-muted'}`}
    >
      {children}
    </button>
  )
}

/** Hands the Markdown to the phone: share sheet when there is one, else a download. */
async function exportMarkdown(
  markdown: string,
  fileName: string,
): Promise<'shared' | 'downloaded'> {
  const file = new File([markdown], fileName, { type: 'text/markdown' })
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], title: 'Fathoms journal' })
    return 'shared'
  }
  const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return 'downloaded'
}

export function Journal() {
  const game = useGame()
  const { room } = game
  const content = getContent()
  const [filter, setFilter] = useState<JournalFilter>(EMPTY_FILTER)
  const [exported, setExported] = useState<string | null>(null)
  const cards = useMemo(() => filterJournal(room.cards, filter), [room.cards, filter])
  const groups = useMemo(() => groupByDay(cards), [cards])
  const packs = journalPacks(room.cards)
  const viewerFor = (card: CardRecord) => (game.mode === 'online' ? game.viewer : card.closerUid)
  const reactor = game.mode === 'online' ? game.viewer : room.ball.holderUid

  async function doExport() {
    setExported(null)
    const levelNames = Object.fromEntries(
      content.shared.levels.map((l) => [l.id, l.name]),
    ) as Record<LevelId, string>
    const packNames = Object.fromEntries(content.packs.map((p) => [p.id, p.name]))
    const markdown = journalToMarkdown(room, {
      title: `${content.shared.appName} journal`,
      levelNames,
      packNames,
    })
    try {
      const how = await exportMarkdown(markdown, 'fathoms-journal.md')
      setExported(how === 'shared' ? 'Shared.' : 'Saved as fathoms-journal.md.')
    } catch {
      setExported('Could not export.')
    }
  }

  return (
    <Screen
      title="Journal"
      back={`${game.basePath}/turn`}
      right={
        <Button
          variant="ghost"
          className="px-2 text-sm"
          onClick={doExport}
          data-testid="journal-export"
        >
          Export
        </Button>
      }
      testId="screen-journal"
    >
      <div className="flex flex-col gap-3">
        <TextInput
          type="search"
          value={filter.query}
          placeholder="Search cards and answers"
          aria-label="Search the journal"
          onChange={(e) => setFilter({ ...filter, query: e.target.value })}
          data-testid="journal-search"
        />
        <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filters">
          <Chip
            on={filter.view === 'all'}
            onClick={() => setFilter({ ...filter, view: 'all' })}
            testId="journal-filter-all"
          >
            All
          </Chip>
          <Chip
            on={filter.view === 'favorites'}
            onClick={() => setFilter({ ...filter, view: 'favorites' })}
            testId="journal-filter-favorites"
          >
            {'★'} Favorites
          </Chip>
          {content.shared.levels.map((level) => (
            <Chip
              key={level.id}
              on={filter.level === level.id}
              onClick={() =>
                setFilter({ ...filter, level: filter.level === level.id ? null : level.id })
              }
              testId={`journal-filter-level-${level.id}`}
            >
              {level.name}
            </Chip>
          ))}
          <Chip
            on={filter.level === 'currents'}
            onClick={() =>
              setFilter({ ...filter, level: filter.level === 'currents' ? null : 'currents' })
            }
            testId="journal-filter-currents"
          >
            Currents
          </Chip>
          {packs.length > 1 &&
            packs.map((pack) => (
              <Chip
                key={pack}
                on={filter.pack === pack}
                onClick={() => setFilter({ ...filter, pack: filter.pack === pack ? null : pack })}
                testId={`journal-filter-pack-${pack}`}
              >
                {packName(pack)}
              </Chip>
            ))}
        </div>
      </div>
      <p className="text-ink-muted mt-3 mb-4 text-sm" data-testid="journal-count">
        {cards.length} {cards.length === 1 ? 'card' : 'cards'}
        {cards.length !== room.cards.length ? ` of ${room.cards.length}` : ' so far'}. Newest first.
      </p>
      {exported && <Notice>{exported}</Notice>}
      {cards.length === 0 ? (
        <Notice>
          {room.cards.length === 0
            ? 'Nothing here yet. The first card lands once someone opens it.'
            : 'Nothing matches.'}
        </Notice>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map((group) => (
            <section key={group.day} aria-label={group.day}>
              <h2
                className="text-ink-muted mb-2 text-xs font-semibold tracking-widest uppercase"
                data-testid="journal-day"
              >
                {group.day}
              </h2>
              <ul className="flex flex-col gap-3">
                {group.cards.map((card) => (
                  <Entry
                    key={card.seq}
                    room={room}
                    card={card}
                    viewer={
                      game.mode === 'online'
                        ? viewerFor(card)
                        : reactor === card.closerUid
                          ? card.closerUid
                          : card.openerUid
                    }
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Screen>
  )
}
