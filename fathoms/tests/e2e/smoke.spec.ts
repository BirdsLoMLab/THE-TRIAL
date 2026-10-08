import { expect, test } from '@playwright/test'
import { resolve } from 'node:path'
import { validateContent } from '../../src/content/schema.ts'
import { readContentDir } from '../../scripts/content-node.ts'

const raw = readContentDir(resolve(import.meta.dirname, '../../content'))
const content = validateContent(raw.shared, raw.packs)

test('home shows the app name and fits 360 px without a horizontal scroll', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('app-name')).toHaveText(content.shared.appName)
  await expect(page.getByTestId('home-new')).toBeVisible()
  await expect(page.getByTestId('home-continue')).toHaveCount(0)

  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(scrollWidth).toBeLessThanOrEqual(360)

  await page.screenshot({ path: 'test-results/home-360.png', fullPage: true })
})
