import type { ReactNode } from 'react'
import { FileDropArea } from './FileDropArea'

/** `missing` tints the row, for what is wanted now; `muted` is for what was marked as not needed. */
export type DocRowTone = 'plain' | 'missing' | 'muted'

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

/**
 * One document as a row of a table, so its parts stay in place from line to line: when, title with
 * `mark` at the title's far side, the files in `children`, and `end`. A narrow list folds it into two rows.
 */
export function DocLine({
  voucher,
  date,
  title,
  mark,
  children,
  end,
}: {
  /** A `VoucherPill`, which shows the voucher's date. */
  voucher?: ReactNode
  /** For a line without a voucher. */
  date?: ReactNode
  title: ReactNode
  /** Why the line is here or what is wrong with it. Never moves the title or the files. */
  mark?: ReactNode
  children?: ReactNode
  end?: ReactNode
}) {
  return (
    <li className="doc-line">
      <span className="doc-line-when">{voucher ?? (date ? <span className="doc-line-date num-text">{date}</span> : null)}</span>
      <span className="doc-line-what">
        <span className="doc-line-title" title={typeof title === 'string' ? title : undefined}>
          {title}
        </span>
        {mark ? <span className="doc-line-mark">{mark}</span> : null}
      </span>
      <span className="doc-line-files">{children}</span>
      {end ? <span className="doc-line-end">{end}</span> : null}
    </li>
  )
}
