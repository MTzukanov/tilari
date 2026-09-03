import type { ModuleNavItem } from '../nav'
import type { BookViewCtx, UiModule } from '../ui'
import { BrowserStorageView } from './ui/BrowserStorageView'
import { SettingsView } from './ui/SettingsView'

function SettingsScreen({ route, meta, onWipeBrowserStorage }: BookViewCtx) {
  if (route.view !== 'settings') return null
  if (route.page === 'storage') {
    return <BrowserStorageView meta={meta} onWipeBrowserStorage={onWipeBrowserStorage} />
  }
  if (!meta) return null
  return <SettingsView />
}

export const navItems: ModuleNavItem[] = [
  { id: 'settings', href: '#/settings', icon: 'gear', labelKey: 'nav.settings' },
]

export const settingsUi: UiModule = {
  id: 'settings',
  navItems,
  match: (route) => route.view === 'settings',
  Screen: SettingsScreen,
  activeNav: (route) => (route.view === 'settings' ? 'settings' : null),
}
