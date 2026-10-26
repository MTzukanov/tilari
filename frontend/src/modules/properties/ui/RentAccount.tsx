import { getBcp47, useI18n } from '../../../i18n'
import { formatDate } from '../../../shared/dates'
import { formatCents } from '../../../shared/money'
import type { LeaseRentAccount } from '../api'
import { monthName, rentBalanceText, tenantSide } from './format'
import { LineLink } from './FormParts'

/**
 * A lease's rent account (ADR-026): its balance on the as-of date, exact, and its months folded,
 * newest first, each payment a link to its voucher. Figures stand as the tenant does: a month paid
 * short and arrears are red and minus, so the month where it went wrong shows in the change.
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
                <th className="amount" title={t('properties.rent.col.changeHint')}>
                  {t('properties.rent.col.change')}
                </th>
                <th className="amount" title={t('properties.rent.col.balanceHint')}>
                  {t('properties.rent.col.balance')}
                </th>
                <th>{t('properties.rent.col.lines')}</th>
              </tr>
            </thead>
            <tbody>
              {[...account.months].reverse().map((m) => {
                const change = m.received_snt - m.rent_snt - m.water_snt
                const balance = tenantSide(m.balance_snt)
                return (
                  <tr key={m.key}>
                    <td>{monthName(m.key, getBcp47())}</td>
                    <td className="amount">{formatCents(m.rent_snt)}</td>
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
                  </tr>
                )
              })}
            </tbody>
          </table>
        </details>
      ) : null}
    </div>
  )
}
