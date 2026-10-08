import type { CapacitorConfig } from '@capacitor/cli'

// Keep this file self contained. The Capacitor CLI compiles it on its own,
// so it must not import from src/.
const config: CapacitorConfig = {
  appId: 'com.fathoms.app',
  appName: 'Fathoms',
  webDir: 'dist',
  // Same value as --color-abyss in src/index.css, so the WebView never flashes
  // white before the page paints. A unit test keeps them in sync.
  backgroundColor: '#070d16',
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SystemBars: {
      // Light icons on the dark page, whatever the phone's system theme is.
      style: 'DARK',
    },
  },
}

export default config
