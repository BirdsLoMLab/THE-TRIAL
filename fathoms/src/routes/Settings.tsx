import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { getContent } from '../content'
import { countCards } from '../content/schema'
import { GameError, roomPhase } from '../game/turns'
import type { LevelId, PlayerId, Progression, RoomSettings } from '../game/types'
import { PLAYER_COLORS, useSameDevice } from '../store/sameDevice'
import { clock } from '../store/clock'
import { Button, Notice, Screen, SectionLabel, TextInput } from '../components/ui'

const DECK_FIELDS: readonly (keyof RoomSettings)[] = [
  'packs',
  'startLevel',
  'progression',
  'currentEvery',
  'excludeAnswered',
]

interface DeckDraft {
  packs: string[]
  startLevel: LevelId
  progression: Progression
  currentEvery: number
  excludeAnswered: boolean
  passesPerDeck: number
  closerSeesOpener: boolean
}

function errorText(caught: unknown): string {
  return caught instanceof GameError ? caught.message : String(caught)
}

function Toggle({
  label,
  checked,
  onChange,
  testId,
  hint,
}: {
  readonly label: string
  readonly checked: boolean
  readonly onChange: (next: boolean) => void
  readonly testId: string
  readonly hint?: string | undefined
}) {
  return (
    <label className="flex min-h-12 items-center justify-between gap-4 py-2">
      <span>
        <span className="block text-base">{label}</span>
        {hint && <span className="text-ink-muted block text-xs">{hint}</span>}
      </span>
      <input
        type="checkbox"
        className="h-6 w-6 shrink-0"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        data-testid={testId}
      />
    </label>
  )
}

function PlayerEditor({ uid }: { readonly uid: PlayerId }) {
  const room = useSameDevice((s) => s.room)
  const dispatch = useSameDevice((s) => s.dispatch)
  const player = room?.players[uid]
  const [name, setName] = useState(player?.name ?? '')
  const [error, setError] = useState<string | null>(null)
  if (!player) return null

  function save(patch: { name?: string; color?: string }) {
    setError(null)
    try {
      dispatch({ type: 'updatePlayer', by: uid, at: clock.now(), patch })
    } catch (caught) {
      setError(errorText(caught))
    }
  }

  return (
    <div className="bg-surface border-edge rounded-3xl border p-4">
      <label className="block">
        <span className="text-ink-muted text-xs font-semibold tracking-widest uppercase">Name</span>
        <TextInput
          data-testid={`settings-name-${uid}`}
          className="mt-1"
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            if (name.trim() && name.trim() !== player.name) save({ name })
          }}
        />
      </label>
      <div
        role="radiogroup"
        aria-label={`Color of ${player.name}`}
        className="mt-3 flex flex-wrap gap-2"
      >
        {PLAYER_COLORS.map((color) => (
          <button
            key={color.id}
            type="button"
            role="radio"
            aria-checked={player.color === color.hex}
            aria-label={color.name}
            onClick={() => save({ color: color.hex })}
            className={`h-10 w-10 rounded-full border-4 ${player.color === color.hex ? 'border-ink' : 'border-transparent'}`}
            style={{ backgroundColor: color.hex }}
          />
        ))}
      </div>
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  )
}

