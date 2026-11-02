import type { ReactNode } from 'react'
import { AttachmentLink } from './AttachmentLink'

/**
 * Colour says what kind of thing it is, the same everywhere (docs/UI_PATTERNS.md):
 * `ok` done, `warn` needs doing, `crit` missing or wrong, `accent` open, `neutral` a plain fact,
 * `doc` a file or a suggestion, `voucher` a voucher.
 */
export type PillTone = 'neutral' | 'ok' | 'warn' | 'crit' | 'accent' | 'doc' | 'voucher'

export function Pill({ tone = 'neutral', children }: { tone?: PillTone; children: ReactNode }) {
  return <span className={`pill pill-${tone}`}>{children}</span>
}

function FileIcon() {
  return (
    <svg className="pill-icon" width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4 1.5h5l3 3v10H4z" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M9 1.5v3h3" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

function VoucherIcon() {
  return (
    <svg className="pill-icon" width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2.5 3.5h11v9h-11z" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 3.5v9M2.5 6.5h11" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

/** Opens one attachment. A long name is cut, and shows in full on hover. */
export function FilePill({ id, name }: { id: number; name: string }) {
  return (
    <AttachmentLink id={id} lazy className="pill pill-doc pill-action" title={name}>
      <FileIcon />
      <span className="pill-text">{name}</span>
    </AttachmentLink>
  )
}

/** Opens a voucher. Shows its date and number; `label` names it on hover and for screen readers. */
export function VoucherPill({ label, date, number, onOpen }: { label: string; date: string; number?: string; onOpen: () => void }) {
  const name = `${label}, ${date}`
  return (
    <button type="button" className="pill pill-voucher pill-action" title={name} aria-label={name} onClick={onOpen}>
      <VoucherIcon />
      <span className="pill-text num-text">
        <span className="pill-date">{date}</span>
        {number ? <span className="pill-number">{number}</span> : null}
      </span>
    </button>
  )
}
