import { useState, type FormEvent } from 'react'
import { getContent } from '../content'
import { validateCustomCard } from '../game/custom'
import type { CardType, LevelId } from '../game/types'
import { useGame } from '../game-ui/context'
import { playerName } from '../components/cardMeta'
import { LevelChip } from '../components/cards'
import { Button, Notice, Screen, SectionLabel, TextArea } from '../components/ui'

/** PLAN Phase 4: a small editor for the players' own cards, After Dark ones included. */
export function CustomCards() {
  const game = useGame()
  const { room } = game
  const content = getContent()
  const [text, setText] = useState('')
  const [type, setType] = useState<CardType>('question')
  const [level, setLevel] = useState<LevelId>(1)
  const [adult, setAdult] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const enabled = room.settings.customCardsEnabled
  const input = { text, type, level: type === 'current' ? null : level, adult }
  const problems = validateCustomCard(input)

  async function add(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await game.addCustomCard(input)
      setText('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    setError(null)
    try {
      await game.removeCustomCard(id)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }

  return (
    <Screen title="Your cards" back={`${game.basePath}/settings`} testId="screen-custom-cards">
      <p className="text-ink-muted">
        Cards you write join the next deck under the Custom pack
        {enabled ? '' : ' once custom cards are switched on in Settings'}. Same rules as the printed
        ones: short, specific, no double quotes.
      </p>
      <form
        onSubmit={add}
        className="bg-surface border-edge mt-5 flex flex-col gap-4 rounded-3xl border p-4"
      >
        <SectionLabel>New card</SectionLabel>
        <TextArea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="The question, or what the Current asks you to do"
          maxLength={220}
          aria-label="Card text"
          data-testid="custom-text"
        />
        <div className="grid grid-cols-2 gap-2">
          {(['question', 'current'] as const).map((kind) => (
            <label
              key={kind}
              className={`flex min-h-12 cursor-pointer items-center justify-center rounded-xl border px-2 text-sm capitalize ${type === kind ? 'border-level-1 text-ink' : 'border-edge text-ink-muted'}`}
              data-testid={`custom-type-${kind}`}
            >
              <input
                type="radio"
                name="customType"
                className="sr-only"
                checked={type === kind}
                onChange={() => setType(kind)}
              />
              {kind}
            </label>
          ))}
        </div>
        {type === 'question' && (
          <div className="grid grid-cols-3 gap-2">
            {content.shared.levels.map((item) => (
              <label
                key={item.id}
                className={`flex min-h-12 cursor-pointer items-center justify-center rounded-xl border px-2 text-center text-sm ${level === item.id ? 'border-level-1 text-ink' : 'border-edge text-ink-muted'}`}
                data-testid={`custom-level-${item.id}`}
              >
                <input
                  type="radio"
                  name="customLevel"
                  className="sr-only"
                  checked={level === item.id}
                  onChange={() => setLevel(item.id)}
                />
                {item.name}
              </label>
            ))}
          </div>
        )}
        <label className="flex min-h-12 items-center justify-between gap-4">
          <span>
            <span className="block text-base">After Dark</span>
            <span className="text-ink-muted block text-xs">
              Dealt only when both of you have After Dark on.
            </span>
          </span>
          <input
            type="checkbox"
            className="h-6 w-6"
            checked={adult}
            onChange={(e) => setAdult(e.target.checked)}
            data-testid="custom-adult"
          />
        </label>
        {text.trim() && problems.length > 0 && <Notice tone="error">{problems.join(' ')}</Notice>}
        {error && <Notice tone="error">{error}</Notice>}
        <Button
          type="submit"
          variant="primary"
          block
          disabled={busy || problems.length > 0}
          data-testid="custom-add"
        >
          Add card
        </Button>
      </form>
      <section className="mt-6">
        <SectionLabel>{game.customCards.length} custom cards</SectionLabel>
        {game.customCards.length === 0 ? (
          <Notice>None yet.</Notice>
        ) : (
          <ul className="flex flex-col gap-3">
            {game.customCards.map((card) => (
              <li
                key={card.id}
                className="bg-surface border-edge rounded-3xl border p-4"
                data-testid="custom-card"
              >
                <div className="flex items-center justify-between gap-2">
                  <LevelChip card={{ level: card.level, type: card.type, adult: card.adult }} />
                  <span className="text-ink-muted text-xs">
                    by {playerName(room, card.createdBy)}
                  </span>
                </div>
                <p className="mt-2 text-base">{card.text}</p>
                <div className="mt-2 flex justify-end">
                  <Button
                    variant="ghost"
                    className="px-3 text-sm"
                    onClick={() => remove(card.id)}
                    data-testid={`custom-remove-${card.id}`}
                  >
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Screen>
  )
}
