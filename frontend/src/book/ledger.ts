/**
 * In-process ledger session: one SqliteDb + kernel operations.
 * Feature workflows live in book/modules and attach via compose.
 */
import { getAccounts, getPeriods, getSettings, validateBook } from './access'
import { isIsoDate, isPracticeValue, wallToday } from './clock'
import {
  computeAllAllocationBalances,
  computeAllocationBalances,
  getAllocation,
  listAllocationEntries,
  listAllocations,
} from './allocations'
import { computeBalanceSheetItems } from './balanceSheetItems'
import { bankStatementMeta, splitBankStatementLine } from './bankStatement'
import { listBrowseEntries, listJournal, listPartners, listVouchers } from './browse'
import { attachModules } from './compose'
import { BookError } from './errors'
import { listFiscalPeriods, type FiscalPeriodSummary } from './fiscalPeriods'
import { updateFiscalPeriodJson } from './fiscalPeriod'
import type { BookModules, KernelContext, KernelSettings } from './modules/types'
import { attachAttachment, deleteVoucher, lockDate, saveVoucher } from './posting'
import { computeOverview } from './overview'
import { balancesWithLines, entriesWithRunning } from './reports'
import { getCompany, getPaymentMethods, putCompany, saveAccount, saveAllocation, saveFiscalPeriod } from './settings'
import { SqliteDb } from './sqlite'
import { getAttachmentMeta, getVoucher, TYPE_BANK_STATEMENT } from './vouchers'
import { SessionJournal, type MutateMeta, type SessionChange } from './sessionLog'
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

type OpenBytesOpts = {
  sourceName: string
  dbPath: string
  sessionId?: string
}

