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
        card={route.card}
        bookKey={meta?.session_id ?? ''}
        today={meta?.book_date}
        onBack={() => goTo('#/properties')}
        onEdit={() => goTo(propertyEditHash(route.id))}
        onOpenAllocation={(month) => goTo(allocationHash(route.id, month))}
        onOpenVoucher={(voucherId, entryId, at) =>
          goTo(
            voucherHash(
              { kind: 'property', id: route.id, ...(at.month ? { month: at.month } : at.tab ? { tab: at.tab, ...(at.card ? { card: at.card } : {}) } : {}) },
              voucherId,
              entryId,
            ),
          )
        }
      />
    )
  }
  if (route.view === 'propertyEdit') {
    return <PropertyEdit key={route.id} id={route.id} onDone={() => goTo(propertyHash(route.id))} />
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
        month={route.month}
        onOpenVoucher={(voucherId, entryId, month) => goTo(voucherHash({ kind: 'properties', ...(month ? { month } : {}) }, voucherId, entryId))}
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
    VIEWS.has(route.view) || ['property', 'properties', 'propertiesSetup'].includes(viaKind(route) ?? '') ? 'properties' : null,
}
