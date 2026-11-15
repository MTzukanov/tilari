import { allocationHash, propertyEditHash, propertyHash, voucherHash } from '../../app/routing'
import type { BookViewCtx, UiModule } from '../ui'
import { viaKind } from '../ui'
import { AlertsButton } from './ui/AlertsButton'
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
        month={route.month}
        tab={route.tab}
        onBack={() => goTo('#/properties')}
        onEdit={(tab, intent) => goTo(propertyEditHash(route.id, tab, intent))}
        onOpenAllocation={(month) => goTo(allocationHash(route.id, month))}
        onOpenVoucher={(voucherId, entryId, at) =>
          goTo(voucherHash({ kind: 'property', id: route.id, ...(at.month ? { month: at.month } : at.tab ? { tab: at.tab } : {}) }, voucherId, entryId))
        }
      />
    )
  }
  if (route.view === 'propertyEdit') {
    return (
      <PropertyEdit
        key={route.id}
        id={route.id}
        bookKey={meta?.session_id ?? ''}
        today={meta?.book_date}
        tab={route.tab}
        intent={route.intent}
        onDone={(tab) => goTo(propertyHash(route.id, { tab }))}
        onOpenVoucher={(voucherId, tab) => goTo(voucherHash({ kind: 'propertyEdit', id: route.id, ...(tab ? { tab } : {}) }, voucherId))}
      />
    )
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
    return (
      <PortfolioView
        onOpen={(id) => goTo(`#/property/${id}`)}
        onSetup={() => goTo('#/properties/setup')}
        focusAlerts={route.section === 'alerts'}
      />
    )
  }
  return null
}

const VIEWS = new Set(['properties', 'propertiesSetup', 'property', 'propertyEdit'])

export const propertiesUi: UiModule = {
  id: 'properties',
  navItems: [{ id: 'properties', href: '#/properties', icon: 'home', labelKey: 'nav.properties' }],
  match: (route) => VIEWS.has(route.view),
  Screen: PropertiesScreen,
  TopbarItem: AlertsButton,
  activeNav: (route) =>
    VIEWS.has(route.view) || ['property', 'propertiesSetup', 'propertyEdit'].includes(viaKind(route) ?? '') ? 'properties' : null,
}
