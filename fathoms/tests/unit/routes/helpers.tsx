import { render } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { routes } from '../../../src/routes/routes'
import { PLAYER_IDS, useSameDevice } from '../../../src/store/sameDevice'
import type { RoomSettings } from '../../../src/game/types'

export const PLAYERS = [
  { name: 'Ada', color: '#4fb3d9' },
  { name: 'Ben', color: '#e0a030' },
] as const

export function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const utils = render(<RouterProvider router={router} />)
  return { ...utils, router }
}

export function resetStore() {
  useSameDevice.setState({ room: null, handoff: false, reveal: null, drafts: {} })
  localStorage.clear()
}

/** A small deck: core pack, The Deep only, no Currents. 32 cards. */
export function startSmallGame(settings: Partial<RoomSettings> = {}) {
  useSameDevice.getState().newGame({
    players: PLAYERS,
    settings: { packs: ['core'], startLevel: 3, currentEvery: 0, ...settings },
    seed: 'test-seed',
    now: 1000,
  })
}

export function agreeBoth() {
  for (const uid of PLAYER_IDS)
    useSameDevice.getState().dispatch({ type: 'agreeRules', by: uid, at: 1001 })
}

/** Shrinks the current deck to its first `count` cards. */
export function shrinkDeck(count: number) {
  const room = useSameDevice.getState().room
  if (!room) throw new Error('no room')
  useSameDevice.setState({
    room: { ...room, deck: { ...room.deck, cards: room.deck.cards.slice(0, count) } },
  })
}

export function store() {
  return useSameDevice.getState()
}
