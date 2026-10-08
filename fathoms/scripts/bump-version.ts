// Bumps the app version in one go: package.json, src/config/app.ts, and the
// Android versionCode and versionName. Usage: pnpm version:bump [major|minor|patch|x.y.z]
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

export type Bump = 'major' | 'minor' | 'patch'

export function nextVersion(current: string, bump: Bump | string): string {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(current)
  if (!match) throw new Error(`current version ${current} is not x.y.z`)
  const [major, minor, patch] = [Number(match[1]), Number(match[2]), Number(match[3])]
  if (bump === 'major') return `${major + 1}.0.0`
  if (bump === 'minor') return `${major}.${minor + 1}.0`
  if (bump === 'patch') return `${major}.${minor}.${patch + 1}`
  if (/^\d+\.\d+\.\d+$/.test(bump)) return bump
  throw new Error(`bump must be major, minor, patch, or x.y.z, not ${bump}`)
}

/** One versionCode per release, strictly increasing: major * 10000 + minor * 100 + patch. */
export function versionCodeFor(version: string): number {
  const [major, minor, patch] = version.split('.').map(Number) as [number, number, number]
  return major * 10_000 + minor * 100 + patch
}

export interface BumpResult {
  readonly from: string
  readonly to: string
  readonly versionCode: number
}

export function applyBump(root: string, bump: string): BumpResult {
  const packagePath = resolve(root, 'package.json')
  const pkg = JSON.parse(readFileSync(packagePath, 'utf8')) as { version: string }
  const from = pkg.version
  const to = nextVersion(from, bump)
  const versionCode = versionCodeFor(to)

  pkg.version = to
  writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n')

  const appPath = resolve(root, 'src/config/app.ts')
  const app = readFileSync(appPath, 'utf8').replace(
    /APP_VERSION = '[^']*'/,
    `APP_VERSION = '${to}'`,
  )
  writeFileSync(appPath, app)

  const gradlePath = resolve(root, 'android/app/build.gradle')
  const gradle = readFileSync(gradlePath, 'utf8')
    .replace(/versionCode \d+/, `versionCode ${versionCode}`)
    .replace(/versionName "[^"]*"/, `versionName "${to}"`)
  writeFileSync(gradlePath, gradle)

  return { from, to, versionCode }
}

if (process.argv[1] && import.meta.filename === resolve(process.argv[1])) {
  const bump = process.argv[2] ?? 'patch'
  const result = applyBump(resolve(import.meta.dirname, '..'), bump)
  console.log(`${result.from} to ${result.to} (versionCode ${result.versionCode})`)
}
