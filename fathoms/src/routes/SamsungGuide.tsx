import { Screen } from '../components/ui'

const STEPS: readonly { readonly title: string; readonly body: string }[] = [
  {
    title: 'Allow notifications',
    body: 'Settings, then Apps, then Fathoms, then Notifications. Turn Allow notifications on, and make sure the Turns category is set to Alert, not Silent.',
  },
  {
    title: 'Keep Fathoms awake',
    body: 'Settings, then Battery, then Background usage limits. Open Never sleeping apps and add Fathoms. On older One UI versions this lives under Battery and device care, then Battery, then Background usage limits.',
  },
  {
    title: 'Do not put it to sleep',
    body: 'In the same Background usage limits screen, check Sleeping apps and Deep sleeping apps. Remove Fathoms from both if it ended up there.',
  },
  {
    title: 'Turn off adaptive battery for this app',
    body: 'Settings, then Apps, then Fathoms, then Battery. Pick Unrestricted so Android does not hold back the push that tells you it is your turn.',
  },
  {
    title: 'Data saver',
    body: 'If Data saver is on (Settings, then Connections, then Data usage), allow Fathoms to use data in the background.',
  },
]

/** PLAN 4.5: a one screen guide for Samsung battery settings. Documented, not automated. */
export function SamsungGuide() {
  return (
    <Screen title="Samsung battery guide" back="/" testId="screen-samsung-guide">
      <p className="text-ink-muted">
        Samsung phones put quiet apps to sleep, and a sleeping app does not get its turn alerts.
        Five settings keep Fathoms awake. Menu names shift a little between One UI versions; look
        for the same words.
      </p>
      <ol className="mt-6 flex flex-col gap-4">
        {STEPS.map((step, index) => (
          <li key={step.title} className="bg-surface border-edge rounded-3xl border p-4">
            <p className="text-ink-muted text-xs font-semibold tracking-widest uppercase">
              Step {index + 1}
            </p>
            <p className="mt-1 text-lg font-medium">{step.title}</p>
            <p className="text-ink-muted mt-2 text-sm leading-relaxed">{step.body}</p>
          </li>
        ))}
      </ol>
      <p className="text-ink-muted mt-6 text-sm">
        As a backup, the phone itself schedules Still your turn reminders at 10, 20, and 30 hours
        whenever the ball lands on it, even with no connection.
      </p>
    </Screen>
  )
}
