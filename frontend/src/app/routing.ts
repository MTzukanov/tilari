export type VoucherVia =
  | { kind: 'account'; account: number }
  | { kind: 'allocation'; id: number }
  | { kind: 'balanceSheetItems' }
  | { kind: 'browse' }
  | { kind: 'journal' }
  | { kind: 'vat' }
  | { kind: 'fiscalPeriods'; ends: string }

export type Route =
  | { view: 'reports' }
  | { view: 'ledger'; account: number }
  | { view: 'balanceSheetItems' }
  | { view: 'allocations' }
  | { view: 'allocation'; id: number }
  | { view: 'reportsHub' }
  | { view: 'overview' }
  | { view: 'browse' }
  | { view: 'journal' }
  | { view: 'vat' }
  | { view: 'settings'; page?: 'storage' }
  | { view: 'fiscalPeriods'; wizardEnds?: string | null }
  | { view: 'help' }
  | { view: 'deferred'; module: 'billing' | 'workflow' }
  | {
      view: 'edit'
      voucherId: number | null
      type: number | null
      via: VoucherVia
      entryId: number | null
      copyFromId?: number
    }
  | {
      view: 'voucher'
      voucherId: number
      via: VoucherVia
      entryId: number | null
    }

type VoucherRef = { voucherId: number; entryId: number | null; edit: boolean }

/** `voucher/2`, `voucher/2/v/7`, `voucher/2/edit`, `voucher/2/v/7/edit` */
function parseVoucherSegment(seg: string): VoucherRef | null {
  const m = seg.match(/^voucher\/(\d+)(?:\/v\/(\d+))?(?:\/edit)?$/)
  if (!m) return null
  return {
    voucherId: Number(m[1]),
    entryId: m[2] ? Number(m[2]) : null,
    edit: /\/edit$/.test(seg),
  }
}

function voucherTail(id: number, entryId: number | null, edit = false): string {
  const entry = entryId != null ? `/v/${entryId}` : ''
  return `/voucher/${id}${entry}${edit ? '/edit' : ''}`
}

export function voucherHash(
  via: VoucherVia,
  voucherId: number,
  entryId: number | null = null,
  edit = false,
): string {
  const tail = voucherTail(voucherId, entryId, edit)
  switch (via.kind) {
    case 'account':
      return `#/account/${via.account}${tail}`
    case 'allocation':
      return `#/allocation/${via.id}${tail}`
    case 'balanceSheetItems':
      return `#/balance-sheet-items${tail}`
    case 'browse':
      return `#/browse${tail}`
    case 'journal':
      return `#/journal${tail}`
    case 'vat':
      return `#/vat${tail}`
    case 'fiscalPeriods':
      return `#/fiscal-periods/${via.ends}/closing${tail}`
  }
}

export function voucherParentHash(via: VoucherVia): string {
  switch (via.kind) {
    case 'account':
      return `#/account/${via.account}`
    case 'allocation':
      return `#/allocation/${via.id}`
    case 'balanceSheetItems':
      return '#/balance-sheet-items'
    case 'browse':
      return '#/browse'
    case 'journal':
      return '#/journal'
    case 'vat':
      return '#/vat'
    case 'fiscalPeriods':
      return `#/fiscal-periods/${via.ends}/closing`
  }
}

export function viaHighlightAccount(via: VoucherVia): number | undefined {
  return via.kind === 'account' ? via.account : undefined
}

/** Destination label for the up-control (not browser-back). */
export function voucherUpI18n(via: VoucherVia): { key: string; vars?: Record<string, string | number> } {
  switch (via.kind) {
    case 'account':
      return { key: 'up.account', vars: { number: via.account } }
    case 'allocation':
      return { key: 'up.allocation' }
    case 'balanceSheetItems':
      return { key: 'up.balanceSheetItems' }
    case 'browse':
      return { key: 'up.browse' }
    case 'journal':
      return { key: 'up.journal' }
    case 'vat':
      return { key: 'up.vat' }
    case 'fiscalPeriods':
      return { key: 'up.closing' }
  }
}

function voucherRoute(via: VoucherVia, ref: VoucherRef): Route {
  if (ref.edit) {
    return {
      view: 'edit',
      voucherId: ref.voucherId,
      type: null,
      via,
      entryId: ref.entryId,
    }
  }
  return { view: 'voucher', voucherId: ref.voucherId, via, entryId: ref.entryId }
}

