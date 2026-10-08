import { visibleAnswers } from '../game/turns'
import type { CardRecord, PlayerId, RoomState } from '../game/types'
import { useGame } from '../game-ui/context'
import { packName, playerName } from '../components/cardMeta'
import { AnswerList, LevelChip } from '../components/cards'
import { Notice, Screen } from '../components/ui'

function Entry({
  room,
  card,
  viewer,
}: {
  readonly room: RoomState
  readonly card: CardRecord
  readonly viewer: PlayerId
}) {
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
    </li>
  )
}

export function Journal() {
  const game = useGame()
  const { room } = game
  const cards = [...room.cards].reverse()
  return (
    <Screen title="Journal" back={`${game.basePath}/turn`} testId="screen-journal">
      <p className="text-ink-muted mb-4 text-sm" data-testid="journal-count">
        {cards.length} {cards.length === 1 ? 'card' : 'cards'} so far. Newest first.
      </p>
      {cards.length === 0 ? (
        <Notice>Nothing here yet. The first card lands once someone opens it.</Notice>
      ) : (
        <ul className="flex flex-col gap-3">
          {cards.map((card) => (
            // One phone shares the journal, so an open card shows what its closer may see. Online, I see my own side.
            <Entry
              key={card.seq}
              room={room}
              card={card}
              viewer={game.mode === 'online' ? game.viewer : card.closerUid}
            />
          ))}
        </ul>
      )}
    </Screen>
  )
}
