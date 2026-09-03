import { useState } from 'react'
import { createDepreciation, type DepreciationLine } from '../api'
import { useI18n } from '../../../i18n'
import { formatCents } from '../../../shared/money'
import { ModalShell } from './ModalShell'

export function DepreciationDialog({
  ends,
  lines,
  onClose,
  onBooked,
}: {
  ends: string
  lines: DepreciationLine[]
  onClose: () => void
  onBooked: (voucherId: number) => void
}) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const total = lines.reduce((s, l) => s + l.depreciation_cents, 0)

  async function book() {
    setBusy(true)
    setError(null)
    try {
      const voucher = await createDepreciation(ends)
      onBooked(voucher.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalShell
      title={t('yearEnd.depreciation.title')}
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
            disabled={busy || !lines.length}
          >
            {busy ? t('yearEnd.booking') : t('yearEnd.book')}
          </button>
        </>
      }
    >
      {error ? <p className="error">{error}</p> : null}
      {lines.length ? (
        <table className="ledger-table zebra">
          <thead>
            <tr>
              <th>{t('yearEnd.depreciation.account')}</th>
              <th className="amount">{t('yearEnd.depreciation.before')}</th>
              <th className="amount">{t('yearEnd.depreciation.rule')}</th>
              <th className="amount">{t('yearEnd.depreciation.amount')}</th>
              <th className="amount">{t('yearEnd.depreciation.after')}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={`${line.account}-${line.item_id ?? line.allocation}`}>
                <td>
                  {line.account} {line.account_name}
                  {line.label ? <div className="muted">{line.label}</div> : null}
                </td>
                <td className="amount">{formatCents(line.balance_before_cents)}</td>
                <td className="amount">
                  {line.percent != null
                    ? `${line.percent} %`
                    : t('yearEnd.depreciation.months', { months: String(line.months ?? 0) })}
                </td>
                <td className="amount">{formatCents(line.depreciation_cents)}</td>
                <td className="amount">
                  {formatCents(line.balance_before_cents - line.depreciation_cents)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}>{t('yearEnd.total')}</td>
              <td className="amount">{formatCents(total)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      ) : (
        <p className="muted">{t('yearEnd.depreciation.empty')}</p>
      )}
    </ModalShell>
  )
}
