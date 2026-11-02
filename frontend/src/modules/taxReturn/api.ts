import { getBookService } from '../../book/engine'
import type { Target } from '../../book/modules/taxReturn/domain/mapping'
import type { DebtTerm, TaxReturnInputs } from '../../book/modules/taxReturn/domain/types'

export type {
  AccountLine,
  CheckView,
  DebtTerm,
  DistributionInput,
  DividendClassView,
  DividendInput,
  Form73Input,
  Form62Row,
  Form62Section,
  FormNeed,
  GroupView,
  HoldingGroup,
  HoldingGroupView,
  HoldingInput,
  HoldingRow,
  SaleIdType,
  SaleInput,
  RowView,
  ShareholderInput,
  TaxReturnInputs,
  TaxReturnView,
} from '../../book/modules/taxReturn/domain/types'
export { ANSWERS, BALANCE_GROUPS, PNL_GROUPS, fieldName, openAnswers } from '../../book/modules/taxReturn/domain/fields6b'
export { SALE, type Target } from '../../book/modules/taxReturn/domain/mapping'
export { saleResult } from '../../book/modules/taxReturn/domain/form71b'
export { computeForm73, emptyDividend } from '../../book/modules/taxReturn/domain/form73'
export { parseHoldingTable } from '../../book/modules/taxReturn/domain/form8a'
export { ilmoitinFile, type FileNotice, type FileProblem, type FileRemark } from '../../book/modules/taxReturn/domain/ilmoitinFile'
export { omaVeroText, typedAmount } from '../../book/modules/taxReturn/domain/omaVeroText'

function service() {
  return getBookService().modules.taxReturn
}

export function fetchTaxReturn(ends: string) {
  return service().fetchReturn(ends)
}
export function saveTaxReturnInputs(ends: string, inputs: TaxReturnInputs) {
  return service().saveInputs(ends, inputs)
}
export function saveTaxReturnMapping(ends: string, accounts: Record<string, Target | null>) {
  return service().saveMapping(ends, accounts)
}
export function saveTaxReturnTerms(ends: string, terms: Record<string, DebtTerm | null>) {
  return service().saveTerms(ends, terms)
}
