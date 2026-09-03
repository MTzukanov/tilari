import { voucherHash } from '../../app/routing'
import type { ModuleNavItem } from '../nav'
import type { BookViewCtx, UiModule } from '../ui'
import { viaKind } from '../ui'
import { AccountLedger } from './ui/AccountLedger'
import { BalanceSheetItemsView } from './ui/BalanceSheetItemsView'
import { BalanceSheetView } from './ui/BalanceSheetView'
import { OverviewView } from './ui/OverviewView'
import { ReportsHub } from './ui/ReportsHub'

function ReportsScreen({
  route,
  meta,
  period,
  balances,
  allocationPrefs,
  onAllocationPrefs,
  onPeriodEnd,
  goTo,
}: BookViewCtx) {
  if (route.view === 'reportsHub' && meta) {
    return (
      <ReportsHub
        onOpenOverview={() => goTo('#/overview')}
        onOpenBalanceSheet={() => goTo('#/')}
        onOpenBalanceSheetItems={() => goTo('#/balance-sheet-items')}
        onOpenJournal={() => goTo('#/journal')}
        onOpenAllocations={() => goTo('#/allocations')}
      />
    )
  }
  if (route.view === 'overview' && meta) {
    return (
      <OverviewView
        periods={meta.periods}
        period={period}
        onPeriodEnd={onPeriodEnd}
        onBack={() => goTo('#/reports')}
      />
    )
  }
  if (route.view === 'ledger' && period) {
    return (
      <AccountLedger
        account={route.account}
        initialStartDate={period.starts}
        initialEndDate={period.ends}
        periods={meta?.periods ?? []}
        onBack={() => goTo('#/')}
        onOpenVoucher={(voucherId, entryId) =>
          goTo(voucherHash({ kind: 'account', account: route.account }, voucherId, entryId))
        }
      />
    )
  }
  if (route.view === 'balanceSheetItems' && period) {
    return (
      <BalanceSheetItemsView
        initialStartDate={period.starts}
        initialEndDate={period.ends}
        periods={meta?.periods ?? []}
        onBack={() => goTo('#/')}
        onOpenVoucher={(voucherId, entryId) =>
          goTo(voucherHash({ kind: 'balanceSheetItems' }, voucherId, entryId))
        }
      />
    )
  }
  if (route.view === 'reports' && meta) {
    return (
      <BalanceSheetView
        periods={meta.periods}
        period={period}
        balances={balances}
        allocationPrefs={allocationPrefs}
        onAllocationPrefs={onAllocationPrefs}
        onPeriodEnd={onPeriodEnd}
        onOpenAccount={(number) => goTo(`#/account/${number}`)}
        onOpenAllocation={(id) => goTo(`#/allocation/${id}`)}
        onShowAllAllocations={() => goTo('#/allocations')}
      />
    )
  }
  return null
}

export const navItems: ModuleNavItem[] = [
  { id: 'start', href: '#/', icon: 'horse', labelKey: 'nav.start' },
  { id: 'reportsHub', href: '#/reports', icon: 'chart', labelKey: 'nav.reports' },
]

export const reportsUi: UiModule = {
  id: 'reports',
  navItems,
  match: (route) =>
    route.view === 'reports' ||
    route.view === 'reportsHub' ||
    route.view === 'overview' ||
    route.view === 'ledger' ||
    route.view === 'balanceSheetItems',
  Screen: ReportsScreen,
  activeNav: (route) => {
    if (route.view === 'reports') return 'start'
    if (
      route.view === 'reportsHub' ||
      route.view === 'overview' ||
      route.view === 'ledger' ||
      route.view === 'balanceSheetItems'
    ) {
      return 'reportsHub'
    }
    const via = viaKind(route)
    if (via === 'account' || via === 'balanceSheetItems') return 'reportsHub'
    return null
  },
}
