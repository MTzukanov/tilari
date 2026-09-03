import { useRef } from 'react'
import { CHOOSE_CREATE, CHOOSE_NEW, CHOOSE_SERVER, type LastBook } from './open/lastBook'
import type { EngineKind } from '../book/service'
import { useI18n } from '../i18n'

export const ACTION_LINK_FILE = '__link_file__'
export const ACTION_SAVE_COPY = '__save_copy__'
export const ACTION_DOWNLOAD = '__download__'
export const ACTION_SAVE_SERVER_AS = '__save_server_as__'
export const ACTION_RELOAD = '__reload__'
export const ACTION_CLOSE = '__close__'

export function FilePick({
  recents,
  currentPath,
  opening,
  disabled = false,
  showActions = false,
  engine = 'wasm',
  writableLinked = false,
  canLinkWritableFile = false,
  onChooseNew,
  onCreateBook,
  onOpenPath,
  onOpenServer,
  onLinkFile,
  onSaveCopy,
  onDownload,
  onSaveServerAs,
  onReload,
  reloadEnabled = false,
  onClose,
}: {
  recents: LastBook[]
  currentPath: string | null
  opening: boolean
  disabled?: boolean
  showActions?: boolean
  engine?: EngineKind
  writableLinked?: boolean
  canLinkWritableFile?: boolean
  onChooseNew: () => void
  onCreateBook?: () => void
  onOpenPath: (path: string) => void
  onOpenServer?: () => void
  onLinkFile?: () => void
  onSaveCopy?: () => void
  onDownload?: () => void
  onSaveServerAs?: () => void
  onReload?: () => void
  reloadEnabled?: boolean
  onClose?: () => void
}) {
  const { t } = useI18n()
  const selectRef = useRef<HTMLSelectElement>(null)
  const browser = engine === 'wasm'
  const busy = opening || disabled

  function resetSelect() {
    const el = selectRef.current
    if (!el) return
    el.value = currentPath ?? ''
  }

  const hasActions =
    showActions &&
    (onLinkFile || onSaveCopy || onDownload || onSaveServerAs || onReload || onClose)

  return (
    <div className="file-pick-wrap">
      <label className="file-pick">
        <select
          ref={selectRef}
          className="file-pick-select"
          aria-label={t('file.label')}
          disabled={busy}
          value={currentPath ?? ''}
          onChange={(e) => {
            const next = e.target.value
            if (next === CHOOSE_CREATE) {
              resetSelect()
              onCreateBook?.()
              return
            }
            if (next === CHOOSE_NEW) {
              resetSelect()
              onChooseNew()
              return
            }
            if (next === CHOOSE_SERVER) {
              resetSelect()
              onOpenServer?.()
              return
            }
            if (next === ACTION_LINK_FILE) {
              resetSelect()
              onLinkFile?.()
              return
            }
            if (next === ACTION_SAVE_COPY) {
              resetSelect()
              onSaveCopy?.()
              return
            }
            if (next === ACTION_DOWNLOAD) {
              resetSelect()
              onDownload?.()
              return
            }
            if (next === ACTION_SAVE_SERVER_AS) {
              resetSelect()
              onSaveServerAs?.()
              return
            }
            if (next === ACTION_RELOAD) {
              resetSelect()
              onReload?.()
              return
            }
            if (next === ACTION_CLOSE) {
              resetSelect()
              onClose?.()
              return
            }
            if (next) onOpenPath(next)
          }}
        >
          {currentPath ? null : (
            <option value="" disabled>
              {opening ? t('file.opening') : t('file.choose')}
            </option>
          )}
          {onCreateBook ? <option value={CHOOSE_CREATE}>{t('file.createBook')}</option> : null}
          <option value={CHOOSE_NEW}>{t('file.chooseNew')}</option>
          {onOpenServer ? <option value={CHOOSE_SERVER}>{t('file.fromServer')}</option> : null}
          {hasActions ? (
            <optgroup label={t('file.actions')}>
              {browser && !writableLinked && onLinkFile ? (
                <option value={ACTION_LINK_FILE} disabled={busy || !canLinkWritableFile}>
                  {t('file.linkOriginal')}
                </option>
              ) : null}
              {browser && onSaveCopy ? (
                <option value={ACTION_SAVE_COPY} disabled={busy}>
                  {t('file.saveAs')}
                </option>
              ) : null}
              {!browser && onDownload ? (
                <option value={ACTION_DOWNLOAD} disabled={busy}>
                  {t('file.saveAs')}
                </option>
              ) : null}
              {onSaveServerAs ? (
                <option value={ACTION_SAVE_SERVER_AS} disabled={busy}>
                  {t('file.saveServerAs')}
                </option>
              ) : null}
              {onReload ? (
                <option value={ACTION_RELOAD} disabled={busy || !reloadEnabled}>
                  {t('file.reloadDiscard')}
                </option>
              ) : null}
              {onClose ? (
                <option value={ACTION_CLOSE} disabled={busy}>
                  {browser ? t('file.forgetDevice') : t('file.closeBook')}
                </option>
              ) : null}
            </optgroup>
          ) : null}
          {recents.length > 0 ? (
            <optgroup label={t('file.recent')}>
              {recents.map((book) => (
                <option key={book.path} value={book.path}>
                  {book.name}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
      </label>
    </div>
  )
}
