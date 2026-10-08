// Two phones against the Firestore and Auth emulators (PLAN Phase 2 accept):
// create and join, ten cards, a refresh on both sides, and a third client kept out.
import { expect, test, type Page } from '@playwright/test'

const CARDS_TO_PLAY = 10

// Two browsers, a dozen round trips through the emulator, and two reloads need more than the default 30 seconds.
test.setTimeout(240_000)

async function agree(page: Page) {
  await expect(page.getByTestId('screen-rules')).toBeVisible({ timeout: 20_000 })
  await page.getByTestId('rules-agree').click()
}

/** The holder answers whatever is on the stack and sends; the reveal is dismissed when it shows. */
async function playTurn(page: Page, turn: number) {
  await expect(page.getByTestId('screen-turn')).toBeVisible({ timeout: 20_000 })
  const close = page.getByTestId('close-answer')
  if (await close.isVisible()) await close.fill(`close ${turn}`)
  const open = page.getByTestId('open-answer')
  if (await open.isVisible()) await open.fill(`open ${turn}`)
  await page.getByTestId('send').click()
  const done = page.getByTestId('reveal-done')
  await expect(done.or(page.getByTestId('screen-waiting'))).toBeVisible({ timeout: 20_000 })
  if (await done.isVisible()) await done.click()
  await expect(page.getByTestId('screen-waiting')).toBeVisible({ timeout: 20_000 })
}

test('two phones play ten cards, survive a refresh on both sides, and keep a third phone out', async ({
  browser,
  baseURL,
}) => {
  const ada = await (await browser.newContext()).newPage()
  const ben = await (await browser.newContext()).newPage()

  await ada.goto('/')
  await ada.getByTestId('home-create-room').click()
  await ada.getByTestId('create-name').fill('Ada')
  await ada.getByTestId('create-submit').click()
  await expect(ada.getByTestId('screen-invite')).toBeVisible({ timeout: 20_000 })
  const roomId = (await ada.getByTestId('invite-code').textContent())?.trim() ?? ''
  expect(roomId).toHaveLength(20)
  await expect(ada.getByTestId('invite-url')).toContainText(`#/join/${roomId}`)

  await ben.goto(`/#/join/${roomId}`)
  await expect(ben.getByTestId('join-code')).toHaveText(roomId)
  await ben.getByTestId('join-name').fill('Ben')
  await ben.getByRole('radio', { name: 'Amber' }).click()
  await ben.getByTestId('join-submit').click()
  await agree(ben)
  await expect(ben.getByTestId('screen-waiting')).toBeVisible({ timeout: 20_000 })

  // Ada's invite page flips to the rules on its own once Ben is in.
  await agree(ada)
  await expect(ada.getByTestId('screen-turn')).toBeVisible({ timeout: 20_000 })
  await expect(ada.getByTestId('turn-holder')).toContainText("Ada's turn")

  // Turn 1: Ada opens. Ben must not see her answer while the card is open.
  await playTurn(ada, 1)
  await expect(ben.getByTestId('screen-turn')).toBeVisible({ timeout: 20_000 })
  await expect(ben.getByTestId('close-card')).toBeVisible()
  await expect(ben.getByTestId('close-card').locator('[data-testid^="answer-"]')).toHaveCount(0)
  await expect(ben.getByTestId('close-answer')).toHaveAttribute(
    'placeholder',
    'Your answer, written blind',
  )

  // Turn 2: Ben closes and opens, sees the reveal with both answers, and asks a follow-up.
  await ben.getByTestId('close-answer').fill('close 2')
  await ben.getByTestId('open-answer').fill('open 2')
  await ben.getByTestId('send').click()
  await expect(ben.getByTestId('screen-reveal')).toBeVisible({ timeout: 20_000 })
  await expect(ben.getByTestId('reveal-card').locator('[data-testid^="answer-"]')).toHaveCount(2, {
    timeout: 20_000,
  })
  await expect(ben.getByTestId('reveal-card')).toContainText('open 1')
  await ben.getByTestId('follow-up-1').fill('Why that one?')
  await ben.getByTestId('follow-up-ask-1').click()
  await expect(ben.getByText('You asked')).toBeVisible({ timeout: 20_000 })
  await ben.getByTestId('reveal-done').click()
  await expect(ben.getByTestId('screen-waiting')).toBeVisible({ timeout: 20_000 })

  // Turn 3: Ada catches up on card 1, replies, closes 2, opens 3. Then both refresh.
  await expect(ada.getByTestId('screen-turn')).toBeVisible({ timeout: 20_000 })
  await expect(ada.getByTestId('catch-up')).toContainText('close 2')
  await expect(ada.getByTestId('pending-1')).toContainText('Why that one?')
  await ada.getByTestId('reply-1').fill('Because.')
  await ada.reload()
  await expect(ada.getByTestId('screen-turn')).toBeVisible({ timeout: 20_000 })
  await expect(ada.getByTestId('reply-1')).toHaveValue('Because.')
  await ben.reload()
  await expect(ben.getByTestId('screen-waiting')).toBeVisible({ timeout: 20_000 })
  await expect(ben.getByTestId('waiting-holder')).toContainText("Ada's turn")
  await playTurn(ada, 3)

  for (let turn = 4; turn <= CARDS_TO_PLAY + 1; turn++) {
    await playTurn(turn % 2 === 0 ? ben : ada, turn)
  }

  // Ten closed cards in both journals, with the follow-up and its reply on card 1.
  for (const page of [ada, ben]) {
    await page.getByTestId('nav-journal').click()
    await expect(page.getByTestId('journal-entry')).toHaveCount(CARDS_TO_PLAY + 1, {
      timeout: 20_000,
    })
    const first = page.locator('[data-testid="journal-entry"][data-seq="1"]')
    await expect(first).toContainText('Ben asked: Why that one?')
    await expect(first).toContainText('Ada: Because.')
    await expect(first.locator('[data-testid^="answer-"]')).toHaveCount(2, { timeout: 20_000 })
  }

  // A third phone can neither join nor read the room.
  const carol = await (await browser.newContext()).newPage()
  await carol.goto(`/#/join/${roomId}`)
  await carol.getByTestId('join-name').fill('Carol')
  await carol.getByTestId('join-submit').click()
  await expect(carol.getByRole('alert')).toContainText('full', { timeout: 20_000 })
  await carol.goto(`${baseURL}/#/room/${roomId}/journal`)
  await expect(carol.getByTestId('screen-room-error')).toBeVisible({ timeout: 20_000 })
  await expect(carol.getByTestId('journal-entry')).toHaveCount(0)

  await ada.screenshot({ path: 'test-results/online-journal-360.png', fullPage: false })
})
