import { getJson } from '../../http'
import type { WriteJson } from '../types'
import type { CompanyAlerts, CompanyChanges, CompanyOverview, DocCandidate } from './domain/types'
import type { CompanyQuery, CompanyService } from './service'

function queryString(query: CompanyQuery = {}): string {
  return query.asOf ? `?as_of=${encodeURIComponent(query.asOf)}` : ''
}

export function createCompanyHttp(writeJson: WriteJson, _afterMutate: () => void): CompanyService {
  return {
    fetchOverview(query?: CompanyQuery) {
      return getJson<CompanyOverview>(`/api/company${queryString(query)}`)
    },
    fetchAlerts(query?: CompanyQuery) {
      return getJson<CompanyAlerts>(`/api/company/alerts${queryString(query)}`)
    },
    fetchCandidates(all = false) {
      return getJson<DocCandidate[]>(`/api/company/candidates${all ? '?all=1' : ''}`)
    },
    applyChanges(changes: CompanyChanges, query?: CompanyQuery) {
      return writeJson<CompanyOverview>(`/api/company/changes${queryString(query)}`, 'POST', changes)
    },
  } as unknown as CompanyService
}
