import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { agreeBoth, renderAt, resetStore, startSmallGame, store } from './helpers'

describe('Journal', () => {
  beforeEach(() => {
    resetStore()
    startSmallGame()
    agreeBoth()
  })

  it('is empty before the first card and lists cards newest first afterwards', async () => {
    const empty = renderAt('/same-device/journal')
    expect(screen.getByTestId('journal-count')).toHaveTextContent('0 cards')
    empty.unmount()
    store().sendTurn({ open: 'Ada opens 1' }, 10)
    store().acknowledgeHandoff()
    store().dispatch({ type: 'pass', by: 'p2', at: 15, target: 'open' })
    store().sendTurn({ close: 'Ben closes 1', open: 'Ben opens 3' }, 20)
    store().finishReveal()
    store().dispatch({ type: 'askFollowUp', by: 'p2', at: 21, seq: 1, text: 'Why?' })
    renderAt('/same-device/journal')
    expect(screen.getByTestId('journal-count')).toHaveTextContent('3 cards')
    const entries = screen.getAllByTestId('journal-entry')
    expect(entries.map((e) => e.dataset['seq'])).toEqual(['3', '2', '1'])
    expect(entries[0]).toHaveTextContent('Waiting on Ada')
    expect(within(entries[0]!).queryByTestId('answer-p2')).not.toBeInTheDocument()
    expect(entries[1]).toHaveTextContent('Passed by Ben')
    expect(within(entries[2]!).getByTestId('answer-p1')).toHaveTextContent('Ada opens 1')
    expect(within(entries[2]!).getByTestId('answer-p2')).toHaveTextContent('Ben closes 1')
    expect(entries[2]).toHaveTextContent('Ben asked: Why?')
    expect(entries[2]).toHaveTextContent('Not answered.')
    expect(entries[2]).toHaveTextContent('The Deep')
  })

  it('goes home when there is no game', async () => {
    resetStore()
    const { router } = renderAt('/same-device/journal')
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })
})

describe('Settings', () => {
  beforeEach(() => {
    resetStore()
    startSmallGame()
    agreeBoth()
  })

  it('saves a non deck setting in place', async () => {
    const user = userEvent.setup()
    renderAt('/same-device/settings')
    expect(screen.getByTestId('settings-pack-core')).toBeChecked()
    expect(screen.getByTestId('settings-pack-partner')).not.toBeChecked()
    expect(screen.getAllByText(/32 \/ 32 \/ 32 questions by level, 12 Currents/)).toHaveLength(2)
    await user.click(screen.getByTestId('settings-closer-sees-opener'))
    expect(screen.getByTestId('settings-save')).toHaveTextContent('Save')
    await user.click(screen.getByTestId('settings-save'))
    expect(store().room?.settings.closerSeesOpener).toBe(true)
    expect(screen.getByText('Saved.')).toBeInTheDocument()
  })

  it('rebuilds the deck and shows the rules again when deck settings change', async () => {
    const user = userEvent.setup()
    const { router } = renderAt('/same-device/settings')
    await user.click(screen.getByTestId('settings-pack-partner'))
    await user.click(screen.getByTestId('settings-start-level-2'))
    await user.click(screen.getByTestId('settings-progression-mixed'))
    expect(screen.getByTestId('settings-save')).toHaveTextContent('Save and rebuild the deck')
    await user.click(screen.getByTestId('settings-save'))
    await waitFor(() => expect(router.state.location.pathname).toBe('/same-device/rules'))
    const room = store().room!
    expect(room.settings.packs).toEqual(['core', 'partner'])
    expect(room.settings.startLevel).toBe(2)
    expect(room.settings.progression).toBe('mixed')
    expect(room.deck.cards.length).toBeGreaterThan(100)
    expect(room.players.p1?.rulesAgreedAt).toBeNull()
  })

  it('renames a player and changes their color', async () => {
    const user = userEvent.setup()
    renderAt('/same-device/settings')
    const name = screen.getByTestId('settings-name-p2')
    await user.clear(name)
    await user.type(name, 'Benjamin')
    await user.tab()
    expect(store().room?.players.p2?.name).toBe('Benjamin')
    const group = screen.getByRole('radiogroup', { name: 'Color of Benjamin' })
    await user.click(within(group).getByRole('radio', { name: 'Moss' }))
    expect(store().room?.players.p2?.color).toBe('#7bb662')
  })

  it('pauses and resumes', async () => {
    const user = userEvent.setup()
    renderAt('/same-device/settings')
    await user.click(screen.getByTestId('settings-pause'))
    expect(store().room?.paused?.by).toBe('p1')
    await user.click(screen.getByTestId('settings-resume'))
    expect(store().room?.paused).toBeNull()
  })

  it('ends the game only after a confirmation', async () => {
    const user = userEvent.setup()
    const { router } = renderAt('/same-device/settings')
    await user.click(screen.getByTestId('settings-end'))
    expect(store().room).not.toBeNull()
    await user.click(screen.getByTestId('settings-end-confirm'))
    expect(store().room).toBeNull()
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })
})
