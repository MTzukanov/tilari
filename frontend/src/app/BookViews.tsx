import { useI18n } from '../i18n'
import type { AllocationPrefs } from '../modules/allocations/allocationPrefs'
import type { BalancesResponse, Meta, Period } from '../api'
import { matchUiModule } from '../modules/registry'
import type { Route } from './routing'

export function BookViews({
  route,
  meta,
  period,
  balances,
  periodEnd,
  allocationPrefs,
  onAllocationPrefs,
  onPeriodEnd,
  goTo,
  onWipeBrowserStorage,
}: {
  route: Route
  meta: Meta | null
  period: Period | null
  balances: BalancesResponse | null
  periodEnd: string
  allocationPrefs: AllocationPrefs
  onAllocationPrefs: (patch: Partial<AllocationPrefs>) => void
  onPeriodEnd: (ends: string) => void
  goTo: (hash: string) => void
  onWipeBrowserStorage: () => Promise<void>
}) {
  const { t } = useI18n()
  const mod = matchUiModule(route)
  if (!mod) return null
  const Screen = mod.Screen
  return (
    <Screen
      route={route}
      meta={meta}
      period={period}
      balances={balances}
      periodEnd={periodEnd}
      allocationPrefs={allocationPrefs}
      onAllocationPrefs={onAllocationPrefs}
      onPeriodEnd={onPeriodEnd}
      goTo={goTo}
      t={t}
      onWipeBrowserStorage={onWipeBrowserStorage}
    />
  )
}
