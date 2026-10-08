/** Calendar-month helpers on ISO dates (`YYYY-MM-DD`). */

/** `YYYY-MM` keys from the month of `starts` through the month of `ends`, inclusive. */
export function monthKeys(starts: string, ends: string): string[] {
  const out: string[] = []
  let y = Number(starts.slice(0, 4))
  let m = Number(starts.slice(5, 7))
  const endY = Number(ends.slice(0, 4))
  const endM = Number(ends.slice(5, 7))
  while (y < endY || (y === endY && m <= endM)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  return out
}

/** Last day of the month of an ISO date or `YYYY-MM` key. */
export function monthEnd(dateOrKey: string): string {
  const y = Number(dateOrKey.slice(0, 4))
  const m = Number(dateOrKey.slice(5, 7))
  const day = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${dateOrKey.slice(0, 7)}-${String(day).padStart(2, '0')}`
}

/** Shift a `YYYY-MM` key by `delta` months. */
export function addMonths(key: string, delta: number): string {
  const y = Number(key.slice(0, 4))
  const m = Number(key.slice(5, 7)) - 1 + delta
  const year = y + Math.floor(m / 12)
  const month = ((m % 12) + 12) % 12
  return `${year}-${String(month + 1).padStart(2, '0')}`
}
