import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { getContent } from '../content'
import { countCards } from '../content/schema'
import { GameError, roomPhase } from '../game/turns'
import type { LevelId, PlayerId, Progression, RoomSettings } from '../game/types'
import { useGame } from '../game-ui/context'
import { deleteConfirmed } from '../game/turns'
import { useLock } from '../lock/lock'
import { clock } from '../store/clock'
import { useOnline } from '../store/online'
import { playerName } from '../components/cardMeta'
import { ColorPicker } from '../components/ColorPicker'
import {
  Button,
  LinkButton,
  Notice,
  PlayerDot,
  Screen,
  SectionLabel,
  TextInput,
} from '../components/ui'

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
  customCardsEnabled: boolean
  passesPerDeck: number
  closerSeesOpener: boolean
}

function errorText(caught: unknown): string {
  return caught instanceof GameError || caught instanceof Error ? caught.message : String(caught)
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
  const game = useGame()
  const player = game.room.players[uid]
  const [name, setName] = useState(player?.name ?? '')
  const [error, setError] = useState<string | null>(null)
  if (!player) return null

  async function save(patch: { name?: string; color?: string }) {
    setError(null)
    try {
      await game.dispatch({ type: 'updatePlayer', by: uid, at: clock.now(), patch })
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
            if (name.trim() && name.trim() !== player.name) void save({ name })
          }}
        />
      </label>
      <ColorPicker
        label={`Color of ${player.name}`}
        value={player.color}
        onChange={(color) => void save({ color })}
        size="md"
      />
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  )
}

function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/** Phase 3: reminder hours, cap, quiet hours, push status, and the Samsung battery guide. Online rooms only. */
function RemindersSection() {
  const game = useGame()
  const { room, viewer } = game
  const me = room.players[viewer]
  const pushState = useOnline((s) => s.pushState)
  const enablePush = useOnline((s) => s.enablePush)
  const [hours, setHours] = useState(String(room.settings.reminderHours))
  const [cap, setCap] = useState(
    room.settings.reminderCap === null ? '' : String(room.settings.reminderCap),
  )
  const [quietOn, setQuietOn] = useState(me?.quietHours !== null && me?.quietHours !== undefined)
  const [start, setStart] = useState(me?.quietHours?.start ?? '22:00')
  const [end, setEnd] = useState(me?.quietHours?.end ?? '08:00')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function save() {
    setError(null)
    setSaved(false)
    try {
      const reminderHours = Number(hours)
      const reminderCap = cap.trim() === '' ? null : Number(cap)
      await game.dispatch({
        type: 'updateSettings',
        by: viewer,
        at: clock.now(),
        patch: { reminderHours, reminderCap },
      })
      await game.dispatch({
        type: 'updatePlayer',
        by: viewer,
        at: clock.now(),
        patch: { quietHours: quietOn ? { start, end, tz: deviceTimeZone() } : null },
      })
      setSaved(true)
    } catch (caught) {
      setError(errorText(caught))
    }
  }

  return (
    <section>
      <SectionLabel>Reminders and notifications</SectionLabel>
      <div className="bg-surface border-edge flex flex-col gap-4 rounded-3xl border p-4">
        <label className="flex min-h-12 items-center justify-between gap-4">
          <span>
            <span className="block text-base">Remind after</span>
            <span className="text-ink-muted block text-xs">
              hours holding the ball, then again every that many hours.
            </span>
          </span>
          <input
            type="number"
            min={1}
            max={72}
            step={1}
            className="bg-abyss/60 border-edge w-20 rounded-xl border px-3 py-2 text-center text-base"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            data-testid="settings-reminder-hours"
          />
        </label>
        <label className="flex min-h-12 items-center justify-between gap-4">
          <span>
            <span className="block text-base">Reminders per turn</span>
            <span className="text-ink-muted block text-xs">Empty means no limit.</span>
          </span>
          <input
            type="number"
            min={1}
            max={20}
            step={1}
            className="bg-abyss/60 border-edge w-20 rounded-xl border px-3 py-2 text-center text-base"
            value={cap}
            placeholder="none"
            onChange={(e) => setCap(e.target.value)}
            data-testid="settings-reminder-cap"
          />
        </label>
        <Toggle
          label="Quiet hours for me"
          hint={`No reminders between these times, ${deviceTimeZone()}.`}
          checked={quietOn}
          onChange={setQuietOn}
          testId="settings-quiet-toggle"
        />
        {quietOn && (
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="text-ink-muted block text-xs">From</span>
              <input
                type="time"
                className="bg-abyss/60 border-edge mt-1 w-full rounded-xl border px-3 py-2 text-base"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                data-testid="settings-quiet-start"
              />
            </label>
            <label className="text-sm">
              <span className="text-ink-muted block text-xs">To</span>
              <input
                type="time"
                className="bg-abyss/60 border-edge mt-1 w-full rounded-xl border px-3 py-2 text-base"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                data-testid="settings-quiet-end"
              />
            </label>
          </div>
        )}
        {error && <Notice tone="error">{error}</Notice>}
        {saved && <Notice>Saved.</Notice>}
        <Button
          variant="primary"
          block
          onClick={save}
          disabled={game.busy}
          data-testid="settings-reminders-save"
        >
          Save reminders
        </Button>
        <div className="border-edge border-t pt-4">
          <p className="text-base">Turn alerts on this phone</p>
          <p className="text-ink-muted mt-1 text-xs" data-testid="settings-push-state">
            {pushState === 'granted'
              ? 'On. This phone gets a push when it is your turn.'
              : pushState === 'denied'
                ? 'Off. Allow notifications for Fathoms in Android settings, then tap below.'
                : pushState === 'unsupported'
                  ? 'Push works in the Android app. In a browser, keep this tab open instead.'
                  : 'Not asked yet.'}
          </p>
          <Button
            className="mt-3"
            onClick={() => void enablePush()}
            data-testid="settings-enable-push"
          >
            Enable notifications
          </Button>
        </div>
        <LinkButton
          to="/guide/samsung-battery"
          variant="ghost"
          block
          data-testid="settings-battery-guide"
        >
          Samsung battery settings guide
        </LinkButton>
      </div>
    </section>
  )
}

