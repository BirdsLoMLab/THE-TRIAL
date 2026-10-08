import type { RouteObject } from 'react-router'
import { OnlineLayout, RoomIndex } from '../game-ui/OnlineLayout'
import { SameDeviceLayout } from '../game-ui/SameDeviceLayout'
import { CreateRoom } from './CreateRoom'
import { Home } from './Home'
import { JoinRoom } from './JoinRoom'
import { Journal } from './Journal'
import { Rules } from './Rules'
import { SameDeviceNew } from './SameDeviceNew'
import { Settings } from './Settings'
import { Turn } from './Turn'

const gameScreens: RouteObject[] = [
  { path: 'rules', Component: Rules },
  { path: 'turn', Component: Turn },
  { path: 'journal', Component: Journal },
  { path: 'settings', Component: Settings },
]

/** One entry per screen (PLAN section 6). The same game screens serve one phone and online rooms. */
export const routes: RouteObject[] = [
  { path: '/', Component: Home },
  { path: '/same-device/new', Component: SameDeviceNew },
  { path: '/same-device', Component: SameDeviceLayout, children: gameScreens },
  { path: '/room/new', Component: CreateRoom },
  { path: '/join/:roomId', Component: JoinRoom },
  {
    path: '/room/:roomId',
    Component: OnlineLayout,
    children: [{ index: true, Component: RoomIndex }, ...gameScreens],
  },
]
