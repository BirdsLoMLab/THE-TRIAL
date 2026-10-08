import { resolve } from 'node:path'
import type { Plugin } from 'vite'
import { ContentError, validateContent } from '../src/content/schema.ts'
import { readContentDir } from './content-node.ts'

/**
 * Fails the build (and the dev server start) when content/ is invalid, using
 * the same schema the app applies at runtime. PLAN section 8, Phase 0.
 */
export function fathomsContent(): Plugin {
  let contentDir = ''
  return {
    name: 'fathoms-content',
    configResolved(config) {
      contentDir = resolve(config.root, 'content')
    },
    buildStart() {
      try {
        const raw = readContentDir(contentDir)
        validateContent(raw.shared, raw.packs)
      } catch (error) {
        const detail = error instanceof ContentError ? error.message : String(error)
        this.error(`Content under ${contentDir} failed validation.\n${detail}`)
      }
    },
  }
}
