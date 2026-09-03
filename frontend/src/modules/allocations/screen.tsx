import { voucherHash } from '../../app/routing'
import type { BookViewCtx, UiModule } from '../ui'
import { viaKind } from '../ui'
import { AllocationList } from './ui/AllocationList'
import { AllocationView } from './ui/AllocationView'

function AllocationsScreen({
  route,
  meta,
  period,
  allocationPrefs,
  onAllocationPrefs,
  goTo,
}: BookViewCtx) {
  if (route.view === 'allocation' && period) {
    return (
      <AllocationView
        allocationId={route.id}
        initialStartDate={period.starts}
        initialEndDate={period.ends}
        periods={meta?.periods ?? []}
        prefs={allocationPrefs}
        onBack={() => goTo('#/allocations')}
        onOpenVoucher={(voucherId, entryId) =>
          goTo(voucherHash({ kind: 'allocation', id: route.id }, voucherId, entryId))
        }
        onTogglePnlOnly={() => onAllocationPrefs({ pnlOnly: !allocationPrefs.pnlOnly })}
        onToggleProjects={() =>
          onAllocationPrefs({ includeProjects: !allocationPrefs.includeProjects })
        }
        onToggleProfitMode={() =>
          onAllocationPrefs({
            profitMode: allocationPrefs.profitMode === 'types' ? 'kitsas' : 'types',
          })
        }
      />
    )
  }
  if (route.view === 'allocations' && period) {
    return (
      <AllocationList
        initialStartDate={period.starts}
        initialEndDate={period.ends}
        periods={meta?.periods ?? []}
        prefs={allocationPrefs}
        onBack={() => goTo('#/')}
        onToggleHideEnded={() => onAllocationPrefs({ hideEnded: !allocationPrefs.hideEnded })}
        onToggleProjects={() =>
          onAllocationPrefs({ includeProjects: !allocationPrefs.includeProjects })
        }
        onToggleProfitMode={() =>
          onAllocationPrefs({
            profitMode: allocationPrefs.profitMode === 'types' ? 'kitsas' : 'types',
          })
        }
        onOpen={(id) => goTo(`#/allocation/${id}`)}
      />
    )
  }
  return null
}

export const allocationsUi: UiModule = {
  id: 'allocations',
  match: (route) => route.view === 'allocations' || route.view === 'allocation',
  Screen: AllocationsScreen,
  activeNav: (route) =>
    route.view === 'allocations' || route.view === 'allocation' || viaKind(route) === 'allocation'
      ? 'reportsHub'
      : null,
}
