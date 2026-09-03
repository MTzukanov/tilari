import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppLayout } from './AppLayout'
import { BookViews } from './BookViews'
import {
  fetchHealth,
  fetchMeta,
  setPracticeDate,
  fetchBalances,
  openKitsasFile,
  openKitsasPath,
  createNewBook,
  listLockerBooks,
  openLockerBook,
  saveLocal,
  saveToLocker,
  closeBook,
  reloadFromSource,
  downloadCopy,
  isDirty,
  onDirtyChange,
  onLocalLinkChange,
  hasWritableLocalFile,
  canLinkWritableFile,
  linkWritableFile,
  onAttachmentSync,
  onSessionPersist,
  flushSessionPersist,
  type AttachmentSyncState,
  type SessionPersistState,
  type Meta,
  type BalancesResponse,
  type LockerBook,
  fetchSessionChanges,
  onSessionChange,
  type SessionChange,
} from '../api'
import { loadAllocationPrefs, saveAllocationPrefs, type AllocationPrefs } from '../modules/allocations/allocationPrefs'
import { clearTilariWebStorage } from '../modules/settings/browserStorage'
import { opfsClear } from '../book/opfs'
import { fileStorageKind } from './open/fileStorage'
import { pickWritableLocalKitsas } from './open/pickLocalKitsas'
import {
  clearBookSession,
  loadBookSession,
  loadRecentBooks,
  rememberOpenBook,
  removeRecent,
  sessionMatches,
  type LastBook,
} from './open/lastBook'
import { forgetLocale, useI18n } from '../i18n'
import { parseRoute, routeAllowsNoBook, type Route } from './routing'
import { periodContaining } from '../shared/periodNav'
import { normalizeSessionChanges } from '../book/sessionLog'
import { resetBodyScrollLock } from '../shared/scrollLock'
import { getBookServiceEpoch, getEngine, resetBookService, resolveEngine, setEngine, withEngine } from '../book/engine'
import { lockerSupportsHttpEngine } from '../book/persist/locker'
import { forcedEngineForPath } from '../book/openPath'
import {
  clearStoredPracticeDate,
  loadStoredPracticeDate,
  saveStoredPracticeDate,
} from '../book/clock'
import type { EngineKind } from '../book/service'
import type { NewBookInput } from '../book/newBook/createBook'
import { CreateBookDialog } from './CreateBookDialog'
import '../App.css'

function isAbortError(err: unknown): boolean {
  return (err instanceof DOMException || err instanceof Error) && err.name === 'AbortError'
}

type PendingOpen =
  | { type: 'file'; file: File; label: string; handle?: FileSystemFileHandle | null }
  | { type: 'path'; path: string; label: string; forcedEngine?: EngineKind }
  | { type: 'locker'; id: string; label: string }

type BusyState = {
  title: string
  loaded: number
  total: number | null
  cancellable: boolean
}

