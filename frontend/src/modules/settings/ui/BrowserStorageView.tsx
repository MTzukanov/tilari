import { useCallback, useEffect, useRef, useState } from 'react'
import type { Meta } from '../../../api'
import { sweepUnreferencedBlobs } from '../../../book/blobStore'
import { OPFS_BLOBS_DIR, opfsRemove } from '../../../book/opfs'
import { useI18n } from '../../../i18n'
import {
  estimateOriginQuota,
  formatBytes,
  listOpfsInventory,
  listTilariWebStorage,
  opfsAvailable,
  removeTilariWebStorageKey,
  truncateValue,
  type OpfsBlobPool,
  type OpfsBookGroup,
  type OpfsListProgress,
  type QuotaEstimate,
  type WebStorageItem,
} from '../browserStorage'

export function BrowserStorageView({
  meta,
  onWipeBrowserStorage,
}: {
  meta: Meta | null
  onWipeBrowserStorage: () => Promise<void>
}) {
  const { t } = useI18n()
  const [webItems, setWebItems] = useState<WebStorageItem[]>([])
  const [books, setBooks] = useState<OpfsBookGroup[]>([])
  const [blobs, setBlobs] = useState<OpfsBlobPool>({ files: [], bytes: 0 })
  const [quota, setQuota] = useState<QuotaEstimate | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [opfsReady, setOpfsReady] = useState(false)
  const [opfsScan, setOpfsScan] = useState<OpfsListProgress | null>(null)
  const scanGen = useRef(0)

  const reload = useCallback(async () => {
    const gen = ++scanGen.current
    const live = () => scanGen.current === gen
    setWebItems(listTilariWebStorage())
    setOpfsReady(false)
    setOpfsScan({ files: 0, bytes: 0 })
    setBooks([])
    setBlobs({ files: [], bytes: 0 })
    setQuota(await estimateOriginQuota())
    if (!live()) return
    try {
      const listed = await listOpfsInventory(
        meta ? { db_path: meta.db_path, session_id: meta.session_id } : null,
        (progress) => {
          if (live()) setOpfsScan(progress)
        },
      )
      if (!live()) return
      setBooks(listed.books)
      setBlobs(listed.blobs)
    } catch (err) {
      if (!live()) return
      setError(err instanceof Error ? err.message : String(err))
      setBooks([])
    } finally {
      if (live()) {
        setOpfsReady(true)
        setOpfsScan(null)
      }
    }
  }, [meta])

  useEffect(() => {
    void reload()
    return () => {
      scanGen.current += 1
    }
  }, [reload])

  const webBytes = webItems.reduce((sum, item) => sum + item.bytes, 0)
  const opfsBytes = books.reduce((sum, book) => sum + book.bytes, 0) + blobs.bytes

  async function removeWeb(item: WebStorageItem) {
    removeTilariWebStorageKey(item.kind, item.key)
    await reload()
  }

  async function removeOpfs(path: string, sweep = false) {
    setError(null)
    setBusy(true)
    try {
      await opfsRemove(path)
      if (sweep) await sweepUnreferencedBlobs()
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function wipeAll() {
    if (!window.confirm(t('settings.storage.clearAllConfirm'))) return
    setError(null)
    setBusy(true)
    try {
      await onWipeBrowserStorage()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <div className="ledger">
      <h2>{t('settings.storage.title')}</h2>
      {meta ? (
        <p className="muted">
          <a href="#/settings">{t('settings.storage.back')}</a>
        </p>
      ) : null}
      <p>{t('settings.storage.intro')}</p>
      <p>
        {t('settings.storage.measured', {
          size: formatBytes(webBytes + (opfsReady ? opfsBytes : (opfsScan?.bytes ?? 0))),
        })}
        {' · '}
        {quota
          ? t('settings.storage.quota', {
              used: formatBytes(quota.usage),
              quota: formatBytes(quota.quota),
            })
          : t('settings.storage.quotaUnknown')}
      </p>
      <p className="muted">{t('settings.storage.usageExplain')}</p>
      {error ? <p className="error">{error}</p> : null}

      <h3>{t('settings.storage.webStorage')}</h3>
      {webItems.length === 0 ? (
        <p className="muted">{t('settings.storage.empty')}</p>
      ) : (
        <table className="ledger-table zebra">
          <thead>
            <tr>
              <th>{t('settings.storage.kind')}</th>
              <th>{t('settings.storage.key')}</th>
              <th>{t('settings.storage.value')}</th>
              <th className="storage-size">{t('settings.storage.size')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {webItems.map((item) => (
              <tr key={`${item.kind}:${item.key}`}>
                <td>{t(`settings.storage.${item.kind}`)}</td>
                <td>
                  <code>{item.key}</code>
                </td>
                <td title={item.value}>{truncateValue(item.value)}</td>
                <td className="storage-size">{formatBytes(item.bytes)}</td>
                <td>
                  <button
                    type="button"
                    className="btn-small"
                    disabled={busy}
                    onClick={() => void removeWeb(item)}
                  >
                    {t('settings.storage.delete')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3>{t('settings.storage.opfs')}</h3>
      {!opfsAvailable() ? (
        <p className="muted">{t('settings.storage.opfsUnavailable')}</p>
      ) : !opfsReady ? (
        <div className="storage-scan" aria-busy="true" aria-live="polite">
          <p>
            {opfsScan?.total != null
              ? t('settings.storage.scanningMeasure', {
                  count: opfsScan.files,
                  total: opfsScan.total,
                  size: formatBytes(opfsScan.bytes),
                })
              : t('settings.storage.scanning', { count: opfsScan?.files ?? 0 })}
          </p>
          {opfsScan?.total != null && opfsScan.total > 0 ? (
            <progress className="busy-progress" value={opfsScan.files} max={opfsScan.total} />
          ) : (
            <progress className="busy-progress" />
          )}
        </div>
      ) : books.length === 0 && blobs.files.length === 0 ? (
        <p className="muted">{t('settings.storage.opfsEmpty')}</p>
      ) : (
        <>
        {blobs.files.length > 0 ? (
          <section className="storage-book">
            <div className="storage-book-head">
              <h4>{t('settings.storage.blobs')}</h4>
              <span className="muted storage-size">{formatBytes(blobs.bytes)}</span>
              <button
                type="button"
                className="btn-small"
                disabled={busy}
                onClick={() => void removeOpfs(OPFS_BLOBS_DIR)}
              >
                {t('settings.storage.deleteBlobs')}
              </button>
            </div>
            <p className="muted">{t('settings.storage.blobsHint')}</p>
            <details className="storage-book-files">
              <summary>{t('settings.storage.files', { count: blobs.files.length })}</summary>
              <table className="ledger-table zebra compact">
                <thead>
                  <tr>
                    <th>{t('settings.storage.key')}</th>
                    <th className="storage-size">{t('settings.storage.size')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {blobs.files.map((file) => (
                    <tr key={file.path}>
                      <td>
                        <code>{file.path}</code>
                      </td>
                      <td className="storage-size">{formatBytes(file.bytes)}</td>
                      <td>
                        <button
                          type="button"
                          className="btn-small"
                          disabled={busy}
                          onClick={() => void removeOpfs(file.path)}
                        >
                          {t('settings.storage.delete')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </section>
        ) : null}
        {books.map((book) => (
          <section key={book.bookId} className="storage-book">
            <div className="storage-book-head">
              <h4>
                {book.meta?.sourceName || t('settings.storage.book', { id: book.bookId })}
                {book.inUse ? <span className="tag">{t('settings.storage.inUse')}</span> : null}
              </h4>
              <span className="muted storage-size">{formatBytes(book.bytes)}</span>
              {book.inUse ? null : (
                <button
                  type="button"
                  className="btn-small"
                  disabled={busy}
                  onClick={() => void removeOpfs(book.bookId, true)}
                >
                  {t('settings.storage.deleteBook')}
                </button>
              )}
            </div>
            {book.inUse ? <p className="muted">{t('settings.storage.inUseHint')}</p> : null}
            <details className="storage-book-files">
              <summary>{t('settings.storage.files', { count: book.files.length })}</summary>
              <table className="ledger-table zebra compact">
                <thead>
                  <tr>
                    <th>{t('settings.storage.key')}</th>
                    <th className="storage-size">{t('settings.storage.size')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {book.files.map((file) => (
                    <tr key={file.path}>
                      <td>
                        <code>{file.path}</code>
                      </td>
                      <td className="storage-size">{formatBytes(file.bytes)}</td>
                      <td>
                        <button
                          type="button"
                          className="btn-small"
                          disabled={busy || book.inUse}
                          onClick={() => void removeOpfs(file.path)}
                        >
                          {t('settings.storage.delete')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </section>
        ))}
        </>
      )}

      <p className="storage-wipe">
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => void wipeAll()}>
          {t('settings.storage.clearAll')}
        </button>
      </p>
      <p className="muted">{t('settings.storage.clearAllHint')}</p>
    </div>
  )
}
