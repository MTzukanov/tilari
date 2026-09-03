import {
  fetchAllocationBalances,
  fetchAllocationEntries,
  type Period,
} from '../../../api'
import { TypeTag } from '../../../shared/TypeTag'
import { type AllocationPrefs } from '../allocationPrefs'
import { formatCents } from '../../../shared/money'
import { PeriodNav } from '../../../shared/PeriodNav'
import { formatVoucherId } from '../../../shared/formatVoucherId'
import { usePeriodQuery } from '../../../shared/usePeriodQuery'
import { useI18n } from '../../../i18n'
import { allocationTypeName } from '../../../shared/voucherTypes'
import { usePeriodNav } from '../../../shared/usePeriodNav'

export function AllocationView({
  allocationId,
  initialStartDate,
  initialEndDate,
  periods,
  prefs,
  onBack,
  onOpenVoucher,
  onTogglePnlOnly,
  onToggleProjects,
  onToggleProfitMode,
}: {
  allocationId: number
  initialStartDate: string
  initialEndDate: string
  periods: Period[]
  prefs: AllocationPrefs
  onBack: () => void
  onOpenVoucher: (voucherId: number, entryId: number) => void
  onTogglePnlOnly: () => void
  onToggleProjects: () => void
  onToggleProfitMode: () => void
}) {
  const { t } = useI18n()
  const nav = usePeriodNav(periods, initialStartDate, initialEndDate, allocationId)
  const { data, error, loading } = usePeriodQuery(
    () =>
      Promise.all([
        fetchAllocationBalances(allocationId, nav.start_date, nav.end_date, prefs.includeProjects),
        fetchAllocationEntries(
          allocationId,
          nav.start_date,
          nav.end_date,
          prefs.includeProjects,
          prefs.pnlOnly,
        ),
      ]),
    [allocationId, nav.start_date, nav.end_date, prefs.includeProjects, prefs.pnlOnly],
  )
  const balances = data?.[0] ?? null
  const entries = data?.[1] ?? null

  const profitValue =
    prefs.profitMode === 'types' ? (balances?.profit_cents ?? 0) : (balances?.kitsas_profit_cents ?? 0)

  return (
    <div className="ledger allocation-detail">
      <button type="button" className="back-btn" onClick={onBack}>
        {t('up.allocations')}
      </button>

      <div className="ledger-head-intro">
        <h2 className="ledger-page-title allocation-detail-title">
          {balances?.name || entries?.name || '...'}
        </h2>
        <p className="lede voucher-meta">
          {balances ? allocationTypeName(balances.type) : entries ? allocationTypeName(entries.type) : ''}
          {balances?.parent_name ? ` · ${balances.parent_name}` : ''}
          {balances?.starts ? ` · ${balances.starts}` : ''}
          {balances?.ends ? `\u2013${balances.ends}` : ''}
        </p>
      </div>

      <PeriodNav
        radioName="allocation-detail-nav-mode"
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

      <div className="allocation-toggles" role="group" aria-label={t('table.display')}>
        <label className="allocation-check">
          <input type="checkbox" checked={prefs.pnlOnly} onChange={onTogglePnlOnly} />
          {t('costCentres.pnlOnly')}
        </label>
        <label className="allocation-check">
          <input
            type="checkbox"
            checked={prefs.includeProjects}
            onChange={onToggleProjects}
          />
          {t('costCentres.includeProjects')}
        </label>
        <button type="button" className="allocation-toggle-btn" onClick={onToggleProfitMode}>
          {t('costCentres.profitLabel', {
            mode: prefs.profitMode === 'types' ? t('costCentres.profitTypes') : t('costCentres.profitKitsas'),
          })}
        </button>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {loading && !balances ? <p className="muted">{t('app.loadingGeneric')}</p> : null}

      {balances ? (
        <div className="allocation-summary">
          {prefs.profitMode === 'types' ? (
            <>
              <div>
                <span className="muted">{t('costCentres.income')}</span>
                <strong>{formatCents(balances.income_cents)}</strong>
              </div>
              <div>
                <span className="muted">{t('costCentres.expense')}</span>
                <strong>{formatCents(balances.expense_cents)}</strong>
              </div>
            </>
          ) : (
            <div>
              <span className="muted">{t('costCentres.kitsasNet')}</span>
              <strong className={balances.kitsas_profit_cents < 0 ? 'neg' : ''}>
                {formatCents(balances.kitsas_profit_cents)}
              </strong>
            </div>
          )}
          <div>
            <span className="muted">{t('costCentres.result')}</span>
            <strong className={profitValue < 0 ? 'neg' : ''}>
              {formatCents(profitValue)}
            </strong>
          </div>
        </div>
      ) : null}

      {balances && balances.lines.length > 0 ? (
        <table className="ledger-table allocation-pnl">
          <thead>
            <tr>
              <th>{t('table.account')}</th>
              <th>{t('table.name')}</th>
              <th className="amount">{t('table.balance')}</th>
            </tr>
          </thead>
          <tbody>
            {balances.lines.map((line) => (
              <tr key={line.number}>
                <td className="num">{line.number}</td>
                <td>
                  {line.name}
                  <TypeTag type={line.type} />
                </td>
                <td className={`amount ${line.balance_cents < 0 ? 'neg' : ''}`}>
                  {formatCents(line.balance_cents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {entries ? (
        entries.entries.length === 0 ? (
          <p className="empty">{t('costCentres.emptyLines')}</p>
        ) : (
          <table className="ledger-table">
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
              {entries.entries.map((v) => {
                const partner = v.partner?.name
                const description =
                  partner && v.description && partner !== v.description
                    ? `${partner} - ${v.description}`
                    : partner || v.description || '-'
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
                      {formatVoucherId(v.voucher.series, v.voucher.doc_number, v.voucher.date || v.date)}
                    </td>
                    <td>
                      <span className="num">{v.account}</span> {v.account_name}
                      <TypeTag type={v.account_type} />
                    </td>
                    <td>{description}</td>
                    <td className="amount">{formatCents(v.debit_cents, { emptyZero: true })}</td>
                    <td className="amount">{formatCents(v.credit_cents, { emptyZero: true })}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4}>
                  {t('table.rows', { n: entries.count })}
                </td>
                <td className="amount">{formatCents(entries.debit_sum_cents)}</td>
                <td className="amount">{formatCents(entries.credit_sum_cents)}</td>
              </tr>
            </tfoot>
          </table>
        )
      ) : null}
    </div>
  )
}
