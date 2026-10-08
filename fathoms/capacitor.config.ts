import type { CapacitorConfig } from '@capacitor/cli'

// Keep this file self contained. The Capacitor CLI compiles it on its own,
// so it must not import from src/.
const config: CapacitorConfig = {
  appId: 'com.fathoms.app',
  appName: 'Fathoms',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
}

export default config
