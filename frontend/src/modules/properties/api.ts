import { getBookService } from '../../book/engine'
import type { PropertyQuery } from '../../book/modules/properties/service'
import { skipDocument } from '../../book/modules/properties/domain/reminders'
import type { DocumentSkip, PortfolioSettings, PropertyDoc, SetupApplyInput } from '../../book/modules/properties/domain/types'

export type {
  BookedLine,
  BreakEven,
  DepositCandidate,
  DepositMovement,
  DepositView,
  DocumentSkip,
  Disposal,
  DocumentVoucher,
  EraCandidate,
  DocCandidate,
  Lease,
  LeaseException,
  LeaseIncrease,
  LeaseIncreaseKind,
  LeaseRent,
  LeaseSuggestionView,
  LeaseView,
  LeaseVoucher,
  MonthLine,
  MonthLineKind,
  MonthPoint,
  PortfolioAlerts,
  PortfolioResponse,
  PortfolioSettings,
  PropertyDetail,
  PropertyDoc,
  PropertyDocuments,
  PropertyKind,
  PropertyRow,
  PropertyStatus,
  RentAccount,
  RentBalance,
  LeaseRentAccount,
  RentEnd,
  RentMonth,
  RentPeriod,
  RentStart,
  SaleCosts,
  SetupApplyInput,
  SetupResponse,
  Valuation,
  Warning,
  WaterBookedLine,
  WaterDetail,
  WaterSettlement,
  WaterSettlementView,
  WaterShare,
  WaterShareStatus,
  WaterShareView,
  WaterSuggestionView,
  YearRow,
} from '../../book/modules/properties/domain/types'
export { LEASE_INCREASE_KINDS, PROPERTY_KINDS } from '../../book/modules/properties/domain/types'

function service() {
  return getBookService().modules.properties
}

export function fetchPortfolio(query?: PropertyQuery) {
  return service().listProperties(query)
}
export function fetchPropertyAlerts() {
  return service().fetchAlerts()
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
/** The owner's word that a missing document has none (ADR-030), saved on the object's stored document. */
export async function skipPropertyDocument(id: number, skip: DocumentSkip, query?: PropertyQuery) {
  const { doc } = await fetchProperty(id, query)
  return saveProperty(id, skipDocument(doc, skip), query)
}
export function deleteProperty(id: number) {
  return service().deleteProperty(id)
}
export function savePortfolioSettings(settings: PortfolioSettings) {
  return service().savePortfolioSettings(settings)
}
