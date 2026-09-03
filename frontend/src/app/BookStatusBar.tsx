import type { AttachmentSyncState } from '../api'
import type { SessionPersistState } from '../book/service'
import type { FileStorageKind } from './open/fileStorage'
import type { EngineKind } from '../book/service'
import { useI18n } from '../i18n'

export function BookStatusBar({
  engine,
  storageKind,
  sourceName,
  dirty,
  attSync,
  sessionPersist,
}: {
  engine: EngineKind | null
  storageKind: FileStorageKind | null
  sourceName: string | null
  dirty: boolean
  attSync: AttachmentSyncState
  sessionPersist: SessionPersistState
}) {
  const { t } = useI18n()
  if (!engine || !storageKind) return null

  // Primary chip reflects where ledger math runs (engine), not only canonical file location.
  const displayKind =
    engine === 'wasm'
      ? storageKind === 'disk'
        ? 'disk'
        : 'browser'
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
      : displayKind === 'locker'
        ? t('file.storageServerHint', { name: sourceName ?? '' })
        : displayKind === 'disk'
          ? t('file.storageDiskHint', { name: sourceName ?? '' })
          : displayKind === 'session'
            ? t('file.storageSessionHint', { name: sourceName ?? '' })
            : t('file.storageBrowserHint', { name: sourceName ?? '' })

  const showDirty = true
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
      <span
        className={`status-chip status-storage status-storage-${displayKind}`}
        title={storageTitle}
      >
        <span className="status-storage-kind">{storageLabel}</span>
        {sourceName ? (
          <span className="status-storage-name">{sourceName}</span>
        ) : null}
      </span>
      {showDirty ? (
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
