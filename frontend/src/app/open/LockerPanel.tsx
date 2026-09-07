import { useMemo, useState, useSyncExternalStore, type FormEvent } from 'react'
import type { LockerBook } from '../../api'
import {
  connectHttpLocker,
  connectSupabaseLocker,
  disconnectHttpLocker,
  disconnectSupabaseLocker,
  generateLockerSecret,
  getActiveLocker,
  getLockerConnection,
  getLockerKind,
  getLockerRemember,
  httpLockerUsesSameOrigin,
  loadHttpLockerSettings,
  loadSupabaseSettings,
  lockerHostOf,
  setLockerKind,
  subscribeLockerConnection,
  type LockerKind,
} from '../../book/persist/locker'
import { DEFAULT_STORAGE_PATH } from '../../book/persist/locker/storagePath'
import { useI18n } from '../../i18n'
import { mapFileError } from '../mapFileError'
import { formatBookDate } from './bookDates'
import { lockerBookLabel } from './lockerBooks'
import { LockerDisconnectDialog, type DisconnectChoice } from './LockerDisconnectDialog'

function thisPageOrigin(): string {
  return typeof location !== 'undefined' ? location.origin : ''
}

export function LockerPanel({
  books,
  onPick,
  onDelete,
  onClose,
  onKindChange,
  needsDisconnectGuard = false,
  closesServerSession = false,
  onSaveBeforeDisconnect,
}: {
  books: LockerBook[] | null
  onPick: (id: string, name: string) => void
  onDelete?: (id: string, name: string) => void
  onClose: () => void
  onKindChange: () => void
  needsDisconnectGuard?: boolean
  /** Open book is HTTP-engine locker — disconnect will close the Node session. */
  closesServerSession?: boolean
  onSaveBeforeDisconnect?: () => Promise<void>
}) {
  const { t, formatLocale } = useI18n()
  const conn = useSyncExternalStore(subscribeLockerConnection, getLockerConnection, getLockerConnection)
  const [kind, setKind] = useState<LockerKind>(() => getLockerKind())
  const savedSupabase = loadSupabaseSettings()
  const savedHttp = loadHttpLockerSettings()
  const suggestThisPage = httpLockerUsesSameOrigin()
  const [httpUrl, setHttpUrl] = useState(() => {
    const http = loadHttpLockerSettings()
    if (http?.url) return http.url
    return httpLockerUsesSameOrigin() ? thisPageOrigin() : ''
  })
  const [pendingDisconnect, setPendingDisconnect] = useState<(() => void) | null>(null)
  const [guardBusy, setGuardBusy] = useState(false)
  const [url, setUrl] = useState(() => loadSupabaseSettings()?.url ?? '')
  const [anonKey, setAnonKey] = useState(() => loadSupabaseSettings()?.anonKey ?? '')
  const [path, setPath] = useState(() => {
    const k = getLockerKind()
    if (k === 'supabase') {
      const s = loadSupabaseSettings()
      return s?.path || s?.bucket || DEFAULT_STORAGE_PATH
    }
    return loadHttpLockerSettings()?.path || DEFAULT_STORAGE_PATH
  })
  const [encrypt, setEncrypt] = useState(() => {
    const k = getLockerKind()
    if (k === 'supabase') return loadSupabaseSettings()?.encrypt !== false
    return Boolean(loadHttpLockerSettings()?.encrypt)
  })
  const [secret, setSecret] = useState(() => {
    const k = getLockerKind()
    if (k === 'supabase') return loadSupabaseSettings()?.secret || ''
    return loadHttpLockerSettings()?.secret || ''
  })
  const [remember, setRemember] = useState(() => getLockerRemember())
  const [revealSecret, setRevealSecret] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(() => {
    const k = getLockerKind()
    if (k === 'supabase') return !loadSupabaseSettings()
    return !loadHttpLockerSettings()
  })

  const supabaseReady = kind === 'supabase' && Boolean(savedSupabase)
  const httpReady = kind === 'http' && Boolean(savedHttp)
  const connected = supabaseReady || httpReady
  const showList = connected
  const showGc = connected && typeof getActiveLocker().gcUnusedBlobs === 'function'
  const showForm = !connected || editing

  const supabaseDirty = useMemo(() => {
    if (!savedSupabase) return true
    const savedPath = savedSupabase.path || savedSupabase.bucket || DEFAULT_STORAGE_PATH
    const savedEncrypt = savedSupabase.encrypt !== false
    return (
      url.trim() !== savedSupabase.url ||
      anonKey !== savedSupabase.anonKey ||
      path.trim() !== savedPath ||
      encrypt !== savedEncrypt ||
      (encrypt && secret !== (savedSupabase.secret || '')) ||
      remember !== getLockerRemember()
    )
  }, [savedSupabase, url, anonKey, path, encrypt, secret, remember])

  const httpDirty = useMemo(() => {
    if (!savedHttp) return true
    const savedPath = savedHttp.path || DEFAULT_STORAGE_PATH
    return (
      httpUrl.trim() !== savedHttp.url ||
      path.trim() !== savedPath ||
      encrypt !== Boolean(savedHttp.encrypt) ||
      (encrypt && secret !== (savedHttp.secret || '')) ||
      remember !== getLockerRemember()
    )
  }, [savedHttp, httpUrl, path, encrypt, secret, remember])

  const formDirty = kind === 'supabase' ? supabaseDirty : httpDirty
  const canSubmit = !busy && !guardBusy && (!connected || formDirty)

  function resetHttpFormFields(http: ReturnType<typeof loadHttpLockerSettings>) {
    setHttpUrl(http?.url ?? (suggestThisPage ? thisPageOrigin() : ''))
    setPath(http?.path || DEFAULT_STORAGE_PATH)
    setEncrypt(Boolean(http?.encrypt))
    setSecret(http?.secret || '')
    setUrl('')
    setAnonKey('')
    setRevealSecret(false)
  }

  function resetSupabaseFormFields(sb: ReturnType<typeof loadSupabaseSettings>) {
    setUrl(sb?.url ?? '')
    setAnonKey(sb?.anonKey ?? '')
    setPath(sb?.path || sb?.bucket || DEFAULT_STORAGE_PATH)
    setEncrypt(sb ? sb.encrypt !== false : true)
    setSecret(sb?.secret || '')
    setHttpUrl('')
    setRevealSecret(false)
  }

  function requestDisconnect(run: () => void) {
    if (!needsDisconnectGuard) {
      run()
      return
    }
    // Wrap so React does not treat `run` as a setState updater.
    setPendingDisconnect(() => () => run())
  }

  async function onDisconnectChoice(choice: DisconnectChoice) {
    const run = pendingDisconnect
    setPendingDisconnect(null)
    if (choice === 'cancel' || !run) return
    if (choice === 'save') {
      if (!onSaveBeforeDisconnect) return
      setGuardBusy(true)
      try {
        await onSaveBeforeDisconnect()
      } catch {
        return
      } finally {
        setGuardBusy(false)
      }
    }
    run()
  }

  function applyKind(next: LockerKind) {
    if (next === kind) return
    const switchToHttp = () => {
      setError(null)
      setRemember(getLockerRemember())
      if (loadSupabaseSettings()) disconnectSupabaseLocker()
      const http = loadHttpLockerSettings()
      setKind('http')
      resetHttpFormFields(http)
      setLockerKind('http')
      setEditing(!http)
      onKindChange()
    }
    const switchToSupabase = () => {
      setError(null)
      setRemember(getLockerRemember())
      if (loadHttpLockerSettings()) disconnectHttpLocker()
      const sb = loadSupabaseSettings()
      setKind('supabase')
      resetSupabaseFormFields(sb)
      setLockerKind('supabase')
      setEditing(!sb)
      onKindChange()
    }
    if (next === 'http') {
      if (loadSupabaseSettings()) requestDisconnect(switchToHttp)
      else switchToHttp()
      return
    }
    if (loadHttpLockerSettings()) requestDisconnect(switchToSupabase)
    else switchToSupabase()
  }

  function useThisPageUrl() {
    setHttpUrl(thisPageOrigin())
    setError(null)
  }

  async function onConnectHttp(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    try {
      await connectHttpLocker(
        {
          url: httpUrl.trim(),
          path,
          encrypt,
          secret: encrypt ? secret : undefined,
        },
        remember,
      )
      setKind('http')
      setEditing(false)
      onKindChange()
    } catch (err) {
      setError(mapFileError(err) || String(err))
    } finally {
      setBusy(false)
    }
  }

  function finishDisconnectHttp() {
    disconnectHttpLocker()
    setKind('http')
    resetHttpFormFields(null)
    setError(null)
    setEditing(true)
    onKindChange()
  }

  function onDisconnectHttp() {
    requestDisconnect(finishDisconnectHttp)
  }

  async function onConnectSupabase(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    try {
      await connectSupabaseLocker(
        {
          url,
          anonKey,
          path,
          bucket: path,
          encrypt,
          secret: encrypt ? secret : undefined,
        },
        remember,
      )
      setKind('supabase')
      setEditing(false)
      onKindChange()
    } catch (err) {
      setError(mapFileError(err) || String(err))
    } finally {
      setBusy(false)
    }
  }

  function finishDisconnectSupabase() {
    disconnectSupabaseLocker()
    setKind('http')
    resetHttpFormFields(null)
    setError(null)
    setEditing(true)
    onKindChange()
  }

  function onDisconnectSupabase() {
    requestDisconnect(finishDisconnectSupabase)
  }

  async function onGcBlobs() {
    setBusy(true)
    setError(null)
    try {
      const locker = getActiveLocker()
      if (!locker.gcUnusedBlobs) throw new Error('locker_gc_unsupported')
      const removed = await locker.gcUnusedBlobs()
      window.alert(t('file.lockerGcBlobsDone', { count: removed }))
    } catch (err) {
      setError(mapFileError(err) || String(err))
    } finally {
      setBusy(false)
    }
  }

  function startEdit() {
    setRemember(getLockerRemember())
    setEditing(true)
  }

  function cancelEdit() {
    if (kind === 'supabase') resetSupabaseFormFields(loadSupabaseSettings())
    else resetHttpFormFields(loadHttpLockerSettings())
    setRemember(getLockerRemember())
    setError(null)
    setEditing(false)
  }

  function storageOptions() {
    return (
      <>
        <label>
          {t('file.lockerStoragePath')}
          <input
            type="text"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder={DEFAULT_STORAGE_PATH}
            autoComplete="off"
          />
        </label>
        <p className="muted">{t('file.lockerStoragePathHint')}</p>
        <label className="locker-encrypt" title={t('file.lockerEncryptHint')}>
          <input type="checkbox" checked={encrypt} onChange={(e) => setEncrypt(e.target.checked)} />
          <span>{t('file.lockerEncrypt')}</span>
        </label>
        {encrypt ? (
          <>
            <label>
              {t('file.lockerSecret')}
              <span className="locker-connect-row">
                <input
                  type={revealSecret ? 'text' : 'password'}
                  required
                  minLength={8}
                  autoComplete="off"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                />
                <button
                  type="button"
                  className="file-btn-secondary"
                  onClick={() => {
                    setSecret(generateLockerSecret())
                    setRevealSecret(true)
                  }}
                >
                  {t('file.lockerSecretGenerate')}
                </button>
              </span>
            </label>
            <p className="muted">{t('file.lockerSecretHint')}</p>
          </>
        ) : null}
        <label className="locker-encrypt" title={t('file.lockerRememberHint')}>
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <span>{t('file.lockerRemember')}</span>
        </label>
      </>
    )
  }

  function connectedSummary() {
    const title =
      conn.mode === 'supabase' ? t('file.lockerStatusSupabase') : t('file.lockerStatusHttp')
    const endpoint =
      conn.endpoint ||
      (kind === 'supabase' && savedSupabase ? lockerHostOf(savedSupabase.url) : null) ||
      (savedHttp ? lockerHostOf(savedHttp.url) : null)
    const storagePath =
      conn.path ||
      (kind === 'supabase' ? savedSupabase?.path || savedSupabase?.bucket || null : savedHttp?.path || null)
    const encrypted =
      conn.mode !== 'off'
        ? conn.encrypted
        : kind === 'supabase'
          ? savedSupabase?.encrypt !== false
          : Boolean(savedHttp?.encrypt)

    return (
      <div className="locker-connected" role="status">
        <div className="locker-connected-head">
          <span className="status-dot status-dot-ok" aria-hidden="true" />
          <strong>{t('file.lockerConnectedBanner', { kind: title })}</strong>
        </div>
        <ul className="locker-connected-meta muted">
          {endpoint ? <li>{endpoint}</li> : null}
          {storagePath ? <li>{t('file.lockerStatusPath', { path: storagePath })}</li> : null}
          <li>{encrypted ? t('file.lockerStatusEncrypted') : t('file.lockerStatusPlain')}</li>
          {getLockerRemember() ? <li>{t('file.lockerRememberOn')}</li> : <li>{t('file.lockerRememberOff')}</li>}
        </ul>
        <div className="file-prompt-actions">
          <button type="button" className="file-btn-secondary" onClick={startEdit}>
            {t('file.lockerEditConnection')}
          </button>
          {kind === 'supabase' ? (
            <button type="button" className="file-btn-secondary" onClick={onDisconnectSupabase}>
              {t('file.lockerDisconnect')}
            </button>
          ) : (
            <button type="button" className="file-btn-secondary" onClick={onDisconnectHttp}>
              {t('file.lockerDisconnect')}
            </button>
          )}
          {showGc ? (
            <button type="button" className="file-btn-secondary" disabled={busy} onClick={() => void onGcBlobs()}>
              {t('file.lockerGcBlobs')}
            </button>
          ) : null}
        </div>
      </div>
    )
  }

  function formActions(submitLabel: string) {
    const submitText = connected ? t('file.lockerUpdateConnection') : submitLabel
    return (
      <div className="file-prompt-actions">
        <button
          type="submit"
          className={`file-btn${busy || guardBusy ? ' is-busy' : ''}`}
          disabled={!canSubmit}
        >
          {submitText}
        </button>
        {connected && editing ? (
          <button
            type="button"
            className={`file-btn-secondary${busy ? ' is-busy' : ''}`}
            onClick={cancelEdit}
            disabled={busy}
          >
            {t('common.cancel')}
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <section className="file-prompt locker-panel">
      <h2>{t('file.lockerTitle')}</h2>
      <p className="locker-byo">{t('file.lockerByoIntro')}</p>
      <fieldset className="engine-pick locker-kind-pick">
        <legend>{t('file.lockerKindLabel')}</legend>
        <label>
          <input
            type="radio"
            name="tilari-locker-kind"
            checked={kind === 'http'}
            onChange={() => applyKind('http')}
          />
          {t('file.lockerKindHttp')}
        </label>
        <label>
          <input
            type="radio"
            name="tilari-locker-kind"
            checked={kind === 'supabase'}
            onChange={() => applyKind('supabase')}
          />
          {t('file.lockerKindSupabase')}
        </label>
      </fieldset>

      {connected && !editing ? connectedSummary() : null}

      {showForm && kind === 'http' ? (
        <form className="locker-connect" onSubmit={(e) => void onConnectHttp(e)}>
          <p className="muted">{t('file.lockerHttpHint')}</p>
          <label>
            {t('file.lockerHttpUrl')}
            <span className="locker-connect-row">
              <input
                type="url"
                required
                autoComplete="off"
                value={httpUrl}
                onChange={(e) => setHttpUrl(e.target.value)}
                placeholder="http://127.0.0.1:8787"
              />
              {suggestThisPage ? (
                <button type="button" className="file-btn-secondary" onClick={useThisPageUrl}>
                  {t('file.lockerUseThisPage')}
                </button>
              ) : null}
            </span>
          </label>
          {storageOptions()}
          {error ? <p className="error">{error}</p> : null}
          {formActions(t('file.lockerConnect'))}
        </form>
      ) : null}

      {showForm && kind === 'supabase' ? (
        <form className="locker-connect" onSubmit={(e) => void onConnectSupabase(e)}>
          {!connected ? (
            <>
              <p className="muted">{t('file.lockerWasmOnly')}</p>
              <p className="muted">{t('file.lockerSetupHint')}</p>
            </>
          ) : (
            <p className="muted">{t('file.lockerEditHint')}</p>
          )}
          <label>
            {t('file.lockerSupabaseUrl')}
            <input
              type="url"
              required
              autoComplete="off"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://xxxx.supabase.co"
            />
          </label>
          <label>
            {t('file.lockerSupabaseKey')}
            <input
              type="password"
              required
              autoComplete="off"
              value={anonKey}
              onChange={(e) => setAnonKey(e.target.value)}
            />
          </label>
          {storageOptions()}
          {error ? <p className="error">{error}</p> : null}
          {formActions(t('file.lockerConnect'))}
        </form>
      ) : null}

      {showList ? (
        books == null ? (
          <p className="muted">{t('app.loading')}</p>
        ) : books.length === 0 ? (
          <p className="muted">{t('file.lockerEmpty')}</p>
        ) : (
          <ul className="file-picker-list">
            {books.map((book) => {
              const saved = formatBookDate(book.updated_at, formatLocale)
              return (
                <li key={book.id} className="locker-book-row">
                  <button
                    type="button"
                    className="nav-link file-picker-row"
                    onClick={() => onPick(book.id, book.name)}
                  >
                    <span className="file-picker-name">{lockerBookLabel(book, books)}</span>
                    {saved ? (
                      <span className="muted file-picker-date">{t('file.savedAt', { date: saved })}</span>
                    ) : null}
                  </button>
                  {onDelete ? (
                    <button
                      type="button"
                      className="locker-book-delete"
                      title={t('common.delete')}
                      aria-label={`${t('common.delete')}: ${book.name}`}
                      onClick={() => onDelete(book.id, book.name)}
                    >
                      <svg
                        className="locker-book-delete-icon"
                        viewBox="0 0 16 16"
                        width="16"
                        height="16"
                        aria-hidden="true"
                      >
                        <path
                          fill="currentColor"
                          d="M6 2h4l.5 1H14v1.5H2V3h3.5L6 2zm1 4.5V12h1.5V6.5H7zm2.5 0V12H11V6.5H9.5zM3.5 5h9l-.7 8.2A1.5 1.5 0 0 1 10.3 14.5H5.7a1.5 1.5 0 0 1-1.5-1.3L3.5 5z"
                        />
                      </svg>
                    </button>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )
      ) : null}

      <button type="button" className="back-btn" onClick={onClose}>
        {t('common.close')}
      </button>

      <LockerDisconnectDialog
        open={pendingDisconnect != null}
        closesServerSession={closesServerSession}
        onChoose={(c) => void onDisconnectChoice(c)}
      />
    </section>
  )
}
