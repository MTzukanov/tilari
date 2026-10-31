import { computeAlerts, computeOverview, fetchCandidates, saveChanges } from './domain/overview'
import type { CompanyAlerts, CompanyChanges, CompanyOverview, DocCandidate } from './domain/types'
import type { KernelContext } from '../types'

export type CompanyQuery = { asOf?: string | null }

/** Company documents and deadlines: reads from the book, writes only the TilariData table. */
export class CompanyService {
  private kernel: KernelContext

  constructor(kernel: KernelContext) {
    this.kernel = kernel
  }

  async fetchOverview(query: CompanyQuery = {}): Promise<CompanyOverview> {
    return computeOverview(this.kernel.requireDb(), { today: this.kernel.today(), asOf: query.asOf })
  }

  /** The header's count of deadlines to act on. */
  async fetchAlerts(query: CompanyQuery = {}): Promise<CompanyAlerts> {
    return computeAlerts(this.kernel.requireDb(), { today: this.kernel.today(), asOf: query.asOf })
  }

  async fetchCandidates(all = false): Promise<DocCandidate[]> {
    return fetchCandidates(this.kernel.requireDb(), all)
  }

  async applyChanges(changes: CompanyChanges, query: CompanyQuery = {}): Promise<CompanyOverview> {
    const now = new Date().toISOString()
    await this.kernel.mutate((db) => saveChanges(db, changes, now), { kind: 'company' })
    return this.fetchOverview(query)
  }
}
