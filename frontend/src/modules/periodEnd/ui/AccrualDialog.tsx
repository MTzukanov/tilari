import { useState } from 'react'
import { createAccrual, type AccrualLine } from '../api'
import { formatDate } from '../../../shared/dates'
import { useI18n } from '../../../i18n'
import { formatCents } from '../../../shared/money'
import { ModalShell } from './ModalShell'

export function AccrualDialog({
  ends,
  lines,
  taxReceivableCents,
  onClose,
  onBooked,
}: {
  ends: string
  lines: AccrualLine[]
  taxReceivableCents: number
  onClose: () => void
  onBooked: (voucherId: number) => void
}) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debit = lines.reduce((s, l) => s + l.debit_cents, 0)
  const credit = lines.reduce((s, l) => s + l.credit_cents, 0)

  async function book() {
    setBusy(true)
    setError(null)
    try {
      const res = await createAccrual(ends)
      onBooked(res.closing)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalShell
      title={t('yearEnd.accrual.title')}
      busy={busy}
      onClose={onClose}
      wide
      actions={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => void book()}
            disabled={busy || (!lines.length && !taxReceivableCents)}
          >
            {busy ? t('yearEnd.booking') : t('yearEnd.book')}
          </button>
        </>
      }
    >
      {error ? <p className="error">{error}</p> : null}
      <p className="muted">{t('yearEnd.accrual.help')}</p>
      {lines.length ? (
        <table className="ledger-table zebra">
          <thead>
            <tr>
              <th>{t('yearEnd.accrual.account')}</th>
              <th>{t('yearEnd.accrual.description')}</th>
              <th>{t('yearEnd.accrual.window')}</th>
              <th className="amount">{t('table.debit')}</th>
              <th className="amount">{t('table.credit')}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => (
              <tr key={`${line.account}-${idx}`}>
                <td>
                  {line.account} {line.account_name}
                </td>
                <td>{line.description}</td>
                <td className="num">
                  {line.accrual_starts
                    ? `${formatDate(line.accrual_starts)} – ${line.accrual_ends ? formatDate(line.accrual_ends) : ''}`
                    : '—'}
                </td>
                <td className="amount">{formatCents(line.debit_cents, { emptyZero: true })}</td>
                <td className="amount">{formatCents(line.credit_cents, { emptyZero: true })}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}>{t('yearEnd.total')}</td>
              <td className="amount">{formatCents(debit)}</td>
              <td className="amount">{formatCents(credit)}</td>
            </tr>
          </tfoot>
        </table>
      ) : (
        <p className="muted">{t('yearEnd.accrual.empty')}</p>
      )}
      {taxReceivableCents ? (
        <p>{t('yearEnd.accrual.taxReceivable', { amount: formatCents(taxReceivableCents) })}</p>
      ) : null}
    </ModalShell>
  )
}
