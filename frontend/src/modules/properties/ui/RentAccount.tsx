import { Fragment, useState } from 'react'
import { getBcp47, useI18n } from '../../../i18n'
import { formatDate } from '../../../shared/dates'
import { EuroInput } from '../../../shared/EuroInput'
import { formatCents, formatEurInput, parseEurInput } from '../../../shared/money'
import type { LeaseException, LeaseRentAccount, RentMonth } from '../api'
import { monthName, rentBalanceText, saveErrorText } from './format'
import { LineLink, Shown } from './FormParts'

const eur = (snt: number | undefined) => (snt ? formatEurInput(snt) : '')

/**
 * An exception for one month, prefilled so the month expects what was paid: the owner checks the
 * days and amounts, gives the reason and saves it to the lease at once.
 */
function ExceptionForm({
  month,
  prefill,
  onSave,
  onClose,
}: {
  month: RentMonth
  prefill: LeaseException
  onSave: (exception: LeaseException) => Promise<void>
  onClose: () => void
}) {
  const { t } = useI18n()
  const [draft, setDraft] = useState({
    from: prefill.from,
    to: prefill.to,
    rent: formatEurInput(prefill.rent_snt),
    water: eur(prefill.water_snt),
    parking: eur(prefill.parking_snt),
    note: '',
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
    setSaving(true)
    setError(null)
    try {
      await onSave(exception)
    } catch (err) {
      setError(saveErrorText(t, err instanceof Error ? err.message : String(err)))
      setSaving(false)
    }
  }

  return (
    <div className="property-rent-exception-form">
      <p className="muted property-lease-hint">
        {t('properties.rent.prefillLead', { month: monthName(month.key, getBcp47()), paid: formatCents(month.received_snt) })}
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
        </div>
      </div>
      {error ? <p className="error">{error}</p> : null}
    </div>
  )
}

/**
 * A lease's rent account (ADR-026): its balance on the as-of date, exact, and its months folded,
 * newest first, each payment a link to its voucher. A month that moved the balance offers an
 * agreed exception, prefilled, when `onAddException` is given (ADR-027).
 */
export function RentAccountView({
  account,
  asOf,
  leaseStarts,
  onOpen,
  onAddException,
}: {
  account: LeaseRentAccount
  asOf: string
  leaseStarts: string
  onOpen: (voucherId: number) => void
  /** Saves an exception to this lease; the page then shows the account again. */
  onAddException?: (exception: LeaseException) => Promise<void>
}) {
  const { t } = useI18n()
  const [adding, setAdding] = useState<string | null>(null)
  const exceptionHint = (e: NonNullable<RentMonth['exception']>) =>
    [t('properties.rent.exceptionHint', { amount: formatCents(e.normal_snt) }), ...e.notes].join(' · ')
  return (
    <div className="property-rent">
      <p className="property-lease-terms">
        {t('properties.rent.balanceOn', { date: formatDate(asOf) })}:{' '}
        <strong className={account.balance_snt > 0 ? 'neg' : ''}>{rentBalanceText(t, account.balance_snt)}</strong>
        {account.counted_from > leaseStarts ? (
          <span className="muted"> · {t('properties.rent.countedFrom', { date: formatDate(account.counted_from) })}</span>
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
                <th className="amount">{t('properties.rent.col.balance')}</th>
                <th>{t('properties.rent.col.lines')}</th>
                {onAddException ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {[...account.months].reverse().map((m) => (
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
                    <td className={`amount ${m.balance_snt > 0 ? 'neg' : ''}`}>{formatCents(m.balance_snt)}</td>
                    <td className="property-rent-lines">
                      {m.lines.map((line) => (
                        <LineLink key={line.line_id} line={line} onOpen={onOpen} />
                      ))}
                    </td>
                    {onAddException ? (
                      <td>
                        {m.exception_prefill && adding !== m.key ? (
                          <button type="button" className="btn-small" onClick={() => setAdding(m.key)}>
                            {t('properties.rent.addException')}
                          </button>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                  {onAddException && m.exception_prefill && adding === m.key ? (
                    <tr className="property-rent-form-row">
                      <td colSpan={7}>
                        <ExceptionForm
                          month={m}
                          prefill={m.exception_prefill}
                          onSave={async (exception) => {
                            await onAddException(exception)
                            setAdding(null)
                          }}
                          onClose={() => setAdding(null)}
                        />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
          {account.months.some((m) => m.exception) ? <p className="muted property-lease-hint">{t('properties.rent.exceptionLegend')}</p> : null}
        </details>
      ) : null}
    </div>
  )
}
