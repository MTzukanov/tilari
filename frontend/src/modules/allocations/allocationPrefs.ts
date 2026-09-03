export type ProfitMode = 'kitsas' | 'types'

export type AllocationPrefs = {
  pnlOnly: boolean
  includeProjects: boolean
  profitMode: ProfitMode
  hideEnded: boolean
}

const KEY = 'tilari.allocation-prefs'

export const DEFAULT_ALLOCATION_PREFS: AllocationPrefs = {
  pnlOnly: false,
  includeProjects: true,
  profitMode: 'types',
  hideEnded: false,
}

export function loadAllocationPrefs(): AllocationPrefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT_ALLOCATION_PREFS }
    const parsed = JSON.parse(raw) as Partial<AllocationPrefs>
    return {
      pnlOnly: Boolean(parsed.pnlOnly),
      includeProjects: parsed.includeProjects !== false,
      profitMode: parsed.profitMode === 'kitsas' ? 'kitsas' : 'types',
      hideEnded: Boolean(parsed.hideEnded),
    }
  } catch {
    return { ...DEFAULT_ALLOCATION_PREFS }
  }
}

export function saveAllocationPrefs(prefs: AllocationPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    /* ignore quota / private mode */
  }
}

/** True if the cost-centre validity window overlaps [from, to]. Missing dates count as open-ended. */
export function allocationActiveIn(
  starts: string | null | undefined,
  ends: string | null | undefined,
  from: string,
  to: string,
): boolean {
  const start = starts || '0000-01-01'
  const end = ends || '9999-12-31'
  return start <= to && end >= from
}
