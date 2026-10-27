import { useState } from 'react'
import { useI18n } from '../../../i18n'
import { formatDate } from '../../../shared/dates'
import { formatVoucherId } from '../../../shared/formatVoucherId'
import { formatCents } from '../../../shared/money'
import type { BookedLine, LeaseVoucher } from '../api'
import { saveErrorText } from './format'

/** The owner's word that a document slot stays empty, so no reminder asks for it (ADR-030); shown while none is picked. */
export function NoDocumentCheck({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  const { t } = useI18n()
  return (
    <label className="allocation-check property-no-doc" title={t('properties.edit.noDocumentHint')}>
      <input type="checkbox" checked={checked} onChange={() => onChange(!checked)} />
      {t('properties.edit.noDocument')}
    </label>
  )
}

/**
 * "Ohita" on a missing document's reminder: the owner's word that there is none (ADR-030). The
 * edit page's "Ei asiakirjaa" takes it back.
 */
export function SkipDocumentButton({ onSkip }: { onSkip: () => Promise<unknown> }) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function skip() {
    setBusy(true)
    try {
      await onSkip()
    } catch (err) {
      setError(saveErrorText(t, err instanceof Error ? err.message : String(err)))
      setBusy(false)
    }
  }
  return (
    <>
      {' '}
      <button type="button" className="btn-link property-skip-doc" title={t('properties.alerts.skipHint')} disabled={busy} onClick={() => void skip()}>
        {t('properties.alerts.skip')}
      </button>
      {error ? <span className="error"> {error}</span> : null}
    </>
  )
}

/** A read-only cell lined up with the inputs: a label and its value. */
export function Shown({ label, value, strong = false, title }: { label: string; value: string; strong?: boolean; title?: string }) {
  return (
    <div className="property-lease-shown" title={title}>
      <span>{label}</span>
      {strong ? <strong>{value}</strong> : <span className="property-lease-value">{value}</span>}
    </div>
  )
}

/** A linked voucher as Kitsas numbers it, with its title; opens the voucher. */
export function VoucherLink({ voucher, onOpen }: { voucher: LeaseVoucher; onOpen: (voucherId: number) => void }) {
  return (
    <button type="button" className="btn-link" onClick={() => onOpen(voucher.voucher_id)}>
      {formatVoucherId(voucher.series, voucher.doc_number, voucher.date)} · {voucher.title}
    </button>
  )
}

/** A booked line: its date and the amount that counts; the payer and the line's text on hover. Opens its voucher. */
export function LineLink({ line, onOpen }: { line: BookedLine; onOpen: (voucherId: number) => void }) {
  return (
    <button
      type="button"
      className="btn-link"
      title={[line.partner, line.text].filter(Boolean).join(' - ')}
      onClick={() => onOpen(line.voucher.voucher_id)}
    >
      {formatDate(line.date)} {formatCents(line.amount_snt)}
    </button>
  )
}

/** Many booked lines behind a figure, folded under a label such as "Vuokrasuoritukset (12)". */
export function LineSources({ label, lines, onOpen }: { label: string; lines: BookedLine[]; onOpen: (voucherId: number) => void }) {
  if (!lines.length) return null
  return (
    <details className="property-sources">
      <summary>{label}</summary>
      <span className="property-sources-lines">
        {lines.map((line) => (
          <LineLink key={line.line_id} line={line} onOpen={onOpen} />
        ))}
      </span>
    </details>
  )
}
