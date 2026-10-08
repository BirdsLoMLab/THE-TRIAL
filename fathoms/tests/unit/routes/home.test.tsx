import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useSameDevice } from '../../../src/store/sameDevice'
import { agreeBoth, renderAt, resetStore, shrinkDeck, startSmallGame, store } from './helpers'

describe('Home', () => {
  beforeEach(resetStore)

  it('offers to play on this phone when there is no game', () => {
    renderAt('/')
    expect(screen.getByTestId('app-name')).toHaveTextContent('Fathoms')
    expect(screen.getByTestId('home-new').getAttribute('href')).toContain('/same-device/new')
    expect(screen.queryByTestId('home-continue')).not.toBeInTheDocument()
  })

  it('shows whose turn it is and a Continue button when a game exists', () => {
    startSmallGame()
    renderAt('/')
    expect(screen.getByTestId('home-status')).toHaveTextContent(
      'Ada still has to agree to the rules',
    )
    expect(screen.getByTestId('home-continue')).toBeInTheDocument()
    expect(screen.getByTestId('home-journal')).toBeInTheDocument()
    expect(screen.getByTestId('home-settings')).toBeInTheDocument()
  })

  it('describes the turn, a pause, and a finished deck', () => {
    startSmallGame()
    agreeBoth()
    const first = renderAt('/')
    expect(screen.getByTestId('home-status')).toHaveTextContent("Ada's turn, 0 cards dealt")
    first.unmount()
    store().dispatch({ type: 'pause', by: 'p2', at: 2 })
    const second = renderAt('/')
    expect(screen.getByTestId('home-status')).toHaveTextContent('Paused by Ben')
    second.unmount()
    store().dispatch({ type: 'resume', by: 'p2', at: 3 })
    shrinkDeck(0)
    renderAt('/')
    expect(screen.getByTestId('home-status')).toHaveTextContent('The deck is finished')
    expect(useSameDevice.getState().room?.deck.cards).toEqual([])
  })
})
