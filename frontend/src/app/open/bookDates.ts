/** Format an ISO / SQLite timestamp for book pickers and Muutokset. */
export function formatBookDate(iso: string | null | undefined, locale: string): string | null {
  if (!iso) return null
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return null
    return d.toLocaleString(locale)
  } catch {
    return null
  }
}

/** Compact date for `<option>` labels (date only). */
export function formatBookDateShort(iso: string | null | undefined, locale: string): string | null {
  if (!iso) return null
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return null
    return d.toLocaleDateString(locale)
  } catch {
    return null
  }
}
