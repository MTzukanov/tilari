import { useEffect, useState } from 'react'
import {
  fetchAllocationBalances,
  fetchAllocationEntries,
  fetchSettings,
  type AllocationBalanceLine,
  type Period,
} from '../../../api'
import { isVatLiableSetting } from '../../../book/settings'
import { SortableTable, type TableColumn } from '../../../shared/SortableTable'
import { TypeTag } from '../../../shared/TypeTag'
import { type AllocationPrefs } from '../allocationPrefs'
import { formatCents } from '../../../shared/money'
import { PeriodNav } from '../../../shared/PeriodNav'
import { monthRange, parseISO } from '../../../shared/periodNav'
import { usePeriodQuery } from '../../../shared/usePeriodQuery'
import { useI18n } from '../../../i18n'
import { allocationTypeName } from '../../../shared/voucherTypes'
import { usePeriodNav } from '../../../shared/usePeriodNav'
import { BrowseEntriesTable } from '../../vouchers/ui/BrowseEntriesTable'

export function AllocationView({
  allocationId,
  initialStartDate,
  initialEndDate,
  initialMonth,
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
  /** YYYY-MM: open on that month (Kuukausi) instead of the fiscal year. */
  initialMonth?: string
  periods: Period[]
  prefs: AllocationPrefs
  onBack: () => void
  /** `month` while the page shows one month, so back from the voucher returns to it. */
  onOpenVoucher: (voucherId: number, entryId: number, month?: string) => void
  onTogglePnlOnly: () => void
  onToggleProjects: () => void
  onToggleProfitMode: () => void
}) {
  const { t } = useI18n()
  const month = initialMonth ? monthRange(parseISO(`${initialMonth}-01`)) : null
  const nav = usePeriodNav(
    periods,
    month?.starts ?? initialStartDate,
    month?.ends ?? initialEndDate,
    allocationId,
    month ? 'month' : 'year',
  )
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
  const [vatLiable, setVatLiable] = useState(true)

  useEffect(() => {
    void fetchSettings().then((s) => setVatLiable(isVatLiableSetting(s.company.AlvVelvollinen)))
  }, [])

  const balanceColumns: TableColumn<AllocationBalanceLine>[] = [
    {
      id: 'account',
      label: t('table.account'),
      width: 96,
      sortValue: (line) => line.number,
      cellClass: () => 'num',
      render: (line) => line.number,
    },
    {
      id: 'name',
      label: t('table.name'),
      width: 420,
      sortValue: (line) => line.name,
      render: (line) => (
        <>
          {line.name}
          <TypeTag type={line.type} />
        </>
      ),
    },
    {
      id: 'balance',
      label: t('table.balance'),
      width: 140,
      align: 'right',
      sortValue: (line) => line.balance_cents,
      cellClass: (line) => (line.balance_cents < 0 ? 'neg' : ''),
      render: (line) => formatCents(line.balance_cents),
    },
  ]

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
        <SortableTable
          storageKey="tilari.allocation.balanceCols"
          className="allocation-pnl"
          columns={balanceColumns}
          rows={balances.lines}
          rowKey={(line) => line.number}
        />
      ) : null}

      {entries ? (
        entries.entries.length === 0 ? (
          <p className="empty">{t('costCentres.emptyLines')}</p>
        ) : (
          <>
            <div className="allocation-entries-head">
              <span className="browse-count muted">
                <span>
                  {t('table.debit')} {formatCents(entries.debit_sum_cents)}
                </span>
                <span>
                  {t('table.credit')} {formatCents(entries.credit_sum_cents)}
                </span>
                <span>{t('table.count', { n: entries.count })}</span>
              </span>
            </div>
            <BrowseEntriesTable
              rows={entries.entries}
              showVat={vatLiable}
              storageKey="tilari.allocation.entryCols"
              onOpen={(voucherId, entryId) =>
                onOpenVoucher(voucherId, entryId, nav.mode === 'month' ? nav.start_date.slice(0, 7) : undefined)
              }
            />
          </>
        )
      ) : null}
    </div>
  )
}
