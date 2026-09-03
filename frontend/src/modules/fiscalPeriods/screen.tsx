import { voucherHash } from '../../app/routing'
import type { ModuleNavItem } from '../nav'
import type { BookViewCtx, UiModule } from '../ui'
import { viaKind } from '../ui'
import { FiscalPeriodsView } from './ui/FiscalPeriodsView'

function FiscalPeriodsScreen({ route, meta, goTo }: BookViewCtx) {
  if (route.view !== 'fiscalPeriods' || !meta) return null
  return (
    <FiscalPeriodsView
      initialWizardEnds={route.wizardEnds ?? null}
      bookDate={meta.book_date}
      onOpenVoucher={(id, periodEnds) =>
        goTo(voucherHash({ kind: 'fiscalPeriods', ends: periodEnds }, id))
      }
    />
  )
}

export const navItems: ModuleNavItem[] = [
  { id: 'fiscalPeriods', href: '#/fiscal-periods', icon: 'years', labelKey: 'nav.fiscalPeriods' },
]

export const fiscalPeriodsUi: UiModule = {
  id: 'fiscalPeriods',
  navItems,
  match: (route) => route.view === 'fiscalPeriods',
  Screen: FiscalPeriodsScreen,
  activeNav: (route) =>
    route.view === 'fiscalPeriods' || viaKind(route) === 'fiscalPeriods' ? 'fiscalPeriods' : null,
}
