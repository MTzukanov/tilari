import { helpUi } from '../app/helpUi'
import type { Route } from '../app/routing'
import { allocationsUi } from './allocations/screen'
import { deferredUi } from './deferred/screen'
import { fiscalPeriodsUi } from './fiscalPeriods/screen'
import { journalUi } from './journal/screen'
import type { ModuleNavItem } from './nav'
import { reportsUi } from './reports/screen'
import { settingsUi } from './settings/screen'
import type { UiModule } from './ui'
import { vatUi } from './vat/screen'
import { vouchersUi } from './vouchers/screen'

/** Compile-time screens. Add a module here — BookViews and SideNav loop this list. */
export const UI_MODULES: UiModule[] = [
  vatUi,
  fiscalPeriodsUi,
  vouchersUi,
  deferredUi,
  journalUi,
  allocationsUi,
  reportsUi,
  settingsUi,
  helpUi,
]

export const NAV_ITEMS: ModuleNavItem[] = [
  ...(reportsUi.navItems ?? []).filter((item) => item.id === 'start'),
  ...(vouchersUi.navItems ?? []),
  ...(deferredUi.navItems ?? []),
  ...(reportsUi.navItems ?? []).filter((item) => item.id === 'reportsHub'),
  ...(fiscalPeriodsUi.navItems ?? []),
  ...(vatUi.navItems ?? []),
  ...(settingsUi.navItems ?? []),
  ...(helpUi.navItems ?? []),
]

export function activeNav(route: Route): string | null {
  for (const mod of UI_MODULES) {
    const id = mod.activeNav?.(route)
    if (id) return id
  }
  return 'start'
}

export function matchUiModule(route: Route): UiModule | undefined {
  return UI_MODULES.find((mod) => mod.match(route))
}
