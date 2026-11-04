// Intl formatters are costly to build, so create them once. `undefined` locale = the user's own.
const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
const sameYear = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
const otherYear = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })
const full = new Intl.DateTimeFormat(undefined, { dateStyle: 'long', timeStyle: 'short' })

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * Short, scannable date: relative within the last week ("5 minutes ago", "yesterday"),
 * then "Nov 4", then "Nov 4, 2025" once the year differs.
 */
export function formatShortDate(ms: number, now = Date.now()): string {
  const diff = now - ms
  if (diff < MINUTE) return 'just now'
  if (diff < HOUR) return relative.format(-Math.floor(diff / MINUTE), 'minute')
  if (diff < DAY) return relative.format(-Math.floor(diff / HOUR), 'hour')
  if (diff < 7 * DAY) return relative.format(-daysBetween(ms, now), 'day')
  const date = new Date(ms)
  return date.getFullYear() === new Date(now).getFullYear()
    ? sameYear.format(date)
    : otherYear.format(date)
}

/** Full date and time, for tooltips: "November 4, 2026 at 10:06 AM". */
export function formatFullDate(ms: number): string {
  return full.format(ms)
}

/** Calendar days between two instants, so something from 30 hours ago late at night reads "2 days ago" correctly. */
function daysBetween(from: number, to: number): number {
  const start = new Date(from).setHours(0, 0, 0, 0)
  const end = new Date(to).setHours(0, 0, 0, 0)
  return Math.max(1, Math.round((end - start) / DAY))
}