export function Settings() {
  const navigate = useNavigate()
  const room = useSameDevice((s) => s.room)
  const dispatch = useSameDevice((s) => s.dispatch)
  const rebuild = useSameDevice((s) => s.rebuildDeck)
  const endGame = useSameDevice((s) => s.endGame)
  const content = getContent()
  const counts = countCards(content)
  const [draft, setDraft] = useState<DeckDraft | null>(() =>
    room
      ? {
          packs: [...room.settings.packs],
          startLevel: room.settings.startLevel,
          progression: room.settings.progression,
          currentEvery: room.settings.currentEvery,
          excludeAnswered: room.settings.excludeAnswered,
          passesPerDeck: room.settings.passesPerDeck,
          closerSeesOpener: room.settings.closerSeesOpener,
        }
      : null,
  )
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [pauseNote, setPauseNote] = useState('')

  if (!room || !draft) return <Navigate to="/" replace />

  const deckChanged = DECK_FIELDS.some((field) => {
    const current = room.settings[field]
    const next = draft[field as keyof DeckDraft]
    return next !== undefined && JSON.stringify(current) !== JSON.stringify(next)
  })

  function save() {
    if (!room || !draft) return
    setError(null)
    setSaved(false)
    try {
      const by = room.ball.holderUid
      dispatch({ type: 'updateSettings', by, at: clock.now(), patch: { ...draft } })
      if (deckChanged) {
        rebuild(by)
        navigate('/same-device/rules')
        return
      }
      setSaved(true)
    } catch (caught) {
      setError(errorText(caught))
    }
  }

  function togglePack(id: string, on: boolean) {
    setDraft((d) =>
      d
        ? { ...d, packs: on ? [...new Set([...d.packs, id])] : d.packs.filter((p) => p !== id) }
        : d,
    )
  }

  const phase = roomPhase(room)

  return (
    <Screen title="Settings" back="/same-device/turn" testId="screen-settings">
      <div className="flex flex-col gap-8">
        <section>
          <SectionLabel>Players</SectionLabel>
          <div className="flex flex-col gap-3">
            {room.order.map((uid) => (
              <PlayerEditor key={uid} uid={uid} />
            ))}
          </div>
        </section>

        <section>
          <SectionLabel>Packs</SectionLabel>
          <div className="bg-surface border-edge rounded-3xl border px-4 py-1">
            {counts
              .filter((pack) => !pack.adult)
              .map((pack) => (
                <Toggle
                  key={pack.packId}
                  label={pack.name}
                  hint={`${pack.levels[1]} / ${pack.levels[2]} / ${pack.levels[3]} questions by level, ${pack.currents} Currents`}
                  checked={draft.packs.includes(pack.packId)}
                  onChange={(on) => togglePack(pack.packId, on)}
                  testId={`settings-pack-${pack.packId}`}
                />
              ))}
          </div>
          <Notice>
            After Dark needs both players to switch it on. That gate arrives in Phase 4.
          </Notice>
        </section>

        <section>
          <SectionLabel>Deck</SectionLabel>
          <div className="bg-surface border-edge flex flex-col gap-4 rounded-3xl border p-4">
            <fieldset>
              <legend className="mb-2 text-base">Start at</legend>
              <div className="grid grid-cols-3 gap-2">
                {content.shared.levels.map((level) => (
                  <label
                    key={level.id}
                    data-testid={`settings-start-level-${level.id}`}
                    className={`flex min-h-12 cursor-pointer items-center justify-center rounded-xl border px-2 text-center text-sm ${draft.startLevel === level.id ? 'border-level-1 text-ink' : 'border-edge text-ink-muted'}`}
                  >
                    <input
                      type="radio"
                      name="startLevel"
                      className="sr-only"
                      checked={draft.startLevel === level.id}
                      onChange={() => setDraft({ ...draft, startLevel: level.id })}
                    />
                    {level.name}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-2 text-base">Progression</legend>
              <div className="grid grid-cols-2 gap-2">
                {(['linear', 'mixed'] as const).map((progression) => (
                  <label
                    key={progression}
                    data-testid={`settings-progression-${progression}`}
                    className={`flex min-h-12 cursor-pointer items-center justify-center rounded-xl border px-2 text-sm capitalize ${draft.progression === progression ? 'border-level-1 text-ink' : 'border-edge text-ink-muted'}`}
                  >
                    <input
                      type="radio"
                      name="progression"
                      className="sr-only"
                      checked={draft.progression === progression}
                      onChange={() => setDraft({ ...draft, progression })}
                    />
                    {progression}
                  </label>
                ))}
              </div>
              <p className="text-ink-muted mt-1 text-xs">
                Linear climbs level by level. Mixed shuffles every level together.
              </p>
            </fieldset>
            <label className="flex min-h-12 items-center justify-between gap-4">
              <span>
                <span className="block text-base">A Current after every</span>
                <span className="text-ink-muted block text-xs">
                  questions. 0 turns Currents off.
                </span>
              </span>
              <input
                type="number"
                min={0}
                max={20}
                className="bg-abyss/60 border-edge w-20 rounded-xl border px-3 py-2 text-center text-base"
                value={draft.currentEvery}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    currentEvery: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                  })
                }
                data-testid="settings-current-every"
              />
            </label>
            <label className="flex min-h-12 items-center justify-between gap-4">
              <span>
                <span className="block text-base">Passes per deck</span>
                <span className="text-ink-muted block text-xs">Applies to the next deck.</span>
              </span>
              <input
                type="number"
                min={0}
                max={10}
                className="bg-abyss/60 border-edge w-20 rounded-xl border px-3 py-2 text-center text-base"
                value={draft.passesPerDeck}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    passesPerDeck: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                  })
                }
                data-testid="settings-passes"
              />
            </label>
            <Toggle
              label="Skip cards already answered"
              hint="Off deals answered cards again in the next deck."
              checked={draft.excludeAnswered}
              onChange={(excludeAnswered) => setDraft({ ...draft, excludeAnswered })}
              testId="settings-exclude-answered"
            />
            <Toggle
              label="Closer sees the opener's answer"
              hint="Off means both answers are written blind."
              checked={draft.closerSeesOpener}
              onChange={(closerSeesOpener) => setDraft({ ...draft, closerSeesOpener })}
              testId="settings-closer-sees-opener"
            />
          </div>
          {deckChanged && (
            <Notice>
              Changing packs, the start level, progression, or Currents rebuilds the rest of the
              deck and shows the rules again.
            </Notice>
          )}
          {error && <Notice tone="error">{error}</Notice>}
          {saved && <Notice>Saved.</Notice>}
          <div className="mt-3">
            <Button variant="primary" block onClick={save} data-testid="settings-save">
              {deckChanged ? 'Save and rebuild the deck' : 'Save'}
            </Button>
          </div>
        </section>

        <section>
          <SectionLabel>Game</SectionLabel>
          <div className="bg-surface border-edge flex flex-col gap-3 rounded-3xl border p-4">
            {phase === 'paused' ? (
              <Button
                block
                onClick={() =>
                  dispatch({ type: 'resume', by: room.ball.holderUid, at: clock.now() })
                }
                data-testid="settings-resume"
              >
                Resume
              </Button>
            ) : (
              <>
                <TextInput
                  value={pauseNote}
                  placeholder="Pause note (optional)"
                  aria-label="Pause note"
                  onChange={(e) => setPauseNote(e.target.value)}
                />
                <Button
                  block
                  onClick={() =>
                    dispatch({
                      type: 'pause',
                      by: room.ball.holderUid,
                      at: clock.now(),
                      note: pauseNote,
                    })
                  }
                  data-testid="settings-pause"
                >
                  Pause the game
                </Button>
              </>
            )}
            {confirmEnd ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm">This deletes the journal on this phone. There is no undo.</p>
                <Button
                  variant="danger"
                  block
                  onClick={() => {
                    endGame()
                    navigate('/')
                  }}
                  data-testid="settings-end-confirm"
                >
                  Yes, end it
                </Button>
                <Button variant="ghost" block onClick={() => setConfirmEnd(false)}>
                  Keep playing
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                block
                onClick={() => setConfirmEnd(true)}
                data-testid="settings-end"
              >
                End this game
              </Button>
            )}
          </div>
        </section>

        <footer className="text-ink-muted text-xs">
          Content version {content.shared.version}. Reminder hours, quiet hours, After Dark, and the
          Samsung battery guide arrive with the online rooms.
        </footer>
      </div>
    </Screen>
  )
}
