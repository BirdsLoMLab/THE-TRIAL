import { expect, test } from '@playwright/test'
import { resolve } from 'node:path'
import { countCards, validateContent } from '../../src/content/schema.ts'
import { readContentDir } from '../../scripts/content-node.ts'

const raw = readContentDir(resolve(import.meta.dirname, '../../content'))
const content = validateContent(raw.shared, raw.packs)

test('home shows the app name and card counts per pack and level at 360 px', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('app-name')).toHaveText(content.shared.appName)

  for (const pack of countCards(content)) {
    await expect(page.getByTestId(`pack-${pack.packId}`)).toContainText(pack.name)
    for (const level of [1, 2, 3] as const) {
      await expect(page.getByTestId(`count-${pack.packId}-${level}`)).toHaveText(
        String(pack.levels[level]),
      )
    }
    await expect(page.getByTestId(`count-${pack.packId}-currents`)).toHaveText(
      String(pack.currents),
    )
    await expect(page.getByTestId(`count-${pack.packId}-total`)).toHaveText(String(pack.total))
  }

  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(scrollWidth).toBeLessThanOrEqual(360)

  await page.screenshot({ path: 'test-results/home-360.png', fullPage: true })
})
