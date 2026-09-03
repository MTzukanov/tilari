import type { BookViewCtx, UiModule } from '../modules/ui'
import { HelpView } from './HelpView'

function HelpScreen({ route }: BookViewCtx) {
  if (route.view !== 'help') return null
  return <HelpView />
}

export const helpUi: UiModule = {
  id: 'help',
  navItems: [{ id: 'help', href: '#/help', icon: 'help', labelKey: 'nav.help' }],
  match: (route) => route.view === 'help',
  Screen: HelpScreen,
  activeNav: (route) => (route.view === 'help' ? 'help' : null),
}
