import { getBookService } from '../../book/engine'
import type { TaxCalculation } from '../../book/fiscalPeriod'
import type { PmaSize } from '../../book/modules/periodEnd/domain/statementTemplate'

export type { TaxCalculation } from '../../book/fiscalPeriod'
export type { StatementDoc } from '../../book/modules/periodEnd/domain/statement'
export type { PmaSize, TemplateSection } from '../../book/modules/periodEnd/domain/statementTemplate'
export type {
  AccrualLine,
  ClosingPlan,
  DepreciationLine,
  TaxAccountLine,
  TaxBreakdown,
} from '../../book/modules/periodEnd/domain/yearEnd'

export function fetchClosing(ends: string) {
  return getBookService().modules.periodEnd.fetchClosing(ends)
}
export function createDepreciation(ends: string) {
  return getBookService().modules.periodEnd.createDepreciation(ends)
}
export function createAccrual(ends: string) {
  return getBookService().modules.periodEnd.createAccrual(ends)
}
export function saveTax(ends: string, tax: TaxCalculation) {
  return getBookService().modules.periodEnd.saveTax(ends, tax)
}
export function clearTax(ends: string) {
  return getBookService().modules.periodEnd.clearTax(ends)
}
export function createIncomeTax(ends: string, tax: TaxCalculation) {
  return getBookService().modules.periodEnd.createIncomeTax(ends, tax)
}
export function lockPeriod(ends: string) {
  return getBookService().modules.periodEnd.lockPeriod(ends)
}
export function unlockPeriod(ends: string) {
  return getBookService().modules.periodEnd.unlockPeriod(ends)
}
export function fetchStatement(ends: string) {
  return getBookService().modules.periodEnd.fetchStatement(ends)
}
export function startStatement(
  ends: string,
  opts: { size: PmaSize; selected: string[]; headcount: number | null; share_count?: number | null },
) {
  return getBookService().modules.periodEnd.startStatement(ends, opts)
}
export function saveStatement(ends: string, html: string) {
  return getBookService().modules.periodEnd.saveStatement(ends, html)
}
export function uploadStatementPdf(ends: string, data: Uint8Array) {
  return getBookService().modules.periodEnd.uploadStatementPdf(ends, data)
}
export function confirmStatement(ends: string) {
  return getBookService().modules.periodEnd.confirmStatement(ends)
}
export function unconfirmStatement(ends: string) {
  return getBookService().modules.periodEnd.unconfirmStatement(ends)
}
export function fetchStatementPrint(ends: string) {
  return getBookService().modules.periodEnd.fetchStatementPrint(ends)
}
