import { useMemo, useState } from 'react'
import {
  fetchAllocationsSummary,
  type Period,
} from '../../../api'
import { allocationActiveIn, type AllocationPrefs } from '../allocationPrefs'
import { rowsForTotal, sumAllocationRows } from '../allocationTotals'
import { formatCents } from '../../../shared/money'
import { PeriodNav } from '../../../shared/PeriodNav'
import { SectionToggle } from '../../../shared/SectionToggle'
import { useI18n } from '../../../i18n'
import { allocationTypeName } from '../../../shared/voucherTypes'
import { usePeriodQuery } from '../../../shared/usePeriodQuery'
import { usePeriodNav } from '../../../shared/usePeriodNav'

export function AllocationList({
  initialStartDate,
  initialEndDate,
  periods,
  prefs,
  compact,
  collapsible,
  onBack,
  onShowAll,
  onToggleHideEnded,
  onToggleProjects,
  onToggleProfitMode,
  onOpen,
}: {
  initialStartDate: string
  initialEndDate: string
  periods: Period[]
  prefs: AllocationPrefs
  compact?: boolean
  collapsible?: boolean
  onBack?: () => void
  onShowAll?: () => void
  onToggleHideEnded: () => void
  onToggleProjects: () => void
  onToggleProfitMode: () => void
  onOpen: (id: number) => void
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(true)
  const nav = usePeriodNav(periods, initialStartDate, initialEndDate, initialEndDate)
  const { data: rows, error, loading } = usePeriodQuery(
    () =>
      fetchAllocationsSummary(nav.start_date, nav.end_date, prefs.includeProjects).then(
        (res) => res.allocations,
      ),
    [nav.start_date, nav.end_date, prefs.includeProjects],
  )

  const visible = useMemo(() => {
    const list = rows ?? []
    return list.filter((row) => {
      const active = allocationActiveIn(row.starts, row.ends, nav.start_date, nav.end_date)
      if (prefs.hideEnded && !active) return false
      return true
    })
  }, [rows, prefs.hideEnded, nav.start_date, nav.end_date])

  const totals = useMemo(() => {
    return sumAllocationRows(rowsForTotal(visible, prefs.includeProjects))
  }, [visible, prefs.includeProjects])

  const profitTotal =
    prefs.profitMode === 'types' ? totals.profit_cents : totals.kitsas_profit_cents

  const showBody = !collapsible || open

  return (
    <section className={`report allocation-list ${compact ? 'allocation-list-compact' : ''}`}>
      {onBack ? (
        <button type="button" className="back-btn" onClick={onBack}>
          {t('up.reports')}
        </button>
      ) : null}

      {collapsible ? (
        <SectionToggle title={t('costCentres.title')} open={open} onToggle={() => setOpen((v) => !v)} />
      ) : !compact ? (
        <h2 className="ledger-page-title">{t('costCentres.title')}</h2>
      ) : (
        <h2>{t('costCentres.title')}</h2>
      )}

      {showBody ? (
        <>
          {!compact ? (
            <PeriodNav
              radioName="allocation-list-nav-mode"
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
          ) : null}

      <div className="allocation-toggles" role="group" aria-label={t('table.display')}>
        <label className="allocation-check">
          <input
            type="checkbox"
            checked={prefs.hideEnded}
            onChange={onToggleHideEnded}
          />
          {t('costCentres.hideEnded')}
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
      {loading && !rows ? <p className="muted">{t('app.loadingCostCentres')}</p> : null}

      {visible.length > 0 ? (
        <div className="allocation-summary allocation-summary-total">
          {prefs.profitMode === 'types' ? (
            <>
              <div>
                <span className="muted">{t('costCentres.incomeTotal')}</span>
                <strong>{formatCents(totals.income_cents)}</strong>
              </div>
              <div>
                <span className="muted">{t('costCentres.expenseTotal')}</span>
                <strong>{formatCents(totals.expense_cents)}</strong>
              </div>
            </>
          ) : (
            <div>
              <span className="muted">{t('costCentres.kitsasNetTotal')}</span>
              <strong className={totals.kitsas_profit_cents < 0 ? 'neg' : ''}>
                {formatCents(totals.kitsas_profit_cents)}
              </strong>
            </div>
          )}
          <div>
            <span className="muted">{t('costCentres.resultTotal')}</span>
            <strong className={profitTotal < 0 ? 'neg' : ''}>
              {formatCents(profitTotal)}
            </strong>
          </div>
          <div>
            <span className="muted">{t('costCentres.countLabel')}</span>
            <strong>{totals.count}</strong>
          </div>
        </div>
      ) : null}

      {rows && visible.length === 0 ? (
        <p className="empty">{t('costCentres.empty')}</p>
      ) : null}

      {visible.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th>{t('table.name')}</th>
              <th>{t('table.type')}</th>
              <th className="amount">
                {prefs.profitMode === 'types' ? t('costCentres.colResult') : t('costCentres.colKitsas')}
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const active = allocationActiveIn(
                row.starts,
                row.ends,
                nav.start_date,
                nav.end_date,
              )
              const value = prefs.profitMode === 'types' ? row.profit_cents : row.kitsas_profit_cents
              return (
                <tr
                  key={row.id}
                  className={`clickable ${active ? '' : 'is-ended'}`}
                  tabIndex={0}
                  onClick={() => onOpen(row.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onOpen(row.id)
                    }
                  }}
                >
                  <td>
                    {row.name || <span className="muted">#{row.id}</span>}
                    {!active && row.ends ? (
                      <span className="muted"> {t('costCentres.ended', { date: row.ends })}</span>
                    ) : null}
                  </td>
                  <td className="muted">{allocationTypeName(row.type)}</td>
                  <td className={`amount ${value < 0 ? 'neg' : ''}`}>
                    {formatCents(value)}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}>
                {t('costCentres.totalCount', { n: totals.count })}
              </td>
              <td className={`amount ${profitTotal < 0 ? 'neg' : ''}`}>
                {formatCents(profitTotal)}
              </td>
            </tr>
          </tfoot>
        </table>
      ) : null}

          {compact && onShowAll ? (
            <p className="lede">
              <button type="button" className="nav-link" onClick={onShowAll}>
                {t('costCentres.openAll')}
              </button>
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  )
}
