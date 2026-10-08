import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      setupFiles: ['tests/unit/setup.ts'],
      include: ['tests/unit/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
      coverage: {
        // Always on, so pnpm test fails when src/game or src/content drops
        // below 100 percent line coverage (PLAN sections 7 and 8).
        enabled: true,
        provider: 'v8',
        include: ['src/game', 'src/content'],
        reporter: ['text', 'html'],
        reportsDirectory: 'coverage',
        thresholds: {
          'src/game/**': { lines: 100, perFile: true },
          'src/content/**': { lines: 100, perFile: true },
        },
      },
    },
  }),
)
