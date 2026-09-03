import type { TaxCalculation } from '../../fiscalPeriod'
import { lockFiscalPeriod, unlockFiscalPeriod } from './domain/fiscalPeriodLock'
import {
  buildStatementPrintHtml,
  confirmStatement,
  getStatement,
  saveStatement,
  startStatement,
  unconfirmStatement,
  uploadStatementPdf,
  type StatementDoc,
} from './domain/statement'
import type { PmaSize } from './domain/statementTemplate'
import { computeClosingPlan, type ClosingPlan } from './domain/yearEnd'
import {
  clearTaxCalculation,
  createAccrual,
  createDepreciation,
  createIncomeTax,
  saveTaxCalculation,
} from './domain/yearEndBook'
import type { KernelContext } from '../types'
import type { VoucherDetail } from '../../types'

export class PeriodEndService {
  private kernel: KernelContext

  constructor(kernel: KernelContext) {
    this.kernel = kernel
  }

  async fetchClosing(ends: string): Promise<ClosingPlan> {
    return computeClosingPlan(this.kernel.requireDb(), ends)
  }

  async createDepreciation(ends: string): Promise<VoucherDetail> {
    const id = await this.kernel.mutate((db) => createDepreciation(db, ends), (voucherId) => ({
      kind: 'depreciation',
      params: { ends, id: voucherId },
    }))
    return this.kernel.voucherDetail(id)
  }

  async createAccrual(ends: string): Promise<{ closing: number; opening: number | null }> {
    return this.kernel.mutate((db) => createAccrual(db, ends), (result) => ({
      kind: 'accrual',
      params: { ends, closing: result.closing, ...(result.opening != null ? { opening: result.opening } : {}) },
    }))
  }

  async saveTax(ends: string, tax: TaxCalculation): Promise<TaxCalculation> {
    return this.kernel.mutate((db) => saveTaxCalculation(db, ends, tax), {
      kind: 'tax_save',
      params: { ends },
    })
  }

  async clearTax(ends: string): Promise<void> {
    await this.kernel.mutate((db) => {
      clearTaxCalculation(db, ends)
    }, { kind: 'tax_clear', params: { ends } })
  }

  async createIncomeTax(
    ends: string,
    tax: TaxCalculation,
  ): Promise<{ voucher_id: number | null; tax: TaxCalculation }> {
    return this.kernel.mutate((db) => createIncomeTax(db, ends, tax), (result) => ({
      kind: 'income_tax',
      params: { ends, ...(result.voucher_id != null ? { id: result.voucher_id } : {}) },
    }))
  }

  async lockPeriod(ends: string): Promise<{ lock_date: string | null }> {
    await this.kernel.mutate((db) => {
      lockFiscalPeriod(db, ends)
    }, { kind: 'period_lock', params: { ends } })
    return { lock_date: this.kernel.lockDate() }
  }

  async unlockPeriod(ends: string): Promise<{ lock_date: string | null; unlocked: boolean }> {
    let unlocked = false
    await this.kernel.mutate((db) => {
      unlocked = unlockFiscalPeriod(db, ends)
    }, { kind: 'period_unlock', params: { ends } })
    return { lock_date: this.kernel.lockDate(), unlocked }
  }

  async fetchStatement(ends: string): Promise<StatementDoc> {
    return getStatement(this.kernel.requireDb(), ends)
  }

  async startStatement(
    ends: string,
    opts: { size: PmaSize; selected: string[]; headcount: number | null; share_count?: number | null },
  ): Promise<StatementDoc> {
    return this.kernel.mutate(
      (db) => startStatement(db, ends, { ...opts, today: this.kernel.today() }),
      {
        kind: 'statement_start',
        params: { ends },
      },
    )
  }

  async saveStatement(ends: string, html: string): Promise<StatementDoc> {
    return this.kernel.mutate((db) => saveStatement(db, ends, html), {
      kind: 'statement_save',
      params: { ends },
    })
  }

  async uploadStatementPdf(ends: string, data: Uint8Array): Promise<StatementDoc> {
    return this.kernel.mutate(
      (db) => {
        uploadStatementPdf(db, ends, data)
        return getStatement(db, ends)
      },
      { kind: 'statement_pdf', params: { ends } },
    )
  }

  async confirmStatement(ends: string): Promise<{ confirmed_at: string }> {
    const confirmed = await this.kernel.mutate(
      (db) => confirmStatement(db, ends, this.kernel.today()),
      {
        kind: 'statement_confirm',
        params: { ends },
      },
    )
    return { confirmed_at: confirmed }
  }

  async unconfirmStatement(ends: string): Promise<{ confirmed_at: null }> {
    await this.kernel.mutate((db) => unconfirmStatement(db, ends), {
      kind: 'statement_unconfirm',
      params: { ends },
    })
    return { confirmed_at: null }
  }

  async fetchStatementPrint(ends: string): Promise<{ html: string }> {
    return { html: buildStatementPrintHtml(this.kernel.requireDb(), ends) }
  }
}
