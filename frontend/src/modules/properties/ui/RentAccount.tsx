import { Fragment, useState } from 'react'
import { getBcp47, useI18n } from '../../../i18n'
import { formatDate } from '../../../shared/dates'
import { EuroInput } from '../../../shared/EuroInput'
import { formatCents, formatEurInput, parseEurInput } from '../../../shared/money'
import type { LeaseException, LeaseRentAccount, RentMonth, RentPeriod } from '../api'
import { monthName, periodText, rentBalanceText, saveErrorText, tenantSide } from './format'
import { LineLink, Shown } from './FormParts'

const eur = (snt: number | undefined) => (snt ? formatEurInput(snt) : '')

/**
 * An exception from one month's row: a new one prefilled so the month expects what was paid, or a
 * stored one to change or remove (its agreement kept). The owner checks the days and amounts,
 * gives the reason and saves it to the lease at once.
 */
function ExceptionForm({
  month,
  prefill,
  onSave,
  onRemove,
  onClose,
}: {
  month: RentMonth
  prefill: LeaseException
  onSave: (exception: LeaseException) => Promise<void>
  /** Given when `prefill` is the lease's own exception: the save replaces it, and it can be removed. */
  onRemove?: () => Promise<void>
  onClose: () => void
}) {
  const { t } = useI18n()
  const stored = Boolean(onRemove)
  const [draft, setDraft] = useState({
    from: prefill.from,
    to: prefill.to,
    rent: formatEurInput(prefill.rent_snt),
    water: eur(prefill.water_snt),
    parking: eur(prefill.parking_snt),
    note: stored ? (prefill.note ?? '') : '',
  })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const parking = prefill.parking_snt != null
  const set = (patch: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...patch }))
  const total = parseEurInput(draft.rent) + parseEurInput(draft.water) + (parking ? parseEurInput(draft.parking) : 0)

  async function save() {
    const exception: LeaseException = { from: draft.from, to: draft.to, rent_snt: parseEurInput(draft.rent) }
    const water = parseEurInput(draft.water)
    const parkingSnt = parking ? parseEurInput(draft.parking) : 0
    if (water) exception.water_snt = water
    if (parkingSnt) exception.parking_snt = parkingSnt
    if (draft.note.trim()) exception.note = draft.note.trim()
    // The agreement, or the owner's word that there is none (ADR-030), stays with the exception.
    if (prefill.voucher_id != null) exception.voucher_id = prefill.voucher_id
    else if (prefill.no_document) exception.no_document = true
    await run(() => onSave(exception))
  }

  function remove() {
    if (!onRemove || !window.confirm(t('properties.rent.removeExceptionConfirm', { period: periodText(t, prefill.from, prefill.to) }))) return
    void run(onRemove)
  }

  async function run(action: () => Promise<void>) {
    setSaving(true)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(saveErrorText(t, err instanceof Error ? err.message : String(err)))
      setSaving(false)
    }
  }

  return (
    <div className="property-rent-exception-form">
      <p className="muted property-lease-hint">
        {stored
          ? t('properties.rent.editLead')
          : t('properties.rent.prefillLead', { month: monthName(month.key, getBcp47()), paid: formatCents(month.received_snt) })}
      </p>
      <div className={`property-lease-grid property-lease-amounts property-lease-exception${parking ? '' : ' no-parking'}`}>
        <label>
          {t('properties.field.exceptionFrom')}
          <input type="date" value={draft.from} onChange={(e) => set({ from: e.target.value })} />
        </label>
        <label>
          {t('properties.field.exceptionTo')}
          <input type="date" value={draft.to} onChange={(e) => set({ to: e.target.value })} />
        </label>
        <label>
          {t('properties.field.rent')}
          <EuroInput value={draft.rent} onChange={(rent) => set({ rent })} />
        </label>
        <label>
          {t('properties.field.water')}
          <EuroInput value={draft.water} onChange={(water) => set({ water })} />
        </label>
        {parking ? (
          <label>
            {t('properties.field.parking')}
            <EuroInput value={draft.parking} onChange={(value) => set({ parking: value })} />
          </label>
        ) : null}
        <Shown label={t('properties.field.total')} value={formatCents(total)} strong />
        <div className="property-lease-notice">
          <label>
            {t('properties.field.exceptionNote')}
            <input type="text" maxLength={500} value={draft.note} autoFocus onChange={(e) => set({ note: e.target.value })} />
          </label>
          <button type="button" className="btn-primary" disabled={saving} onClick={() => void save()}>
            {saving ? t('common.saving') : t('properties.rent.saveException')}
          </button>
          <button type="button" className="btn-secondary" disabled={saving} onClick={onClose}>
            {t('common.cancel')}
          </button>
          {onRemove ? (
            <button type="button" className="btn-secondary" disabled={saving} onClick={remove}>
              {t('properties.rent.removeException')}
            </button>
          ) : null}
        </div>
      </div>
      {error ? <p className="error">{error}</p> : null}
    </div>
  )
}

/**
 * A lease's rent account (ADR-026): its balance on the as-of date, exact, and its months folded,
 * newest first, each payment a link to its voucher. Figures stand as the tenant does: a month paid
 * short and arrears are red and minus, so the month where it went wrong shows in the change. A month
 * that moved the balance offers an agreed exception, prefilled, and a month with one offers to change
 * or remove it, when `onSaveException` is given (ADR-027).
 */