export function BookShell() {
  const [meta, setMeta] = useState<Meta | null>(null)
  const [balances, setBalances] = useState<BalancesResponse | null>(null)
  const [periodEnd, setPeriodEnd] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [opening, setOpening] = useState(false)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState<BusyState | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [attSync, setAttSync] = useState<AttachmentSyncState>({ status: 'idle', loaded: 0, total: null })
  const [sessionPersist, setSessionPersist] = useState<SessionPersistState>(null)
  const [lockerOpen, setLockerOpen] = useState(false)
  const [lockerBooks, setLockerBooks] = useState<LockerBook[] | null>(null)
  const [fileNote, setFileNote] = useState<string | null>(null)
  const [dbKey, setDbKey] = useState(0)
  const [recents, setRecents] = useState<LastBook[]>(() => loadRecentBooks())
  const [route, setRoute] = useState<Route>(() => parseRoute())
  const [allocationPrefs, setAllocationPrefs] = useState<AllocationPrefs>(() => loadAllocationPrefs())
  const [navOpen, setNavOpen] = useState(false)
  const [openEngine, setOpenEngine] = useState<EngineKind | null>(null)
  const [pendingOpen, setPendingOpen] = useState<PendingOpen | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [sessionChanges, setSessionChanges] = useState<SessionChange[]>([])
  const [writableLinked, setWritableLinked] = useState(false)
  const [serviceEpoch, setServiceEpoch] = useState(() => getBookServiceEpoch())
  const openingRef = useRef(false)
  const { t } = useI18n()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const metaRef = useRef<Meta | null>(null)
  metaRef.current = meta

  function updateAllocationPrefs(patch: Partial<AllocationPrefs>) {
    setAllocationPrefs((prev) => {
      const next = { ...prev, ...patch }
      saveAllocationPrefs(next)
      return next
    })
  }

  const goTo = useCallback((hash: string) => {
    window.location.hash = hash
    setRoute(parseRoute(hash))
    setNavOpen(false)
  }, [])

  function goHome() {
    goTo('#/')
  }

  const applyMeta = useCallback(async (m: Meta, bookEngine: EngineKind, opts?: { recents?: boolean }) => {
    let next = m
    if (m.practice) {
      const stored = loadStoredPracticeDate(m.db_path)
      if (stored && stored !== m.book_date) {
        try {
          next = await setPracticeDate(stored)
        } catch {
          next = m
        }
      } else {
        saveStoredPracticeDate(m.db_path, m.book_date)
      }
    }
    setRecents(rememberOpenBook(next, bookEngine, opts))
    setOpenEngine(bookEngine)
    setMeta(next)
    const latest = next.periods.at(-1)
    setPeriodEnd(latest?.ends ?? '')
    setBalances(null)
    setDbKey((k) => k + 1)
  }, [])

  function mapFileError(err: unknown): string | null {
    if (isAbortError(err)) return null
    if (err instanceof Error && err.message === 'etag_mismatch') return t('file.lockerConflict')
    if (err instanceof Error && err.message === 'no_writable_link') return t('file.noWritableLink')
    if (err instanceof Error && err.message === 'permission_denied') return t('file.linkPermissionDenied')
    if (err instanceof Error && err.message === 'kitsas_required') return t('file.kitsasRequired')
    if (err instanceof Error && err.message === 'file_picker_unsupported') return t('file.linkUnsupported')
    if (err instanceof Error && err.message === 'reload_unavailable') return t('file.reloadUnavailable')
    if (err instanceof Error && err.message === 'locker_http_unsupported') return t('file.lockerHttpUnsupported')
    if (err instanceof Error && err.message === 'locker_not_configured') return t('file.lockerNeedConnect')
    if (err instanceof Error && err.message === 'locker_service_role') return t('file.lockerServiceRole')
    if (err instanceof Error && err.message === 'locker_bad_secret') return t('file.lockerBadSecret')
    if (err instanceof Error && err.message === 'locker_secret') return t('file.lockerNeedSecret')
    if (err instanceof Error && err.message === 'create_wasm_only') return t('file.createWasmOnly')
    if (err instanceof Error && err.message === 'name_required') return t('file.createNameRequired')
    if (err instanceof Error && err.message === 'ytunnus_invalid') return t('file.createYtunnusInvalid')
    if (err instanceof Error && err.message === 'fiscal_year_invalid') return t('file.createYearInvalid')
    return err instanceof Error ? err.message : String(err)
  }

  function startBusy(title: string, cancellable: boolean): AbortSignal | undefined {
    openingRef.current = true
    abortRef.current?.abort()
    const ac = cancellable ? new AbortController() : null
    abortRef.current = ac
    setBusy({ title, loaded: 0, total: null, cancellable })
    return ac?.signal
  }

  function reportBusy(loaded: number, total: number | null) {
    setBusy((cur) => (cur ? { ...cur, loaded, total } : cur))
  }

  function onSaveStage(stage: 'transfer' | 'parse' | 'attachments' | 'server' | 'persist') {
    if (stage === 'transfer') {
      setBusy((cur) =>
        cur ? { ...cur, title: t('file.busySave'), loaded: 0, total: null } : cur,
      )
    } else if (stage === 'server') {
      setBusy((cur) =>
        cur ? { ...cur, title: t('file.busySaveWait'), loaded: 0, total: null } : cur,
      )
    } else if (stage === 'persist') {
      abortRef.current = null
      setBusy((cur) =>
        cur
          ? { ...cur, title: t('file.attSyncPersist'), cancellable: false, loaded: 0, total: null }
          : cur,
      )
    }
  }

  function stopBusy(clearBlocked = true) {
    abortRef.current = null
    setBusy(null)
    if (clearBlocked) openingRef.current = false
  }

  const dropBook = useCallback(() => {
    if (metaRef.current) clearStoredPracticeDate(metaRef.current.db_path)
    clearBookSession()
    resetBookService()
    setServiceEpoch(getBookServiceEpoch())
    setMeta(null)
    setBalances(null)
    setPeriodEnd('')
    setOpenEngine(null)
    setSessionChanges([])
    setError(null)
    setDbKey((k) => k + 1)
  }, [])

  const refreshSessionChanges = useCallback(async () => {
    if (!metaRef.current) {
      setSessionChanges([])
      return
    }
    try {
      const changes = await fetchSessionChanges()
      setSessionChanges(normalizeSessionChanges(changes))
    } catch {
      setSessionChanges([])
    }
  }, [])

  async function prepareEngine(kind: EngineKind, discard = false) {
    if (meta) {
      try {
        await closeBook({ discard })
      } catch {
        /* ignore */
      }
      dropBook()
    } else {
      // Drop a stale session before switching engine so getBookService() honors `kind`.
      clearBookSession()
    }
    setEngine(kind)
    resetBookService()
    setServiceEpoch(getBookServiceEpoch())
  }

  useEffect(() => {
    const onHash = () => setRoute(parseRoute())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    resetBodyScrollLock()
  }, [route])

  useEffect(() => onAttachmentSync(setAttSync), [meta, dbKey, openEngine, serviceEpoch])

  useEffect(() => onSessionPersist(setSessionPersist), [meta, dbKey, openEngine, serviceEpoch])

  useEffect(() => {
    const sync = () => setDirty(isDirty())
    sync()
    return onDirtyChange(sync)
  }, [meta, dbKey, serviceEpoch])

  useEffect(() => {
    void refreshSessionChanges()
  }, [meta, dbKey, dirty, refreshSessionChanges, serviceEpoch])

  useEffect(() => {
    return onSessionChange(() => {
      void refreshSessionChanges()
      if (!metaRef.current) return
      void fetchMeta()
        .then((m) => {
          const prev = metaRef.current
          if (!prev) return
          setMeta(m)
          if (prev.practice !== m.practice || prev.book_date !== m.book_date) {
            if (m.practice) saveStoredPracticeDate(m.db_path, m.book_date)
            else clearStoredPracticeDate(m.db_path)
            setDbKey((k) => k + 1)
          }
        })
        .catch(() => undefined)
    })
  }, [meta, dbKey, refreshSessionChanges, serviceEpoch])

  useEffect(() => {
    const sync = () => setWritableLinked(hasWritableLocalFile())
    sync()
    return onLocalLinkChange(sync)
  }, [meta, dbKey, openEngine, serviceEpoch])

  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      void flushSessionPersist()
      e.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  function confirmDiscard(): boolean {
    if (!isDirty()) return true
    return window.confirm(t('file.unsavedConfirm'))
  }

  useEffect(() => {
    let cancelled = false
    async function sync() {
      if (openingRef.current) return
      try {
        const session = loadBookSession()
        // Engine preference applies to the next open; only restore via session.engine when one is saved.
        const bookEngine: EngineKind = session?.engine ?? 'wasm'
        const health = await withEngine(bookEngine, () => fetchHealth())
        if (cancelled || openingRef.current) return
        if (sessionMatches(health, session)) {
          if (!metaRef.current) {
            const bookEngine = session!.engine
            const m = await withEngine(bookEngine, () => fetchMeta())
            if (cancelled || openingRef.current) return
            await applyMeta(m, bookEngine)
          }
          if ((session?.engine ?? resolveEngine()) === 'http' && health.dirty != null) {
            setDirty(health.dirty)
          }
          setError(null)
        } else if (!metaRef.current && session) {
          // Stale localStorage session with nothing restored in the UI yet.
          dropBook()
          await withEngine('wasm', () => fetchHealth())
        } else {
          setError(null)
        }
      } catch (err) {
        const stale = !metaRef.current && Boolean(loadBookSession())
        if (!cancelled && stale) {
          dropBook()
          try {
            await withEngine('wasm', () => fetchHealth())
          } catch {
            /* wasm health is optional after abandoning a dead http session */
          }
        } else if (!cancelled) {
          setError(mapFileError(err))
        }
      } finally {
        if (!cancelled) setReady(true)
      }
    }
    void sync()
    const onVis = () => {
      if (document.visibilityState === 'visible') void sync()
    }
    window.addEventListener('focus', onVis)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      window.removeEventListener('focus', onVis)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [applyMeta, dropBook, t])

  useEffect(() => {
    if (!periodEnd) return
    let cancelled = false
    ;(async () => {
      try {
        const data = await fetchBalances(periodEnd)
        if (cancelled) return
        setBalances(data)
        setError(null)
      } catch (err) {
        if (!cancelled) setError(mapFileError(err))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [periodEnd, dbKey, t])

  async function executeOpen(kind: EngineKind, pending: PendingOpen, discardPrevious = false) {
    openingRef.current = true
    setOpening(true)
    setError(null)
    const signal = startBusy(t('file.busyOpen'), pending.type === 'file')
    if (pending.type === 'file') {
      setFileNote(
        pending.file.size > 50 * 1024 * 1024
          ? t('file.largeFile', { mb: String(Math.round(pending.file.size / 1024 / 1024)) })
          : null,
      )
    } else {
      setFileNote(null)
    }
    try {
      let m: Meta
      await withEngine(kind, async () => {
        await prepareEngine(kind, discardPrevious)
        if (pending.type === 'file') {
          m = await openKitsasFile(pending.file, pending.handle ?? undefined, {
            signal,
            onProgress: (p) => reportBusy(p.loaded, p.total),
            onStage: (stage) => {
              if (stage === 'parse') {
                abortRef.current = null
                setBusy((cur) =>
                  cur ? { ...cur, title: t('file.busyParse'), cancellable: false, loaded: 0, total: null } : cur,
                )
              } else if (stage === 'attachments') {
                abortRef.current = null
                setBusy((cur) =>
                  cur
                    ? { ...cur, title: t('file.attSyncPersist'), cancellable: false, loaded: 0, total: null }
                    : cur,
                )
              }
            },
          })
        } else if (pending.type === 'locker') {
          m = await openLockerBook(pending.id, {
            signal,
            onProgress: (p) => reportBusy(p.loaded, p.total),
            onStage: (stage) => {
              if (stage === 'parse') {
                abortRef.current = null
                setBusy((cur) =>
                  cur ? { ...cur, title: t('file.busyParse'), cancellable: false, loaded: 0, total: null } : cur,
                )
              } else if (stage === 'attachments') {
                abortRef.current = null
                setBusy((cur) =>
                  cur
                    ? { ...cur, title: t('file.attSyncPersist'), cancellable: false, loaded: 0, total: null }
                    : cur,
                )
              }
            },
          })
          setLockerOpen(false)
        } else {
          abortRef.current = null
          setBusy((cur) =>
            cur ? { ...cur, title: t('file.busyParse'), cancellable: false, loaded: 0, total: null } : cur,
          )
          m = await openKitsasPath(pending.path)
        }
      })
      await applyMeta(m!, kind)
      setDirty(false)
      setWritableLinked(hasWritableLocalFile())
      goTo('#/')
    } catch (err) {
      if (pending.type === 'path' && !pending.path.startsWith('locker:')) {
        setRecents(removeRecent(pending.path))
        setError(t('file.lastGone'))
      } else {
        const msg = mapFileError(err)
        if (msg) setError(msg)
      }
    } finally {
      stopBusy(false)
      setOpening(false)
      openingRef.current = false
      if (pending.type === 'file' && fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function queueOpen(pending: PendingOpen) {
    const hadBook = Boolean(meta)
    if (meta && !confirmDiscard()) return
    if (!lockerSupportsHttpEngine()) {
      void executeOpen('wasm', pending, hadBook)
      return
    }
    const forced = pending.type === 'path' ? pending.forcedEngine : undefined
    if (forced) {
      void executeOpen(forced, pending, hadBook)
      return
    }
    setPendingOpen(pending)
  }

  async function onChooseNewFile() {
    if (canLinkWritableFile()) {
      try {
        const picked = await pickWritableLocalKitsas()
        if (picked) {
          queueOpen({ type: 'file', file: picked.file, label: picked.file.name, handle: picked.handle })
          return
        }
      } catch (err) {
        if (isAbortError(err)) return
        if (err instanceof Error && err.message === 'kitsas_required') {
          setError(t('file.kitsasRequired'))
          return
        }
      }
    }
    fileInputRef.current?.click()
  }

  function onFileChosen(file: File | undefined) {
    if (!file) return
    queueOpen({ type: 'file', file, label: file.name })
  }

  function onCreateBook() {
    setCreateOpen(true)
  }

  async function executeCreate(input: NewBookInput) {
    const hadBook = Boolean(meta)
    if (meta && !confirmDiscard()) return
    openingRef.current = true
    setOpening(true)
    setError(null)
    setFileNote(null)
    startBusy(t('file.creating'), false)
    try {
      let m: Meta
      await withEngine('wasm', async () => {
        await prepareEngine('wasm', hadBook)
        m = await createNewBook(input)
      })
      setCreateOpen(false)
      await applyMeta(m!, 'wasm', { recents: false })
      setDirty(true)
      setWritableLinked(hasWritableLocalFile())
      goTo('#/')
    } catch (err) {
      setCreateOpen(false)
      const msg = mapFileError(err)
      if (msg) setError(msg)
    } finally {
      stopBusy(false)
      setOpening(false)
      openingRef.current = false
    }
  }

  function confirmPendingOpen(kind: EngineKind) {
    const pending = pendingOpen
    setPendingOpen(null)
    if (!pending) return
    void executeOpen(kind, pending, Boolean(meta))
  }

  function cancelPendingOpen() {
    setPendingOpen(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function onOpenServerList() {
    setLockerOpen(true)
    await refreshLockerList()
  }

  async function refreshLockerList() {
    if (!lockerSupportsHttpEngine() && getEngine() === 'http' && !meta) {
      setEngine('wasm')
      resetBookService()
      setServiceEpoch(getBookServiceEpoch())
    }
    try {
      setLockerBooks(await listLockerBooks())
    } catch (err) {
      setLockerBooks([])
      const detail = err instanceof Error ? err.message : String(err)
      if (detail === 'locker_not_configured') {
        setError(null)
        return
      }
      if (detail === 'locker_bad_secret') {
        setError(t('file.lockerBadSecret'))
        return
      }
      setError(detail ? `${t('file.lockerError')} (${detail})` : t('file.lockerError'))
    }
  }

  function onPickLocker(id: string, name: string) {
    queueOpen({ type: 'locker', id, label: name })
  }

  async function onSavePrimary() {
    if (!meta) return
    const kind = fileStorageKind(meta.db_path, writableLinked, openEngine)
    setSaving(true)
    setError(null)
    try {
      if (kind === 'locker') {
        const signal = startBusy(t('file.busySave'), true)
        try {
          await saveToLocker({
            signal,
            onProgress: (p) => reportBusy(p.loaded, p.total),
            onStage: onSaveStage,
            asNew: false,
          })
          setFileNote(t('file.savedServer'))
          const m = await fetchMeta()
          await applyMeta(m, openEngine ?? resolveEngine())
        } finally {
          stopBusy()
        }
      } else if (kind === 'disk') {
        if (!isDirty()) return
        await saveLocal()
        setFileNote(t('file.savedOriginal'))
      } else if (kind === 'browser') {
        if (!isDirty()) return
        if (canLinkWritableFile()) {
          await linkWritableFile()
          await saveLocal()
          setFileNote(t('file.savedOriginal'))
        } else {
          await downloadCopy((suggested) => window.prompt(t('file.saveAsPrompt'), suggested))
        }
      }
    } catch (err) {
      const msg = mapFileError(err)
      if (msg) setError(msg)
    } finally {
      setSaving(false)
    }
  }

  async function onLinkWritableFile() {
    setSaving(true)
    setError(null)
    try {
      await linkWritableFile()
      setFileNote(t('file.linkedOriginal'))
    } catch (err) {
      const msg = mapFileError(err)
      if (msg) setError(msg)
    } finally {
      setSaving(false)
    }
  }

  async function onSaveAsName() {
    setSaving(true)
    setError(null)
    try {
      await downloadCopy((suggested) => window.prompt(t('file.saveAsPrompt'), suggested))
    } catch (err) {
      const msg = mapFileError(err)
      if (msg) setError(msg)
    } finally {
      setSaving(false)
    }
  }

  async function onSaveServerAs() {
    const defaultName = meta?.source_name ?? 'book.kitsas'
    const picked = window.prompt(t('file.saveServerAsPrompt'), defaultName)
    if (!picked?.trim()) return
    const name = picked.trim()
    try {
      const books = await listLockerBooks()
      const dup = books.find((b) => b.name === name)
      if (dup && !window.confirm(t('file.saveServerDuplicate', { id: dup.id.slice(0, 8) }))) return
    } catch {
      /* locker list optional */
    }
    setSaving(true)
    setError(null)
    const signal = startBusy(t('file.busySave'), true)
    try {
      await saveToLocker({
        signal,
        onProgress: (p) => reportBusy(p.loaded, p.total),
        onStage: onSaveStage,
        name,
        asNew: true,
      })
      setFileNote(t('file.savedServer'))
      const m = await fetchMeta()
      await applyMeta(m, openEngine ?? resolveEngine())
    } catch (err) {
      const msg = mapFileError(err)
      if (msg) setError(msg)
    } finally {
      stopBusy()
      setSaving(false)
    }
  }

  async function onWipeBrowserStorage() {
    abortRef.current?.abort()
    stopBusy()
    setOpening(false)
    setError(null)
    try {
      if (metaRef.current) {
        await closeBook({ discard: true })
        resetBookService()
        setServiceEpoch(getBookServiceEpoch())
        dropBook()
        setSessionPersist(null)
        setAttSync({ status: 'idle', loaded: 0, total: null })
        setLockerOpen(false)
      } else {
        await opfsClear()
      }
      clearTilariWebStorage()
      forgetLocale()
      setRecents([])
      goTo('#/')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function onForgetDevice() {
    const msg = openEngine === 'http' ? t('file.closeBookConfirm') : t('file.forgetConfirm')
    if (!window.confirm(msg)) return
    abortRef.current?.abort()
    stopBusy()
    setOpening(false)
    const path = meta?.db_path
    setError(null)
    try {
      await closeBook({ discard: true })
      resetBookService()
      setServiceEpoch(getBookServiceEpoch())
      if (path && openEngine !== 'http') setRecents(removeRecent(path))
      dropBook()
      setSessionPersist(null)
      setAttSync({ status: 'idle', loaded: 0, total: null })
      setLockerOpen(false)
      goTo('#/')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function onReloadDiscard() {
    if (!meta || !dirty) return
    if (!window.confirm(t('file.reloadDiscardConfirm'))) return
    setOpening(true)
    setError(null)
    startBusy(t('file.busyReload'), false)
    try {
      const m = await reloadFromSource()
      await applyMeta(m, openEngine ?? resolveEngine())
      setDirty(false)
      setWritableLinked(hasWritableLocalFile())
      void refreshSessionChanges()
      setFileNote(null)
    } catch (err) {
      const msg = mapFileError(err)
      if (msg) setError(msg)
    } finally {
      stopBusy()
      setOpening(false)
    }
  }

  function onOpenRecent(path: string) {
    if (path === meta?.db_path) return
    if (path.startsWith('locker:')) {
      const name =
        recents.find((book) => book.path === path)?.name ?? path.slice('locker:'.length)
      queueOpen({ type: 'locker', id: path.slice('locker:'.length), label: name })
      return
    }
    const name = recents.find((book) => book.path === path)?.name ?? path.split(/[/\\]/).pop() ?? path
    queueOpen({
      type: 'path',
      path,
      label: name,
      forcedEngine: forcedEngineForPath(path),
    })
  }

  const period = useMemo(() => {
    if (!meta) return null
    if (balances?.period) return balances.period
    return (
      periodContaining(meta.periods, periodEnd) ??
      meta.periods.find((p) => p.ends === periodEnd) ??
      null
    )
  }, [balances, meta, periodEnd])

  return (
    <AppLayout
      route={route}
      navOpen={navOpen}
      onCloseNav={() => setNavOpen(false)}
      onOpenNav={() => setNavOpen(true)}
      onNavigate={goTo}
      onHome={goHome}
      meta={meta}
      ready={ready}
      dirty={dirty}
      opening={opening}
      saving={saving}
      busy={busy}
      attSync={attSync}
      sessionPersist={sessionPersist}
      sessionChanges={sessionChanges}
      writableLinked={writableLinked}
      openEngine={openEngine}
      recents={recents}
      fileInputRef={fileInputRef}
      onFileChosen={onFileChosen}
      onReloadDiscard={() => void onReloadDiscard()}
      onSavePrimary={() => void onSavePrimary()}
      onChooseNewFile={() => void onChooseNewFile()}
      onCreateBook={onCreateBook}
      onOpenRecent={onOpenRecent}
      onOpenServerList={() => void onOpenServerList()}
      onLinkWritableFile={() => void onLinkWritableFile()}
      onSaveAsName={() => void onSaveAsName()}
      onSaveServerAs={() => void onSaveServerAs()}
      onForgetDevice={() => void onForgetDevice()}
      error={error}
      onDismissError={() => setError(null)}
      fileNote={fileNote}
      lockerOpen={lockerOpen}
      lockerBooks={lockerBooks}
      onPickLocker={onPickLocker}
      onCloseLocker={() => setLockerOpen(false)}
      onLockerKindChange={() => void refreshLockerList()}
      asOfDate={balances?.date ?? periodEnd}
      pendingOpen={pendingOpen != null}
      pendingOpenLabel={pendingOpen?.label ?? ''}
      pendingOpenForcedEngine={pendingOpen?.type === 'path' ? pendingOpen.forcedEngine : undefined}
      onConfirmPendingOpen={confirmPendingOpen}
      onCancelPendingOpen={cancelPendingOpen}
      onCancelBusy={() => abortRef.current?.abort()}
      defaultEngine={getEngine()}
      allowHttpEngine={lockerSupportsHttpEngine()}
      onRefreshRoute={() => setRoute(parseRoute())}
      onPracticeDate={(iso) => {
        void (async () => {
          try {
            const m = await setPracticeDate(iso)
            saveStoredPracticeDate(m.db_path, m.book_date)
            setMeta(m)
            setDbKey((k) => k + 1)
          } catch (err) {
            const msg = mapFileError(err)
            if (msg) setError(msg)
          }
        })()
      }}
    >
      {ready && !meta && !routeAllowsNoBook(route) ? (
        <section className="file-prompt">
          <h2>{t('file.none')}</h2>
          <p>{t('file.choosePrompt')}</p>
          {recents.length > 0 ? (
            <>
              <h3 className="file-prompt-recent">{t('file.recent')}</h3>
              <ul className="file-recent-list">
                {recents.map((book) => (
                  <li key={book.path}>
                    <button
                      type="button"
                      className="file-recent-btn"
                      disabled={opening || Boolean(busy)}
                      onClick={() => onOpenRecent(book.path)}
                    >
                      {book.name}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="muted">{t('file.noRecents')}</p>
          )}
          <div className="file-prompt-actions">
            <button
              type="button"
              className="file-btn"
              disabled={opening || Boolean(busy)}
              onClick={onCreateBook}
            >
              {t('file.createBook')}
            </button>
            <button
              type="button"
              className="file-btn"
              disabled={opening || Boolean(busy)}
              onClick={() => void onChooseNewFile()}
            >
              {t('file.chooseNew')}
            </button>
            <button
              type="button"
              className="file-btn file-btn-secondary"
              disabled={opening || Boolean(busy)}
              onClick={() => void onOpenServerList()}
            >
              {t('file.fromServer')}
            </button>
          </div>
        </section>
      ) : null}

      {createOpen ? (
        <CreateBookDialog
          busy={opening || Boolean(busy)}
          onCancel={() => {
            if (!opening) setCreateOpen(false)
          }}
          onCreate={(input) => void executeCreate(input)}
        />
      ) : null}

      <BookViews
        key={dbKey}
        route={route}
        meta={meta}
        period={period}
        balances={balances}
        periodEnd={periodEnd}
        allocationPrefs={allocationPrefs}
        onAllocationPrefs={updateAllocationPrefs}
        onPeriodEnd={setPeriodEnd}
        goTo={goTo}
        onWipeBrowserStorage={onWipeBrowserStorage}
      />
    </AppLayout>
  )
}
