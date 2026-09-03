import { getJson } from '../../http'
import type { WriteJson } from '../types'
import type { VatResponse } from './domain/vat'
import type { VatService } from './service'
import type { VoucherDetail } from '../../types'

export function createVatHttp(writeJson: WriteJson, _afterMutate: () => void): VatService {
  return {
    fetchVat(startDate: string, endDate: string) {
      const q = new URLSearchParams()
      if (startDate) q.set('start_date', startDate)
      if (endDate) q.set('end_date', endDate)
      const qs = q.toString()
      return getJson<VatResponse>(`/api/vat${qs ? `?${qs}` : ''}`)
    },
    createVat(startDate: string, endDate: string) {
      return writeJson<VoucherDetail>('/api/vat', 'POST', {
        start_date: startDate,
        end_date: endDate,
      })
    },
  } as VatService
}
