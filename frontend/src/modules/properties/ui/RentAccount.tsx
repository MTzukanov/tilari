import { getBcp47, useI18n } from '../../../i18n'
import { formatDate } from '../../../shared/dates'
import { formatCents } from '../../../shared/money'
import type { LeaseRentAccount, RentMonth } from '../api'
import { monthName, rentBalanceText } from './format'
import { LineLink } from './FormParts'

/**
 * A lease's rent account (ADR-026): its balance on the as-of date, exact, and its months folded,
 * newest first, each payment a link to its voucher.
 */
export function RentAccountView({
  account,
  asOf,
  leaseStarts,
  onOpen,
}: {
  account: LeaseRentAccount
  asOf: string
  leaseStarts: string
  onOpen: (voucherId: number) => void
}) {
  const { t } = useI18n()
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
              </tr>
            </thead>
            <tbody>
              {[...account.months].reverse().map((m) => (
                <tr key={m.key}>
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
                </tr>
              ))}
            </tbody>
          </table>
          {account.months.some((m) => m.exception) ? <p className="muted property-lease-hint">{t('properties.rent.exceptionLegend')}</p> : null}
        </details>
      ) : null}
    </div>
  )
}
