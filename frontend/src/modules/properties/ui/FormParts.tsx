import { useState } from 'react'
import { useI18n } from '../../../i18n'
import { formatDate } from '../../../shared/dates'
import { DocLine } from '../../../shared/DocRows'
import { formatVoucherId } from '../../../shared/formatVoucherId'
import { formatCents } from '../../../shared/money'
import { FilePill, Pill, VoucherPill } from '../../../shared/Pill'
import type { BookedLine, LeaseVoucher, WaterShareView } from '../api'
import { saveErrorText, waterStatusText } from './format'

/** A voucher's pill: its date and Kitsas number, its title on hover and for screen readers. Opens the voucher. */
export function VoucherOpen({
  voucher,
  onOpen,
}: {
  voucher: { voucher_id: number; date: string; doc_number: number | null; series: string | null; title: string }
  onOpen: (voucherId: number) => void
}) {
  const { t } = useI18n()
  // An empty fallback: the default one is truthy and would show as a number.
  const number = formatVoucherId(voucher.series, voucher.doc_number, voucher.date, { fallback: '' })
  const label = voucher.title || (number ? t('properties.docs.voucher', { id: number }) : t('properties.docs.voucherNoId'))
  return <VoucherPill label={label} date={formatDate(voucher.date)} number={number} onOpen={() => onOpen(voucher.voucher_id)} />
}

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

/** A linked voucher: its pill opens it, then its title and a pill per file. */
export function VoucherLink({ voucher, onOpen }: { voucher: LeaseVoucher; onOpen: (voucherId: number) => void }) {
  return (
    <span className="property-voucher">
      <VoucherOpen voucher={voucher} onOpen={onOpen} />
      {voucher.title ? <span>{voucher.title}</span> : null}
      {voucher.files.map((f) => (
        <FilePill key={f.id} id={f.id} name={f.name} />
      ))}
    </span>
  )
}

/**
 * What a lease or water settlement holds in a document's place: the voucher's pill and its files;
 * with none, "Ei asiakirjaa" when the owner said there is none (ADR-030), else "Puuttuu" while the
 * object is held, as the reminders' `missingDocuments` flags it.
 */
export function DocSlot({
  voucher,
  noDocument,
  held = true,
  onOpen,
}: {
  voucher: LeaseVoucher | null
  noDocument?: boolean
  held?: boolean
  onOpen: (voucherId: number) => void
}) {
  const { t } = useI18n()
  if (!voucher) {
    if (noDocument) return <Pill>{t('properties.edit.noDocument')}</Pill>
    return held ? <Pill tone="crit">{t('properties.docs.absent')}</Pill> : null
  }
  return (
    <>
      <VoucherOpen voucher={voucher} onOpen={onOpen} />
      {voucher.files.map((f) => (
        <FilePill key={f.id} id={f.id} name={f.name} />
      ))}
    </>
  )
}

/** A document such as the contract as a line: its voucher, its title and what it is, its files; or the slot's state. */
export function DocSlotLine({
  label,
  voucher,
  noDocument,
  onOpen,
}: {
  label: string
  voucher: LeaseVoucher | null
  noDocument?: boolean
  onOpen: (voucherId: number) => void
}) {
  if (!voucher) {
    return (
      <DocLine title={label}>
        <DocSlot voucher={null} noDocument={noDocument} onOpen={onOpen} />
      </DocLine>
    )
  }
  return (
    <DocLine voucher={<VoucherOpen voucher={voucher} onOpen={onOpen} />} title={voucher.title || label} mark={<Pill>{label}</Pill>}>
      {voucher.files.map((f) => (
        <FilePill key={f.id} id={f.id} name={f.name} />
      ))}
    </DocLine>
  )
}

/** Whether a tenant's water share is settled: done, or still to do. */
export function WaterStatusPill({ share }: { share: Pick<WaterShareView, 'status' | 'balance_snt' | 'settled_snt'> }) {
  const { t } = useI18n()
  if (share.status === 'none') return null
  return <Pill tone={share.status === 'settled' ? 'ok' : 'warn'}>{waterStatusText(t, share.status, share.balance_snt, share.settled_snt)}</Pill>
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
