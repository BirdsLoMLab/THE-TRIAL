import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { renderAt, resetStore, startSmallGame, store } from './helpers'

describe('Play on this phone (setup)', () => {
  beforeEach(resetStore)

  it('needs two names and two different colors, then shows the rules', async () => {
    const user = userEvent.setup()
    const { router } = renderAt('/same-device/new')
    const start = screen.getByTestId('setup-start')
    expect(start).toBeDisabled()
    await user.type(screen.getByTestId('setup-name-1'), 'Ada')
    await user.type(screen.getByTestId('setup-name-2'), 'Ben')
    expect(start).toBeEnabled()
    await user.click(screen.getAllByRole('radio', { name: 'Sea' })[1]!)
    await user.click(start)
    expect(screen.getByRole('alert')).toHaveTextContent('Pick two different colors.')
    expect(store().room).toBeNull()
    await user.click(screen.getAllByRole('radio', { name: 'Coral' })[1]!)
    await user.click(start)
    await waitFor(() => expect(router.state.location.pathname).toBe('/same-device/rules'))
    expect(store().room?.players.p1?.name).toBe('Ada')
    expect(store().room?.players.p2?.color).toBe('#e8735a')
  })

  it('asks before replacing a game that already exists', async () => {
    const user = userEvent.setup()
    startSmallGame()
    const before = store().room
    renderAt('/same-device/new')
    await user.type(screen.getByTestId('setup-name-1'), 'Cy')
    await user.type(screen.getByTestId('setup-name-2'), 'Di')
    expect(screen.getByTestId('setup-start')).toBeDisabled()
    await user.click(screen.getByTestId('setup-confirm-replace'))
    await user.click(screen.getByTestId('setup-start'))
    expect(store().room).not.toBe(before)
    expect(store().room?.players.p1?.name).toBe('Cy')
  })
})

describe('Rules', () => {
  beforeEach(resetStore)

  it('shows both rules and takes one agreement per player before the first turn', async () => {
    const user = userEvent.setup()
    startSmallGame()
    const { router } = renderAt('/same-device/rules')
    const rules = store().room!.rules
    expect(screen.getByText(rules[0])).toBeInTheDocument()
    expect(screen.getByText(rules[1])).toBeInTheDocument()
    expect(screen.getByTestId('rules-agree')).toHaveTextContent('Ada, I agree')
    expect(screen.getByTestId('rules-status-p1')).toHaveTextContent('Not yet')
    await user.click(screen.getByTestId('rules-agree'))
    expect(screen.getByTestId('rules-status-p1')).toHaveTextContent('Agreed')
    expect(screen.getByTestId('rules-agree')).toHaveTextContent('Ben, I agree')
    await user.click(screen.getByTestId('rules-agree'))
    await waitFor(() => expect(router.state.location.pathname).toBe('/same-device/turn'))
    expect(screen.getByTestId('screen-turn')).toBeInTheDocument()
  })

  it('goes home without a game and to the turn when everyone already agreed', async () => {
    const first = renderAt('/same-device/rules')
    await waitFor(() => expect(first.router.state.location.pathname).toBe('/'))
    first.unmount()
    startSmallGame()
    store().dispatch({ type: 'agreeRules', by: 'p1', at: 1 })
    store().dispatch({ type: 'agreeRules', by: 'p2', at: 2 })
    const second = renderAt('/same-device/rules')
    await waitFor(() => expect(second.router.state.location.pathname).toBe('/same-device/turn'))
  })
})
