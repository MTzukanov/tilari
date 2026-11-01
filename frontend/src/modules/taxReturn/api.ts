import { getBookService } from '../../book/engine'
import type { Target } from '../../book/modules/taxReturn/domain/mapping'
import type { TaxReturnInputs } from '../../book/modules/taxReturn/domain/types'

export type {
  AccountLine,
  CheckView,
  DistributionInput,
  FormNeed,
  GroupView,
  RowView,
  ShareholderInput,
  TaxReturnInputs,
  TaxReturnView,
} from '../../book/modules/taxReturn/domain/types'
export { ANSWERS, BALANCE_GROUPS, PNL_GROUPS, fieldName } from '../../book/modules/taxReturn/domain/fields6b'
export { SALE, type Target } from '../../book/modules/taxReturn/domain/mapping'
export { ilmoitinFile, type FileNotice, type FileProblem } from '../../book/modules/taxReturn/domain/ilmoitinFile'
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
