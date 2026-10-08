import { getContent } from '../content'
import { countCards, type LevelId } from '../content/schema'

// Tailwind only sees complete class names, so level styles are a static map.
const LEVEL_CHIP: Record<LevelId, string> = {
  1: 'bg-level-1 text-abyss',
  2: 'bg-level-2 text-ink',
  3: 'bg-level-3 text-ink ring-1 ring-edge',
}

export function Home() {
  const content = getContent()
  const counts = countCards(content)
  const totalCards = content.cards.length

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md px-4 pt-10 pb-12">
      <header>
        <h1 data-testid="app-name" className="text-4xl font-semibold tracking-tight">
          {content.shared.appName}
        </h1>
        <p className="text-ink-muted mt-2 text-lg">
          Phase 0 scaffold. Card counts per pack and level.
        </p>
      </header>

      <section className="mt-8 flex flex-col gap-4" aria-label="Packs">
        {counts.map((pack) => (
          <article
            key={pack.packId}
            data-testid={`pack-${pack.packId}`}
            className={`bg-surface rounded-2xl border p-4 ${pack.adult ? 'border-afterdark' : 'border-edge'}`}
          >
            <h2 className="flex items-center gap-2 text-xl font-medium">
              {pack.name}
              {pack.adult && (
                <>
                  <span className="bg-afterdark rounded-full px-2 py-0.5 text-xs tracking-wide uppercase">
                    18+
                  </span>
                  <span className="sr-only">adults only</span>
                </>
              )}
            </h2>
            <dl className="mt-3 grid grid-cols-4 gap-2 text-center">
              {content.shared.levels.map((level) => (
                <div key={level.id} className={`rounded-xl px-1 py-2 ${LEVEL_CHIP[level.id]}`}>
                  <dt className="flex min-h-8 items-end justify-center text-[11px] leading-tight [overflow-wrap:anywhere] opacity-90">
                    {level.name}
                  </dt>
                  <dd
                    data-testid={`count-${pack.packId}-${level.id}`}
                    className="text-2xl font-semibold"
                  >
                    {pack.levels[level.id]}
                  </dd>
                </div>
              ))}
              <div className="bg-currents text-abyss rounded-xl px-1 py-2">
                <dt className="flex min-h-8 items-end justify-center text-[11px] leading-tight [overflow-wrap:anywhere] opacity-90">
                  Currents
                </dt>
                <dd
                  data-testid={`count-${pack.packId}-currents`}
                  className="text-2xl font-semibold"
                >
                  {pack.currents}
                </dd>
              </div>
            </dl>
            <p className="text-ink-muted mt-3 text-sm">
              {'Total '}
              <span data-testid={`count-${pack.packId}-total`} className="text-ink font-medium">
                {pack.total}
              </span>
              {' cards'}
            </p>
          </article>
        ))}
      </section>

      <footer className="text-ink-muted mt-8 text-sm">
        <p>
          Content version {content.shared.version}. {totalCards} cards across {counts.length} packs.
        </p>
      </footer>
    </main>
  )
}
