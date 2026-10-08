import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { GameError, playersNeedingRules } from '../game/turns'
import { useSameDevice } from '../store/sameDevice'
import { clock } from '../store/clock'
import { playerColor, playerName } from '../components/cardMeta'
import { Button, Notice, PlayerDot, Screen } from '../components/ui'

export function Rules() {
  const navigate = useNavigate()
  const room = useSameDevice((s) => s.room)
  const dispatch = useSameDevice((s) => s.dispatch)
  const [error, setError] = useState<string | null>(null)

  if (!room) return <Navigate to="/" replace />
  const waiting = playersNeedingRules(room)
  const next = waiting[0]
  if (next === undefined) return <Navigate to="/same-device/turn" replace />

  function agree(uid: string) {
    setError(null)
    try {
      dispatch({ type: 'agreeRules', by: uid, at: clock.now() })
      if (waiting.length === 1) navigate('/same-device/turn', { replace: true })
    } catch (caught) {
      setError(caught instanceof GameError ? caught.message : String(caught))
    }
  }

  return (
    <Screen title="The two rules" testId="screen-rules">
      <ol className="flex flex-col gap-4">
        {room.rules.map((rule, index) => (
          <li key={index} className="bg-surface border-edge rounded-3xl border p-5">
            <span className="text-ink-muted block text-xs font-semibold tracking-widest uppercase">
              Rule {index + 1}
            </span>
            <p className="mt-2 text-2xl leading-snug font-medium">{rule}</p>
          </li>
        ))}
      </ol>
      <p className="text-ink-muted mt-6 text-sm">
        Either player can ask one follow-up question at any reveal. Passing is allowed, faking is
        not.
      </p>
      <ul className="mt-6 flex flex-col gap-2" aria-label="Who agreed">
        {room.order.map((uid) => {
          const agreed = room.players[uid]?.rulesAgreedAt !== null
          return (
            <li
              key={uid}
              className="flex items-center justify-between text-base"
              data-testid={`rules-status-${uid}`}
            >
              <PlayerDot color={playerColor(room, uid)} name={playerName(room, uid)} />
              <span className={agreed ? 'text-level-1' : 'text-ink-muted'}>
                {agreed ? 'Agreed' : 'Not yet'}
              </span>
            </li>
          )
        })}
      </ul>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="mt-8">
        <Button variant="primary" block onClick={() => agree(next)} data-testid="rules-agree">
          {playerName(room, next)}, I agree
        </Button>
      </div>
    </Screen>
  )
}
