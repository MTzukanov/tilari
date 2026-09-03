import { voucherHash } from '../../app/routing'
import type { ModuleNavItem } from '../nav'
import type { BookViewCtx, UiModule } from '../ui'
import { viaKind } from '../ui'
import { VatView } from './ui/VatView'

function VatScreen({ route, meta, goTo }: BookViewCtx) {
  if (route.view !== 'vat' || !meta) return null
  return (
    <VatView
      periods={meta.periods}
      onOpenVoucher={(id) => goTo(voucherHash({ kind: 'vat' }, id))}
    />
  )
}

export const navItems: ModuleNavItem[] = [
  { id: 'vat', href: '#/vat', icon: 'pct', labelKey: 'nav.vat' },
]

export const vatUi: UiModule = {
  id: 'vat',
  navItems,
  match: (route) => route.view === 'vat',
  Screen: VatScreen,
  activeNav: (route) => (route.view === 'vat' || viaKind(route) === 'vat' ? 'vat' : null),
}
