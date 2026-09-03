/**
 * Practice-mode clock. Kitsas stores only `Asetus.Harjoitus` in the file;
 * the simulated date is session state (`harjoitusPvm`).
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const STORAGE_PREFIX = 'tilari.practiceDate:'

/** Kitsas `AsetusModel::onko` — false when missing, empty, `"0"`, or `"EI"`. */
export function isPracticeValue(raw: string | null | undefined): boolean {
  const v = (raw ?? '').trim()
  if (!v || v === '0' || v.toUpperCase() === 'EI') return false
  return true
}

/** Local calendar date as `YYYY-MM-DD` (not UTC `toISOString()`). */
export function wallToday(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
}

export function practiceStorageKey(bookId: string): string {
  return STORAGE_PREFIX + bookId
}

export function loadStoredPracticeDate(bookId: string): string | null {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(practiceStorageKey(bookId))
    return raw && isIsoDate(raw) ? raw : null
  } catch {
    return null
  }
}

export function saveStoredPracticeDate(bookId: string, iso: string): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(practiceStorageKey(bookId), iso)
  } catch {
    /* quota / private mode */
  }
}

export function clearStoredPracticeDate(bookId: string): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.removeItem(practiceStorageKey(bookId))
  } catch {
    /* ignore */
  }
}
