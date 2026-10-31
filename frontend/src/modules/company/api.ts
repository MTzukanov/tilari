import { getBookService } from '../../book/engine'
import type { CompanyChanges } from '../../book/modules/company/domain/types'

export type {
  CompanyAlerts,
  CompanyChanges,
  CompanyOverview,
  CompanySlotView,
  DeadlineView,
  DocCandidate,
  DocumentView,
  KitsasStatement,
  NextDeadline,
  PeriodView,
  SlotStatus,
  SlotView,
  Suggestion,
} from '../../book/modules/company/domain/types'
export { COMPANY_KINDS, PERIOD_KINDS } from '../../book/modules/company/domain/types'

function service() {
  return getBookService().modules.company
}

export function fetchCompany() {
  return service().fetchOverview()
}
export function fetchCompanyAlerts() {
  return service().fetchAlerts()
}
export function fetchCompanyCandidates(all = false) {
  return service().fetchCandidates(all)
}
export function applyCompanyChanges(changes: CompanyChanges) {
  return service().applyChanges(changes)
}
