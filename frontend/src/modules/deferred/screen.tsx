import type { ModuleNavItem } from '../nav'
import type { BookViewCtx, UiModule } from '../ui'
import { DeferredView } from './ui/DeferredView'

function DeferredScreen({ route }: BookViewCtx) {
  if (route.view !== 'deferred') return null
  return <DeferredView module={route.module} />
}

export const navItems: ModuleNavItem[] = [
  { id: 'invoices', href: '#/billing', icon: 'invoice', labelKey: 'nav.invoices' },
]

export const deferredUi: UiModule = {
  id: 'deferred',
  navItems,
  match: (route) => route.view === 'deferred',
  Screen: DeferredScreen,
  activeNav: (route) =>
    route.view === 'deferred' && route.module === 'billing' ? 'invoices' : null,
}
