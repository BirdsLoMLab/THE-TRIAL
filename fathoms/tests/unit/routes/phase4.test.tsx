import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useLock } from '../../../src/lock/lock'
import { useSameDevice } from '../../../src/store/sameDevice'
import { agreeBoth, renderAt, resetStore, startSmallGame, store } from './helpers'

function playTwo() {
  store().sendTurn({ open: 'Rain on asphalt' }, 10)
  store().acknowledgeHandoff()
  store().sendTurn({ close: 'Fresh bread', open: 'The truth' }, 20)
  store().finishReveal()
  store().acknowledgeHandoff()
}

describe('Journal (Phase 4)', () => {
  beforeEach(() => {
    resetStore()
    useLock.setState({ enabled: false, locked: false })
    startSmallGame()
    agreeBoth()
    playTwo()
  })

  it('reacts, stars, filters favorites, searches, and exports Markdown', async () => {
    const user = userEvent.setup()
    renderAt('/same-device/journal')
    expect(screen.getAllByTestId('journal-entry')).toHaveLength(2)
    expect(screen.getAllByTestId('journal-day')).toHaveLength(1)

    await user.click(screen.getByTestId('react-1-❤️'))
    expect(store().room?.cards[0]?.reactions['❤️']).toEqual(['p1'])
    expect(screen.getByTestId('react-1-❤️')).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByTestId('favorite-1'))
    expect(store().room?.cards[0]?.favorite).toBe(true)

    await user.click(screen.getByTestId('journal-filter-favorites'))
    expect(screen.getAllByTestId('journal-entry')).toHaveLength(1)
    expect(screen.getByTestId('journal-count')).toHaveTextContent('1 card of 2')
    await user.click(screen.getByTestId('journal-filter-all'))

    await user.type(screen.getByTestId('journal-search'), 'bread')
    expect(screen.getAllByTestId('journal-entry')).toHaveLength(1)
    expect(within(screen.getByTestId('journal-entry')).getByTestId('answer-p2')).toHaveTextContent(
      'Fresh bread',
    )
    await user.clear(screen.getByTestId('journal-search'))
    await user.type(screen.getByTestId('journal-search'), 'nothing matches this')
    expect(screen.getByText('Nothing matches.')).toBeInTheDocument()
    await user.clear(screen.getByTestId('journal-search'))

    const created = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:journal')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const clicked = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined)
    await user.click(screen.getByTestId('journal-export'))
    await waitFor(() =>
      expect(screen.getByText('Saved as fathoms-journal.md.')).toBeInTheDocument(),
    )
    expect(created).toHaveBeenCalledTimes(1)
    expect(clicked).toHaveBeenCalledTimes(1)
    const blob = created.mock.calls[0]?.[0] as Blob
    expect(await blob.text()).toContain('**Ada:** Rain on asphalt')
    vi.restoreAllMocks()
  })

  it('shows a hidden After Dark card as a tombstone', () => {
    const room = store().room!
    const card = room.cards[0]!
    useSameDevice.setState({
      room: {
        ...room,
        cards: [
          {
            ...card,
            adult: true,
            status: 'hidden',
            cardText: '',
            answers: {},
            followUps: {},
            reactions: {},
          },
          ...room.cards.slice(1),
        ],
      },
    })
    renderAt('/same-device/journal')
    const hidden = screen
      .getAllByTestId('journal-entry')
      .find((e) => e.dataset['hidden'] === 'true')
    expect(hidden).toHaveTextContent('hidden after you both read it')
    expect(within(hidden!).queryByTestId('reactions-1')).not.toBeInTheDocument()
  })
})

