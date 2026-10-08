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
        provider: 'v8',
        include: ['src/game', 'src/content'],
        reporter: ['text', 'html'],
        reportsDirectory: 'coverage',
      },
    },
  }),
)