/** PLAN 4.9: each player switches After Dark on for themselves after confirming they are an adult. */
function AfterDarkSection() {
  const game = useGame()
  const { room } = game
  const actor = game.mode === 'online' ? game.viewer : room.ball.holderUid
  const me = room.players[actor]
  const partner = room.order.find((uid) => uid !== actor)
  const [confirm, setConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const content = getContent()
  const adultPack = content.packs.find((pack) => pack.adult)
  const packOn = adultPack ? room.settings.packs.includes(adultPack.id) : false
  const bothOn = room.order.every((uid) => room.players[uid]?.afterDarkEnabled)

  async function run(action: Parameters<typeof game.dispatch>[0]) {
    setError(null)
    try {
      await game.dispatch(action)
    } catch (caught) {
      setError(errorText(caught))
    }
  }

  async function toggle(enabled: boolean) {
    await run({ type: 'afterDark', by: actor, at: clock.now(), enabled, confirmAdult: confirm })
    if (enabled && adultPack && !packOn) {
      await run({
        type: 'updateSettings',
        by: actor,
        at: clock.now(),
        patch: { packs: [...room.settings.packs, adultPack.id] },
      })
    }
  }

  if (!adultPack || !me) return null
  return (
    <section>
      <SectionLabel>After Dark</SectionLabel>
      <div className="bg-surface border-edge flex flex-col gap-3 rounded-3xl border p-4">
        <p className="text-ink-muted text-sm">
          {adultPack.blurb}{' '}
          {bothOn
            ? 'On for both of you: its cards join the next deck.'
            : partner
              ? `${playerName(room, partner)} ${room.players[partner]?.afterDarkEnabled ? 'has it on' : 'has it off'}.`
              : ''}
        </p>
        {me.afterDarkEnabled ? (
          <Button block onClick={() => toggle(false)} data-testid="settings-afterdark-off">
            Turn After Dark off for me
          </Button>
        ) : (
          <>
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-1 h-5 w-5"
                checked={confirm}
                onChange={(e) => setConfirm(e.target.checked)}
                data-testid="settings-afterdark-confirm"
              />
              <span>I am 18 or older and I want explicit cards in this room.</span>
            </label>
            <Button
              variant="primary"
              block
              disabled={!confirm || game.busy}
              onClick={() => toggle(true)}
              data-testid="settings-afterdark-on"
            >
              Turn After Dark on for me
            </Button>
          </>
        )}
        <label className="flex min-h-12 items-center justify-between gap-4">
          <span>
            <span className="block text-base">Keep After Dark entries in the journal</span>
            <span className="text-ink-muted block text-xs">
              Off hides each one after you have both read it. Hidden entries are gone for good.
            </span>
          </span>
          <input
            type="checkbox"
            className="h-6 w-6 shrink-0"
            checked={room.settings.afterDarkRetention === 'keep'}
            onChange={(e) =>
              run({
                type: 'updateSettings',
                by: actor,
                at: clock.now(),
                patch: { afterDarkRetention: e.target.checked ? 'keep' : 'hide-after-read' },
              })
            }
            data-testid="settings-afterdark-retention"
          />
        </label>
        <p className="text-ink-muted text-xs">
          Turn alerts for After Dark cards never show the card text. An app lock is below.
        </p>
        {error && <Notice tone="error">{error}</Notice>}
      </div>
    </section>
  )
}

/** PLAN 4.9: tags a player excludes are excluded for the room; the partner sees only that something is excluded. */
function TagExclusionSection() {
  const game = useGame()
  const { room } = game
  const actor = game.mode === 'online' ? game.viewer : room.ball.holderUid
  const me = room.players[actor]
  const partner = room.order.find((uid) => uid !== actor)
  const [error, setError] = useState<string | null>(null)
  const content = getContent()
  const tags = useMemo(() => {
    const set = new Set<string>()
    for (const pack of content.packs) {
      if (!room.settings.packs.includes(pack.id)) continue
      if (pack.adult && !room.order.every((uid) => room.players[uid]?.afterDarkEnabled)) continue
      for (const card of pack.cards) for (const tag of card.tags) set.add(tag)
    }
    return [...set].sort()
  }, [content.packs, room])
  if (!me) return null
  const mine = new Set(me.excludeTags)
  const partnerCount = partner ? (room.players[partner]?.excludeTags.length ?? 0) : 0

  async function toggle(tag: string) {
    setError(null)
    const next = mine.has(tag)
      ? me!.excludeTags.filter((t) => t !== tag)
      : [...me!.excludeTags, tag]
    try {
      await game.dispatch({ type: 'excludeTags', by: actor, at: clock.now(), tags: next })
    } catch (caught) {
      setError(errorText(caught))
    }
  }

  return (
    <section>
      <SectionLabel>Topics to skip</SectionLabel>
      <div className="bg-surface border-edge rounded-3xl border p-4">
        <p className="text-ink-muted text-sm">
          Cards with a topic you tick are left out of the deck for both of you.
          {game.mode === 'online' && partnerCount > 0
            ? ` ${playerName(room, partner!)} skips ${partnerCount} ${partnerCount === 1 ? 'topic' : 'topics'} too.`
            : ''}
        </p>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Topics">
          {tags.map((tag) => (
            <button
              key={tag}
              type="button"
              aria-pressed={mine.has(tag)}
              onClick={() => toggle(tag)}
              data-testid={`settings-tag-${tag}`}
              className={`min-h-10 rounded-full border px-3 text-sm ${mine.has(tag) ? 'border-afterdark text-ink line-through' : 'border-edge text-ink-muted'}`}
            >
              {tag}
            </button>
          ))}
        </div>
        {error && <Notice tone="error">{error}</Notice>}
      </div>
    </section>
  )
}

/** PLAN 4.9: PIN with biometric unlock. Local to this phone. */
function LockSection() {
  const enabled = useLock((s) => s.enabled)
  const biometrics = useLock((s) => s.biometrics)
  const enable = useLock((s) => s.enable)
  const disable = useLock((s) => s.disable)
  const setBiometrics = useLock((s) => s.setBiometrics)
  const [pin, setPin] = useState('')
  const [again, setAgain] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function turnOn() {
    setError(null)
    if (pin !== again) {
      setError('The two PINs differ.')
      return
    }
    try {
      await enable(pin, true)
      setPin('')
      setAgain('')
    } catch (caught) {
      setError(errorText(caught))
    }
  }

  async function turnOff() {
    setError(null)
    if (!(await disable(pin))) setError('That PIN is not right.')
    setPin('')
  }

  return (
    <section>
      <SectionLabel>App lock</SectionLabel>
      <div className="bg-surface border-edge flex flex-col gap-3 rounded-3xl border p-4">
        <p className="text-ink-muted text-sm">
          {enabled
            ? 'On. The Turn and Journal screens ask for the PIN when the app opens or comes back after a while.'
            : 'A PIN for this phone, with fingerprint or face unlock when the phone has it.'}
        </p>
        <TextInput
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          value={pin}
          placeholder={enabled ? 'Current PIN' : 'New PIN, 4 to 8 digits'}
          aria-label={enabled ? 'Current PIN' : 'New PIN'}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
          data-testid="settings-lock-pin"
        />
        {!enabled && (
          <TextInput
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            value={again}
            placeholder="Same PIN again"
            aria-label="Repeat the PIN"
            onChange={(e) => setAgain(e.target.value.replace(/\D/g, '').slice(0, 8))}
            data-testid="settings-lock-pin-again"
          />
        )}
        {enabled ? (
          <>
            <Toggle
              label="Fingerprint or face unlock"
              checked={biometrics}
              onChange={setBiometrics}
              testId="settings-lock-biometrics"
            />
            <Button
              block
              onClick={turnOff}
              disabled={pin.length < 4}
              data-testid="settings-lock-off"
            >
              Turn the lock off
            </Button>
          </>
        ) : (
          <Button
            variant="primary"
            block
            onClick={turnOn}
            disabled={pin.length < 4}
            data-testid="settings-lock-on"
          >
            Turn the lock on
          </Button>
        )}
        {error && <Notice tone="error">{error}</Notice>}
      </div>
    </section>
  )
}

/** PLAN 4.8: Delete Room is a hard delete that both players confirm. */
function DeleteRoomControls() {
  const game = useGame()
  const navigate = useNavigate()
  const { room, viewer } = game
  const [error, setError] = useState<string | null>(null)
  const mine = room.deleteRequests[viewer] !== undefined
  const partner = room.order.find((uid) => uid !== viewer)
  const theirs = partner ? room.deleteRequests[partner] !== undefined : false
  const confirmed = deleteConfirmed(room)

  async function run(fn: () => Promise<void>) {
    setError(null)
    try {
      await fn()
    } catch (caught) {
      setError(errorText(caught))
    }
  }

  return (
    <div className="border-edge flex flex-col gap-2 border-t pt-3">
      <p className="text-sm">
        Delete the room for both of you.{' '}
        {theirs
          ? `${playerName(room, partner!)} already asked.`
          : 'Both of you have to ask; then either of you can delete it.'}
      </p>
      {confirmed ? (
        <Button
          variant="danger"
          block
          onClick={() =>
            run(async () => {
              await game.deleteRoom()
              navigate('/')
            })
          }
          data-testid="settings-delete-room"
        >
          Delete the room now
        </Button>
      ) : (
        <Button
          variant={mine ? 'ghost' : 'danger'}
          block
          onClick={() =>
            run(() =>
              game.dispatch({ type: 'requestDelete', by: viewer, at: clock.now(), on: !mine }),
            )
          }
          data-testid="settings-delete-request"
        >
          {mine ? 'Withdraw my delete request' : 'Ask to delete the room'}
        </Button>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  )
}

export function Settings() {
  const navigate = useNavigate()
  const game = useGame()
  const { room } = game
  const content = getContent()
  const counts = countCards(content)
  const [draft, setDraft] = useState<DeckDraft>(() => ({
    packs: [...room.settings.packs],
    startLevel: room.settings.startLevel,
    progression: room.settings.progression,
    currentEvery: room.settings.currentEvery,
    excludeAnswered: room.settings.excludeAnswered,
    customCardsEnabled: room.settings.customCardsEnabled,
    passesPerDeck: room.settings.passesPerDeck,
    closerSeesOpener: room.settings.closerSeesOpener,
  }))
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [pauseNote, setPauseNote] = useState('')
  const [copied, setCopied] = useState(false)

  const deckChanged = DECK_FIELDS.some((field) => {
    const current = room.settings[field]
    const next = draft[field as keyof DeckDraft]
    return next !== undefined && JSON.stringify(current) !== JSON.stringify(next)
  })
  const actor = game.mode === 'online' ? game.viewer : room.ball.holderUid

  async function save() {
    setError(null)
    setSaved(false)
    try {
      await game.dispatch({
        type: 'updateSettings',
        by: actor,
        at: clock.now(),
        patch: { ...draft },
      })
      if (deckChanged) {
        await game.rebuildDeck()
        navigate(`${game.basePath}/rules`)
        return
      }
      setSaved(true)
    } catch (caught) {
      setError(errorText(caught))
    }
  }

  async function run(action: Parameters<typeof game.dispatch>[0]) {
    setError(null)
    try {
      await game.dispatch(action)
    } catch (caught) {
      setError(errorText(caught))
    }
  }

  function togglePack(id: string, on: boolean) {
    setDraft((d) => ({
      ...d,
      packs: on ? [...new Set([...d.packs, id])] : d.packs.filter((p) => p !== id),
    }))
  }

  async function copyInvite() {
    if (!game.inviteUrl) return
    try {
      await navigator.clipboard.writeText(game.inviteUrl)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const phase = roomPhase(room)

  return (
    <Screen title="Settings" back={`${game.basePath}/turn`} testId="screen-settings">
      <div className="flex flex-col gap-8">
        <section>
          <SectionLabel>Players</SectionLabel>
          <div className="flex flex-col gap-3">
            {room.order.map((uid) =>
              game.mode === 'online' && uid !== game.viewer ? (
                <div
                  key={uid}
                  className="bg-surface border-edge rounded-3xl border p-4"
                  data-testid={`settings-partner-${uid}`}
                >
                  <PlayerDot
                    color={room.players[uid]?.color ?? '#9fb0c3'}
                    name={room.players[uid]?.name ?? uid}
                  />
                  <p className="text-ink-muted mt-1 text-xs">
                    Your partner edits their own name and color.
                  </p>
                </div>
              ) : (
                <PlayerEditor key={uid} uid={uid} />
              ),
            )}
          </div>
        </section>

        {game.mode === 'online' && game.inviteUrl && (
          <section>
            <SectionLabel>Room</SectionLabel>
            <div className="bg-surface border-edge rounded-3xl border p-4">
              <p className="text-ink-muted text-xs font-semibold tracking-widest uppercase">
                Room code
              </p>
              <p className="mt-1 font-mono text-sm break-all" data-testid="settings-room-code">
                {game.roomId}
              </p>
              <Button className="mt-3" onClick={copyInvite} data-testid="settings-copy-invite">
                {copied ? 'Copied' : 'Copy invite link'}
              </Button>
            </div>
          </section>
        )}

        {game.mode === 'online' && <RemindersSection />}

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
              label="Custom cards"
              hint="Cards you write join the next deck."
              checked={draft.customCardsEnabled}
              onChange={(customCardsEnabled) => setDraft({ ...draft, customCardsEnabled })}
              testId="settings-custom-cards"
            />
            <LinkButton
              to={`${game.basePath}/cards`}
              variant="ghost"
              block
              data-testid="settings-custom-cards-link"
            >
              Write your own cards ({game.customCards.length})
            </LinkButton>
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
            <Button
              variant="primary"
              block
              onClick={save}
              disabled={game.busy}
              data-testid="settings-save"
            >
              {deckChanged ? 'Save and rebuild the deck' : 'Save'}
            </Button>
          </div>
        </section>

        <AfterDarkSection />
        <TagExclusionSection />
        <LockSection />

        <section>
          <SectionLabel>Game</SectionLabel>
          <div className="bg-surface border-edge flex flex-col gap-3 rounded-3xl border p-4">
            {phase === 'paused' ? (
              <Button
                block
                onClick={() => run({ type: 'resume', by: actor, at: clock.now() })}
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
                    run({ type: 'pause', by: actor, at: clock.now(), note: pauseNote })
                  }
                  data-testid="settings-pause"
                >
                  Pause the game
                </Button>
              </>
            )}
            {game.mode === 'online' && <DeleteRoomControls />}
            {confirmEnd ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm">
                  {game.mode === 'online'
                    ? 'This forgets the room on this phone. The room itself stays; open the invite link to come back.'
                    : 'This deletes the journal on this phone. There is no undo.'}
                </p>
                <Button
                  variant="danger"
                  block
                  onClick={async () => {
                    await game.endGame()
                    navigate('/')
                  }}
                  data-testid="settings-end-confirm"
                >
                  {game.mode === 'online' ? 'Yes, forget it' : 'Yes, end it'}
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
                {game.mode === 'online' ? 'Leave this room on this phone' : 'End this game'}
              </Button>
            )}
          </div>
        </section>

        <footer className="text-ink-muted text-xs">
          Content version {content.shared.version}. Reminder hours, quiet hours, After Dark, Delete
          room, and the Samsung battery guide arrive in later phases.
        </footer>
      </div>
    </Screen>
  )
}
