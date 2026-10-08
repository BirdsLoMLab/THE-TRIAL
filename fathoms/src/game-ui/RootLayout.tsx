import { useEffect } from 'react'
import { Outlet, useNavigate } from 'react-router'
import { useLockOnResume } from '../lock/useLockOnResume'
import { onNotificationTap } from '../notifications/push'

/** Wraps every screen: a tapped turn notification opens that room's Turn screen (PLAN 4.5), and the app lock re-arms on resume. */
export function RootLayout() {
  const navigate = useNavigate()
  useLockOnResume()
  useEffect(() => {
    void onNotificationTap((roomId) => navigate(`/room/${roomId}/turn`)).catch(() => undefined)
  }, [navigate])
  return <Outlet />
}
