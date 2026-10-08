// Validates content/ with the same schema the app uses at startup.
// Usage: node scripts/check-content.ts [contentDir]
import { ContentError, countCards, validateContent } from '../src/content/schema.ts'
import { defaultContentDir, readContentDir } from './content-node.ts'

const contentDir = process.argv[2] ?? defaultContentDir()

try {
  const raw = readContentDir(contentDir)
  const content = validateContent(raw.shared, raw.packs)
  const counts = countCards(content)
  console.log(
    `${content.shared.appName}: content version ${content.shared.version}, ${content.cards.length} cards`,
  )
  for (const pack of counts) {
    const flag = pack.adult ? ' (adult)' : ''
    console.log(
      `  ${pack.name}${flag}: ${pack.levels[1]} / ${pack.levels[2]} / ${pack.levels[3]} questions by level, ${pack.currents} Currents, ${pack.total} total`,
    )
  }
} catch (error) {
  if (error instanceof ContentError) {
    console.error(error.message)
    process.exit(1)
  }
  throw error
}
