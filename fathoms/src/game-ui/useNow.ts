import { useEffect, useState } from 'react'
import { clock } from '../store/clock'

/** The current time, refreshed every `intervalMs`, for relative timestamps that stay honest on screen. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => clock.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(clock.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}

/** "just now", "5 minutes ago", "3 hours ago", "2 days ago". */
export function timeAgo(then: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - then) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
  const days = Math.round(hours / 24)
  return `${days} days ago`
}