export function RentAccountView({
  account,
  asOf,
  leaseStarts,
  period,
  onOpen,
  onSaveException,
}: {
  account: LeaseRentAccount
  asOf: string
  leaseStarts: string
  /** The owner's rent days on the object: why a lease's account starts after the lease, or ends before it. */
  period: RentPeriod
  onOpen: (voucherId: number) => void
  /**
   * Saves an exception to this lease, new or in place of `replaces` (null removes that one); the
   * page then shows the account again.
   */
  onSaveException?: (exception: LeaseException | null, replaces?: LeaseException) => Promise<void>
}) {
  const { t } = useI18n()
  /** The month whose form is open, and the stored exception it changes (none: a new one). */
  const [open, setOpen] = useState<{ key: string; stored?: LeaseException } | null>(null)
  /** Saves the open form (null removes its stored exception) and closes it. */
  async function saveOpen(exception: LeaseException | null) {
    await onSaveException!(exception, open?.stored)
    setOpen(null)
  }
  const exceptionHint = (e: NonNullable<RentMonth['exception']>) =>
    [t('properties.rent.exceptionHint', { amount: formatCents(e.normal_snt) }), ...e.agreed.flatMap((x) => (x.note ? [x.note] : []))].join(' · ')
  return (
    <div className="property-rent">
      <p className="property-lease-terms">
        {t('properties.rent.balanceOn', { date: formatDate(asOf) })}:{' '}
        <strong className={account.balance_snt > 0 ? 'neg' : ''}>{rentBalanceText(t, account.balance_snt)}</strong>
        {account.counted_from > leaseStarts ? (
          <span className="muted">
            {' '}
            · {t('properties.rent.countedFrom', { date: formatDate(account.counted_from), reason: t(`properties.rent.start.${period.start.source}`) })}
          </span>
        ) : null}
        {period.end && account.counted_until === period.end.until ? (
          <span className="muted">
            {' '}
            · {t('properties.rent.countedUntil', { date: formatDate(period.end.until), reason: t(`properties.rent.end.${period.end.source}`) })}
          </span>
        ) : null}
      </p>
      {account.months.length ? (
        <details className="property-sources">
          <summary>{t('properties.rent.months', { n: account.months.length })}</summary>
          <table className="ledger-table compact property-rent-table">
            <thead>
              <tr>
                <th>{t('properties.rent.col.month')}</th>
                <th className="amount">{t('properties.rent.col.rent')}</th>
                <th className="amount">{t('properties.rent.col.water')}</th>
                <th className="amount">{t('properties.rent.col.received')}</th>
                <th className="amount" title={t('properties.rent.col.changeHint')}>
                  {t('properties.rent.col.change')}
                </th>
                <th className="amount" title={t('properties.rent.col.balanceHint')}>
                  {t('properties.rent.col.balance')}
                </th>
                <th>{t('properties.rent.col.lines')}</th>
                {onSaveException ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {[...account.months].reverse().map((m) => {
                const change = m.received_snt - m.rent_snt - m.water_snt
                const balance = tenantSide(m.balance_snt)
                const formFrom = open?.key === m.key ? (open.stored ?? m.exception_prefill) : undefined
                return (
                  <Fragment key={m.key}>
                    <tr>
                      <td>{monthName(m.key, getBcp47())}</td>
                      {m.exception ? (
                        <td className="amount property-rent-exception" title={exceptionHint(m.exception)}>
                          {formatCents(m.rent_snt)}*
                        </td>
                      ) : (
                        <td className="amount">{formatCents(m.rent_snt)}</td>
                      )}
                      <td className="amount">{m.water_snt ? formatCents(m.water_snt) : ''}</td>
                      <td className="amount">{formatCents(m.received_snt)}</td>
                      <td className={`amount ${change < 0 ? 'neg' : ''}`}>
                        {change > 0 ? '+' : ''}
                        {formatCents(change, { emptyZero: true })}
                      </td>
                      <td className={`amount ${balance < 0 ? 'neg' : balance > 0 ? 'pos' : ''}`}>
                        {balance > 0 ? '+' : ''}
                        {formatCents(balance)}
                      </td>
                      <td className="property-rent-lines">
                        {m.lines.map((line) => (
                          <LineLink key={line.line_id} line={line} onOpen={onOpen} />
                        ))}
                      </td>
                      {onSaveException ? (
                        <td>
                          {m.exception_prefill && !formFrom ? (
                            <button type="button" className="btn-small" onClick={() => setOpen({ key: m.key })}>
                              {t('properties.rent.addException')}
                            </button>
                          ) : null}
                          {!formFrom
                            ? m.exception?.agreed.map((e) => (
                                <button key={e.from} type="button" className="btn-small" onClick={() => setOpen({ key: m.key, stored: e })}>
                                  {m.exception!.agreed.length > 1
                                    ? t('properties.rent.editExceptionOf', { period: periodText(t, e.from, e.to) })
                                    : t('properties.rent.editException')}
                                </button>
                              ))
                            : null}
                        </td>
                      ) : null}
                    </tr>
                    {onSaveException && formFrom ? (
                      <tr className="property-rent-form-row">
                        <td colSpan={8}>
                          <ExceptionForm
                            month={m}
                            prefill={formFrom}
                            onSave={saveOpen}
                            onRemove={open?.stored ? () => saveOpen(null) : undefined}
                            onClose={() => setOpen(null)}
                          />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
          {account.months.some((m) => m.exception) ? <p className="muted property-lease-hint">{t('properties.rent.exceptionLegend')}</p> : null}
        </details>
      ) : null}
    </div>
  )
}
