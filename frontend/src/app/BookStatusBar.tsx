import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { AttachmentSyncState } from '../api'
import type { SessionPersistState } from '../book/service'
import type { FileStorageKind } from './open/fileStorage'
import type { EngineKind } from '../book/service'
import {
  getLockerConnection,
  subscribeLockerConnection,
  type LockerConnection,
} from '../book/persist/locker'
import { useI18n } from '../i18n'

function lockerLabel(conn: LockerConnection, t: (key: string) => string): string {
  switch (conn.mode) {
    case 'supabase':
      return t('file.lockerStatusSupabase')
    case 'http':
      return t('file.lockerStatusHttp')
    default:
      return t('file.lockerStatusOff')
  }
}

function lockerTitle(conn: LockerConnection, t: (key: string, params?: Record<string, string>) => string): string {
  switch (conn.mode) {
    case 'supabase': {
      const parts = [t('file.lockerStatusSupabaseHint', { host: conn.endpoint || '—' })]
      if (conn.path) parts.push(t('file.lockerStatusPath', { path: conn.path }))
      parts.push(conn.encrypted ? t('file.lockerStatusEncrypted') : t('file.lockerStatusPlain'))
      parts.push(t('file.lockerStatusOpenHint'))
      return parts.join(' ')
    }
    case 'http': {
      const parts = [t('file.lockerStatusHttpHint', { host: conn.endpoint || '—' })]
      if (conn.path) parts.push(t('file.lockerStatusPath', { path: conn.path }))
      if (conn.encrypted) parts.push(t('file.lockerStatusEncrypted'))
      parts.push(t('file.lockerStatusOpenHint'))
      return parts.join(' ')
    }
    default:
      return t('file.lockerStatusOffHint')
  }
}

