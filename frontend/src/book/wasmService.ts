/**
 * Browser BookService: Ledger + OPFS / file picker / locker I/O.
 */
import { saveKitsasAs } from '../app/open/saveKitsasAs'
import { extractAttachmentsFromDb, packAttachmentsIntoDb } from './attachments'
import { attachmentPackSha, decodeAttachmentPack } from './attPack'
import { AttachmentStore, SHA_RE, sweepUnreferencedBlobs } from './blobStore'
import { BookError } from './errors'
import type { TransferOpts } from './http'
import { buildNewBook, kitsasFileName, type NewBookInput } from './newBook/createBook'
import { Ledger, newLedgerId } from './ledger'
import type { BookModules } from './modules/types'
import { OpfsPersistScheduler } from './persist/OpfsPersistScheduler'
import { getActiveLocker } from './persist/locker'
import { wrapSession } from './persist/wrapSession'
import { lockerUploadPlan } from './lockerSave'
import { loadBookSession } from '../app/open/lastBook'
import {
  opfsLoadForSession,
  opfsLoadLatest,
  opfsLoadOriginal,
  opfsRemove,
  opfsSaveOriginal,
  opfsSaveWorking,
  type OpfsMeta,
} from './opfs'
import { deleteVoucher as deleteVoucherRow } from './posting'
import { readFileBytes } from './readFileBytes'
import type { AttachmentSyncState, BookService, SessionPersistState } from './service'
import type { Meta } from './types'
import type { SqliteDb } from './sqlite'

const LARGE = 50 * 1024 * 1024
const PERSIST_DEBOUNCE_MS = 1500

export type AttachmentSyncListener = (state: AttachmentSyncState) => void
export type SessionPersistListener = (state: SessionPersistState) => void

export class WasmBookService extends Ledger implements BookService {
  private bookId = ''
  private attachmentsDirty = false
  private backupDone = false
  private lockerId: string | undefined
  private etag: string | undefined
  private attachmentsEtag: string | undefined
  private largeFile = false
  private fileHandle: FileSystemFileHandle | null = null
  private blobUrls = new Map<number, string>()
  private store = new AttachmentStore()
  private syncAbort: AbortController | null = null
  private syncState: AttachmentSyncState = { status: 'idle', loaded: 0, total: null }
  private syncListeners = new Set<AttachmentSyncListener>()
  private linkListeners = new Set<() => void>()
  private persistListeners = new Set<SessionPersistListener>()
  private sessionPersist: SessionPersistState = null
  private persistScheduler = new OpfsPersistScheduler(PERSIST_DEBOUNCE_MS, () => this.runScheduledPersist())
  private persistInFlight: Promise<void> | null = null
  private persistGeneration = 0
  private restoreStarted = false
  private skipRestore = false
  private attSyncPersistProgress: ((loaded: number, total: number) => void) | null = null
  private restored: Promise<void> = Promise.resolve()

