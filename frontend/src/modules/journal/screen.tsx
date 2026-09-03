import { voucherHash } from '../../app/routing'
import type { BookViewCtx, UiModule } from '../ui'
import { viaKind } from '../ui'
import { JournalView } from './ui/JournalView'

function JournalScreen({ route, meta, goTo }: BookViewCtx) {
  if (route.view !== 'journal' || !meta) return null
  return (
    <JournalView
      periods={meta.periods}
      onOpen={(id, entryId) => goTo(voucherHash({ kind: 'journal' }, id, entryId))}
    />
  )
}

export const journalUi: UiModule = {
  id: 'journal',
  match: (route) => route.view === 'journal',
  Screen: JournalScreen,
  activeNav: (route) => (route.view === 'journal' || viaKind(route) === 'journal' ? 'reportsHub' : null),
}
