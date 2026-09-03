import { useState, type FormEvent } from 'react'
import type { LockerBook } from '../../api'
import {
  connectHttpLocker,
  connectSupabaseLocker,
  disconnectHttpLocker,
  disconnectSupabaseLocker,
  generateLockerSecret,
  getActiveLocker,
  getLockerKind,
  httpLockerUsesSameOrigin,
  loadHttpLockerSettings,
  loadSupabaseSettings,
  setLockerKind,
  type LockerKind,
} from '../../book/persist/locker'
import { useI18n } from '../../i18n'
import { lockerBookLabel } from './lockerBooks'

export function LockerPanel({
  books,
  onPick,
  onClose,
  onKindChange,
}: {
  books: LockerBook[] | null
  onPick: (id: string, name: string) => void
  onClose: () => void
  onKindChange: () => void
}) {
  const { t } = useI18n()
  const [kind, setKind] = useState<LockerKind>(() => getLockerKind())
  const savedSupabase = loadSupabaseSettings()
  const savedHttp = loadHttpLockerSettings()
  const [httpUrl, setHttpUrl] = useState(savedHttp?.url ?? '')
  const [url, setUrl] = useState(savedSupabase?.url ?? '')
  const [anonKey, setAnonKey] = useState(savedSupabase?.anonKey ?? '')
  const [bucket, setBucket] = useState(savedSupabase?.bucket ?? 'tilari')
  const [secret, setSecret] = useState(savedSupabase?.secret ?? '')
  const [revealSecret, setRevealSecret] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const httpReady = kind === 'http' && getActiveLocker().id === 'http' && getActiveLocker().isReady()
  const sameOriginHttp = httpReady && httpLockerUsesSameOrigin()
  const supabaseReady = kind === 'supabase' && Boolean(loadSupabaseSettings())
  const showList = (kind === 'http' && httpReady) || supabaseReady

  function applyKind(next: LockerKind) {
    setError(null)
    setKind(next)
    if (next === 'http') {
      setLockerKind('http')
      onKindChange()
      return
    }
    if (loadSupabaseSettings()) {
      setLockerKind('supabase')
      onKindChange()
    }
  }

  async function onConnectHttp(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await connectHttpLocker({ url: httpUrl })
      setKind('http')
      onKindChange()
    } catch (err) {
      const code = err instanceof Error ? err.message : String(err)
      if (code === 'locker_http_url') setError(t('file.lockerHttpNeedConnect'))
      else if (code === 'locker_http_unreachable') setError(t('file.lockerHttpUnreachable'))
      else setError(code)
    } finally {
      setBusy(false)
    }
  }

  function onDisconnectHttp() {
    disconnectHttpLocker()
    setKind('http')
    setHttpUrl('')
    setError(null)
    onKindChange()
  }

  async function onConnect(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await connectSupabaseLocker({ url, anonKey, bucket, secret })
      setKind('supabase')
      onKindChange()
    } catch (err) {
      const code = err instanceof Error ? err.message : String(err)
      if (code === 'locker_service_role') setError(t('file.lockerServiceRole'))
      else if (code === 'locker_bad_secret') setError(t('file.lockerBadSecret'))
      else if (code === 'locker_secret') setError(t('file.lockerNeedSecret'))
      else if (code === 'locker_url' || code === 'locker_settings') setError(t('file.lockerNeedConnect'))
      else setError(code)
    } finally {
      setBusy(false)
    }
  }

  function onDisconnect() {
    disconnectSupabaseLocker()
    setKind('http')
    setAnonKey('')
    setSecret('')
    onKindChange()
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

      {kind === 'http' ? (
        sameOriginHttp ? (
          <p className="muted">{t('file.lockerHttpSameOrigin')}</p>
        ) : (
          <form className="locker-connect" onSubmit={(e) => void onConnectHttp(e)}>
            <p className="muted">{t('file.lockerHttpHint')}</p>
            <label>
              {t('file.lockerHttpUrl')}
              <input
                type="url"
                required
                autoComplete="off"
                value={httpUrl}
                onChange={(e) => setHttpUrl(e.target.value)}
                placeholder="https://books.example.com"
              />
            </label>
            {error ? <p className="error">{error}</p> : null}
            <div className="file-prompt-actions">
              <button type="submit" className="file-btn" disabled={busy}>
                {t('file.lockerConnect')}
              </button>
              {httpReady && !sameOriginHttp ? (
                <button type="button" className="file-btn-secondary" onClick={onDisconnectHttp}>
                  {t('file.lockerDisconnect')}
                </button>
              ) : null}
            </div>
          </form>
        )
      ) : null}

      {kind === 'supabase' ? (
        <form className="locker-connect" onSubmit={(e) => void onConnect(e)}>
          <p className="muted">{t('file.lockerWasmOnly')}</p>
          <p className="muted">{t('file.lockerSetupHint')}</p>
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
          <label>
            {t('file.lockerSupabaseBucket')}
            <input type="text" value={bucket} onChange={(e) => setBucket(e.target.value)} />
          </label>
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
          {error ? <p className="error">{error}</p> : null}
          <div className="file-prompt-actions">
            <button type="submit" className="file-btn" disabled={busy}>
              {t('file.lockerConnect')}
            </button>
            {supabaseReady ? (
              <button type="button" className="file-btn-secondary" onClick={onDisconnect}>
                {t('file.lockerDisconnect')}
              </button>
            ) : null}
          </div>
        </form>
      ) : null}

      {showList ? (
        books == null ? (
          <p className="muted">{t('app.loading')}</p>
        ) : books.length === 0 ? (
          <p className="muted">{t('file.lockerEmpty')}</p>
        ) : (
          <ul>
            {books.map((book) => (
              <li key={book.id}>
                <button type="button" className="nav-link" onClick={() => onPick(book.id, book.name)}>
                  {lockerBookLabel(book, books)}
                </button>
              </li>
            ))}
          </ul>
        )
      ) : null}

      <button type="button" className="back-btn" onClick={onClose}>
        {t('common.close')}
      </button>
    </section>
  )
}
