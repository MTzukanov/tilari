import { getBookService } from '../../book/engine'

export type { FiscalPeriodSummary } from '../../book/fiscalPeriods'

export function fetchFiscalPeriods() {
  return getBookService().fetchFiscalPeriods()
}

export function saveFiscalPeriod(
  starts: string,
  ends: string,
  opts?: { replace_starts?: string | null; headcount?: number | null },
) {
  return getBookService().saveFiscalPeriod(starts, ends, opts)
}
