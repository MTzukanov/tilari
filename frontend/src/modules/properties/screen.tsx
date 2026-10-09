import { voucherHash } from '../../app/routing'
import type { BookViewCtx, UiModule } from '../ui'
import { viaKind } from '../ui'
import { PortfolioView } from './ui/PortfolioView'
import { PropertyEdit } from './ui/PropertyEdit'
import { PropertySetup } from './ui/PropertySetup'
import { PropertyView } from './ui/PropertyView'

function PropertiesScreen({ route, goTo, meta }: BookViewCtx) {
  if (route.view === 'property') {
    return (
      <PropertyView
        key={route.id}
        id={route.id}
        onBack={() => goTo('#/properties')}
        onEdit={() => goTo(`#/property/${route.id}/edit`)}
        onOpenAllocation={() => goTo(`#/allocation/${route.id}`)}
        onOpenVoucher={(voucherId) => goTo(voucherHash({ kind: 'property', id: route.id }, voucherId))}
      />
    )
  }
  if (route.view === 'propertyEdit') {
    return <PropertyEdit key={route.id} id={route.id} onDone={() => goTo(`#/property/${route.id}`)} />
  }
  if (route.view === 'propertiesSetup') {
    return (
      <PropertySetup
        bookKey={meta?.session_id ?? ''}
        onDone={() => goTo('#/properties')}
        onOpenVoucher={(voucherId) => goTo(voucherHash({ kind: 'propertiesSetup' }, voucherId))}
      />
    )
  }
  if (route.view === 'properties') {
    return <PortfolioView onOpen={(id) => goTo(`#/property/${id}`)} onSetup={() => goTo('#/properties/setup')} />
  }
  return null
}

const VIEWS = new Set(['properties', 'propertiesSetup', 'property', 'propertyEdit'])

export const propertiesUi: UiModule = {
  id: 'properties',
  navItems: [{ id: 'properties', href: '#/properties', icon: 'home', labelKey: 'nav.properties' }],
  match: (route) => VIEWS.has(route.view),
  Screen: PropertiesScreen,
  activeNav: (route) =>
    VIEWS.has(route.view) || viaKind(route) === 'property' || viaKind(route) === 'propertiesSetup' ? 'properties' : null,
}
