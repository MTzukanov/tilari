import { useMemo, useState } from 'react'
import {
  createIncomeTax,
  clearTax,
  saveTax,
  type ClosingPlan,
  type TaxAccountLine,
  type TaxBreakdown,
  type TaxCalculation,
} from '../api'
import { isTaxBookingComplete, taxFromBasis } from '../../../book/modules/periodEnd/domain/yearEnd'
import { formatDate } from '../../../shared/dates'
import { useI18n } from '../../../i18n'
import { formatCents, parseEurInput } from '../../../shared/money'
import { ModalShell } from './ModalShell'

function eurInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',')
}

function BreakdownSection({
  title,
  lines,
  note,
  halfHint,
}: {
  title: string
  lines: TaxAccountLine[]
  note?: string
  halfHint?: boolean
}) {
  const { t } = useI18n()
  if (!lines.length) {
    return (
      <details className="tax-breakdown-section">
        <summary>{title}</summary>
        <p className="muted">{t('yearEnd.tax.noAccounts')}</p>
      </details>
    )
  }
  const total = lines.reduce((s, l) => s + l.amount_cents, 0)
  return (
    <details className="tax-breakdown-section" open>
      <summary>
        {title} <span className="muted">({formatCents(total)})</span>
      </summary>
      {note ? <p className="muted tax-breakdown-note">{note}</p> : null}
      <table className="ledger-table zebra compact">
        <thead>
          <tr>
            <th>{t('yearEnd.tax.colAccount')}</th>
            <th>{t('yearEnd.tax.colName')}</th>
            <th className="amount">{t('yearEnd.tax.colAmount')}</th>
            <th>{t('yearEnd.tax.colType')}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.account}>
              <td>{line.account}</td>
              <td>{line.account_name}</td>
              <td className="amount">
                {formatCents(line.amount_cents)}
                {halfHint ? (
                  <span className="muted tax-half-hint">
                    {' '}
                    ({formatCents(Math.trunc(line.amount_cents / 2))})
                  </span>
                ) : null}
              </td>
              <td className="muted">{line.account_type}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}

function AccountBreakdown({ breakdown }: { breakdown: TaxBreakdown }) {
  const { t } = useI18n()
  return (
    <section className="tax-breakdown">
      <h3>{t('yearEnd.tax.breakdownTitle')}</h3>
      <BreakdownSection
        title={t('yearEnd.tax.breakdownIncome')}
        lines={breakdown.income}
      />
      <BreakdownSection
        title={t('yearEnd.tax.breakdownFull')}
        lines={breakdown.full_deduct}
      />
      <BreakdownSection
        title={t('yearEnd.tax.breakdownHalf')}
        lines={breakdown.half_deduct}
        note={t('yearEnd.tax.breakdownHalfNote')}
        halfHint
      />
      <BreakdownSection
        title={t('yearEnd.tax.breakdownPrepaid')}
        lines={breakdown.prepaid}
      />
      <BreakdownSection
        title={t('yearEnd.tax.breakdownSkipped')}
        lines={breakdown.skipped}
        note={t('yearEnd.tax.breakdownSkippedNote')}
      />
    </section>
  )
}

/**
 * Kitsas income-tax dialog. Unlike Kitsas, the resulting breakdown is persisted
 * in `Tilikausi.json` so it can be shown again and embedded in the notes.
 */