  constructor() {
    super()
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', () => {
        void this.flushPersistNow()
      })
    }
  }

  protected override mapMutateError(err: unknown): never {
    if (err instanceof BookError) throw new Error(err.message)
    throw err
  }

  protected override async afterMutate(): Promise<void> {
    this.schedulePersist()
  }

  onSessionPersist(listener: SessionPersistListener): () => void {
    this.persistListeners.add(listener)
    listener(this.sessionPersist)
    return () => this.persistListeners.delete(listener)
  }

  getSessionPersistState(): SessionPersistState {
    return this.sessionPersist
  }

  private emitSessionPersist(state: SessionPersistState): void {
    this.sessionPersist = state
    for (const listener of this.persistListeners) listener(state)
  }

  private schedulePersist(): void {
    this.emitSessionPersist({ status: 'scheduled', loaded: 0, total: null })
    this.persistScheduler.schedule()
  }

  private async runScheduledPersist(): Promise<void> {
    await this.flushPersistNow()
  }

  override get modules(): BookModules {
    return Object.fromEntries(
      (Object.keys(this.composed) as (keyof BookModules)[]).map((id) => [
        id,
        wrapSession(this.composed[id], () => this.ensureRestored()),
      ]),
    ) as BookModules
  }

  async flushPersistNow(onAttProgress?: (loaded: number, total: number) => void): Promise<void> {
    this.persistScheduler.cancel()
    const gen = this.persistGeneration
    while (gen === this.persistGeneration) {
      if (this.persistInFlight) {
        await this.persistInFlight
        continue
      }
      const pending = this.runPersist(onAttProgress)
      this.persistInFlight = pending
      try {
        await pending
      } finally {
        if (this.persistInFlight === pending) this.persistInFlight = null
      }
      return
    }
  }

  /** Await OPFS restore. Used by engine session wrap and module proxies. */
  prepareSession(): Promise<void> {
    return this.ensureRestored()
  }

  /** Start OPFS restore once; no-ops when opening a new file replaces the session. */
  private ensureRestored(): Promise<void> {
    if (this.skipRestore) return Promise.resolve()
    if (!this.restoreStarted) {
      this.restoreStarted = true
      this.restored = this.restore()
    }
    return this.restored
  }

  /** Stop background work; used when this instance is replaced or book is discarded. */
  dispose(): void {
    this.skipRestore = true
    this.abortSessionWork()
    this.setSyncState({ status: 'idle', loaded: 0, total: null })
    this.emitSessionPersist(null)
  }

  private async snapshotOriginal(): Promise<void> {
    if (this.backupDone || !this.db) return
    await opfsSaveOriginal(this.bookId, this.requireDb().export())
    this.backupDone = true
  }

  private setAttachmentsDirty(value: boolean): void {
    if (this.attachmentsDirty === value) return
    this.attachmentsDirty = value
    this.emitDirtyChange()
  }

  private clearAllDirty(): void {
    const had = this.dirty || this.attachmentsDirty
    this.dirty = false
    this.attachmentsDirty = false
    if (had) this.emitDirtyChange()
  }

  onAttachmentSync(listener: AttachmentSyncListener): () => void {
    this.syncListeners.add(listener)
    listener(this.syncState)
    return () => this.syncListeners.delete(listener)
  }

  onLocalLinkChange(listener: () => void): () => void {
    this.linkListeners.add(listener)
    listener()
    return () => this.linkListeners.delete(listener)
  }

  private emitLocalLinkChange(): void {
    for (const listener of this.linkListeners) listener()
  }

  hasWritableLocalFile(): boolean {
    return this.fileHandle != null
  }

  canLinkWritableFile(): boolean {
    return typeof window !== 'undefined' && 'showOpenFilePicker' in window
  }

  async linkWritableFile(): Promise<void> {
    if (!this.canLinkWritableFile()) throw new Error('file_picker_unsupported')
    const [handle] = await window.showOpenFilePicker!({
      types: [{ description: 'Kitsas', accept: { 'application/octet-stream': ['.kitsas'] } }],
      multiple: false,
      mode: 'readwrite',
    })
    const file = await handle.getFile()
    if (!file.name.toLowerCase().endsWith('.kitsas')) throw new Error('kitsas_required')
    const perm = await handle.requestPermission({ mode: 'readwrite' })
    if (perm !== 'granted') throw new Error('permission_denied')
    this.fileHandle = handle
    if (file.name !== this.sourceName) this.sourceName = file.name
    this.emitLocalLinkChange()
    await this.flushPersistNow()
  }

  getAttachmentSyncState(): AttachmentSyncState {
    return this.syncState
  }

  private setSyncState(next: AttachmentSyncState) {
    this.syncState = next
    for (const listener of this.syncListeners) listener(next)
  }

  private setAttReady(): void {
    const bytes = this.store.byteSize()
    this.setSyncState({ status: 'ready', loaded: bytes, total: bytes > 0 ? bytes : null })
  }

  private beginAttPersistProgress(): void {
    if (!this.store.opfsNeedsPersist()) return
    const total = this.store.byteSize()
    if (total <= 0) return
    this.attSyncPersistProgress = (loaded, t) => {
      this.setSyncState({ status: 'syncing', loaded, total: t, phase: 'persist' })
    }
    // Do not mark syncing yet — wait until attachment bytes are actually writing.
  }

  private endAttPersistProgress(): void {
    this.attSyncPersistProgress = null
  }

  private abortSessionWork(): void {
    this.persistGeneration += 1
    this.persistScheduler.cancel()
    this.endAttPersistProgress()
    this.emitSessionPersist(null)
    this.syncAbort?.abort()
    this.syncAbort = null
  }

  private async restore(): Promise<void> {
    if (this.skipRestore) return
    const session = loadBookSession()
    const saved =
      (session &&
        (await opfsLoadForSession({
          sessionId: session.sessionId,
          dbPath: session.path,
        }))) ||
      (await opfsLoadLatest())
    if (!saved || this.skipRestore) return
    const gen = this.persistGeneration
    try {
      await this.adopt(saved.bytes, {
        ...saved.meta,
        attachmentsDirty: saved.meta.attachmentsDirty ?? false,
        attachmentsEtag: saved.meta.attachmentsEtag,
        attachmentSync: saved.meta.attachmentSync ?? 'idle',
      })
      if (this.skipRestore || gen !== this.persistGeneration) return
      await this.hydrateBlobs()
      if (this.skipRestore || gen !== this.persistGeneration) return
      const lean = await this.leanify(false)
      if (this.skipRestore || gen !== this.persistGeneration) return
      if (!saved.meta.backupDone) await this.snapshotOriginal()
      if (this.skipRestore || gen !== this.persistGeneration) return
      // Only rewrite OPFS when leanify actually changed the store; otherwise the
      // working copy + attachments are already on disk from the previous session.
      if (lean.extracted > 0 || this.store.opfsNeedsPersist()) {
        await this.flushPersistNow()
      }
      if (this.skipRestore || gen !== this.persistGeneration) return
      if (saved.meta.lockerId && (saved.meta.attachmentSync === 'syncing' || this.missingShas().length)) {
        void this.backgroundSyncAttachments(saved.meta.lockerId)
      } else {
        this.setAttReady()
        await this.sweepBlobs()
      }
    } catch {
      if (!this.skipRestore && gen === this.persistGeneration) this.db = null
    }
  }

  private liiteShas(): string[] {
    if (!this.db) return []
    const rows = this.db.all<{ sha: string | null }>('SELECT sha FROM Liite WHERE sha IS NOT NULL')
    return rows.map((r) => r.sha!).filter((sha): sha is string => Boolean(sha) && SHA_RE.test(sha))
  }

  private missingShas(): string[] {
    return this.liiteShas().filter((sha) => !this.store.has(sha))
  }

  private async hydrateBlobs(): Promise<void> {
    await this.store.migrateAllLegacy()
    await this.store.loadShas(this.liiteShas())
  }

  private async sweepBlobs(): Promise<void> {
    await sweepUnreferencedBlobs(this.liiteShas())
  }

  private async adopt(bytes: Uint8Array, meta: OpfsMeta, handle?: FileSystemFileHandle | null) {
    this.syncAbort?.abort()
    this.syncAbort = null
    this.closeBlobs()
    this.store.clear()
    this.store.bindBook(meta.bookId)
    await this.openBytes(bytes, {
      sourceName: meta.sourceName,
      dbPath: meta.dbPath,
      sessionId: meta.sessionId,
    })
    this.bookId = meta.bookId
    this.dirty = meta.dirty
    this.attachmentsDirty = meta.attachmentsDirty ?? false
    this.emitDirtyChange()
    this.backupDone = meta.backupDone
    this.lockerId = meta.lockerId
    this.etag = meta.etag
    this.attachmentsEtag = meta.attachmentsEtag
    this.largeFile = Boolean(meta.largeFile)
    this.fileHandle = handle ?? null
    this.emitLocalLinkChange()
    if (meta.sessionChanges?.length) {
      this.replaceSessionChanges(meta.sessionChanges)
    }
  }

  private opfsMeta(): OpfsMeta {
    return {
      bookId: this.bookId,
      sourceName: this.sourceName,
      dbPath: this.dbPath,
      sessionId: this.sessionId,
      dirty: this.dirty,
      attachmentsDirty: this.attachmentsDirty,
      backupDone: this.backupDone,
      lockerId: this.lockerId,
      etag: this.etag,
      attachmentsEtag: this.attachmentsEtag,
      largeFile: this.largeFile,
      attachmentSync: this.syncState.status,
      attachmentShas: this.store.keys(),
      sessionChanges: this.snapshotSessionChanges(),
    }
  }

  private async runPersist(onAttProgress?: (loaded: number, total: number) => void): Promise<void> {
    if (!this.db) {
      this.emitSessionPersist(null)
      return
    }
    const gen = this.persistGeneration
    const attProgress = Boolean(this.attSyncPersistProgress) || Boolean(onAttProgress)
    try {
      if (!attProgress) {
        this.emitSessionPersist({ status: 'syncing', phase: 'export', loaded: 0, total: null })
      }
      const bytes = this.db.export()
      if (gen !== this.persistGeneration) return
      if (!attProgress) {
        this.emitSessionPersist({
          status: 'syncing',
          phase: 'ledger',
          loaded: 0,
          total: bytes.byteLength,
        })
      }
      await opfsSaveWorking(this.opfsMeta(), bytes)
      if (gen !== this.persistGeneration) return
      if (!attProgress) {
        this.emitSessionPersist({
          status: 'syncing',
          phase: 'ledger',
          loaded: bytes.byteLength,
          total: bytes.byteLength,
        })
      }
      if (this.store.opfsNeedsPersist()) {
        const total = this.store.byteSize()
        if (!this.attSyncPersistProgress && !onAttProgress) {
          this.emitSessionPersist({ status: 'syncing', phase: 'attachments', loaded: 0, total })
        }
        await this.store.persist(
          (loaded, t) => {
            if (gen !== this.persistGeneration) return
            this.attSyncPersistProgress?.(loaded, t)
            onAttProgress?.(loaded, t)
            if (!this.attSyncPersistProgress && !onAttProgress) {
              this.emitSessionPersist({ status: 'syncing', phase: 'attachments', loaded, total: t })
            }
          },
          () => gen !== this.persistGeneration,
        )
      }
    } finally {
      if (gen === this.persistGeneration) this.emitSessionPersist(null)
    }
  }

  private async leanify(trackDirty = true): Promise<{ extracted: number; vacuumed: boolean }> {
    const db = this.requireDb()
    const result = await extractAttachmentsFromDb(db, this.store)
    if (trackDirty) {
      if (result.extracted > 0) {
        this.setDirty(true)
        this.setAttachmentsDirty(true)
      } else if (result.vacuumed) {
        this.setDirty(true)
      }
    }
    return result
  }

  private async backgroundSyncAttachments(lockerId: string) {
    this.syncAbort?.abort()
    const ac = new AbortController()
    this.syncAbort = ac
    this.setSyncState({ status: 'syncing', loaded: 0, total: null, phase: 'download' })
    try {
      const locker = getActiveLocker()
      if (locker.getAttachments) {
        const { pack, etag } = await locker.getAttachments(lockerId, {
          signal: ac.signal,
          onProgress: (p) =>
            this.setSyncState({
              status: 'syncing',
              loaded: p.loaded,
              total: p.total,
              phase: 'download',
            }),
        })
        if (ac.signal.aborted) return
        const downloaded = pack.byteLength
        this.setSyncState({
          status: 'syncing',
          loaded: downloaded,
          total: downloaded,
          phase: 'decode',
        })
        const blobs = decodeAttachmentPack(pack)
        this.store.merge(blobs)
        this.attachmentsEtag = etag || (await attachmentPackSha(pack))
      }
      const missing = this.missingShas()
      let fetchedBytes = 0
      for (const sha of missing) {
        if (ac.signal.aborted) return
        const data = await locker.getAttachmentBlob(lockerId, sha, {
          signal: ac.signal,
          onProgress: (p) =>
            this.setSyncState({
              status: 'syncing',
              loaded: fetchedBytes + p.loaded,
              total: p.total ? fetchedBytes + p.total : null,
              phase: 'fetch',
            }),
        })
        this.store.put(sha, data)
        fetchedBytes += data.byteLength
      }
      // Second phase: write blobs into this browser's OPFS (survives refresh).
      this.setSyncState({
        status: 'syncing',
        loaded: 0,
        total: this.store.byteSize(),
        phase: 'persist',
      })
      // Let the status bar paint "Kirjoitetaan selaimeen" before OPFS write.
      await new Promise<void>((resolve) => {
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve())
        else setTimeout(resolve, 0)
      })
      await this.store.persist((loaded, total) => {
        this.setSyncState({ status: 'syncing', loaded, total, phase: 'persist' })
      })
      this.setAttReady()
      await this.flushPersistNow()
      await this.sweepBlobs()
    } catch (err) {
      if (ac.signal.aborted) return
      const msg = err instanceof Error ? err.message : String(err)
      this.setSyncState({ status: 'error', loaded: 0, total: null, error: msg })
    }
  }

  async openKitsasFile(file: File, handle?: FileSystemFileHandle | null, opts: TransferOpts = {}) {
    // Opening a new file replaces any OPFS session — never restore+rewrite the old one first.
    this.skipRestore = true
    this.abortSessionWork()
    this.setSyncState({ status: 'idle', loaded: 0, total: null })
    this.emitSessionPersist(null)
    if (!file.name.toLowerCase().endsWith('.kitsas')) {
      throw new Error('File must have a .kitsas extension')
    }
    const bytes = await readFileBytes(file, {
      ...opts,
      onProgress: (p) => {
        opts.onStage?.('transfer')
        opts.onProgress?.(p)
      },
    })
    if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    opts.onStage?.('parse')
    const bookId = newLedgerId()
    const sessionId = newLedgerId()
    await this.adopt(
      bytes,
      {
        bookId,
        sourceName: file.name,
        dbPath: `local:${bookId}/${file.name}`,
        sessionId,
        dirty: false,
        attachmentsDirty: false,
        backupDone: false,
        largeFile: (file.size || bytes.byteLength) > LARGE,
      },
      handle,
    )
    await this.hydrateBlobs()
    await this.leanify(false)
    const attTotal = this.store.opfsNeedsPersist() ? this.store.byteSize() : 0
    if (attTotal > 0) {
      opts.onStage?.('attachments')
      opts.onProgress?.({ loaded: 0, total: attTotal })
    }
    await this.snapshotOriginal()
    this.clearAllDirty()
    await this.flushPersistNow((loaded, total) => {
      if (total > 0) opts.onProgress?.({ loaded, total })
    })
    this.setAttReady()
    await this.sweepBlobs()
    return this.buildMeta()
  }

  async createNewBook(input: NewBookInput) {
    this.skipRestore = true
    this.abortSessionWork()
    this.setSyncState({ status: 'idle', loaded: 0, total: null })
    this.emitSessionPersist(null)
    const bytes = await buildNewBook(input)
    const bookId = newLedgerId()
    const sessionId = newLedgerId()
    const sourceName = kitsasFileName(input.name)
    await this.adopt(
      bytes,
      {
        bookId,
        sourceName,
        dbPath: `local:${bookId}/${sourceName}`,
        sessionId,
        dirty: true,
        attachmentsDirty: false,
        backupDone: false,
      },
      null,
    )
    await this.snapshotOriginal()
    await this.flushPersistNow()
    this.setAttReady()
    await this.sweepBlobs()
    return this.buildMeta()
  }

  async openKitsasPath(path: string) {
    if (path.startsWith('locker:')) return this.openLockerBook(path.slice('locker:'.length))
    if (this.db && this.dbPath === path) return this.buildMeta()
    throw new Error('Tiedostoa ei löytynyt. Valitse toinen.')
  }

  private pruneAttachments(db: SqliteDb) {
    const rows = db.all<{ sha: string | null }>(
      "SELECT sha FROM Liite WHERE sha IS NOT NULL AND sha != ''",
    )
    const live = new Set(rows.map((r) => r.sha!).filter(Boolean))
    if (this.store.retain(live)) this.setAttachmentsDirty(true)
  }

  override async deleteVoucher(id: number) {
    await this.mutate((db) => {
      deleteVoucherRow(db, id)
      this.pruneAttachments(db)
    }, { kind: 'voucher_delete', params: { id } })
  }

  async uploadAttachment(voucherId: number, file: File) {
    const data = new Uint8Array(await file.arrayBuffer())
    const result = await this.uploadAttachmentBytes(
      voucherId,
      { name: file.name || 'attachment', type: file.type || 'application/octet-stream', data },
      { lean: true },
    )
    this.store.put(result.sha, data)
    this.setAttachmentsDirty(true)
    await this.flushPersistNow()
    return { id: result.id }
  }

  async attachmentHref(id: number) {
    const cached = this.blobUrls.get(id)
    if (cached) return cached
    const meta = this.attachmentMeta(id)
    if (!meta) throw new Error(`Liite ${id} not found`)
    let data = meta.data
    if (!data && meta.sha) {
      if (!this.store.has(meta.sha)) await this.store.loadShas([meta.sha])
      data = this.store.get(meta.sha) ?? null
    }
    if (!data && meta.sha && this.lockerId) {
      data = await getActiveLocker().getAttachmentBlob(this.lockerId, meta.sha)
      this.store.put(meta.sha, data)
      this.schedulePersist()
    }
    if (!data) throw new Error(`Liite ${id} not ready`)
    const url = URL.createObjectURL(new Blob([data as BlobPart], { type: meta.type }))
    this.blobUrls.set(id, url)
    return url
  }

  override isDirty(): boolean {
    return this.dirty || this.attachmentsDirty
  }

  private async exportPackedKitsas(): Promise<Uint8Array> {
    const packed = await packAttachmentsIntoDb(this.requireDb(), this.store)
    try {
      return packed.export()
    } finally {
      packed.close()
    }
  }

  async saveLocal() {
    if (!this.fileHandle) throw new Error('no_writable_link')
    const bytes = await this.exportPackedKitsas()
    const w = await this.fileHandle.createWritable()
    await w.write(bytes as BufferSource)
    await w.close()
    await this.recordBookSaved({ target: 'disk', name: this.sourceName })
    this.attachmentsDirty = false
    await this.flushPersistNow()
  }

  async downloadCopy(promptForName: (suggested: string) => string | null) {
    const bytes = await this.exportPackedKitsas()
    const name = this.sourceName || 'book.kitsas'
    await saveKitsasAs(bytes, name, promptForName)
    this.clearAllDirty()
    await this.recordBookSaved({ target: 'disk', name })
    await this.flushPersistNow()
  }

  async listLockerBooks() {
    return getActiveLocker().list()
  }

  async openLockerBook(id: string, opts: TransferOpts = {}) {
    this.skipRestore = true
    this.abortSessionWork()
    this.setSyncState({ status: 'idle', loaded: 0, total: null })
    this.emitSessionPersist(null)
    const { bytes, etag, attachmentsEtag, name } = await getActiveLocker().get(id, opts)
    opts.onStage?.('parse')
    if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const bookId = newLedgerId()
    const sessionId = newLedgerId()
    await this.adopt(bytes, {
      bookId,
      sourceName: name,
      dbPath: `locker:${id}`,
      sessionId,
      dirty: false,
      attachmentsDirty: false,
      backupDone: false,
      lockerId: id,
      etag,
      attachmentsEtag: attachmentsEtag || undefined,
      largeFile: bytes.byteLength > LARGE,
    })
    await this.hydrateBlobs()
    const lean = await this.leanify(false)
    const attTotal = this.store.opfsNeedsPersist() ? this.store.byteSize() : 0
    if (attTotal > 0) {
      opts.onStage?.('attachments')
      opts.onProgress?.({ loaded: 0, total: attTotal })
    }
    await this.snapshotOriginal()
    this.clearAllDirty()
    await this.flushPersistNow((loaded, total) => {
      if (total > 0) opts.onProgress?.({ loaded, total })
    })
    if (!lean.extracted && this.missingShas().length) {
      void this.backgroundSyncAttachments(id)
    } else {
      this.setAttReady()
      await this.sweepBlobs()
    }
    return this.buildMeta()
  }

  async saveToLocker(opts: TransferOpts = {}) {
    const asNew = opts.asNew ?? false
    const targetLockerId = asNew ? undefined : this.lockerId
    const displayName = opts.name ?? this.sourceName
    const plan = lockerUploadPlan(this.dirty, this.attachmentsDirty, targetLockerId)
    if (plan.skip && !asNew) return
    const leanBytes = this.requireDb().export()

    const locker = getActiveLocker()
    if (plan.needLedger || asNew) {
      const saved = await locker.put(
        asNew ? null : (this.lockerId ?? null),
        leanBytes,
        displayName,
        asNew ? undefined : this.etag,
        opts,
      )
      this.lockerId = saved.id
      this.etag = saved.sha256
      if (saved.attachments_sha256) {
        this.attachmentsEtag = this.attachmentsEtag || saved.attachments_sha256
      }
      this.dbPath = `locker:${saved.id}`
      this.sourceName = displayName
      this.setDirty(false)
    }

    if (plan.needAttachments || asNew) {
      if (!this.lockerId) throw new Error('book_not_found')
      const attEtag = this.attachmentsEtag
      const blobs: Record<string, Uint8Array> = {}
      for (const sha of this.store.keys()) {
        const data = this.store.get(sha)
        if (data) blobs[sha] = data
      }
      if (!attEtag && Object.keys(blobs).length > 0) throw new Error('etag_mismatch')
      if (Object.keys(blobs).length > 0) {
        if (locker.putAttachmentBlobs) {
          const attSaved = await locker.putAttachmentBlobs(this.lockerId, blobs, attEtag!, opts)
          this.attachmentsEtag = attSaved.attachments_sha256
        } else if (locker.putAttachments) {
          const pack = this.store.toPack()
          const attSaved = await locker.putAttachments(this.lockerId, pack, attEtag!, opts)
          this.attachmentsEtag = attSaved.attachments_sha256
        } else {
          throw new Error('locker_not_configured')
        }
      }
      this.setAttachmentsDirty(false)
    }

    opts.onStage?.('persist')
    await this.recordBookSaved({ target: 'locker', name: displayName })
    this.clearAllDirty()
    await this.flushPersistNow((loaded, total) => {
      if (total > 0) opts.onProgress?.({ loaded, total })
    })
  }

  async closeBook(opts?: { discard?: boolean }) {
    if (opts?.discard) {
      this.abortSessionWork()
    } else {
      await this.flushPersistNow()
      this.emitSessionPersist(null)
    }
    const closedId = this.bookId
    this.syncAbort?.abort()
    this.syncAbort = null
    this.closeBlobs()
    this.store.clear()
    this.closeLedger()
    this.bookId = ''
    this.fileHandle = null
    this.emitLocalLinkChange()
    this.lockerId = undefined
    this.etag = undefined
    this.attachmentsEtag = undefined
    this.setAttachmentsDirty(false)
    this.backupDone = false
    this.largeFile = false
    this.setSyncState({ status: 'idle', loaded: 0, total: null })
    if (closedId) await opfsRemove(closedId)
  }

  async reloadFromSource(): Promise<Meta> {
    if (!this.db) throw new Error('no_book')
    this.abortSessionWork()

    const savedBookId = this.bookId
    const savedMeta = this.opfsMeta()
    const savedHandle = this.fileHandle
    const savedLockerId = this.lockerId
    const savedEtag = this.etag
    const savedAttachmentsEtag = this.attachmentsEtag
    const savedLargeFile = this.largeFile

    let bytes: Uint8Array
    if (savedHandle) {
      bytes = await readFileBytes(await savedHandle.getFile())
    } else if (savedLockerId) {
      ;({ bytes } = await getActiveLocker().get(savedLockerId))
    } else {
      const original = await opfsLoadOriginal(savedBookId)
      if (!original) throw new Error('reload_unavailable')
      bytes = original
    }

    this.closeBlobs()
    this.store.clear()
    this.store.bindBook(savedBookId)
    await this.openBytes(bytes, {
      sourceName: savedMeta.sourceName,
      dbPath: savedMeta.dbPath,
      sessionId: savedMeta.sessionId,
    })
    this.bookId = savedBookId
    this.fileHandle = savedHandle
    this.lockerId = savedLockerId
    this.etag = savedEtag
    this.attachmentsEtag = savedAttachmentsEtag
    this.largeFile = savedLargeFile
    this.backupDone = false
    this.attachmentsDirty = false
    this.emitLocalLinkChange()

    await this.hydrateBlobs()
    await this.leanify(false)
    this.beginAttPersistProgress()
    try {
      await this.snapshotOriginal()
      this.clearAllDirty()
      await this.flushPersistNow()
    } finally {
      this.endAttPersistProgress()
    }
    if (savedLockerId && this.missingShas().length) {
      void this.backgroundSyncAttachments(savedLockerId)
    } else {
      this.setAttReady()
      await this.sweepBlobs()
    }
    return this.buildMeta()
  }

  private closeBlobs() {
    for (const url of this.blobUrls.values()) URL.revokeObjectURL(url)
    this.blobUrls.clear()
  }
}
