import { fetchJournal, type Period } from '../../../api'
import { formatDate } from '../../../shared/dates'
import { useI18n } from '../../../i18n'
import { formatCents } from '../../../shared/money'
import { PeriodNav } from '../../../shared/PeriodNav'
import { formatVoucherId } from '../../../shared/formatVoucherId'
import { usePeriodQuery } from '../../../shared/usePeriodQuery'
import { usePeriodNav } from '../../../shared/usePeriodNav'

export function JournalView({
  periods,
  onOpen,
}: {
  periods: Period[]
  onOpen: (id: number, entryId: number) => void
}) {
  const { t } = useI18n()
  const last = periods.at(-1)
  const nav = usePeriodNav(
    periods,
    last?.starts ?? '',
    last?.ends ?? '',
  )
  const { data, error } = usePeriodQuery(
    () => fetchJournal(nav.start_date, nav.end_date).then((res) => res.entries),
    [nav.start_date, nav.end_date],
  )
  const rows = data ?? []

  return (
    <div className="ledger">
      <header className="ledger-head">
        <PeriodNav
          radioName="journal-nav-mode"
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
        <h2>{t('nav.journal')}</h2>
      </header>
      {error ? <p className="error">{error}</p> : null}
      <table className="ledger-table zebra dense">
        <thead>
          <tr>
            <th>{t('table.date')}</th>
            <th>{t('table.voucher')}</th>
            <th>{t('table.account')}</th>
            <th>{t('table.description')}</th>
            <th className="amount">{t('table.debit')}</th>
            <th className="amount">{t('table.credit')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((v) => (
            <tr
              key={v.id}
              className="clickable"
              tabIndex={0}
              onClick={() => onOpen(v.voucher.id, v.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onOpen(v.voucher.id, v.id)
                }
              }}
            >
              <td className="num">{formatDate(v.date)}</td>
              <td className="num">
                {formatVoucherId(v.voucher.series, v.voucher.doc_number, v.voucher.date || v.date)}
              </td>
              <td>
                {v.account} {v.account_name || ''}
              </td>
              <td>{v.partner?.name || v.description || '-'}</td>
              <td className="amount">{formatCents(v.debit_cents, { emptyZero: true })}</td>
              <td className="amount">{formatCents(v.credit_cents, { emptyZero: true })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
