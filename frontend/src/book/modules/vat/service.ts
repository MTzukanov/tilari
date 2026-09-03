import { isPracticeValue } from '../../clock'
import { getCompany } from '../../settings'
import {
  buildVatHtml,
  computeVat,
  createVatReturn,
  existingVatFilings,
  nextVatPeriod,
  type VatResponse,
} from './domain/vat'
import type { KernelContext } from '../types'
import type { VoucherDetail } from '../../types'

export class VatService {
  private kernel: KernelContext

  constructor(kernel: KernelContext) {
    this.kernel = kernel
  }

  async fetchVat(startDate: string, endDate: string): Promise<VatResponse> {
    const db = this.kernel.requireDb()
    const next = nextVatPeriod(db)
    const start = startDate || next?.start_date || ''
    const end = endDate || next?.end_date || ''
    const period_totals = start && end ? computeVat(db, start, end) : null
    const company = getCompany(db)
    return {
      filings: existingVatFilings(db),
      next_period: next,
      period_totals,
      preview_html:
        period_totals != null
          ? buildVatHtml(period_totals, company.Nimi || '', {
              practice: isPracticeValue(company.Harjoitus),
            })
          : null,
    }
  }

  async createVat(startDate: string, endDate: string): Promise<VoucherDetail> {
    const id = await this.kernel.mutate((db) => createVatReturn(db, startDate, endDate), (voucherId) => ({
      kind: 'vat_create',
      params: { startDate, endDate, id: voucherId },
    }))
    return this.kernel.voucherDetail(id)
  }
}
