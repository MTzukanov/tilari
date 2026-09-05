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
import type { TransferOpts } from './http'
import type { NewBookInput } from './newBook/createBook'
import type { FiscalPeriodSummary } from './fiscalPeriods'
import type { BookModules } from './modules/types'
import type { SessionChange } from './sessionLog'

export type AttachmentSyncState = {
  status: 'idle' | 'syncing' | 'ready' | 'error'
  loaded: number
  total: number | null
  phase?: 'download' | 'decode' | 'fetch' | 'persist'
  error?: string
}

export type SessionPersistState = {
  status: 'scheduled' | 'syncing'
  phase?: 'export' | 'ledger' | 'attachments'
  loaded: number
  total: number | null
} | null

export type LockerBook = {
  id: string
  name: string
  size: number
  sha256: string
  updated_at: string
}

export type EngineKind = 'wasm' | 'http'

export interface BookService {
  readonly modules: BookModules
  fetchHealth(): Promise<Health>
  fetchMeta(): Promise<Meta>
  setPracticeDate(iso: string): Promise<Meta>
  openKitsasFile(file: File, handle?: FileSystemFileHandle | null, opts?: TransferOpts): Promise<Meta>
  createNewBook(input: NewBookInput): Promise<Meta>
  openKitsasPath(path: string): Promise<Meta>
  fetchBalances(date: string): Promise<BalancesResponse>
  fetchOverview(date: string): Promise<OverviewResponse>
  fetchEntries(account: number, startDate: string, endDate: string): Promise<EntriesResponse>
  fetchVoucher(id: number): Promise<VoucherDetail>
  fetchVouchers(params: {
    start_date?: string
    end_date?: string
    type?: number
    status?: string
    q?: string
    huomio?: boolean
  }): Promise<{ vouchers: VoucherListItem[]; count: number }>
  fetchJournal(startDate: string, endDate: string): Promise<JournalResponse>
  fetchBrowseEntries(params: FetchBrowseEntriesParams): Promise<BrowseEntriesResponse>
  fetchAccounts(): Promise<{ accounts: Account[] }>
  fetchPartners(): Promise<{ partners: { id: number; name: string; vat_id: string }[] }>
  saveVoucher(payload: SaveVoucherInput, id?: number): Promise<VoucherDetail>
  deleteVoucher(id: number): Promise<void>
  splitBankStatement(voucherId: number, entryId: number, type?: number, entryIds?: number[]): Promise<VoucherDetail>
  fetchBankStatementOverlay(opts: {
    account: number
    startDate: string
    endDate: string
    excludeVoucherId?: number | null
  }): Promise<{ other: import('./bankStatement').StatementOtherRow[]; opening_cents: number }>
  uploadAttachment(voucherId: number, file: File): Promise<{ id: number }>
  attachmentHref(id: number): Promise<string>
  fetchAllocations(): Promise<{ allocations: Allocation[] }>
  fetchAllocation(id: number): Promise<Allocation>
  fetchAllocationBalances(
    id: number,
    startDate: string,
    endDate: string,
    includeProjects: boolean,
  ): Promise<AllocationBalances>
  fetchAllocationEntries(
    id: number,
    startDate: string,
    endDate: string,
    includeProjects: boolean,
    pnlOnly: boolean,
  ): Promise<AllocationEntries>
  fetchAllocationsSummary(
    startDate: string,
    endDate: string,
    includeProjects: boolean,
  ): Promise<AllocationsSummaryResponse>
  fetchBalanceSheetItems(startDate: string, endDate: string): Promise<BalanceSheetItemsResponse>
  fetchSettings(): Promise<SettingsResponse>
  saveSettings(patch: Record<string, string>): Promise<{ company: Record<string, string> }>
  saveAllocation(payload: SaveAllocationInput, id?: number): Promise<Allocation>
  saveFiscalPeriod(
    starts: string,
    ends: string,
    opts?: { replace_starts?: string | null; headcount?: number | null },
  ): Promise<{ periods: { starts: string; ends: string }[] }>
  fetchFiscalPeriods(): Promise<{ periods: FiscalPeriodSummary[]; lock_date: string | null }>
  saveAccount(
    number: number,
    payload: { name?: string; type?: string; iban?: string | null },
  ): Promise<Account>
  listSessionChanges(): Promise<SessionChange[]>
  recordBookSaved(params: { target: 'locker' | 'disk'; name?: string }): Promise<void>
  onSessionChange?(listener: () => void): () => void
  isDirty(): boolean
  onDirtyChange?(listener: () => void): () => void
  hasWritableLocalFile(): boolean
  canLinkWritableFile(): boolean
  linkWritableFile(): Promise<void>
  onLocalLinkChange?(listener: () => void): () => void
  saveLocal(): Promise<void>
  downloadCopy(promptForName: (suggested: string) => string | null): Promise<void>
  listLockerBooks(): Promise<LockerBook[]>
  openLockerBook(id: string, opts?: TransferOpts): Promise<Meta>
  saveToLocker(opts?: TransferOpts): Promise<void>
  closeBook(opts?: { discard?: boolean }): Promise<void>
  reloadFromSource?(): Promise<Meta>
  onAttachmentSync?(listener: (state: AttachmentSyncState) => void): () => void
  getAttachmentSyncState?(): AttachmentSyncState
  onSessionPersist?(listener: (state: SessionPersistState) => void): () => void
  getSessionPersistState?(): SessionPersistState
  flushPersistNow?(onAttProgress?: (loaded: number, total: number) => void): Promise<void>
}
