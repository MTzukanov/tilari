/** Ledger façade. Browser wasm (default) or Node HTTP engine (ADR-016). */
import { getBookService } from './book/engine'
import type { LockerBook } from './book/service'
import type { TransferOpts } from './book/http'
import type { NewBookInput } from './book/newBook/createBook'
import type { Meta, SaveAllocationInput, SaveVoucherInput, FetchBrowseEntriesParams } from './book/types'

export type { LockerBook }
export type {
  Account,
  Allocation,
  BalanceLine,
  BalancesResponse,
  EntriesResponse,
  Entry,
  Meta,
  PaymentMethod,
  Period,
  SaveVoucherInput,
  SettingsResponse,
  VoucherDetail,
  VoucherEntry,
  BrowseEntry,
  BrowseEntriesResponse,
  FetchBrowseEntriesParams,
} from './book/types'
export type { OverviewPoint, OverviewResponse } from './book/overview'

export function fetchHealth() {
  return getBookService().fetchHealth()
}

export function fetchMeta() {
  return getBookService().fetchMeta()
}

export function setPracticeDate(iso: string) {
  return getBookService().setPracticeDate(iso)
}

export function fetchBalances(date: string) {
  return getBookService().fetchBalances(date)
}

export function fetchOverview(date: string) {
  return getBookService().fetchOverview(date)
}

export function fetchEntries(account: number, start_date: string, end_date: string) {
  return getBookService().fetchEntries(account, start_date, end_date)
}

export function fetchVoucher(id: number) {
  return getBookService().fetchVoucher(id)
}

export function fetchVouchers(params: {
  start_date?: string
  end_date?: string
  type?: number
  status?: string
  q?: string
  huomio?: boolean
}) {
  return getBookService().fetchVouchers(params)
}

export function fetchJournal(start_date: string, end_date: string) {
  return getBookService().fetchJournal(start_date, end_date)
}

export function fetchBrowseEntries(params: FetchBrowseEntriesParams) {
  return getBookService().fetchBrowseEntries(params)
}

export function fetchAccounts() {
  return getBookService().fetchAccounts()
}

export function fetchPartners() {
  return getBookService().fetchPartners()
}

export function saveVoucher(payload: SaveVoucherInput, id?: number) {
  return getBookService().saveVoucher(payload, id)
}

export function deleteVoucher(id: number) {
  return getBookService().deleteVoucher(id)
}

export function splitBankStatement(voucherId: number, entryId: number, type?: number) {
  return getBookService().splitBankStatement(voucherId, entryId, type)
}

export function uploadAttachment(voucherId: number, file: File) {
  return getBookService().uploadAttachment(voucherId, file)
}

export function attachmentHref(id: number) {
  return getBookService().attachmentHref(id)
}

export function isDirty() {
  return getBookService().isDirty()
}

export function saveLocal() {
  return getBookService().saveLocal()
}

export function downloadCopy(promptForName: (suggested: string) => string | null) {
  return getBookService().downloadCopy(promptForName)
}

export function listLockerBooks() {
  return getBookService().listLockerBooks()
}

export function openLockerBook(id: string, opts?: TransferOpts) {
  return getBookService().openLockerBook(id, opts)
}

export function saveToLocker(opts?: TransferOpts) {
  return getBookService().saveToLocker(opts)
}

export function closeBook(opts?: { discard?: boolean }) {
  return getBookService().closeBook(opts)
}

export function reloadFromSource() {
  const svc = getBookService()
  if (!svc.reloadFromSource) return Promise.reject(new Error('reload_unavailable'))
  return svc.reloadFromSource()
}

export type { SessionChange } from './book/sessionLog'

export function fetchSessionChanges() {
  return getBookService().listSessionChanges()
}

export { onAttachmentSync, getAttachmentSyncState, onSessionPersist, getSessionPersistState, flushSessionPersist, onDirtyChange, onLocalLinkChange, onSessionChange, hasWritableLocalFile, canLinkWritableFile, linkWritableFile, getBookServiceEpoch } from './book/engine'
export type { SessionPersistState } from './book/engine'
export type { AttachmentSyncState } from './book/service'

export function fetchAllocations() {
  return getBookService().fetchAllocations()
}

export function fetchAllocation(id: number) {
  return getBookService().fetchAllocation(id)
}

export function fetchAllocationBalances(
  id: number,
  start_date: string,
  end_date: string,
  include_projects: boolean,
) {
  return getBookService().fetchAllocationBalances(id, start_date, end_date, include_projects)
}

export function fetchAllocationEntries(
  id: number,
  start_date: string,
  end_date: string,
  include_projects: boolean,
  pnlOnly: boolean,
) {
  return getBookService().fetchAllocationEntries(
    id,
    start_date,
    end_date,
    include_projects,
    pnlOnly,
  )
}

export function fetchAllocationsSummary(
  start_date: string,
  end_date: string,
  include_projects: boolean,
) {
  return getBookService().fetchAllocationsSummary(start_date, end_date, include_projects)
}

export function fetchBalanceSheetItems(start_date: string, end_date: string) {
  return getBookService().fetchBalanceSheetItems(start_date, end_date)
}

export function fetchSettings() {
  return getBookService().fetchSettings()
}

export function saveSettings(patch: Record<string, string>) {
  return getBookService().saveSettings(patch)
}

export function saveAllocation(payload: SaveAllocationInput, id?: number) {
  return getBookService().saveAllocation(payload, id)
}

export function openKitsasFile(
  file: File,
  handle?: FileSystemFileHandle | null,
  opts?: TransferOpts,
): Promise<Meta> {
  return getBookService().openKitsasFile(file, handle, opts)
}

export function createNewBook(input: NewBookInput): Promise<Meta> {
  return getBookService().createNewBook(input)
}

export function openKitsasPath(path: string): Promise<Meta> {
  return getBookService().openKitsasPath(path)
}
