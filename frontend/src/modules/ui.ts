import type { ReactNode } from 'react'
import type { AllocationPrefs } from './allocations/allocationPrefs'
import type { BalancesResponse, Meta, Period } from '../api'
import type { Route, VoucherVia } from '../app/routing'
import type { ModuleNavItem } from './nav'

export type BookViewCtx = {
  route: Route
  meta: Meta | null
  period: Period | null
  balances: BalancesResponse | null
  periodEnd: string
  allocationPrefs: AllocationPrefs
  onAllocationPrefs: (patch: Partial<AllocationPrefs>) => void
  onPeriodEnd: (ends: string) => void
  goTo: (hash: string) => void
  t: (key: string, vars?: Record<string, string | number>) => string
  onWipeBrowserStorage: () => Promise<void>
}

export type UiModule = {
  id: string
  navItems?: ModuleNavItem[]
  match: (route: Route) => boolean
  Screen: (ctx: BookViewCtx) => ReactNode
  activeNav?: (route: Route) => string | null
}

export function viaKind(route: Route): VoucherVia['kind'] | null {
  if (route.view === 'voucher' || route.view === 'edit') return route.via.kind
  return null
}
