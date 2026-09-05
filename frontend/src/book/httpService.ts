import { saveKitsasAs } from '../app/open/saveKitsasAs'
import {
  getJson,
  parseHttpError,
  sendJson,
  type TransferOpts,
} from './http'
import type { NewBookInput } from './newBook/createBook'
import { getActiveLocker } from './persist/locker'
import { createHttpModules } from './httpModules'
import type { FiscalPeriodSummary } from './fiscalPeriods'
import type { BookModules } from './modules/types'
import type { BookService } from './service'
import { normalizeSessionChanges } from './sessionLog'
import type { OverviewResponse } from './overview'
import type {
  Account,
  Allocation,
  AllocationBalances,
  AllocationEntries,
  AllocationsSummaryResponse,
  BalanceSheetItemsResponse,
  BalancesResponse,
  EntriesResponse,
  Health,
  BrowseEntriesResponse,
  FetchBrowseEntriesParams,
  JournalResponse,
  Meta,
  SaveAllocationInput,
  SaveVoucherInput,
  SettingsResponse,
  VoucherDetail,
  VoucherListItem,
} from './types'
/** Node ledger client (shared TS domain). Used when tilari.engine=http. */
export class HttpBookService implements BookService {
  readonly modules: BookModules
  private lockerId: string | null = null
  private lockerEtag: string | undefined
  private cachedDirty = false
  private sessionListeners = new Set<() => void>()
  private dirtyListeners = new Set<() => void>()

  constructor() {
    this.modules = createHttpModules(
      (path, method, body) => this.writeJson(path, method, body),
      () => this.afterServerMutate(),
    )
  }

  private notifySessionChange() {
    for (const listener of this.sessionListeners) listener()
  }

  private afterServerMutate() {
    this.cachedDirty = true
    this.notifySessionChange()
    for (const listener of this.dirtyListeners) listener()
  }

  private writeJson<T>(path: string, method: string, body?: unknown): Promise<T> {
    return sendJson<T>(path, method, body).then((result) => {
      this.afterServerMutate()
      return result
    })
  }

