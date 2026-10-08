import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { turnView } from '../../../src/game/turns'
import { cardLookup, draftKey, useSameDevice } from '../../../src/store/sameDevice'
import { agreeBoth, renderAt, resetStore, shrinkDeck, startSmallGame, store } from './helpers'

function view() {
  return turnView(store().room!, cardLookup())
}

describe('Turn screen', () => {
  beforeEach(() => {
    resetStore()
    startSmallGame()
    agreeBoth()
  })

  it('shows only the open step on the first turn and hands the phone over after Send', async () => {
    const user = userEvent.setup()
    renderAt('/same-device/turn')
    expect(screen.getByTestId('turn-holder')).toHaveTextContent('Ada')
    expect(screen.getByTestId('turn-holder')).toHaveTextContent('Turn 1')
    expect(screen.queryByTestId('catch-up')).not.toBeInTheDocument()
    expect(screen.queryByTestId('close-card')).not.toBeInTheDocument()
    expect(screen.getByTestId('open-card-text')).toHaveTextContent(view().open!.card.text)
    const send = screen.getByTestId('send')
    expect(send).toBeDisabled()
    await user.type(screen.getByTestId('open-answer'), 'My first answer')
    expect(store().drafts[draftKey.open(1)]).toBe('My first answer')
    expect(send).toBeEnabled()
    await user.click(send)
    expect(screen.getByTestId('screen-handoff')).toBeInTheDocument()
    expect(screen.getByTestId('handoff-name')).toHaveTextContent('Ben')
    expect(store().room?.cards[0]?.answers.p1?.text).toBe('My first answer')
    await user.click(screen.getByTestId('handoff-ack'))
    expect(screen.getByTestId('turn-holder')).toHaveTextContent('Ben')
  })

  it('closes blind on the second turn, reveals after Send, then catches up on the third', async () => {
    const user = userEvent.setup()
    store().sendTurn({ open: 'Ada opens 1' }, 10)
    store().acknowledgeHandoff()
    renderAt('/same-device/turn')
    expect(screen.queryByTestId('catch-up')).not.toBeInTheDocument()
    const close = screen.getByTestId('close-card')
    expect(close).toHaveTextContent('Ada opened this')
    expect(within(close).queryByTestId('answer-p1')).not.toBeInTheDocument()
    expect(screen.getByTestId('close-answer')).toHaveAttribute(
      'placeholder',
      'Your answer, written blind',
    )
    await user.type(screen.getByTestId('close-answer'), 'Ben closes 1')
    expect(screen.getByTestId('send')).toBeDisabled()
    await user.type(screen.getByTestId('open-answer'), 'Ben opens 2')
    await user.click(screen.getByTestId('send'))

    const reveal = screen.getByTestId('screen-reveal')
    expect(within(reveal).getByTestId('answer-p1')).toHaveTextContent('Ada opens 1')
    expect(within(reveal).getByTestId('answer-p2')).toHaveTextContent('Ben closes 1')
    await user.type(screen.getByTestId('follow-up-1'), 'Why that one?')
    await user.click(screen.getByTestId('follow-up-ask-1'))
    expect(store().room?.cards[0]?.followUps.p2?.text).toBe('Why that one?')
    expect(screen.getByText('You asked')).toBeInTheDocument()
    await user.click(screen.getByTestId('reveal-done'))
    await user.click(screen.getByTestId('handoff-ack'))

    expect(screen.getByTestId('turn-holder')).toHaveTextContent('Ada')
    const catchUp = screen.getByTestId('catch-up')
    expect(within(catchUp).getByTestId('answer-p1')).toHaveTextContent('Ada opens 1')
    expect(within(catchUp).getByTestId('answer-p2')).toHaveTextContent('Ben closes 1')
    const pending = screen.getByTestId('pending-1')
    expect(pending).toHaveTextContent('Why that one?')
    await user.type(screen.getByTestId('reply-1'), 'Because.')
    await user.type(screen.getByTestId('follow-up-1'), 'And you?')
    await user.click(screen.getByTestId('follow-up-ask-1'))
    await user.type(screen.getByTestId('close-answer'), 'Ada closes 2')
    await user.type(screen.getByTestId('open-answer'), 'Ada opens 3')
    await user.click(screen.getByTestId('send'))
    const card1 = store().room?.cards[0]
    expect(card1?.followUps.p2?.reply?.text).toBe('Because.')
    expect(card1?.followUps.p1?.text).toBe('And you?')
    expect(store().room?.turn).toBe(3)
  })

  it('shows the opener answer to the closer when closerSeesOpener is on', () => {
    store().dispatch({ type: 'updateSettings', by: 'p1', at: 2, patch: { closerSeesOpener: true } })
    store().sendTurn({ open: 'Visible answer' }, 10)
    store().acknowledgeHandoff()
    renderAt('/same-device/turn')
    expect(within(screen.getByTestId('close-card')).getByTestId('answer-p1')).toHaveTextContent(
      'Visible answer',
    )
  })

  it('passes, goes lighter, and pauses from the overflow menu', async () => {
    const user = userEvent.setup()
    renderAt('/same-device/turn')
    const firstCard = view().open!.card.id
    await user.click(screen.getByTestId('turn-menu'))
    expect(screen.getByRole('menu')).toHaveTextContent('3 passes left')
    expect(screen.queryByTestId('menu-pass-close')).not.toBeInTheDocument()
    await user.click(screen.getByTestId('menu-pass-open'))
    expect(store().room?.passes.p1).toBe(2)
    expect(store().room?.cards[0]?.status).toBe('passed')
    expect(view().open!.card.id).not.toBe(firstCard)
    await user.click(screen.getByTestId('turn-menu'))
    await user.click(screen.getByTestId('menu-lighter'))
    expect(store().room?.lighter).toEqual({ until: 6 })
    expect(screen.getByTestId('turn-holder')).toHaveTextContent('going lighter')
    await user.click(screen.getByTestId('turn-menu'))
    await user.click(screen.getByTestId('menu-pause'))
    await user.type(screen.getByTestId('pause-note'), 'Back tomorrow')
    await user.click(screen.getByTestId('menu-pause-confirm'))
    expect(screen.getByTestId('screen-paused')).toHaveTextContent('Paused by Ada')
    expect(screen.getByTestId('screen-paused')).toHaveTextContent('Back tomorrow')
    await user.click(screen.getByTestId('resume'))
    expect(screen.getByTestId('screen-turn')).toBeInTheDocument()
  })

  it('reports a rule the reducer refuses instead of crashing', async () => {
    const user = userEvent.setup()
    store().dispatch({ type: 'updateSettings', by: 'p1', at: 2, patch: { passesPerDeck: 0 } })
    store().rebuildDeck('p1', 3, 'again')
    agreeBoth()
    renderAt('/same-device/turn')
    await user.click(screen.getByTestId('turn-menu'))
    await user.click(screen.getByTestId('menu-pass-open'))
    expect(screen.getByRole('alert')).toHaveTextContent('no passes left')
  })

  it('finishes the deck, shows a closer, and deals a new deck after the rules', async () => {
    const user = userEvent.setup()
    shrinkDeck(2)
    store().sendTurn({ open: 'a1' }, 10)
    store().acknowledgeHandoff()
    store().sendTurn({ close: 'b1', open: 'b2' }, 20)
    store().finishReveal()
    store().acknowledgeHandoff()
    const { router } = renderAt('/same-device/turn')
    expect(screen.getByTestId('close-card')).toBeInTheDocument()
    expect(screen.queryByTestId('open-card')).not.toBeInTheDocument()
    await user.type(screen.getByTestId('close-answer'), 'a2')
    await user.click(screen.getByTestId('send'))
    await user.click(screen.getByTestId('reveal-done'))
    await user.click(screen.getByTestId('handoff-ack'))
    expect(screen.getByTestId('screen-exhausted')).toBeInTheDocument()
    expect(screen.getByTestId('closer-text').textContent?.length).toBeGreaterThan(10)
    expect(screen.getByTestId('catch-up')).toHaveTextContent('b2')
    expect(screen.getByTestId('new-deck')).toHaveTextContent('New deck (30 cards)')
    await user.click(screen.getByTestId('new-deck'))
    await waitFor(() => expect(router.state.location.pathname).toBe('/same-device/rules'))
    expect(store().room?.deck.cards.length).toBe(30)
    expect(store().room?.cards).toHaveLength(2)
  })

  it('disables New deck when a rebuild would deal nothing', () => {
    const room = store().room!
    useSameDevice.setState({
      room: {
        ...room,
        settings: { ...room.settings, packs: ['empty-pack'] },
        deck: { ...room.deck, cards: [] },
      },
    })
    renderAt('/same-device/turn')
    expect(screen.getByTestId('screen-exhausted')).toBeInTheDocument()
    expect(screen.getByTestId('new-deck')).toBeDisabled()
    expect(screen.getByTestId('next-deck-note')).toHaveTextContent(
      'Every card in the enabled packs has been answered',
    )
  })

  it('goes home when there is no game', async () => {
    resetStore()
    const { router } = renderAt('/same-device/turn')
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })
})