export function newLedgerId(): string {
  const c = globalThis.crypto
  if (typeof c?.randomUUID === 'function') return c.randomUUID().replaceAll('-', '')
  const bytes = new Uint8Array(16)
  if (typeof c?.getRandomValues === 'function') c.getRandomValues(bytes)
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

class LedgerKernel implements KernelContext {
  protected db: SqliteDb | null = null
  protected sourceName = ''
  protected dbPath = ''
  protected sessionId = newLedgerId()
  protected dirty = false
  /** Simulated date while practice is on; ignored otherwise. Not stored in SQLite. */
  protected practiceDate: string | null = null
  private dirtyListeners = new Set<() => void>()
  private sessionJournal = new SessionJournal()

  /** Override in browser to persist OPFS (etc.) after each write. */
  protected async afterMutate(): Promise<void> {}

  /** Override to map BookError → UI Error, etc. */
  protected mapMutateError(err: unknown): never {
    throw err
  }

  requireDb(): SqliteDb {
    if (!this.db) throw new BookError('no_book', 409)
    return this.db
  }

  isOpen(): boolean {
    return Boolean(this.db)
  }

  async openBytes(bytes: Uint8Array, opts: OpenBytesOpts): Promise<Meta> {
    const db = await SqliteDb.fromBytes(bytes)
    validateBook(db)
    this.db?.close()
    this.db = db
    this.sourceName = opts.sourceName
    this.dbPath = opts.dbPath
    this.sessionId = opts.sessionId ?? newLedgerId()
    this.practiceDate = null
    this.setDirty(false)
    this.sessionJournal.clear()
    return this.buildMeta()
  }

  closeLedger(): void {
    this.db?.close()
    this.db = null
    this.sourceName = ''
    this.dbPath = ''
    this.sessionId = newLedgerId()
    this.practiceDate = null
    this.setDirty(false)
    this.sessionJournal.clear()
  }

  isPractice(): boolean {
    if (!this.db) return false
    return isPracticeValue(getSettings(this.db, ['Harjoitus']).Harjoitus)
  }

  today(): string {
    if (this.isPractice() && this.practiceDate) return this.practiceDate
    return wallToday()
  }

  async setPracticeDate(iso: string): Promise<Meta> {
    if (!isIsoDate(iso)) throw new BookError('invalid_date', 400)
    if (this.isPractice()) this.practiceDate = iso
    return this.buildMeta()
  }

  protected setDirty(value: boolean): void {
    if (this.dirty === value) return
    this.dirty = value
    this.emitDirtyChange()
  }

  protected emitDirtyChange(): void {
    for (const listener of this.dirtyListeners) listener()
  }

  onDirtyChange(listener: () => void): () => void {
    this.dirtyListeners.add(listener)
    return () => this.dirtyListeners.delete(listener)
  }

  exportBytes(): Uint8Array {
    return this.requireDb().export()
  }

  async mutate<T>(
    fn: (db: SqliteDb) => T | Promise<T>,
    meta: MutateMeta | ((result: T) => MutateMeta),
  ): Promise<T> {
    const db = this.requireDb()
    try {
      const result = await fn(db)
      this.sessionJournal.record(typeof meta === 'function' ? meta(result) : meta)
      this.setDirty(true)
      await this.afterMutate()
      return result
    } catch (err) {
      this.mapMutateError(err)
    }
  }

  listSessionChanges(): Promise<SessionChange[]> {
    return Promise.resolve(this.sessionJournal.listChanges())
  }

  onSessionChange(listener: () => void): () => void {
    return this.sessionJournal.onChange(listener)
  }

  protected replaceSessionChanges(changes: SessionChange[]): void {
    this.sessionJournal.replace(changes)
  }

  protected snapshotSessionChanges(): SessionChange[] {
    return this.sessionJournal.snapshot()
  }

  /** Record that pending edits were written to external storage; clears dirty. */
  async recordBookSaved(params: { target: 'locker' | 'disk'; name?: string }): Promise<void> {
    this.sessionJournal.record({
      kind: 'book_saved',
      params: params.name
        ? { target: params.target, name: params.name }
        : { target: params.target },
    })
    this.setDirty(false)
    await this.afterMutate()
  }

  buildMeta(): Meta {
    const db = this.requireDb()
    const settings = getSettings(db, [
      'Nimi',
      'Ytunnus',
      'Harjoitus',
      'KpVersio',
      'KitsasVersio',
      'TilitPaatetty',
    ])
    const periods = getPeriods(db)
    return {
      name: settings.Nimi || '',
      business_id: settings.Ytunnus || '',
      practice: isPracticeValue(settings.Harjoitus),
      book_date: this.today(),
      schema_version: settings.KpVersio || '',
      kitsas_version: settings.KitsasVersio || '',
      lock_date: settings.TilitPaatetty || null,
      db_path: this.dbPath,
      source_name: this.sourceName,
      session_id: this.sessionId,
      periods: periods.map((p) => ({ starts: p.starts, ends: p.ends })),
    }
  }

  voucherDetail(id: number): VoucherDetail {
    const data = getVoucher(this.requireDb(), id)
    if (!data) throw new BookError(`Tosite ${id} not found`, 404)
    return this.wrapVoucher(data)
  }

  getSettings(): KernelSettings {
    const db = this.requireDb()
    return { company: getCompany(db), lock_date: lockDate(db) }
  }

  lockDate(): string | null {
    return lockDate(this.requireDb())
  }

  wrapVoucher(data: ReturnType<typeof getVoucher>): VoucherDetail {
    if (!data) throw new BookError('Tosite not found', 404)
    const detail = data as VoucherDetail
    if (detail.type === TYPE_BANK_STATEMENT) {
      const meta = bankStatementMeta(data)
      detail.bank_statement = {
        start_date: meta.start_date,
        end_date: meta.end_date,
        account: meta.account == null ? undefined : Number(meta.account),
      }
    }
    return detail
  }

  health(extra: Record<string, unknown> = {}): Health & Record<string, unknown> {
    return {
      ok: true,
      opened: Boolean(this.db),
      session_id: this.sessionId,
      db_path: this.db ? this.dbPath : null,
      source_name: this.db ? this.sourceName : null,
      dirty: this.dirty,
      ...extra,
    }
  }

  async fetchHealth(): Promise<Health> {
    return this.health()
  }

  async fetchMeta(): Promise<Meta> {
    return this.buildMeta()
  }

  async fetchBalances(date: string): Promise<BalancesResponse> {
    return balancesWithLines(this.requireDb(), date)
  }

  async fetchOverview(date: string): Promise<OverviewResponse> {
    return computeOverview(this.requireDb(), date)
  }

  async fetchEntries(account: number, startDate: string, endDate: string): Promise<EntriesResponse> {
    return entriesWithRunning(this.requireDb(), account, startDate, endDate)
  }

  async fetchVoucher(id: number): Promise<VoucherDetail> {
    return this.voucherDetail(id)
  }

  async fetchVouchers(params: {
    start_date?: string
    end_date?: string
    type?: number
    status?: string
    q?: string
    huomio?: boolean
  }): Promise<{ vouchers: VoucherListItem[]; count: number }> {
    const vouchers = listVouchers(this.requireDb(), {
      startDate: params.start_date,
      endDate: params.end_date,
      type: params.type,
      status: params.status,
      q: params.q,
      huomio: params.huomio,
    })
    return { vouchers, count: vouchers.length }
  }

  async fetchJournal(startDate: string, endDate: string): Promise<JournalResponse> {
    const entries = listJournal(this.requireDb(), startDate, endDate)
    return { entries, count: entries.length }
  }

  async fetchBrowseEntries(params: FetchBrowseEntriesParams): Promise<BrowseEntriesResponse> {
    const result = listBrowseEntries(this.requireDb(), {
      startDate: params.start_date,
      endDate: params.end_date,
      status: params.status,
      q: params.q,
      huomio: params.huomio,
      account: params.account,
    })
    return { ...result, count: result.entries.length }
  }

  async fetchAccounts(): Promise<{ accounts: Account[] }> {
    return { accounts: getAccounts(this.requireDb()) }
  }

  async fetchPartners(): Promise<{ partners: { id: number; name: string; vat_id: string }[] }> {
    return { partners: listPartners(this.requireDb()) }
  }

  async saveVoucher(payload: SaveVoucherInput, id?: number): Promise<VoucherDetail> {
    const title = String(payload.title ?? '')
    const saved = await this.mutate((db) => saveVoucher(db, payload, id), (savedId) => ({
      kind: id != null ? 'voucher_update' : 'voucher_create',
      params: { id: savedId, title },
    }))
    return this.wrapVoucher(getVoucher(this.requireDb(), saved))
  }

  async deleteVoucher(id: number): Promise<void> {
    await this.mutate((db) => {
      deleteVoucher(db, id)
    }, { kind: 'voucher_delete', params: { id } })
  }

  async splitBankStatement(voucherId: number, entryId: number, type?: number): Promise<VoucherDetail> {
    const newId = await this.mutate(
      (db) => splitBankStatementLine(db, voucherId, entryId, type),
      (createdId) => ({ kind: 'bank_split', params: { voucherId, entryId, newId: createdId } }),
    )
    return this.wrapVoucher(getVoucher(this.requireDb(), newId))
  }

  async uploadAttachmentBytes(
    voucherId: number,
    file: { name: string; type: string; data: Uint8Array },
    opts: { lean: boolean } = { lean: false },
  ): Promise<{ id: number; sha: string }> {
    return this.mutate(
      async (db) => {
        const attached = await attachAttachment(db, voucherId, {
          name: file.name || 'attachment',
          type: file.type || 'application/octet-stream',
          data: file.data,
          lean: opts.lean,
        })
        return { id: attached.id, sha: attached.sha }
      },
      (attached) => ({
        kind: 'attachment_add',
        params: { voucherId, name: file.name || 'attachment', attachmentId: attached.id },
      }),
    )
  }

  attachmentMeta(id: number) {
    return getAttachmentMeta(this.requireDb(), id)
  }

  async fetchAllocations(): Promise<{ allocations: Allocation[] }> {
    return { allocations: listAllocations(this.requireDb()) }
  }

  async fetchAllocation(id: number): Promise<Allocation> {
    const item = getAllocation(this.requireDb(), id)
    if (!item) throw new BookError(`Kohdennus ${id} not found`, 404)
    return item
  }

  async fetchAllocationBalances(
    id: number,
    startDate: string,
    endDate: string,
    includeProjects: boolean,
  ): Promise<AllocationBalances> {
    const item = await this.fetchAllocation(id)
    return {
      ...item,
      ...computeAllocationBalances(this.requireDb(), id, startDate, endDate, includeProjects),
    }
  }

  async fetchAllocationEntries(
    id: number,
    startDate: string,
    endDate: string,
    includeProjects: boolean,
    pnlOnly: boolean,
  ): Promise<AllocationEntries> {
    const item = await this.fetchAllocation(id)
    const entries = listAllocationEntries(this.requireDb(), id, startDate, endDate, {
      includeProjects,
      pnlOnly,
    })
    return {
      ...item,
      start_date: startDate,
      end_date: endDate,
      include_projects: includeProjects,
      pnl_only: pnlOnly,
      entries,
      debit_sum_cents: entries.reduce((s, e) => s + (e.debit_cents || 0), 0),
      credit_sum_cents: entries.reduce((s, e) => s + (e.credit_cents || 0), 0),
      count: entries.length,
    }
  }

  async fetchAllocationsSummary(
    startDate: string,
    endDate: string,
    includeProjects: boolean,
  ): Promise<AllocationsSummaryResponse> {
    return {
      start_date: startDate,
      end_date: endDate,
      allocations: computeAllAllocationBalances(this.requireDb(), startDate, endDate, includeProjects),
    }
  }

  async fetchBalanceSheetItems(startDate: string, endDate: string): Promise<BalanceSheetItemsResponse> {
    return computeBalanceSheetItems(this.requireDb(), startDate, endDate)
  }

  async fetchSettings(): Promise<SettingsResponse> {
    const db = this.requireDb()
    return {
      company: getCompany(db),
      periods: getPeriods(db).map((p) => ({ starts: p.starts, ends: p.ends })),
      lock_date: lockDate(db),
      payment_methods: getPaymentMethods(db),
    }
  }

  async saveSettings(patch: Record<string, string>): Promise<{ company: Record<string, string> }> {
    const { TilitPaatetty: _lock, ...allowed } = patch
    const wasPractice = this.isPractice()
    const company = await this.mutate((db) => putCompany(db, allowed), { kind: 'settings' })
    const nowPractice = this.isPractice()
    if (nowPractice && !wasPractice) this.practiceDate = wallToday()
    if (!nowPractice) this.practiceDate = null
    return { company }
  }

  async saveAllocation(payload: SaveAllocationInput, id?: number): Promise<Allocation> {
    const savedId = await this.mutate(
      (db) =>
        saveAllocation(db, {
          allocationId: id,
          name: payload.name,
          type: payload.type,
          parentId: payload.parent_id ?? null,
          starts: payload.starts ?? null,
          ends: payload.ends ?? null,
        }),
      (allocationId) => ({
        kind: 'allocation',
        params: { id: allocationId, name: payload.name },
      }),
    )
    return await this.fetchAllocation(savedId)
  }

  async saveFiscalPeriod(
    starts: string,
    ends: string,
    opts: { replace_starts?: string | null; headcount?: number | null } = {},
  ): Promise<{ periods: { starts: string; ends: string }[] }> {
    await this.mutate(
      (db) => {
        saveFiscalPeriod(db, starts, ends, opts.replace_starts ?? null)
        if (opts.headcount !== undefined) {
          updateFiscalPeriodJson(db, starts, { henkilosto: opts.headcount ?? undefined })
        }
      },
      { kind: 'fiscal_period', params: { starts, ends } },
    )
    return {
      periods: getPeriods(this.requireDb()).map((p) => ({ starts: p.starts, ends: p.ends })),
    }
  }

  async fetchFiscalPeriods(): Promise<{ periods: FiscalPeriodSummary[]; lock_date: string | null }> {
    const db = this.requireDb()
    return { periods: listFiscalPeriods(db, this.today()), lock_date: lockDate(db) }
  }

  async saveAccount(
    number: number,
    payload: { name?: string; type?: string; iban?: string | null },
  ): Promise<Account> {
    await this.mutate((db) => saveAccount(db, number, payload), {
      kind: 'account',
      params: { number, name: payload.name ?? '' },
    })
    const item = getAccounts(this.requireDb()).find((a) => a.number === number)
    return (
      item || {
        number,
        type: payload.type || '',
        iban: payload.iban ?? null,
        name: payload.name || '',
      }
    )
  }

  isDirty(): boolean {
    return this.dirty
  }
}

/** Kernel session plus typed feature modules. Feature APIs live on `modules`. */
export class Ledger extends LedgerKernel {
  protected composed: BookModules = attachModules(this)

  get modules(): BookModules {
    return this.composed
  }
}
