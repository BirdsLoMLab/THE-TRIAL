import type { RouteObject } from 'react-router'
import { Home } from './Home'
import { Journal } from './Journal'
import { Rules } from './Rules'
import { SameDeviceNew } from './SameDeviceNew'
import { Settings } from './Settings'
import { Turn } from './Turn'

/** One entry per screen (PLAN section 6). Same Device screens live under /same-device. */
export const routes: RouteObject[] = [
  { path: '/', Component: Home },
  { path: '/same-device/new', Component: SameDeviceNew },
  { path: '/same-device/rules', Component: Rules },
  { path: '/same-device/turn', Component: Turn },
  { path: '/same-device/journal', Component: Journal },
  { path: '/same-device/settings', Component: Settings },
]
