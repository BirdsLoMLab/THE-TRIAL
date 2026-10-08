// Builds the web app, syncs it into android/, assembles a debug APK with the
// Gradle wrapper, and installs it over USB. Works from a POSIX shell or Windows.
// Usage: pnpm android:debug
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const android = join(root, 'android')
const windows = process.platform === 'win32'
const apk = join('app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')

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

const hasSdk =
  existsSync(join(android, 'local.properties')) ||
  Boolean(process.env.ANDROID_HOME) ||
  Boolean(process.env.ANDROID_SDK_ROOT)
if (!hasSdk) {
  console.error(
    'No Android SDK location. Open android/ in Android Studio once (it writes android/local.properties) or set ANDROID_HOME. See README.md, Android debug build.',
  )
  process.exit(1)
}

run('pnpm', ['android:sync'], root)
run(windows ? 'gradlew.bat' : './gradlew', ['assembleDebug'], android)
run('adb', ['install', '-r', apk], android)
console.log(`Installed ${join(android, apk)}`)