export function TaxBookingDialog({
  ends,
  tax,
  onClose,
  onBooked,
  onOpenVoucher,
}: {
  ends: string
  tax: ClosingPlan['tax']
  onClose: () => void
  onBooked: () => void
  onOpenVoucher: (id: number) => void
}) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [income, setIncome] = useState(eurInput(tax.basis.tulo_cents))
  const [fullDeduct, setFullDeduct] = useState(eurInput(tax.basis.taysivahennys_cents))
  const [halfDeduct, setHalfDeduct] = useState(eurInput(tax.basis.puolivahennys_cents))
  const [prepaid, setPrepaid] = useState(eurInput(tax.basis.ennakko_cents))
  const [loss, setLoss] = useState(eurInput(tax.stored?.tappio_cents ?? 0))
  const [override, setOverride] = useState<string | null>(null)

  const computed = useMemo(
    () =>
      taxFromBasis(
        {
          tulo_cents: parseEurInput(income),
          taysivahennys_cents: parseEurInput(fullDeduct),
          puolivahennys_cents: parseEurInput(halfDeduct),
          ennakko_cents: parseEurInput(prepaid),
        },
        {
          tappio_cents: parseEurInput(loss),
          vero_cents: override == null ? undefined : parseEurInput(override),
        },
      ),
    [income, fullDeduct, halfDeduct, prepaid, loss, override],
  )

  async function runClear() {
    setBusy(true)
    setError(null)
    try {
      await clearTax(ends)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function run(book: boolean) {
    setBusy(true)
    setError(null)
    try {
      if (book) {
        await createIncomeTax(ends, computed)
        onBooked()
      } else {
        await saveTax(ends, computed)
        onClose()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const amountField = (
    label: string,
    value: string,
    setValue: (v: string) => void,
    disabled?: boolean,
  ) => (
    <label className="tax-field">
      {label}
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={busy || disabled}
      />
    </label>
  )

  const summaryRow = (label: string, cents: number, strong?: boolean) => (
    <tr className={strong ? 'tax-total' : undefined}>
      <td>{label}</td>
      <td className="amount">{formatCents(cents)}</td>
    </tr>
  )

  const bookingComplete = isTaxBookingComplete(tax.booked, tax.stored)
  const voucherId = tax.voucher_id
  const hasStoredDraft = Boolean(tax.stored) && !bookingComplete

  return (
    <ModalShell
      title={t('yearEnd.tax.title')}
      busy={busy}
      onClose={onClose}
      wide
      actions={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </button>
          {voucherId ? (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => onOpenVoucher(voucherId)}
              disabled={busy}
            >
              {t('yearEnd.tax.openVoucher')}
            </button>
          ) : null}
          {hasStoredDraft ? (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => void runClear()}
              disabled={busy}
              title={t('yearEnd.tax.clearStoredHint')}
            >
              {t('yearEnd.tax.clearStored')}
            </button>
          ) : null}
          {!bookingComplete ? (
            <>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => void run(false)}
                disabled={busy}
                title={t('yearEnd.tax.saveOnlyHint')}
              >
                {t('yearEnd.tax.saveOnly')}
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => void run(true)}
                disabled={busy}
                title={t('yearEnd.tax.bookHint')}
              >
                {busy ? t('yearEnd.booking') : t('yearEnd.tax.book')}
              </button>
            </>
          ) : null}
        </>
      }
    >
      {error ? <p className="error">{error}</p> : null}

      {bookingComplete ? (
        <p className="warn-note">
          {voucherId
            ? t('yearEnd.tax.alreadyBookedVoucher')
            : t('yearEnd.tax.alreadyBookedNoVoucher')}
        </p>
      ) : (
        <p className="muted">{t('yearEnd.tax.actionsHelp')}</p>
      )}

      {tax.stored ? (
        <section className="tax-stored">
          <h3>{t('yearEnd.tax.stored')}</h3>
          <p className="muted">
            {tax.stored.booked_at && bookingComplete
              ? t('yearEnd.tax.bookedAt', { date: formatDate(tax.stored.booked_at.slice(0, 10)) })
              : t('yearEnd.tax.savedAt', { date: formatDate(tax.stored.updated_at.slice(0, 10)) })}
          </p>
          <table className="ledger-table">
            <tbody>
              {summaryRow(t('yearEnd.tax.taxable'), tax.stored.loppu_tulos_cents)}
              {summaryRow(t('yearEnd.tax.amount'), tax.stored.vero_cents)}
              {summaryRow(t('yearEnd.tax.unpaid'), tax.stored.jaaveroa_cents, true)}
            </tbody>
          </table>
        </section>
      ) : null}

      <AccountBreakdown breakdown={tax.breakdown} />

      {!bookingComplete ? (
        <>
          <div className="tax-grid">
            {amountField(t('yearEnd.tax.income'), income, setIncome)}
            {amountField(t('yearEnd.tax.fullDeduct'), fullDeduct, setFullDeduct)}
            {amountField(t('yearEnd.tax.halfDeduct'), halfDeduct, setHalfDeduct)}
            {amountField(t('yearEnd.tax.priorLoss'), loss, setLoss)}
            {amountField(t('yearEnd.tax.prepaid'), prepaid, setPrepaid)}
            <label className="tax-field">
              {t('yearEnd.tax.override')}
              <input
                type="text"
                inputMode="decimal"
                placeholder={eurInput(
                  taxFromBasis(
                    {
                      tulo_cents: parseEurInput(income),
                      taysivahennys_cents: parseEurInput(fullDeduct),
                      puolivahennys_cents: parseEurInput(halfDeduct),
                      ennakko_cents: parseEurInput(prepaid),
                    },
                    { tappio_cents: parseEurInput(loss) },
                  ).vero_cents,
                )}
                value={override ?? ''}
                onChange={(e) => setOverride(e.target.value || null)}
                disabled={busy}
              />
            </label>
          </div>

          <table className="ledger-table tax-summary">
            <tbody>
              {summaryRow(t('yearEnd.tax.result'), computed.tulos_cents)}
              {summaryRow(t('yearEnd.tax.taxable'), computed.loppu_tulos_cents)}
              {summaryRow(t('yearEnd.tax.amount'), computed.vero_cents)}
              {summaryRow(t('yearEnd.tax.prepaid'), computed.ennakko_cents)}
              {summaryRow(t('yearEnd.tax.unpaid'), computed.jaaveroa_cents, true)}
            </tbody>
          </table>
        </>
      ) : null}

      <p className="muted">{t('yearEnd.tax.help')}</p>
    </ModalShell>
  )
}

export type { TaxCalculation }
