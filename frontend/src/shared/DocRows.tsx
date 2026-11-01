import type { ReactNode } from 'react'
import { FileDropArea } from './FileDropArea'

/**
 * `missing` tints the row, for what is wanted now; `done` quiets its actions until hover, so a list
 * of finished rows is not a wall of buttons; `muted` is for what was marked as not needed.
 */
export type DocRowTone = 'plain' | 'missing' | 'done' | 'muted'

/** A framed list of rows, one for each thing that can hold documents. */
export function DocRows({ children }: { children: ReactNode }) {
  return <div className="doc-rows">{children}</div>
}

/** One such thing: its name and status on the head line, then `children`. Takes dropped files if `onFiles` is given. */
export function DocRow({
  name,
  status,
  actions,
  tone = 'plain',
  onFiles,
  children,
}: {
  name: ReactNode
  status?: ReactNode
  actions?: ReactNode
  tone?: DocRowTone
  onFiles?: (files: File[]) => void
  children?: ReactNode
}) {
  return (
    <FileDropArea className={`doc-row doc-row-${tone}`} disabled={!onFiles} onFiles={onFiles ?? (() => undefined)}>
      <div className="doc-row-head">
        <strong className="doc-row-name">{name}</strong>
        {status}
        {actions ? <span className="doc-row-actions">{actions}</span> : null}
      </div>
      {children}
    </FileDropArea>
  )
}

export function DocLines({ children }: { children: ReactNode }) {
  return <ul className="doc-lines">{children}</ul>
}

/** One document: what and when, the pills that open it, and `end` at the far side of the line. */
export function DocLine({
  mark,
  title,
  date,
  children,
  end,
}: {
  /** In front of the title, as a pill: why the line is here. */
  mark?: ReactNode
  title: ReactNode
  date?: ReactNode
  children?: ReactNode
  end?: ReactNode
}) {
  return (
    <li className="doc-line">
      {mark}
      <span className="doc-line-title">{title}</span>
      {date ? <span className="doc-line-date num-text">{date}</span> : null}
      {children}
      {end ? <span className="doc-line-end">{end}</span> : null}
    </li>
  )
}
