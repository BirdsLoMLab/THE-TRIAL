import { defineConfig } from '@playwright/test'

// Set PLAYWRIGHT_CHROMIUM_EXECUTABLE to reuse a system Chromium instead of the
// browser Playwright would download. Unset it to use the downloaded browser.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    // Galaxy class phone in CSS pixels. Phone first at 360 px is a design rule.
    viewport: { width: 360, height: 780 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    colorScheme: 'dark',
    launchOptions: executablePath ? { executablePath } : {},
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'phone-chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // A demo project against the local emulators. pnpm test:e2e starts them.
    env: {
      VITE_FIREBASE_API_KEY: 'demo-key',
      VITE_FIREBASE_AUTH_DOMAIN: 'localhost',
      VITE_FIREBASE_PROJECT_ID: 'demo-fathoms',
      VITE_FIREBASE_APP_ID: 'demo-app',
      VITE_FIREBASE_EMULATORS: '1',
    },
  },
})
