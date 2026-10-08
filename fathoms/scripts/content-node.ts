import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

export interface RawContent {
  shared: unknown
  packs: Record<string, unknown>
}

function readJson(path: string): unknown {
  const text = readFileSync(path, 'utf8')
  try {
    return JSON.parse(text) as unknown
  } catch (error) {
    throw new Error(`${path} is not valid JSON: ${(error as Error).message}`, { cause: error })
  }
}

/** Read content/shared.json and every content/packs/*.json from disk, unvalidated. */
export function readContentDir(contentDir: string): RawContent {
  const shared = readJson(join(contentDir, 'shared.json'))
  const packs: Record<string, unknown> = {}
  const packDir = join(contentDir, 'packs')
  for (const file of readdirSync(packDir)
    .filter((f) => f.endsWith('.json'))
    .sort()) {
    packs[`packs/${file}`] = readJson(join(packDir, file))
  }
  return { shared, packs }
}

/** The content directory of this checkout. */
export function defaultContentDir(): string {
  return resolve(import.meta.dirname, '..', 'content')
}
