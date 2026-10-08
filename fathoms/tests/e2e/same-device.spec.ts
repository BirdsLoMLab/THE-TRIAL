import { expect, test, type Page } from '@playwright/test'
import { resolve } from 'node:path'
import { validateContent } from '../../src/content/schema.ts'
import { readContentDir } from '../../scripts/content-node.ts'

const raw = readContentDir(resolve(import.meta.dirname, '../../content'))
const content = validateContent(raw.shared, raw.packs)

/** The Deep from the core pack: 32 questions, one Current after every 5, so 6 Currents. */
const CORE_DEEP = content.cards.filter(
  (c) => c.pack === 'core' && c.type === 'question' && c.level === 3,
).length
const EXPECTED_CARDS =
  CORE_DEEP + Math.floor((CORE_DEEP - 1) / content.shared.defaults.currentEvery)

async function agreeBoth(page: Page) {
  await expect(page.getByTestId('screen-rules')).toBeVisible()
  await page.getByTestId('rules-agree').click()
  await page.getByTestId('rules-agree').click()
  await expect(page.getByTestId('screen-turn')).toBeVisible()
}

/** Plays one turn: hand off if needed, answer what is on the stack, send, dismiss the reveal. */
async function playTurn(page: Page, turn: number): Promise<'played' | 'finished'> {
  if (await page.getByTestId('handoff-ack').isVisible())
    await page.getByTestId('handoff-ack').click()
  if (await page.getByTestId('screen-exhausted').isVisible()) return 'finished'
  await expect(page.getByTestId('screen-turn')).toBeVisible()
  const close = page.getByTestId('close-answer')
  if (await close.isVisible()) await close.fill(`close ${turn}`)
  const open = page.getByTestId('open-answer')
  if (await open.isVisible()) await open.fill(`open ${turn}`)
  await page.getByTestId('send').click()
  const done = page.getByTestId('reveal-done')
  if (await done.isVisible()) await done.click()
  return 'played'
}

test('a full deck is playable on one phone and the journal survives a reload', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('home-new').click()
  await page.getByTestId('setup-name-1').fill('Ada')
  await page.getByTestId('setup-name-2').fill('Ben')
  await page.getByTestId('setup-start').click()
  await agreeBoth(page)

  // Shrink the deck to the core pack at The Deep so the whole deck fits one test run.
  await page.getByTestId('nav-settings').click()
  await expect(page.getByTestId('screen-settings')).toBeVisible()
  await expect(page.getByText(/32 \/ 32 \/ 32 questions by level, 12 Currents/)).toHaveCount(2)
  await page.getByTestId('settings-pack-partner').uncheck()
  await page.getByTestId('settings-start-level-3').click()
  await page.getByTestId('settings-save').click()
  await agreeBoth(page)

  // A few turns, then reload in the middle of a turn: the draft and the holder survive.
  await page.getByTestId('open-answer').fill('open 1')
  await page.getByTestId('send').click()
  await page.getByTestId('handoff-ack').click()
  await expect(page.getByTestId('turn-holder')).toContainText('Ben')
  await page.getByTestId('close-answer').fill('a draft that survives')
  await page.reload()
  await expect(page.getByTestId('turn-holder')).toContainText('Ben')
  await expect(page.getByTestId('close-answer')).toHaveValue('a draft that survives')
  await page.getByTestId('open-answer').fill('open 2')
  await page.getByTestId('send').click()
  await expect(page.getByTestId('screen-reveal')).toBeVisible()
  await expect(page.getByTestId('answer-p1')).toHaveText('open 1')
  await expect(page.getByTestId('answer-p2')).toHaveText('a draft that survives')
  await page.getByTestId('reveal-done').click()

  let turns = 2
  for (; turns < 80; turns++) {
    if ((await playTurn(page, turns + 1)) === 'finished') break
  }
  await expect(page.getByTestId('screen-exhausted')).toBeVisible()
  await expect(page.getByTestId('closer-text')).not.toBeEmpty()
  expect(turns).toBe(EXPECTED_CARDS + 1)

  await page.getByTestId('nav-journal').click()
  await expect(page.getByTestId('journal-entry')).toHaveCount(EXPECTED_CARDS)
  await expect(page.getByTestId('journal-count')).toContainText(`${EXPECTED_CARDS} cards`)

  await page.reload()
  await expect(page.getByTestId('journal-entry')).toHaveCount(EXPECTED_CARDS)
  await page.screenshot({ path: 'test-results/journal-360.png', fullPage: false })

  await page.goto('/#/same-device/turn')
  await expect(page.getByTestId('screen-exhausted')).toBeVisible()
  // Every core card at The Deep is answered now, so a new deck with the same settings would be empty.
  await expect(page.getByTestId('new-deck')).toBeDisabled()
  await expect(page.getByTestId('next-deck-note')).toContainText(
    'Every card in the enabled packs has been answered',
  )
  await page.getByTestId('exhausted-settings').click()
  await page.getByTestId('settings-pack-partner').check()
  await page.getByTestId('settings-save').click()
  await agreeBoth(page)
  await expect(page.getByTestId('turn-holder')).toContainText('Turn ' + (EXPECTED_CARDS + 2))
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(scrollWidth).toBeLessThanOrEqual(360)
  await page.screenshot({ path: 'test-results/turn-360.png', fullPage: true })
})
