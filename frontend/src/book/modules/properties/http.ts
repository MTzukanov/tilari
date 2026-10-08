import { getJson } from '../../http'
import type { WriteJson } from '../types'
import type {
  PortfolioResponse,
  PortfolioSettings,
  PropertyDetail,
  PropertyDocuments,
  SetupApplyInput,
  SetupResponse,
} from './domain/types'
import type { PropertiesService, PropertyQuery } from './service'

function queryString(query: PropertyQuery = {}, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams(extra)
  if (query.asOf) q.set('as_of', query.asOf)
  if (query.targetBp != null) q.set('target_bp', String(query.targetBp))
  const qs = q.toString()
  return qs ? `?${qs}` : ''
}

export function createPropertiesHttp(writeJson: WriteJson, _afterMutate: () => void): PropertiesService {
  return {
    listProperties(query?: PropertyQuery) {
      return getJson<PortfolioResponse>(`/api/properties${queryString(query)}`)
    },
    fetchProperty(id: number, query?: PropertyQuery) {
      return getJson<PropertyDetail>(`/api/properties/${id}${queryString(query)}`)
    },
    fetchPropertyDocuments(id: number, includeBank = false) {
      return getJson<PropertyDocuments>(`/api/properties/${id}/documents${includeBank ? '?bank=1' : ''}`)
    },
    fetchSetup() {
      return getJson<SetupResponse>('/api/properties/setup')
    },
    applySetup(input: SetupApplyInput) {
      return writeJson<SetupResponse>('/api/properties/setup', 'POST', input)
    },
    saveProperty(id: number, doc: unknown, query?: PropertyQuery) {
      return writeJson<PropertyDetail>(`/api/properties/${id}${queryString(query)}`, 'PUT', doc)
    },
    deleteProperty(id: number) {
      return writeJson<{ deleted: boolean }>(`/api/properties/${id}`, 'DELETE')
    },
    fetchPortfolioSettings() {
      return getJson<PortfolioSettings>('/api/properties/settings')
    },
    savePortfolioSettings(settings: unknown) {
      return writeJson<PortfolioSettings>('/api/properties/settings', 'PUT', settings)
    },
  } as unknown as PropertiesService
}
