import { listPropertyDocuments } from './domain/documents'
import {
  applySetup,
  buildSetup,
  computeDetail,
  computePortfolio,
  deleteProperty,
  getPortfolioSettings,
  requireCostCentre,
  savePortfolioSettings,
  saveProperty,
} from './domain/portfolio'
import { parsePropertyDoc, propertyKey } from './domain/doc'
import { readTilariData } from '../../kernel/tilariData'
import type {
  PortfolioResponse,
  PortfolioSettings,
  PropertyDetail,
  PropertyDocuments,
  SetupApplyInput,
  SetupResponse,
} from './domain/types'
import type { KernelContext } from '../types'

export type PropertyQuery = { asOf?: string | null; targetBp?: number | null }

/** Rental objects (vuokrakohteet): reads from the ledger, writes only the TilariData table. */
export class PropertiesService {
  private kernel: KernelContext

  constructor(kernel: KernelContext) {
    this.kernel = kernel
  }

  private now(): string {
    return new Date().toISOString()
  }

  async listProperties(query: PropertyQuery = {}): Promise<PortfolioResponse> {
    return computePortfolio(this.kernel.requireDb(), { today: this.kernel.today(), asOf: query.asOf })
  }

  async fetchProperty(id: number, query: PropertyQuery = {}): Promise<PropertyDetail> {
    return computeDetail(this.kernel.requireDb(), id, {
      today: this.kernel.today(),
      asOf: query.asOf,
      targetBp: query.targetBp,
    })
  }

  async fetchPropertyDocuments(id: number, includeBank = false): Promise<PropertyDocuments> {
    const db = this.kernel.requireDb()
    const centre = requireCostCentre(db, id)
    const { doc } = parsePropertyDoc(readTilariData(db, propertyKey(id)))
    return listPropertyDocuments(db, {
      allocations: [centre.id, ...centre.child_ids],
      eraids: doc.eras.map((e) => e.eraid),
      linked: [...new Set([...(doc.doc_voucher_ids ?? []), ...(doc.sale_voucher_ids ?? [])])],
      includeBank,
    })
  }

  async fetchSetup(): Promise<SetupResponse> {
    return buildSetup(this.kernel.requireDb())
  }

  async applySetup(input: SetupApplyInput): Promise<SetupResponse> {
    const now = this.now()
    await this.kernel.mutate((db) => applySetup(db, input, now), (count) => ({
      kind: 'property_setup',
      params: { count },
    }))
    return this.fetchSetup()
  }

  async saveProperty(id: number, doc: unknown, query: PropertyQuery = {}): Promise<PropertyDetail> {
    const now = this.now()
    await this.kernel.mutate((db) => saveProperty(db, id, doc, now), { kind: 'property', params: { id } })
    return this.fetchProperty(id, query)
  }

  async deleteProperty(id: number): Promise<{ deleted: boolean }> {
    const deleted = await this.kernel.mutate((db) => deleteProperty(db, id), { kind: 'property', params: { id } })
    return { deleted }
  }

  async fetchPortfolioSettings(): Promise<PortfolioSettings> {
    return getPortfolioSettings(this.kernel.requireDb())
  }

  async savePortfolioSettings(settings: unknown): Promise<PortfolioSettings> {
    const now = this.now()
    await this.kernel.mutate((db) => savePortfolioSettings(db, settings, now), { kind: 'property_settings' })
    return this.fetchPortfolioSettings()
  }
}