  fetchHealth() {
    return getJson<Health>('/api/health').then((health) => {
      if (health.dirty != null) this.cachedDirty = health.dirty
      return health
    })
  }
  fetchMeta() {
    return getJson<Meta>('/api/meta')
  }
  setPracticeDate(iso: string) {
    return sendJson<Meta>('/api/practice-date', 'PUT', { date: iso })
  }
  async openKitsasFile(file: File, _handle?: FileSystemFileHandle | null, _opts?: TransferOpts) {
    this.lockerId = null
    this.lockerEtag = undefined
    this.cachedDirty = false
    const body = new FormData()
    body.append('file', file)
    const res = await fetch('/api/open', { method: 'POST', body })
    if (!res.ok) throw new Error(await parseHttpError(res))
    return res.json() as Promise<Meta>
  }
  async createNewBook(_input: NewBookInput): Promise<Meta> {
    throw new Error('create_wasm_only')
  }
  openKitsasPath(path: string) {
    if (path.startsWith('locker:')) return this.openLockerBook(path.slice(7))
    if (path.startsWith('server:')) {
      return Promise.reject(
        new Error('Server-side books cannot be reopened by path; use the file picker or locker list'),
      )
    }
    return sendJson<Meta>('/api/open-path', 'POST', { path }).then((meta) => {
      this.cachedDirty = false
      return meta
    })
  }
  fetchBalances(date: string) {
    return getJson<BalancesResponse>(`/api/balances?date=${encodeURIComponent(date)}`)
  }
  fetchOverview(date: string) {
    return getJson<OverviewResponse>(`/api/overview?date=${encodeURIComponent(date)}`)
  }
  fetchEntries(account: number, startDate: string, endDate: string) {
    const q = new URLSearchParams({
      account: String(account),
      start_date: startDate,
      end_date: endDate,
    })
    return getJson<EntriesResponse>(`/api/entries?${q}`)
  }
  fetchVoucher(id: number) {
    return getJson<VoucherDetail>(`/api/vouchers/${id}`)
  }
  fetchVouchers(params: {
    start_date?: string
    end_date?: string
    type?: number
    status?: string
    q?: string
    huomio?: boolean
  }) {
    const q = new URLSearchParams()
    if (params.start_date) q.set('start_date', params.start_date)
    if (params.end_date) q.set('end_date', params.end_date)
    if (params.type != null) q.set('type', String(params.type))
    if (params.status) q.set('status', params.status)
    if (params.q) q.set('q', params.q)
    if (params.huomio) q.set('huomio', '1')
    const suffix = q.toString() ? `?${q}` : ''
    return getJson<{ vouchers: VoucherListItem[]; count: number }>(`/api/vouchers${suffix}`)
  }
  fetchJournal(startDate: string, endDate: string) {
    const q = new URLSearchParams({ start_date: startDate, end_date: endDate })
    return getJson<JournalResponse>(`/api/journal?${q}`)
  }
  fetchBrowseEntries(params: FetchBrowseEntriesParams) {
    const q = new URLSearchParams()
    if (params.start_date) q.set('start_date', params.start_date)
    if (params.end_date) q.set('end_date', params.end_date)
    if (params.status) q.set('status', params.status)
    if (params.q) q.set('q', params.q)
    if (params.huomio) q.set('huomio', '1')
    if (params.account != null) q.set('account', String(params.account))
    const suffix = q.toString() ? `?${q}` : ''
    return getJson<BrowseEntriesResponse>(`/api/browse/entries${suffix}`)
  }
  fetchAccounts() {
    return getJson<{ accounts: Account[] }>('/api/accounts')
  }
  fetchPartners() {
    return getJson<{ partners: { id: number; name: string; vat_id: string }[] }>('/api/partners')
  }
  saveVoucher(payload: SaveVoucherInput, id?: number) {
    if (id) return this.writeJson<VoucherDetail>(`/api/vouchers/${id}`, 'PUT', payload)
    return this.writeJson<VoucherDetail>('/api/vouchers', 'POST', payload)
  }
  async deleteVoucher(id: number) {
    const res = await fetch(`/api/vouchers/${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(await res.text())
    this.afterServerMutate()
  }
  splitBankStatement(voucherId: number, entryId: number, type?: number, entryIds?: number[]) {
    return this.writeJson<VoucherDetail>(`/api/vouchers/${voucherId}/split`, 'POST', {
      entry_id: entryId,
      type,
      entry_ids: entryIds,
    })
  }
  fetchBankStatementOverlay(opts: {
    account: number
    startDate: string
    endDate: string
    excludeVoucherId?: number | null
  }) {
    const q = new URLSearchParams({
      account: String(opts.account),
      start_date: opts.startDate,
      end_date: opts.endDate,
    })
    if (opts.excludeVoucherId != null) q.set('exclude_voucher', String(opts.excludeVoucherId))
    return getJson<{
      other: import('./bankStatement').StatementOtherRow[]
      opening_cents: number
    }>(`/api/bank-statement/overlay?${q}`)
  }
  async uploadAttachment(voucherId: number, file: File) {
    const body = new FormData()
    body.append('file', file)
    const res = await fetch(`/api/vouchers/${voucherId}/attachments`, { method: 'POST', body })
    if (!res.ok) throw new Error(await res.text())
    this.afterServerMutate()
    return res.json() as Promise<{ id: number }>
  }
  async attachmentHref(id: number) {
    return `/api/attachments/${id}`
  }
  fetchAllocations() {
    return getJson<{ allocations: Allocation[] }>('/api/allocations')
  }
  fetchAllocation(id: number) {
    return getJson<Allocation>(`/api/allocations/${id}`)
  }
  fetchAllocationBalances(
    id: number,
    startDate: string,
    endDate: string,
    includeProjects: boolean,
  ) {
    const q = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
      include_projects: includeProjects ? 'true' : 'false',
    })
    return getJson<AllocationBalances>(`/api/allocations/${id}/balances?${q}`)
  }
  fetchAllocationEntries(
    id: number,
    startDate: string,
    endDate: string,
    includeProjects: boolean,
    pnlOnly: boolean,
  ) {
    const q = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
      include_projects: includeProjects ? 'true' : 'false',
      pnl_only: pnlOnly ? 'true' : 'false',
    })
    return getJson<AllocationEntries>(`/api/allocations/${id}/entries?${q}`)
  }
  fetchAllocationsSummary(startDate: string, endDate: string, includeProjects: boolean) {
    const q = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
      include_projects: includeProjects ? 'true' : 'false',
    })
    return getJson<AllocationsSummaryResponse>(`/api/allocations-summary?${q}`)
  }
  fetchBalanceSheetItems(startDate: string, endDate: string) {
    const q = new URLSearchParams({ start_date: startDate, end_date: endDate })
    return getJson<BalanceSheetItemsResponse>(`/api/balance-sheet-items?${q}`)
  }
  fetchSettings() {
    return getJson<SettingsResponse>('/api/settings')
  }
  saveSettings(patch: Record<string, string>) {
    return this.writeJson<{ company: Record<string, string> }>('/api/settings', 'PUT', patch)
  }
  saveAllocation(payload: SaveAllocationInput, id?: number) {
    if (id) return this.writeJson<Allocation>(`/api/allocations/${id}`, 'PUT', payload)
    return this.writeJson<Allocation>('/api/allocations', 'POST', payload)
  }
  saveFiscalPeriod(
    starts: string,
    ends: string,
    opts: { replace_starts?: string | null; headcount?: number | null } = {},
  ) {
    return this.writeJson<{ periods: { starts: string; ends: string }[] }>('/api/fiscal-periods', 'PUT', {
      starts,
      ends,
      ...opts,
    })
  }
  fetchFiscalPeriods() {
    return getJson<{ periods: FiscalPeriodSummary[]; lock_date: string | null }>(
      '/api/fiscal-periods',
    )
  }
  saveAccount(number: number, payload: { name?: string; type?: string; iban?: string | null }) {
    return this.writeJson<Account>(`/api/accounts/${number}`, 'PUT', payload)
  }
  listSessionChanges() {
    return getJson<{ changes: unknown }>('/api/session/changes').then((r) =>
      normalizeSessionChanges(r.changes),
    )
  }
  recordBookSaved(params: { target: 'locker' | 'disk'; name?: string }) {
    return sendJson<{ ok: boolean }>('/api/session/saved', 'POST', params).then(() => {
      this.cachedDirty = false
      this.notifySessionChange()
      for (const listener of this.dirtyListeners) listener()
    })
  }
  onSessionChange(listener: () => void) {
    this.sessionListeners.add(listener)
    listener()
    return () => this.sessionListeners.delete(listener)
  }
  isDirty() {
    return this.cachedDirty
  }
  onDirtyChange(listener: () => void) {
    this.dirtyListeners.add(listener)
    listener()
    return () => this.dirtyListeners.delete(listener)
  }
  hasWritableLocalFile() {
    return false
  }
  canLinkWritableFile() {
    return false
  }
  async linkWritableFile() {
    throw new Error('file_picker_unsupported')
  }
  onLocalLinkChange(listener: () => void) {
    listener()
    return () => undefined
  }
  async saveLocal() {
    /* server already wrote */
  }
  async downloadCopy(promptForName: (suggested: string) => string | null) {
    const meta = await this.fetchMeta()
    const res = await fetch('/api/export', { cache: 'no-store' })
    if (!res.ok) throw new Error(await parseHttpError(res))
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (!bytes.byteLength) throw new Error('empty_book')
    const name = meta.source_name || 'book.kitsas'
    await saveKitsasAs(bytes, name, promptForName)
    await this.recordBookSaved({ target: 'disk', name })
  }
  listLockerBooks() {
    return getActiveLocker().list()
  }
  async openLockerBook(id: string, opts?: TransferOpts) {
    if (!getActiveLocker().supportsHttpEngine) throw new Error('locker_http_unsupported')
    opts?.onStage?.('parse')
    type OpenLockerMeta = Meta & { locker_etag?: string; locker_attachments_etag?: string }
    const res = await sendJson<OpenLockerMeta>(
      `/api/open-locker/${encodeURIComponent(id)}`,
      'POST',
    )
    this.lockerId = id
    this.lockerEtag = res.locker_etag
    this.cachedDirty = false
    const { locker_etag: _e, locker_attachments_etag: _a, ...meta } = res
    return meta as Meta
  }
  async saveToLocker(opts: TransferOpts = {}) {
    const meta = await this.fetchMeta()
    const res = await fetch('/api/export', {
      cache: 'no-store',
      signal: opts.signal,
    })
    if (!res.ok) throw new Error(await parseHttpError(res))
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (!bytes.byteLength) throw new Error('empty_book')
    const asNew = opts.asNew ?? false
    const id = asNew ? null : this.lockerId
    const name = opts.name ?? (meta.source_name || 'book.kitsas')
    const locker = getActiveLocker()
    if (!locker.supportsHttpEngine) throw new Error('locker_http_unsupported')
    const saved = await locker.put(id, bytes, name, asNew ? undefined : this.lockerEtag, opts)
    this.lockerId = saved.id
    this.lockerEtag = saved.sha256
    await this.recordBookSaved({ target: 'locker', name })
  }
  async closeBook(_opts?: { discard?: boolean }) {
    await fetch('/api/close', { method: 'POST' }).catch(() => undefined)
    this.lockerId = null
    this.lockerEtag = undefined
    this.cachedDirty = false
  }
  async reloadFromSource() {
    const meta = await sendJson<Meta>('/api/reload', 'POST')
    this.cachedDirty = false
    this.notifySessionChange()
    for (const listener of this.dirtyListeners) listener()
    return meta
  }
}