/** Screens that render without an open book (file prompt stays hidden). */
export function routeAllowsNoBook(route: Route): boolean {
  return route.view === 'help' || (route.view === 'settings' && route.page === 'storage')
}

export function parseRoute(hash: string = window.location.hash): Route {
  const fiscal = hash.match(/^#\/fiscal-periods\/(\d{4}-\d{2}-\d{2})\/closing(?:\/(.+))?$/)
  if (fiscal) {
    if (!fiscal[2]) return { view: 'fiscalPeriods', wizardEnds: fiscal[1] }
    const ref = parseVoucherSegment(fiscal[2])
    if (ref) return voucherRoute({ kind: 'fiscalPeriods', ends: fiscal[1] }, ref)
  }

  const items = hash.match(/^#\/balance-sheet-items(?:\/(.+))?$/)
  if (items) {
    if (!items[1]) return { view: 'balanceSheetItems' }
    const ref = parseVoucherSegment(items[1])
    if (ref) return voucherRoute({ kind: 'balanceSheetItems' }, ref)
  }

  const allocation = hash.match(/^#\/allocation\/(\d+)(?:\/(.+))?$/)
  if (allocation) {
    if (!allocation[2]) return { view: 'allocation', id: Number(allocation[1]) }
    const ref = parseVoucherSegment(allocation[2])
    if (ref) return voucherRoute({ kind: 'allocation', id: Number(allocation[1]) }, ref)
  }

  const account = hash.match(/^#\/account\/(\d+)(?:\/(.+))?$/)
  if (account) {
    if (!account[2]) return { view: 'ledger', account: Number(account[1]) }
    const ref = parseVoucherSegment(account[2])
    if (ref) return voucherRoute({ kind: 'account', account: Number(account[1]) }, ref)
  }

  const browse = hash.match(/^#\/browse(?:\/(.+))?$/)
  if (browse) {
    if (!browse[1]) return { view: 'browse' }
    const ref = parseVoucherSegment(browse[1])
    if (ref) return voucherRoute({ kind: 'browse' }, ref)
  }

  const journal = hash.match(/^#\/journal(?:\/(.+))?$/)
  if (journal) {
    if (!journal[1]) return { view: 'journal' }
    const ref = parseVoucherSegment(journal[1])
    if (ref) return voucherRoute({ kind: 'journal' }, ref)
  }

  const vat = hash.match(/^#\/vat(?:\/(.+))?$/)
  if (vat) {
    if (!vat[1]) return { view: 'vat' }
    const ref = parseVoucherSegment(vat[1])
    if (ref) return voucherRoute({ kind: 'vat' }, ref)
  }

  const newVoucher = hash.match(/^#\/voucher\/new(?:\/(\d+))?(?:\/from\/(\d+))?$/)
  if (newVoucher) {
    return {
      view: 'edit',
      voucherId: null,
      type: newVoucher[1] ? Number(newVoucher[1]) : 100,
      via: { kind: 'browse' },
      entryId: null,
      ...(newVoucher[2] ? { copyFromId: Number(newVoucher[2]) } : {}),
    }
  }

  const bare = hash.match(/^#\/voucher\/(\d+)(?:\/v\/(\d+))?(?:\/edit)?$/)
  if (bare) {
    const ref: VoucherRef = {
      voucherId: Number(bare[1]),
      entryId: bare[2] ? Number(bare[2]) : null,
      edit: /\/edit$/.test(hash),
    }
    return voucherRoute({ kind: 'browse' }, ref)
  }

  if (hash === '#/reports') return { view: 'reportsHub' }
  if (hash === '#/overview') return { view: 'overview' }
  if (hash === '#/allocations') return { view: 'allocations' }
  if (hash === '#/settings/storage') return { view: 'settings', page: 'storage' }
  if (hash === '#/settings') return { view: 'settings' }
  if (hash === '#/fiscal-periods') return { view: 'fiscalPeriods' }
  if (hash === '#/help') return { view: 'help' }
  if (hash === '#/billing') return { view: 'deferred', module: 'billing' }
  if (hash === '#/workflow') return { view: 'deferred', module: 'workflow' }
  return { view: 'reports' }
}
