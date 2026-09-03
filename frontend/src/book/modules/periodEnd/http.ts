import { getJson, parseHttpError } from '../../http'
import type { TaxCalculation } from '../../fiscalPeriod'
import type { WriteJson } from '../types'
import type { StatementDoc } from './domain/statement'
import type { PmaSize } from './domain/statementTemplate'
import type { ClosingPlan } from './domain/yearEnd'
import type { PeriodEndService } from './service'
import type { VoucherDetail } from '../../types'

export function createPeriodEndHttp(writeJson: WriteJson, afterMutate: () => void): PeriodEndService {
  return {
    fetchClosing(ends: string) {
      return getJson<ClosingPlan>(`/api/fiscal-periods/${ends}/closing`)
    },
    createDepreciation(ends: string) {
      return writeJson<VoucherDetail>(`/api/fiscal-periods/${ends}/depreciation`, 'POST')
    },
    createAccrual(ends: string) {
      return writeJson<{ closing: number; opening: number | null }>(
        `/api/fiscal-periods/${ends}/accrual`,
        'POST',
      )
    },
    saveTax(ends: string, tax: TaxCalculation) {
      return writeJson<TaxCalculation>(`/api/fiscal-periods/${ends}/tax`, 'PUT', tax)
    },
    clearTax(ends: string) {
      return writeJson<void>(`/api/fiscal-periods/${ends}/tax`, 'DELETE')
    },
    createIncomeTax(ends: string, tax: TaxCalculation) {
      return writeJson<{ voucher_id: number | null; tax: TaxCalculation }>(
        `/api/fiscal-periods/${ends}/tax`,
        'POST',
        tax,
      )
    },
    lockPeriod(ends: string) {
      return writeJson<{ lock_date: string | null }>(`/api/fiscal-periods/${ends}/lock`, 'POST')
    },
    unlockPeriod(ends: string) {
      return writeJson<{ lock_date: string | null; unlocked: boolean }>(
        `/api/fiscal-periods/${ends}/unlock`,
        'POST',
      )
    },
    fetchStatement(ends: string) {
      return getJson<StatementDoc>(`/api/fiscal-periods/${ends}/statement`)
    },
    startStatement(
      ends: string,
      opts: { size: PmaSize; selected: string[]; headcount: number | null; share_count?: number | null },
    ) {
      return writeJson<StatementDoc>(`/api/fiscal-periods/${ends}/statement`, 'POST', opts)
    },
    saveStatement(ends: string, html: string) {
      return writeJson<StatementDoc>(`/api/fiscal-periods/${ends}/statement`, 'PUT', { html })
    },
    async uploadStatementPdf(ends: string, data: Uint8Array) {
      const res = await fetch(`/api/fiscal-periods/${ends}/statement-pdf`, {
        method: 'POST',
        headers: { 'content-type': 'application/pdf' },
        body: data as BodyInit,
      })
      if (!res.ok) throw new Error(await parseHttpError(res))
      afterMutate()
      return res.json() as Promise<StatementDoc>
    },
    confirmStatement(ends: string) {
      return writeJson<{ confirmed_at: string }>(`/api/fiscal-periods/${ends}/confirm`, 'POST')
    },
    unconfirmStatement(ends: string) {
      return writeJson<{ confirmed_at: null }>(`/api/fiscal-periods/${ends}/unconfirm`, 'POST')
    },
    fetchStatementPrint(ends: string) {
      return getJson<{ html: string }>(`/api/fiscal-periods/${ends}/print`)
    },
  } as PeriodEndService
}
