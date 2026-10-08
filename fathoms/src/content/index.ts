import sharedRaw from '../../content/shared.json'
import { validateContent, type Content } from './schema'

// Every pack under content/packs is bundled. Keys are rewritten to the form
// shared.json uses to reference them (packs/core.json).
const packModules = import.meta.glob('../../content/packs/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>

export function loadContent(): Content {
  const packFiles: Record<string, unknown> = {}
  for (const [path, data] of Object.entries(packModules)) {
    const key = path.slice(path.lastIndexOf('/packs/') + 1)
    packFiles[key] = data
  }
  return validateContent(sharedRaw, packFiles)
}

let cached: Content | null = null

/** The validated content bundle. Parsed once, then shared. */
export function getContent(): Content {
  cached ??= loadContent()
  return cached
}
