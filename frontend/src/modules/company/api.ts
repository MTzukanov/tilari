import { getBookService } from '../../book/engine'
import type { CompanyChanges } from '../../book/modules/company/domain/types'

export type {
  CompanyAlerts,
  CompanyChanges,
  CompanyOverview,
  CompanySlotView,
  DeadlineView,
  DividendMeeting,
  DividendStepState,
  DividendView,
  DocCandidate,
  DocumentView,
  KitsasStatement,
  NextDeadline,
  PeriodView,
  RecipientView,
  ShareholderInput,
  ShareholderKind,
  ShareholderView,
  SlotStatus,
  SlotView,
  SplitProblem,
  Suggestion,
  TaxSettlementView,
  VoucherRef,
} from '../../book/modules/company/domain/types'
export { COMPANY_KINDS, KIND_SETTINGS, PERIOD_KINDS, SHAREHOLDER_KINDS } from '../../book/modules/company/domain/types'
export { decisionDraft, PAYABLE_ACCOUNT, paymentDraft, RETAINED_ACCOUNT } from '../../book/modules/company/domain/dividendVouchers'
export { DISTRIBUTION_ACCOUNT, WITHHOLDING_ACCOUNT } from '../../book/modules/company/domain/dividends'
export { lastEndedBefore } from '../../book/modules/company/domain/suggest'
export { voucherDateFor } from '../../book/modules/company/domain/upload'

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