function LockerConnectionChip({ onOpen }: { onOpen?: () => void }) {
  const { t } = useI18n()
  const conn = useSyncExternalStore(subscribeLockerConnection, getLockerConnection, getLockerConnection)
  const prevMode = useRef(conn.mode)
  const [flash, setFlash] = useState(false)

  useEffect(() => {
    const wasOff = prevMode.current === 'off'
    const nowOn = conn.mode !== 'off'
    prevMode.current = conn.mode
    // Disconnect (or stay off): drop flash. Connecting clears the prior timeout via cleanup,
    // so without this flash can stick as "Connected" on a gray off chip.
    if (!nowOn) {
      setFlash(false)
      return
    }
    if (!wasOff) return
    setFlash(true)
    const id = window.setTimeout(() => setFlash(false), 1600)
    return () => window.clearTimeout(id)
  }, [conn.mode])

  const connected = conn.mode !== 'off'
  const showJustConnected = connected && flash
  const className = [
    'status-chip',
    'status-locker',
    `status-locker-${conn.mode}`,
    connected ? 'is-connected' : 'is-off',
    showJustConnected ? 'status-locker-flash' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const label = lockerLabel(conn, t)
  const title = lockerTitle(conn, t)
  const text = showJustConnected ? t('file.lockerStatusJustConnected') : label

  if (onOpen) {
    return (
      <button
        type="button"
        className={className}
        title={title}
        aria-label={title}
        onClick={onOpen}
      >
        {connected ? <span className="status-dot status-dot-ok" aria-hidden="true" /> : null}
        {text}
      </button>
    )
  }

  return (
    <span className={className} title={title}>
      {connected ? <span className="status-dot status-dot-ok" aria-hidden="true" /> : null}
      {text}
    </span>
  )
}

export function BookStatusBar({
  engine,
  storageKind,
  sourceName,
  dirty,
  attSync,
  sessionPersist,
  onOpenLocker,
}: {
  engine: EngineKind | null
  storageKind: FileStorageKind | null
  sourceName: string | null
  dirty: boolean
  attSync: AttachmentSyncState
  sessionPersist: SessionPersistState
  onOpenLocker?: () => void
}) {
  const { t } = useI18n()
  const showBookChips = Boolean(engine && storageKind)

  // Primary chip reflects where ledger math runs (engine), not only file location.
  const displayKind =
    engine === 'wasm'
      ? storageKind === 'disk'
        ? 'disk'
        : 'browser'
      : engine === 'http'
        ? 'session'
        : storageKind

  const storageLabel =
    displayKind === 'locker'
      ? t('file.storageServer')
      : displayKind === 'disk'
        ? t('file.storageDisk')
        : displayKind === 'session'
          ? t('file.storageSession')
          : t('file.storageBrowser')

  const storageTitle =
    engine === 'wasm' && storageKind === 'locker'
      ? `${t('file.engineBrowserHint')} ${t('file.storageServerHint', { name: sourceName ?? '' })}`
      : engine === 'http' && storageKind === 'locker'
        ? `${t('file.engineServerHint')} ${t('file.storageServerHint', { name: sourceName ?? '' })}`
        : displayKind === 'locker'
          ? t('file.storageServerHint', { name: sourceName ?? '' })
          : displayKind === 'disk'
            ? t('file.storageDiskHint', { name: sourceName ?? '' })
            : displayKind === 'session'
              ? t('file.storageSessionHint', { name: sourceName ?? '' })
              : t('file.storageBrowserHint', { name: sourceName ?? '' })

  const attShowsOpenProgress =
    attSync.status === 'syncing' &&
    (attSync.phase === 'persist' || attSync.phase === 'decode' || attSync.phase === 'fetch')

  function attSyncLabel(): string {
    const loaded = ((attSync.loaded || 0) / (1024 * 1024)).toFixed(1)
    const total =
      attSync.total != null && attSync.total > 0
        ? (attSync.total / (1024 * 1024)).toFixed(1)
        : null
    const hasBytes = total != null && Number(total) > 0
    const inProgress = hasBytes && attSync.loaded < (attSync.total as number)

    switch (attSync.phase) {
      case 'persist':
        return inProgress
          ? t('file.attSyncPersistProgress', { loaded, total: total! })
          : t('file.attSyncPersist')
      case 'fetch':
        return inProgress
          ? t('file.attSyncFetchProgress', { loaded, total: total! })
          : t('file.attSyncFetch')
      case 'decode':
        return t('file.attSyncProcessing')
      case 'download':
      default:
        return inProgress
          ? t('file.attSyncProgress', { loaded, total: total! })
          : t('file.attSync')
    }
  }

  return (
    <div className="book-status" aria-label={t('file.statusLabel')}>
      {showBookChips && displayKind ? (
        <span
          className={`status-chip status-storage status-storage-${displayKind}`}
          title={storageTitle}
        >
          <span className="status-storage-kind">{storageLabel}</span>
          {sourceName ? (
            <span className="status-storage-name">{sourceName}</span>
          ) : null}
        </span>
      ) : null}
      {showBookChips ? (
        dirty ? (
          <span className="status-chip status-dirty" title={t('file.dirty')}>
            <span className="status-dot" aria-hidden="true" />
            {t('file.dirtyShort')}
          </span>
        ) : (
          <span className="status-chip status-clean" title={t('file.savedHint')}>
            {t('file.savedBadge')}
          </span>
        )
      ) : null}
      <LockerConnectionChip onOpen={onOpenLocker} />
      {sessionPersist?.status === 'scheduled' ? (
        <span className="status-chip status-sync" role="status" aria-live="polite">
          {t('file.sessionPersistScheduled')}
        </span>
      ) : null}
      {sessionPersist?.status === 'syncing' && !attShowsOpenProgress ? (
        <span className="status-chip status-sync" role="status" aria-live="polite">
          <span className="status-sync-spinner" aria-hidden="true" />
          {sessionPersist.phase === 'attachments'
            ? sessionPersist.total && sessionPersist.loaded < sessionPersist.total
              ? t('file.sessionPersistAttachmentsProgress', {
                  loaded: (sessionPersist.loaded / (1024 * 1024)).toFixed(1),
                  total: (sessionPersist.total / (1024 * 1024)).toFixed(1),
                })
              : t('file.sessionPersistAttachments')
            : sessionPersist.total && sessionPersist.loaded < sessionPersist.total
              ? t('file.sessionPersistProgress', {
                  loaded: (sessionPersist.loaded / (1024 * 1024)).toFixed(1),
                  total: (sessionPersist.total / (1024 * 1024)).toFixed(1),
                })
              : sessionPersist.phase === 'export'
                ? t('file.sessionPersist')
                : t('file.sessionPersistWriting')}
        </span>
      ) : null}
      {attSync.status === 'syncing' ? (
        <span className="status-chip status-sync" role="status" aria-live="polite">
          <span className="status-sync-spinner" aria-hidden="true" />
          {attSyncLabel()}
        </span>
      ) : null}
      {attSync.status === 'error' ? (
        <span
          className="status-chip status-sync-error"
          role="status"
          title={attSync.error === 'etag_mismatch' ? t('file.lockerConflict') : attSync.error}
        >
          {attSync.error === 'etag_mismatch' ? t('file.lockerConflictShort') : t('file.attSyncError')}
        </span>
      ) : null}
    </div>
  )
}
