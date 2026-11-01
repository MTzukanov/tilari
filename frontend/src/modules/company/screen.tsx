import { companyHash, voucherHash } from '../../app/routing'
import type { BookViewCtx, UiModule } from '../ui'
import { viaKind } from '../ui'
import { CompanyDocuments } from './ui/CompanyDocuments'
import { CompanyFront, type CompanyOpen } from './ui/CompanyFront'
import { DeadlinesButton } from './ui/DeadlinesButton'

function hashOf(open: CompanyOpen): string {
  if (open === 'own') return companyHash({ section: 'own' })
  return companyHash(open ?? {})
}

function viaOf(open: CompanyOpen) {
  if (open === 'own') return { kind: 'company' as const, section: 'own' as const }
  return { kind: 'company' as const, ...(open ?? {}) }
}

function CompanyScreen({ route, goTo, meta }: BookViewCtx) {
  const today = meta?.book_date
  if (route.view === 'company' && route.section === 'documents') {
    return (
      <CompanyDocuments
        today={today}
        onBack={() => goTo(companyHash())}
        onOpenVoucher={(voucherId) => goTo(voucherHash({ kind: 'company', section: 'documents' }, voucherId))}
      />
    )
  }
  if (route.view === 'company' || route.view === 'companyPeriod') {
    const open: CompanyOpen = route.view === 'companyPeriod' ? { ends: route.ends } : route.section === 'own' ? 'own' : null
    return (
      <CompanyFront
        today={today}
        open={open}
        onOpen={(target) => goTo(hashOf(target))}
        onOpenDocuments={() => goTo(companyHash({ section: 'documents' }))}
        onOpenVoucher={(from, voucherId) => goTo(voucherHash(viaOf(from), voucherId))}
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
