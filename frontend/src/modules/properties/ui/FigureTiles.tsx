import { useState, type ReactNode } from 'react'
import type { PillTone } from '../../../shared/Pill'

/** A card's figures at a glance: a tile each, as many in a row as fit (two on a phone). */
export function Figures({ children }: { children: ReactNode }) {
  return <div className="property-figures">{children}</div>
}

/**
 * One figure on a card (a loan, a lease, a water settlement): what it is, the figure, and a line or
 * two under it. Without a `value` the lines are the tile's content, such as a document's pills.
 */
export function Figure({ label, value, sub = [], neg = false }: { label: ReactNode; value?: string; sub?: ReactNode[]; neg?: boolean }) {
  return (
    <div className="property-figure">
      <span className="property-figure-label">{label}</span>
      {value !== undefined ? <strong className={neg ? 'neg' : undefined}>{value || '–'}</strong> : null}
      {sub.map((line, i) => (
        <span key={i} className="property-figure-sub">
          {line}
        </span>
      ))}
    </div>
  )
}

/** A list folded under a card's figures: its name, how many rows, a dot in the tone of what is wrong there. */
export type Fold = { key: string; title: string; n: number; mark?: { tone: PillTone; title: string }; body: () => ReactNode }

/**
 * A card's lists as small tabs, like the page's own: one opens under them, a click on it closes it.
 * A list with no rows has no tab.
 */
export function Folds({ folds }: { folds: Fold[] }) {
  const [open, setOpen] = useState<string | null>(null)
  const shown = folds.filter((f) => f.n > 0)
  const opened = shown.find((f) => f.key === open)
  if (!shown.length) return null
  return (
    <>
      <div className="property-folds">
        {shown.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`property-fold${open === f.key ? ' is-open' : ''}`}
            aria-expanded={open === f.key}
            onClick={() => setOpen(open === f.key ? null : f.key)}
          >
            {f.title} <span className="tabs-count">{f.n}</span>
            {f.mark ? <span className={`tabs-mark tabs-mark-${f.mark.tone}`} title={f.mark.title} aria-label={f.mark.title} /> : null}
          </button>
        ))}
      </div>
      {opened ? opened.body() : null}
    </>
  )
}

/**
 * A small "i" for a fact the card does not spell out: the note on hover, and on a click or a tap
 * under the element it explains, where the caller puts `InfoNote` while `open`.
 */
export function InfoButton({ note, open, onToggle }: { note: string; open: boolean; onToggle: () => void }) {
  return (
    <button type="button" className="property-info" aria-label={note} aria-expanded={open} title={open ? undefined : note} onClick={onToggle}>
      i
    </button>
  )
}

/** The note an `InfoButton` opened. */
export function InfoNote({ note }: { note: string }) {
  return <p className="muted property-lease-hint property-info-note">{note}</p>
}
