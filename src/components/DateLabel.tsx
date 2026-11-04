import { formatFullDate, formatShortDate } from '../date'

/** A short date for reading, with the exact time in `dateTime` (machines) and `title` (hover). */
export function DateLabel({ prefix, ms }: { prefix?: string; ms: number }) {
  return (
    <time className="date" dateTime={new Date(ms).toISOString()} title={formatFullDate(ms)}>
      {prefix ? `${prefix} ` : ''}
      {formatShortDate(ms)}
    </time>
  )
}
