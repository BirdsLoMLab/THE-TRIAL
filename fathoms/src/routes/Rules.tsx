import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { GameError, playersNeedingRules } from '../game/turns'
import { useGame } from '../game-ui/context'
import { clock } from '../store/clock'
import { playerColor, playerName } from '../components/cardMeta'
import { Button, Notice, PlayerDot, Screen } from '../components/ui'

export function Rules() {
  const navigate = useNavigate()
  const game = useGame()
  const { room } = game
  const [error, setError] = useState<string | null>(null)

  const waiting = playersNeedingRules(room)
  const turnPath = `${game.basePath}/turn`
  // One phone: players agree one after the other. Online: only I can agree for me.
  const next =
    game.mode === 'online' ? (waiting.includes(game.viewer) ? game.viewer : undefined) : waiting[0]
  if (waiting.length === 0) return <Navigate to={turnPath} replace />
  // Online, my own agreement is all this screen needs: the Turn screen waits for the partner.
  if (game.mode === 'online' && !waiting.includes(game.viewer))
    return <Navigate to={turnPath} replace />

  async function agree(uid: string) {
    setError(null)
    try {
      await game.dispatch({ type: 'agreeRules', by: uid, at: clock.now() })
      if (game.mode === 'online' || waiting.length === 1) navigate(turnPath, { replace: true })
    } catch (caught) {
      setError(
        caught instanceof GameError || caught instanceof Error ? caught.message : String(caught),
      )
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
        {next ? (
          <Button
            variant="primary"
            block
            onClick={() => agree(next)}
            disabled={game.busy}
            data-testid="rules-agree"
          >
            {playerName(room, next)}, I agree
          </Button>
        ) : (
          <Notice>
            Waiting for {waiting.map((uid) => playerName(room, uid)).join(' and ')} to agree. You
            can go on to your turn.
          </Notice>
        )}
        {game.mode === 'online' && !next && (
          <Button
            block
            className="mt-3"
            onClick={() => navigate(turnPath)}
            data-testid="rules-continue"
          >
            Continue
          </Button>
        )}
      </div>
    </Screen>
  )
}
