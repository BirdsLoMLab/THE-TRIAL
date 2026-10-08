import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { GameError } from '../game/turns'
import { PLAYER_COLORS, useSameDevice } from '../store/sameDevice'
import { ColorPicker } from '../components/ColorPicker'
import { Button, Notice, Screen, SectionLabel, TextInput } from '../components/ui'

interface Draft {
  name: string
  color: string
}

export function SameDeviceNew() {
  const navigate = useNavigate()
  const hasRoom = useSameDevice((s) => s.room !== null)
  const newGame = useSameDevice((s) => s.newGame)
  const [players, setPlayers] = useState<[Draft, Draft]>([
    { name: '', color: PLAYER_COLORS[0]?.hex ?? '#4fb3d9' },
    { name: '', color: PLAYER_COLORS[1]?.hex ?? '#e0a030' },
  ])
  const [confirmReplace, setConfirmReplace] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function update(index: 0 | 1, patch: Partial<Draft>) {
    setPlayers((prev) => {
      const next: [Draft, Draft] = [{ ...prev[0] }, { ...prev[1] }]
      next[index] = { ...next[index], ...patch }
      return next
    })
  }

  function start(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (players[0].color === players[1].color) {
      setError('Pick two different colors.')
      return
    }
    try {
      newGame({ players })
      navigate('/same-device/rules')
    } catch (caught) {
      setError(caught instanceof GameError ? caught.message : String(caught))
    }
  }

  const canStart =
    players[0].name.trim() !== '' && players[1].name.trim() !== '' && (!hasRoom || confirmReplace)

  return (
    <Screen title="Play on this phone" back="/" testId="screen-new">
      <form onSubmit={start} className="flex flex-col gap-6">
        <p className="text-ink-muted">
          Two names, two colors. The first player opens the first card, then the phone goes back and
          forth.
        </p>
        {([0, 1] as const).map((index) => (
          <fieldset key={index} className="bg-surface border-edge rounded-3xl border p-4">
            <legend className="sr-only">Player {index + 1}</legend>
            <SectionLabel>Player {index + 1}</SectionLabel>
            <label className="block">
              <span className="sr-only">Name of player {index + 1}</span>
              <TextInput
                data-testid={`setup-name-${index + 1}`}
                value={players[index].name}
                onChange={(e) => update(index, { name: e.target.value })}
                placeholder="Name"
                maxLength={40}
                autoComplete="off"
              />
            </label>
            <ColorPicker
              label={`Color of player ${index + 1}`}
              value={players[index].color}
              onChange={(color) => update(index, { color })}
            />
          </fieldset>
        ))}
        {hasRoom && (
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              data-testid="setup-confirm-replace"
              checked={confirmReplace}
              onChange={(e) => setConfirmReplace(e.target.checked)}
              className="mt-1 h-5 w-5"
            />
            <span>Replace the game already on this phone. Its journal is deleted.</span>
          </label>
        )}
        {error && <Notice tone="error">{error}</Notice>}
        <Button
          type="submit"
          variant="primary"
          block
          disabled={!canStart}
          data-testid="setup-start"
        >
          Start
        </Button>
      </form>
    </Screen>
  )
}
