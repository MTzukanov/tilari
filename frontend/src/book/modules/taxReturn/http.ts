import { getJson } from '../../http'
import type { WriteJson } from '../types'
import type { Target } from './domain/mapping'
import type { DebtTerm, TaxReturnInputs, TaxReturnView } from './domain/types'
import type { TaxReturnService } from './service'

function endsQuery(ends: string): string {
  return `?ends=${encodeURIComponent(ends)}`
}

export function createTaxReturnHttp(writeJson: WriteJson, _afterMutate: () => void): TaxReturnService {
  return {
    fetchReturn(ends: string) {
      return getJson<TaxReturnView>(`/api/tax-return${endsQuery(ends)}`)
    },
    saveInputs(ends: string, inputs: TaxReturnInputs) {
      return writeJson<TaxReturnView>(`/api/tax-return/inputs${endsQuery(ends)}`, 'POST', inputs)
    },
    saveMapping(ends: string, accounts: Record<string, Target | null>) {
      return writeJson<TaxReturnView>(`/api/tax-return/mapping${endsQuery(ends)}`, 'POST', accounts)
    },
    saveTerms(ends: string, terms: Record<string, DebtTerm | null>) {
      return writeJson<TaxReturnView>(`/api/tax-return/terms${endsQuery(ends)}`, 'POST', terms)
    },
  } as unknown as TaxReturnService
}
