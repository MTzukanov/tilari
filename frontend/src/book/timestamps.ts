/** Normalize SQLite / ISO timestamps to ISO-8601 UTC, or null if unusable. */
export function normalizeTimestamp(raw: string | number | null | undefined): string | null {
  if (raw == null) return null
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw <= 0) return null
    const d = new Date(raw)
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
  }
  const s = String(raw).trim()
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2} /.test(s)) {
    const d = new Date(`${s.replace(' ', 'T')}Z`)
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
  }
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export function isoFromFileLastModified(ms: number): string | null {
  return normalizeTimestamp(ms)
}
