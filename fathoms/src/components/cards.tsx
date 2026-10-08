import type { ReactNode } from 'react'
import type { Answer, PlayerId, RoomState } from '../game/types'
import { levelName, levelStyle, playerColor, playerName, type CardLike } from './cardMeta'

export function LevelChip({ card }: { readonly card: CardLike }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
      <span className={`rounded-full px-2 py-0.5 ${levelStyle(card).chip}`}>{levelName(card)}</span>
      {card.adult && (
        <span className="bg-afterdark text-ink rounded-full px-2 py-0.5" aria-label="After Dark">
          {'\u{1F512}'} 18+
        </span>
      )}
    </span>
  )
}

export interface CardBlockProps {
  readonly card: CardLike & { readonly text?: string; readonly cardText?: string }
  readonly label?: string | undefined
  readonly children?: ReactNode
  readonly animate?: 'deal' | 'reveal' | undefined
  readonly testId?: string | undefined
}

/** A full width card in its level color: label row, the card text at 18 px or more, then whatever goes under it. */
export function CardBlock({ card, label, children, animate, testId }: CardBlockProps) {
  const style = levelStyle(card)
  const text = card.cardText ?? card.text ?? ''
  const motion = animate === 'deal' ? 'animate-deal' : animate === 'reveal' ? 'animate-reveal' : ''
  return (
    <section
      data-testid={testId}
      className={`rounded-3xl p-5 shadow-lg ${style.block} ${card.adult ? 'border-afterdark border-2' : ''} ${motion}`}
    >
      <div className="mb-3 flex items-center justify-between gap-2 text-xs font-semibold tracking-widest uppercase opacity-80">
        <span>{label ?? levelName(card)}</span>
        {label !== undefined && <span>{levelName(card)}</span>}
      </div>
      <p
        className="text-lg leading-snug font-medium [overflow-wrap:anywhere]"
        data-testid={testId ? `${testId}-text` : undefined}
      >
        {text}
      </p>
      {children !== undefined && <div className="mt-4">{children}</div>}
    </section>
  )
}

/** Answers in join order, each with the author name. */
export function AnswerList({
  room,
  answers,
  order,
  tone = 'onCard',
}: {
  readonly room: RoomState
  readonly answers: Readonly<Record<PlayerId, Answer>>
  readonly order?: readonly PlayerId[] | undefined
  readonly tone?: 'onCard' | 'onSurface'
}) {
  const uids = (order ?? room.order).filter((uid) => answers[uid] !== undefined)
  if (uids.length === 0) return null
  return (
    <dl
      className={`flex flex-col gap-3 rounded-2xl p-3 ${tone === 'onCard' ? 'bg-abyss/25' : 'bg-surface'}`}
    >
      {uids.map((uid) => (
        <div key={uid}>
          <dt className="flex items-center gap-2 text-xs font-semibold tracking-wide uppercase opacity-80">
            <span
              aria-hidden="true"
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: playerColor(room, uid) }}
            />
            {playerName(room, uid)}
          </dt>
          <dd
            className="mt-1 text-base whitespace-pre-wrap [overflow-wrap:anywhere]"
            data-testid={`answer-${uid}`}
          >
            {answers[uid]?.text}
          </dd>
        </div>
      ))}
    </dl>
  )
}
