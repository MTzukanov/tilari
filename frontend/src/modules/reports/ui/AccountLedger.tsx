import { useMemo } from 'react'
import { fetchEntries, type Period, type Entry, type EntriesResponse } from '../../../api'
import { PeriodNav } from '../../../shared/PeriodNav'
import { TypeTag } from '../../../shared/TypeTag'
import { usePeriodNav } from '../../../shared/usePeriodNav'
import { formatVoucherId } from '../../../shared/formatVoucherId'
import { usePeriodQuery } from '../../../shared/usePeriodQuery'

import { formatCents } from '../../../shared/money'
import { useI18n } from '../../../i18n'

function withRunningBalances(data: EntriesResponse): Entry[] {
  const asset = (data.type || '').startsWith('A') || String(data.account).startsWith('1')
  let running = data.opening_cents ?? 0
  return data.entries.map((v) => {
    if (typeof v.balance_cents === 'number') {
      running = v.balance_cents
      return v
    }
    const d = v.debit_cents || 0
    const k = v.credit_cents || 0
    running = running + (asset ? d - k : k - d)
    return { ...v, balance_cents: running }
  })
}

export function AccountLedger({
  account,
  initialStartDate,
  initialEndDate,
  periods,
  onBack,
  onOpenVoucher,
}: {
  account: number
  initialStartDate: string
  initialEndDate: string
  periods: Period[]
  onBack: () => void
  onOpenVoucher: (voucherId: number, entryId: number) => void
}) {
  const { t } = useI18n()
  const nav = usePeriodNav(periods, initialStartDate, initialEndDate, account)
  const { data, error, loading } = usePeriodQuery(
    () => fetchEntries(account, nav.start_date, nav.end_date),
    [account, nav.start_date, nav.end_date],
  )

  const rows = useMemo(() => (data ? withRunningBalances(data) : []), [data])
  const openingCents = data?.opening_cents ?? 0
  const closingCents = rows.length ? (rows[rows.length - 1].balance_cents ?? openingCents) : openingCents
  const empty = data != null && rows.length === 0 && openingCents === 0

  return (
    <div className="ledger">
      <button type="button" className="back-btn" onClick={onBack}>
        {t('up.reports')}
      </button>

      <header className="ledger-head">
        <PeriodNav
          radioName="ledger-nav-mode"
          mode={nav.mode}
          start_date={nav.start_date}
          end_date={nav.end_date}
          canPrev={nav.canPrev}
          canNext={nav.canNext}
          periods={periods}
          onSelectMode={nav.selectMode}
          onSelectRange={nav.selectRange}
          onPrev={nav.goPrev}
          onNext={nav.goNext}
        />

        <h2>
          <span className="ledger-num">{account}</span>
          <span className="ledger-title">
            {data?.name || '...'}
            <TypeTag type={data?.type} />
          </span>
        </h2>
      </header>

      {error ? <p className="error">{error}</p> : null}
      {loading && !data ? <p className="muted">{t('app.loadingPostings')}</p> : null}

      {data ? (
        <>
          {empty ? (
            <p className="empty">{t('ledger.empty')}</p>
          ) : (
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>{t('table.date')}</th>
                  <th>{t('table.voucher')}</th>
                  <th>{t('table.description')}</th>
                  <th className="amount">{t('table.debit')}</th>
                  <th className="amount">{t('table.credit')}</th>
                  <th className="amount">{t('table.balance')}</th>
                </tr>
              </thead>
              <tbody>
                <tr className="opening-balance-row">
                  <td colSpan={3}>{t('table.opening')}</td>
                  <td className="amount" />
                  <td className="amount" />
                  <td className={`amount ${openingCents < 0 ? 'neg' : ''}`}>
                    {formatCents(openingCents)}
                  </td>
                </tr>
                {rows.map((v) => {
                  const partner = v.partner?.name
                  const description =
                    partner && v.description && partner !== v.description
                      ? `${partner} - ${v.description}`
                      : partner || v.description || '-'
                  const balance = v.balance_cents ?? 0
                  return (
                    <tr
                      key={v.id}
                      className="clickable"
                      tabIndex={0}
                      title={t('voucher.openVoucher')}
                      onClick={() => onOpenVoucher(v.voucher.id, v.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onOpenVoucher(v.voucher.id, v.id)
                        }
                      }}
                    >
                      <td className="num">{v.date}</td>
                      <td className="num">
                        {formatVoucherId(
                          v.voucher.series,
                          v.voucher.doc_number,
                          v.voucher.date || v.date,
                        )}
                      </td>
                      <td>{description}</td>
                      <td className="amount">{formatCents(v.debit_cents, { emptyZero: true })}</td>
                      <td className="amount">{formatCents(v.credit_cents, { emptyZero: true })}</td>
                      <td className={`amount ${balance < 0 ? 'neg' : ''}`}>
                        {formatCents(balance)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>
                    {t('table.rows', { n: data.count })}
                  </td>
                  <td className="amount">{formatCents(data.debit_sum_cents)}</td>
                  <td className="amount">{formatCents(data.credit_sum_cents)}</td>
                  <td className={`amount ${closingCents < 0 ? 'neg' : ''}`}>
                    {formatCents(closingCents)}
                  </td>
                </tr>
                <tr className="loppusaldo">
                  <td colSpan={3}>{t('table.closing', { date: nav.end_date })}</td>
                  <td colSpan={2} />
                  <td className={`amount ${data.closing_cents < 0 ? 'neg' : ''}`}>
                    {formatCents(data.closing_cents)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </>
      ) : null}
    </div>
  )
}
