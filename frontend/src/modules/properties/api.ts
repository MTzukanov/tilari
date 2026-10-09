import { getBookService } from '../../book/engine'
import type { PropertyQuery } from '../../book/modules/properties/service'
import type { PortfolioSettings, PropertyDoc, SetupApplyInput } from '../../book/modules/properties/domain/types'

export type {
  BreakEven,
  DocumentVoucher,
  EraCandidate,
  DocCandidate,
  MonthPoint,
  PortfolioResponse,
  PortfolioSettings,
  PropertyDetail,
  PropertyDoc,
  PropertyDocuments,
  PropertyKind,
  PropertyRow,
  PropertyStatus,
  SaleCosts,
  SetupApplyInput,
  SetupResponse,
  Valuation,
  Warning,
  YearRow,
} from '../../book/modules/properties/domain/types'
export { PROPERTY_KINDS } from '../../book/modules/properties/domain/types'

function service() {
  return getBookService().modules.properties
}

export function fetchPortfolio(query?: PropertyQuery) {
  return service().listProperties(query)
}
export function fetchProperty(id: number, query?: PropertyQuery) {
  return service().fetchProperty(id, query)
}
export function fetchPropertyDocuments(id: number, includeBank = false) {
  return service().fetchPropertyDocuments(id, includeBank)
}
export function fetchPropertySetup() {
  return service().fetchSetup()
}
export function applyPropertySetup(input: SetupApplyInput) {
  return service().applySetup(input)
}
export function saveProperty(id: number, doc: PropertyDoc, query?: PropertyQuery) {
  return service().saveProperty(id, doc, query)
}
export function deleteProperty(id: number) {
  return service().deleteProperty(id)
}
export function savePortfolioSettings(settings: PortfolioSettings) {
  return service().savePortfolioSettings(settings)
}
