// Working agreement (PLAN section 12): no em dashes or en dashes anywhere in
// UI text, docs, comments, or content. Scans the text files, dotfiles included.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'android',
  'coverage',
  '.vitest',
  'test-results',
  'playwright-report',
  '.git',
])
const EXTENSIONS = new Set([
  '.md',
  '.ts',
  '.tsx',
  '.js',
  '.json',
  '.css',
  '.html',
  '.yml',
  '.yaml',
  '.svg',
])
// U+2013 en dash and U+2014 em dash, built from code points so this file passes its own check.
const DASHES = new RegExp('[' + String.fromCharCode(0x2013, 0x2014) + ']')

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (name.startsWith('.') || EXTENSIONS.has(name.slice(name.lastIndexOf('.'))))
      out.push(path)
  }
}

const files: string[] = []
walk(root, files)

const hits: string[] = []
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, index) => {
    if (DASHES.test(line)) hits.push(`${relative(root, file)}:${index + 1}: ${line.trim()}`)
  })
}

if (hits.length) {
  console.error(`Found ${hits.length} line(s) with an em dash or en dash:`)
  for (const hit of hits) console.error(`  ${hit}`)
  process.exit(1)
}
console.log(`No em or en dashes in ${files.length} files.`)
