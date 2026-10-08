// Builds the web app, syncs it into android/, assembles a signed release APK,
// and copies it to release/fathoms-<version>.apk. Signing comes from
// android/keystore.properties or the FATHOMS_KEYSTORE_* variables (RELEASE.md).
// Usage: pnpm android:release
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const android = join(root, 'android')
const windows = process.platform === 'win32'

function run(command: string, args: string[], cwd: string): void {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: windows })
  if (result.error) {
    console.error(`Could not start ${command}: ${result.error.message}`)
    process.exit(1)
  }
  if (result.status !== 0) {
    console.error(`${command} ${args.join(' ')} exited with code ${result.status ?? 'unknown'}`)
    process.exit(result.status ?? 1)
  }
}

const hasProps = existsSync(join(android, 'keystore.properties'))
const hasEnv = Boolean(process.env.FATHOMS_KEYSTORE_PATH)
if (!hasProps && !hasEnv) {
  console.error(
    'No signing config. Create android/keystore.properties or set FATHOMS_KEYSTORE_PATH and friends. See RELEASE.md.',
  )
  process.exit(1)
}

const version = (
  JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string }
).version
run('pnpm', ['android:sync'], root)
run(windows ? 'gradlew.bat' : './gradlew', ['assembleRelease'], android)

const built = join(android, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk')
if (!existsSync(built)) {
  console.error(
    `Expected ${built}. An unsigned build lands at app-release-unsigned.apk, which means the signing config was not picked up.`,
  )
  process.exit(1)
}
const out = join(root, 'release')
mkdirSync(out, { recursive: true })
const target = join(out, `fathoms-${version}.apk`)
copyFileSync(built, target)
console.log(`Signed release APK: ${target}`)
