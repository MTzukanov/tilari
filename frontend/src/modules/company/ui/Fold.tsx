import { useState, type ReactNode } from 'react'

export type FoldId = 'deadlines' | 'documents' | 'dividends'

const FOLDS_KEY = 'tilari.company.folds'

/** Määräajat open, the rest folded (owner, 2026-11-03). */
const OPEN_BY_DEFAULT: Record<FoldId, boolean> = { deadlines: true, documents: false, dividends: false }

function readOpen(id: FoldId): boolean {
  try {
    const stored: unknown = JSON.parse(sessionStorage.getItem(FOLDS_KEY) ?? '{}')
    const value = stored && typeof stored === 'object' ? (stored as Record<string, unknown>)[id] : undefined
    return typeof value === 'boolean' ? value : OPEN_BY_DEFAULT[id]
  } catch {
    return OPEN_BY_DEFAULT[id]
  }
}

function writeOpen(id: FoldId, open: boolean): void {
  try {
    const stored: unknown = JSON.parse(sessionStorage.getItem(FOLDS_KEY) ?? '{}')
    const all = stored && typeof stored === 'object' ? (stored as Record<string, unknown>) : {}
    sessionStorage.setItem(FOLDS_KEY, JSON.stringify({ ...all, [id]: open }))
  } catch {
    // Not remembered; the section still folds.
  }
}

/**
 * A section of a period's card that folds. Open or folded is the same for every period and kept for the
 * session, so opening a voucher and coming back finds the card as it was left.
 */
export function Fold({ id, label, children }: { id: FoldId; label: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(() => readOpen(id))
  const toggle = (next: boolean) => {
    // The browser also reports the open state it was rendered with.
    if (next === open) return
    setOpen(next)
    writeOpen(id, next)
  }
  return (
    <details className="company-fold" open={open} onToggle={(e) => toggle(e.currentTarget.open)}>
      <summary className="section-label">{label}</summary>
      {children}
    </details>
  )
}
