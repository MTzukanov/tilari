import { companyHash, voucherHash } from '../../app/routing'
import type { BookViewCtx, UiModule } from '../ui'
import { viaKind } from '../ui'
import { CompanyDocuments } from './ui/CompanyDocuments'
import { CompanyFront } from './ui/CompanyFront'
import { CompanyPeriod } from './ui/CompanyPeriod'
import { DeadlinesButton } from './ui/DeadlinesButton'

function CompanyScreen({ route, goTo, meta }: BookViewCtx) {
  const today = meta?.book_date
  if (route.view === 'companyPeriod') {
    return (
      <CompanyPeriod
        key={route.ends}
        ends={route.ends}
        today={today}
        onBack={() => goTo(companyHash())}
        onOpenVoucher={(voucherId) => goTo(voucherHash({ kind: 'company', ends: route.ends }, voucherId))}
      />
    )
  }
  if (route.view === 'company' && route.section === 'documents') {
    return (
      <CompanyDocuments
        today={today}
        onBack={() => goTo(companyHash())}
        onOpenVoucher={(voucherId) => goTo(voucherHash({ kind: 'company', section: 'documents' }, voucherId))}
      />
    )
  }
  if (route.view === 'company') {
    return (
      <CompanyFront
        today={today}
        onOpenPeriod={(ends) => goTo(companyHash({ ends }))}
        onOpenDocuments={() => goTo(companyHash({ section: 'documents' }))}
        onOpenVoucher={(voucherId) => goTo(voucherHash({ kind: 'company' }, voucherId))}
      />
    )
  }
  return null
}

export const companyUi: UiModule = {
  id: 'company',
  navItems: [{ id: 'company', href: '#/company', icon: 'building', labelKey: 'nav.company' }],
  match: (route) => route.view === 'company' || route.view === 'companyPeriod',
  Screen: CompanyScreen,
  TopbarItem: DeadlinesButton,
  activeNav: (route) => (route.view === 'company' || route.view === 'companyPeriod' || viaKind(route) === 'company' ? 'company' : null),
}
