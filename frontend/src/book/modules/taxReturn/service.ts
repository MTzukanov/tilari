import type { KernelContext } from '../types'
import { computeTaxReturn } from './domain/compute'
import { writeInputs, writeOverrides, writeTerms } from './domain/inputs'
import type { Target } from './domain/mapping'
import type { DebtTerm, TaxReturnInputs, TaxReturnView } from './domain/types'

/** The 6B from the ledger. Reads the book and writes only the owner's inputs to `TilariData`. */
export class TaxReturnService {
  private kernel: KernelContext

  constructor(kernel: KernelContext) {
    this.kernel = kernel
  }

  async fetchReturn(ends: string): Promise<TaxReturnView> {
    return computeTaxReturn(this.kernel.requireDb(), ends, { today: this.kernel.today() })
  }

  async saveInputs(ends: string, inputs: TaxReturnInputs): Promise<TaxReturnView> {
    const now = new Date().toISOString()
    await this.kernel.mutate((db) => writeInputs(db, ends, inputs, now), { kind: 'tax_return' })
    return this.fetchReturn(ends)
  }

  async saveMapping(ends: string, accounts: Record<string, Target | null>): Promise<TaxReturnView> {
    const now = new Date().toISOString()
    await this.kernel.mutate((db) => writeOverrides(db, accounts, now), { kind: 'tax_return' })
    return this.fetchReturn(ends)
  }

  async saveTerms(ends: string, terms: Record<string, DebtTerm | null>): Promise<TaxReturnView> {
    const now = new Date().toISOString()
    await this.kernel.mutate((db) => writeTerms(db, terms, now), { kind: 'tax_return' })
    return this.fetchReturn(ends)
  }
}
