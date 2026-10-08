import { useState } from 'react'
import { getContent } from '../content'
import type { CardRecord, PlayerId } from '../game/types'
import { useGame } from '../game-ui/context'
import { clock } from '../store/clock'
import { Notice } from './ui'

/** Reactions and the favorite star for a revealed card (PLAN 4.8). Any time, not only during a turn. */
export function ReactionRow({
  card,
  viewer,
}: {
  readonly card: CardRecord
  readonly viewer: PlayerId
}) {
  const game = useGame()
  const [error, setError] = useState<string | null>(null)
  if (card.status !== 'closed' && card.status !== 'passed') return null
  const emojis = getContent().shared.reactions

  async function run(action: Parameters<typeof game.dispatch>[0]) {
    setError(null)
    try {
      await game.dispatch(action)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }

  return (
    <div className="mt-3" data-testid={`reactions-${card.seq}`}>
      <div className="flex flex-wrap items-center gap-2">
        {emojis.map((emoji) => {
          const who = card.reactions[emoji] ?? []
          const mine = who.includes(viewer)
          return (
            <button
              key={emoji}
              type="button"
              aria-pressed={mine}
              aria-label={`React ${emoji}`}
              onClick={() =>
                run({ type: 'react', by: viewer, at: clock.now(), seq: card.seq, emoji })
              }
              data-testid={`react-${card.seq}-${emoji}`}
              className={`min-h-10 rounded-full border px-3 text-base ${mine ? 'border-level-1 bg-abyss/40' : 'border-edge bg-abyss/20'}`}
            >
              {emoji}
              {who.length > 0 && <span className="ml-1 text-xs opacity-80">{who.length}</span>}
            </button>
          )
        })}
        <button
          type="button"
          aria-pressed={card.favorite}
          aria-label={card.favorite ? 'Remove from favorites' : 'Add to favorites'}
          onClick={() =>
            run({
              type: 'favorite',
              by: viewer,
              at: clock.now(),
              seq: card.seq,
              on: !card.favorite,
            })
          }
          data-testid={`favorite-${card.seq}`}
          className={`ml-auto min-h-10 rounded-full border px-3 text-base ${card.favorite ? 'border-currents bg-abyss/40' : 'border-edge bg-abyss/20'}`}
        >
          {card.favorite ? '★' : '☆'}
        </button>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  )
}
