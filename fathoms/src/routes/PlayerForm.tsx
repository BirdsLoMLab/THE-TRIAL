import { useState, type FormEvent, type ReactNode } from 'react'
import { ColorPicker } from '../components/ColorPicker'
import { Button, Notice, SectionLabel, TextInput } from '../components/ui'
import { PLAYER_COLORS } from '../store/sameDevice'

/** One name and one color, used to create or join an online room. */
export function PlayerForm({
  submitLabel,
  busyLabel,
  onSubmit,
  children,
  testId,
}: {
  readonly submitLabel: string
  readonly busyLabel: string
  readonly onSubmit: (input: { name: string; color: string }) => Promise<void>
  readonly children?: ReactNode
  readonly testId: string
}) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(PLAYER_COLORS[0]?.hex ?? '#4fb3d9')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await onSubmit({ name, color })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      {children}
      <fieldset className="bg-surface border-edge rounded-3xl border p-4">
        <legend className="sr-only">You</legend>
        <SectionLabel>You</SectionLabel>
        <label className="block">
          <span className="sr-only">Your name</span>
          <TextInput
            data-testid={`${testId}-name`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            maxLength={40}
            autoComplete="off"
          />
        </label>
        <ColorPicker label="Your color" value={color} onChange={setColor} />
      </fieldset>
      {error && <Notice tone="error">{error}</Notice>}
      <Button
        type="submit"
        variant="primary"
        block
        disabled={busy || name.trim() === ''}
        data-testid={`${testId}-submit`}
      >
        {busy ? busyLabel : submitLabel}
      </Button>
    </form>
  )
}
