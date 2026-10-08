import { createElement } from 'react'
import type { RouteObject } from 'react-router'
import { OnlineLayout, RoomIndex } from '../game-ui/OnlineLayout'
import { RootLayout } from '../game-ui/RootLayout'
import { SameDeviceLayout } from '../game-ui/SameDeviceLayout'
import { LockGate } from '../lock/LockGate'
import { CreateRoom } from './CreateRoom'
import { CustomCards } from './CustomCards'
import { Home } from './Home'
import { JoinRoom } from './JoinRoom'
import { Journal } from './Journal'
import { Rules } from './Rules'
import { SameDeviceNew } from './SameDeviceNew'
import { SamsungGuide } from './SamsungGuide'
import { Settings } from './Settings'
import { Turn } from './Turn'

// The app lock (PLAN 4.9) blocks the Turn and Journal screens cold.
const gameScreens: RouteObject[] = [
  { path: 'rules', Component: Rules },
  { path: 'turn', element: createElement(LockGate, null, createElement(Turn)) },
  { path: 'journal', element: createElement(LockGate, null, createElement(Journal)) },
  { path: 'settings', Component: Settings },
  { path: 'cards', Component: CustomCards },
]

/** One entry per screen (PLAN section 6). The same game screens serve one phone and online rooms. */
export const routes: RouteObject[] = [
  {
    Component: RootLayout,
    children: [
      { path: '/', Component: Home },
      { path: '/guide/samsung-battery', Component: SamsungGuide },
      { path: '/same-device/new', Component: SameDeviceNew },
      { path: '/same-device', Component: SameDeviceLayout, children: gameScreens },
      { path: '/room/new', Component: CreateRoom },
      { path: '/join/:roomId', Component: JoinRoom },
      {
        path: '/room/:roomId',
        Component: OnlineLayout,
        children: [{ index: true, Component: RoomIndex }, ...gameScreens],
      },
    ],
  },
]