describe('Settings (Phase 4)', () => {
  beforeEach(() => {
    resetStore()
    useLock.setState({
      enabled: false,
      pinHash: null,
      salt: '',
      biometrics: false,
      locked: false,
      attempts: 0,
      hiddenAt: null,
    })
    startSmallGame()
    agreeBoth()
  })

  it('turns After Dark on for the holder only after the adult confirmation, and adds the pack', async () => {
    const user = userEvent.setup()
    renderAt('/same-device/settings')
    expect(screen.getByTestId('settings-afterdark-on')).toBeDisabled()
    await user.click(screen.getByTestId('settings-afterdark-confirm'))
    await user.click(screen.getByTestId('settings-afterdark-on'))
    expect(store().room?.players.p1).toMatchObject({ afterDarkEnabled: true })
    expect(store().room?.players.p2?.afterDarkEnabled).toBe(false)
    expect(store().room?.settings.packs).toContain('afterdark')
    expect(screen.getByTestId('settings-afterdark-off')).toBeInTheDocument()
    await user.click(screen.getByTestId('settings-afterdark-retention'))
    expect(store().room?.settings.afterDarkRetention).toBe('hide-after-read')
    await user.click(screen.getByTestId('settings-afterdark-off'))
    expect(store().room?.players.p1?.afterDarkEnabled).toBe(false)
  })

  it('excludes a topic for the room and prunes the deck', async () => {
    const user = userEvent.setup()
    const before = store().room!.deck.cards.length
    renderAt('/same-device/settings')
    await user.click(screen.getByTestId('settings-tag-fear'))
    expect(store().room?.players.p1?.excludeTags).toEqual(['fear'])
    expect(store().room!.deck.cards.length).toBeLessThan(before)
    expect(screen.getByTestId('settings-tag-fear')).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByTestId('settings-tag-fear'))
    expect(store().room?.players.p1?.excludeTags).toEqual([])
  })

  it('turns the app lock on with a matching PIN and the lock screen then blocks the journal', async () => {
    const user = userEvent.setup()
    const first = renderAt('/same-device/settings')
    await user.type(screen.getByTestId('settings-lock-pin'), '2468')
    await user.type(screen.getByTestId('settings-lock-pin-again'), '2460')
    await user.click(screen.getByTestId('settings-lock-on'))
    expect(screen.getByRole('alert')).toHaveTextContent('The two PINs differ.')
    await user.clear(screen.getByTestId('settings-lock-pin-again'))
    await user.type(screen.getByTestId('settings-lock-pin-again'), '2468')
    await user.click(screen.getByTestId('settings-lock-on'))
    await waitFor(() => expect(useLock.getState().enabled).toBe(true))
    first.unmount()
    useLock.getState().lock()
    renderAt('/same-device/journal')
    expect(screen.getByTestId('screen-lock')).toBeInTheDocument()
    await user.type(screen.getByTestId('lock-pin'), '0000')
    await user.click(screen.getByTestId('lock-unlock'))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('not right'))
    await user.type(screen.getByTestId('lock-pin'), '2468')
    await user.click(screen.getByTestId('lock-unlock'))
    await waitFor(() => expect(screen.getByTestId('screen-journal')).toBeInTheDocument())
  })

  it('links to the custom card editor and deals custom cards once enabled', async () => {
    const user = userEvent.setup()
    const { router } = renderAt('/same-device/settings')
    await user.click(screen.getByTestId('settings-custom-cards-link'))
    await waitFor(() => expect(router.state.location.pathname).toBe('/same-device/cards'))
    expect(screen.getByTestId('custom-add')).toBeDisabled()
    await user.type(
      screen.getByTestId('custom-text'),
      'What is the best thing in your fridge right now?',
    )
    await user.click(screen.getByTestId('custom-level-3'))
    await user.click(screen.getByTestId('custom-add'))
    await waitFor(() => expect(screen.getAllByTestId('custom-card')).toHaveLength(1))
    expect(store().customCards[0]).toMatchObject({ level: 3, type: 'question', adult: false })
    await user.type(screen.getByTestId('custom-text'), 'Say "hi"')
    expect(screen.getByRole('alert')).toHaveTextContent('double quotes')
    const id = store().customCards[0]!.id
    store().dispatch({
      type: 'updateSettings',
      by: 'p1',
      at: 5,
      patch: { customCardsEnabled: true },
    })
    store().rebuildDeck('p1', 6, 'with-custom')
    expect(store().room?.deck.cards).toContain(id)
    await user.click(screen.getByTestId(`custom-remove-${id}`))
    await waitFor(() => expect(store().customCards).toHaveLength(0))
  })
})
