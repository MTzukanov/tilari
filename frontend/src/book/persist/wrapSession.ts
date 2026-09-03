/** Await a restore hook before every method on a service object. */
export function wrapSession<T extends object>(service: T, before: () => Promise<void>): T {
  return wrapSessionMethods(service, before)
}

/** Await a restore hook before selected methods (others pass through). */
export function wrapSessionMethods<T extends object>(
  service: T,
  before: () => Promise<void>,
  methods?: ReadonlySet<string>,
): T {
  return new Proxy(service, {
    get(target, prop, receiver) {
      const val = Reflect.get(target, prop, receiver)
      if (typeof val !== 'function') return val
      if (methods && !methods.has(String(prop))) return val
      return async (...args: unknown[]) => {
        await before()
        return val.apply(target, args)
      }
    },
  })
}

/** BookService methods that need OPFS restore before touching the ledger. */
export const WASM_SESSION_METHODS = new Set([
  'fetchHealth',
  'fetchMeta',
  'setPracticeDate',
  'openKitsasPath',
  'fetchBalances',
  'fetchOverview',
  'fetchEntries',
  'fetchVoucher',
  'fetchVouchers',
  'fetchJournal',
  'fetchBrowseEntries',
  'fetchAccounts',
  'fetchPartners',
  'saveVoucher',
  'deleteVoucher',
  'splitBankStatement',
  'uploadAttachment',
  'attachmentHref',
  'fetchAllocations',
  'fetchAllocation',
  'fetchAllocationBalances',
  'fetchAllocationEntries',
  'fetchAllocationsSummary',
  'fetchBalanceSheetItems',
  'fetchSettings',
  'saveSettings',
  'saveAllocation',
  'saveFiscalPeriod',
  'fetchFiscalPeriods',
  'saveAccount',
  'listSessionChanges',
  'recordBookSaved',
  'linkWritableFile',
  'saveLocal',
  'downloadCopy',
  'saveToLocker',
  'reloadFromSource',
])
