import { getBookService } from '../../book/engine'
import type { VatResponse } from '../../book/modules/vat/domain/vat'

export type { VatResponse, VatSummary } from '../../book/modules/vat/domain/vat'

export function fetchVat(start_date: string, end_date: string): Promise<VatResponse> {
  return getBookService().modules.vat.fetchVat(start_date, end_date)
}

export function createVat(start_date: string, end_date: string) {
  return getBookService().modules.vat.createVat(start_date, end_date)
}
