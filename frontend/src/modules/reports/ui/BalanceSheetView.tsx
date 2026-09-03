import { useEffect, useMemo, useRef } from 'react'
import type { AllocationPrefs } from '../../allocations/allocationPrefs'
import { AllocationList } from '../../allocations/ui/AllocationList'
import type { BalanceLine, BalancesResponse, Period } from '../../../api'
import { PeriodNav } from '../../../shared/PeriodNav'
import { usePeriodNav } from '../../../shared/usePeriodNav'
import { useI18n } from '../../../i18n'
import { AccountTable } from './AccountTable'

function byAccountNumber(a: BalanceLine, b: BalanceLine): number {
  const as = String(a.number)
  const bs = String(b.number)
  return as < bs ? -1 : as > bs ? 1 : 0
}

export function BalanceSheetView({
  periods,
  period,
  balances,
  allocationPrefs,
  onAllocationPrefs,
  onPeriodEnd,
  onOpenAccount,
  onOpenAllocation,
  onShowAllAllocations,
}: {
  periods: Period[]
  period: Period | null
  balances: BalancesResponse | null
  allocationPrefs: AllocationPrefs
  onAllocationPrefs: (patch: Partial<AllocationPrefs>) => void
  onPeriodEnd: (ends: string) => void
  onOpenAccount: (number: number) => void
  onOpenAllocation: (id: number) => void
  onShowAllAllocations: () => void
}) {
  const { t } = useI18n()
  const last = periods.at(-1)
  const seed = period ?? last ?? null
  const initialRef = useRef<{ starts: string; ends: string } | null>(
    seed ? { starts: seed.starts, ends: seed.ends } : null,
  )
  if (!initialRef.current && seed) {
    initialRef.current = { starts: seed.starts, ends: seed.ends }
  }
  const nav = usePeriodNav(
    periods,
    initialRef.current?.starts ?? '',
    initialRef.current?.ends ?? '',
  )

  useEffect(() => {
    if (nav.end_date) onPeriodEnd(nav.end_date)
  }, [nav.end_date, onPeriodEnd])

  const assetsLines = useMemo(
    () =>
      (balances?.lines ?? [])
        .filter((l) => l.section === 'assets' && l.balance_cents !== 0)
        .sort(byAccountNumber),
    [balances],
  )
  const liabilitiesLines = useMemo(
    () =>
      (balances?.lines ?? [])
        .filter((l) => l.section === 'liabilities' && l.balance_cents !== 0)
        .sort(byAccountNumber),
    [balances],
  )
  const profitLines = useMemo(
    () =>
      (balances?.lines ?? [])
        .filter((l) => l.section === 'profit' && l.balance_cents !== 0)
        .sort(byAccountNumber),
    [balances],
  )

  return (
    <div className="reports">
      <PeriodNav
        radioName="balance-sheet-nav-mode"
        mode={nav.mode}
        start_date={nav.start_date}
        end_date={nav.end_date}
        canPrev={nav.canPrev}
        canNext={nav.canNext}
        periods={periods}
        sticky
        onSelectMode={nav.selectMode}
        onSelectRange={nav.selectRange}
        onPrev={nav.goPrev}
        onNext={nav.goNext}
      />
      <h2 className="ledger-page-title">{t('reports.balanceSheet')}</h2>

      {!balances ? <p className="muted">{t('app.loadingBalances')}</p> : null}

      {balances ? (
        <>
          <section className="report-group">
            <AccountTable
              title={t('reports.assets')}
              lines={assetsLines}
              emptyLabel={t('reports.emptyAssets')}
              collapsible
              onSelect={(line) => onOpenAccount(line.number)}
            />
            <AccountTable
              title={t('reports.liabilities')}
              lines={liabilitiesLines}
              emptyLabel={t('reports.emptyLiabilities')}
              collapsible
              onSelect={(line) => onOpenAccount(line.number)}
            />
          </section>
          <AccountTable
            title={t('reports.incomeStatement')}
            lines={profitLines}
            emptyLabel={t('reports.emptyIncome')}
            collapsible
            onSelect={(line) => onOpenAccount(line.number)}
          />
        </>
      ) : null}

      {nav.start_date && nav.end_date ? (
        <AllocationList
          initialStartDate={nav.start_date}
          initialEndDate={nav.end_date}
          periods={periods}
          prefs={allocationPrefs}
          compact
          collapsible
          onShowAll={onShowAllAllocations}
          onToggleHideEnded={() => onAllocationPrefs({ hideEnded: !allocationPrefs.hideEnded })}
          onToggleProjects={() =>
            onAllocationPrefs({ includeProjects: !allocationPrefs.includeProjects })
          }
          onToggleProfitMode={() =>
            onAllocationPrefs({
              profitMode: allocationPrefs.profitMode === 'types' ? 'kitsas' : 'types',
            })
          }
          onOpen={onOpenAllocation}
        />
      ) : null}
    </div>
  )
}
