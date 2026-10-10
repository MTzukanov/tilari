import {
  Fragment,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import type { LastBook } from './open/lastBook'
import type { EngineKind } from '../book/service'
import type { FileStorageKind } from './open/fileStorage'
import { getLockerConnection, subscribeLockerConnection } from '../book/persist/locker'
import { buildBookMenu, type BookMenuAction, type BookMenuSection } from './open/bookMenu'
import { useI18n } from '../i18n'
import { formatBookDateShort } from './open/bookDates'

const PANEL_WIDTH_PX = 368 // 23rem

const ITEM_SELECTOR = '[role="menuitem"]:not([aria-disabled="true"])'

/** Book file menu: create, then the open book, this device, and own storage. */
export function FilePick({
  recents,
  currentPath,
  currentName,
  opening,
  disabled = false,
  engine = 'wasm',
  storageKind,
  writableLinked = false,
  canLinkWritableFile = false,
  dirty = false,
  onCreateBook,
  onChooseNew,
  onOpenPath,
  onOpenServer,
  onLinkFile,
  onSaveAs,
  onDownloadLean,
  onSaveServerAs,
  onSaveServerKeepCopy,
  onReload,
  onClose,
}: {
  recents: LastBook[]
  currentPath: string | null
  currentName: string | null
  opening: boolean
  disabled?: boolean
  engine?: EngineKind
  storageKind: FileStorageKind | null
  writableLinked?: boolean
  canLinkWritableFile?: boolean
  dirty?: boolean
  onCreateBook: () => void
  onChooseNew: () => void
  onOpenPath: (path: string) => void
  onOpenServer: () => void
  onLinkFile?: () => void
  onSaveAs?: () => void
  onDownloadLean?: () => void
  onSaveServerAs?: () => void
  onSaveServerKeepCopy?: () => void
  onReload?: () => void
  onClose?: () => void
}) {
  const { t, formatLocale } = useI18n()
  const baseId = useId()
  const [open, setOpen] = useState(false)
  const [panelStyle, setPanelStyle] = useState<CSSProperties | undefined>()
  const toggleRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const conn = useSyncExternalStore(subscribeLockerConnection, getLockerConnection, getLockerConnection)
  const busy = opening || disabled
  const hasBook = currentPath != null
  const browser = engine === 'wasm'

  useEffect(() => {
    if (busy) setOpen(false)
  }, [busy])

  useLayoutEffect(() => {
    if (!open || !toggleRef.current) {
      setPanelStyle(undefined)
      return
    }
    function place() {
      const el = toggleRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const width = Math.min(Math.max(PANEL_WIDTH_PX, r.width), window.innerWidth - 16)
      // Left edge under the button like a native select; clamp so the panel stays on-screen.
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8))
      const top = Math.min(r.bottom + 4, window.innerHeight - 8)
      setPanelStyle({
        position: 'fixed',
        top,
        left,
        width,
        maxHeight: Math.max(160, window.innerHeight - top - 8),
        zIndex: 4000,
      })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  // Focus once per opening; later re-placements (scroll, resize) must not steal it back.
  const placed = panelStyle != null
  useEffect(() => {
    if (open && placed) panelRef.current?.querySelector<HTMLElement>(ITEM_SELECTOR)?.focus()
  }, [open, placed])

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      const node = e.target as Node
      if (toggleRef.current?.contains(node) || panelRef.current?.contains(node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  function close() {
    setOpen(false)
    toggleRef.current?.focus()
  }

  function onPanelKey(e: KeyboardEvent<HTMLDivElement>) {
    const items = [...(panelRef.current?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? [])]
    const at = items.indexOf(document.activeElement as HTMLElement)
    let next: number | null = null
    if (e.key === 'ArrowDown') next = at < 0 ? 0 : (at + 1) % items.length
    else if (e.key === 'ArrowUp') next = at <= 0 ? items.length - 1 : at - 1
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = items.length - 1
    else if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault()
      close()
      return
    }
    if (next == null || !items.length) return
    e.preventDefault()
    items[next].focus()
  }

  const handlers: Record<BookMenuAction, (() => void) | undefined> = {
    create: onCreateBook,
    openFile: onChooseNew,
    linkFile: onLinkFile,
    saveAsFile: onSaveAs,
    downloadLean: onDownloadLean,
    connectStorage: onOpenServer,
    openStorage: onOpenServer,
    saveStorageAs: onSaveServerAs,
    saveStorageCopy: onSaveServerKeepCopy,
    reload: onReload,
    close: onClose,
  }

  function actionText(id: BookMenuAction, disabledNow: boolean): { label: string; hint: string } {
    switch (id) {
      case 'create':
        return { label: t('file.createBook'), hint: t('file.menu.createHint') }
      case 'openFile':
        return { label: t('file.chooseNew'), hint: t('file.menu.openFileHint') }
      case 'linkFile':
        return { label: t('file.linkOriginal'), hint: t('file.linkOriginalHint') }
      case 'saveAsFile':
        return { label: t('file.saveAs'), hint: t('file.menu.saveAsFileHint') }
      case 'downloadLean':
        return { label: t('file.downloadLean'), hint: t('file.menu.downloadLeanHint') }
      case 'connectStorage':
        return { label: t('file.menu.connectStorage'), hint: t('file.menu.connectStorageHint') }
      case 'openStorage':
        return { label: t('file.fromServer'), hint: t('file.menu.openStorageHint') }
      case 'saveStorageAs':
        return { label: t('file.saveServerAs'), hint: t('file.saveServerAsHint') }
      case 'saveStorageCopy':
        return { label: t('file.saveServerKeepCopy'), hint: t('file.saveServerKeepCopyHint') }
      case 'reload':
        return {
          label: t('file.reloadDiscard'),
          hint: disabledNow ? t('session.reloadDiscardDisabled') : t('file.menu.reloadHint'),
        }
      case 'close':
        return browser
          ? { label: t('file.forgetDevice'), hint: t('file.menu.forgetHint') }
          : { label: t('file.closeBook'), hint: t('file.closeBookHint') }
    }
  }

  function sectionTitle(section: BookMenuSection): string | null {
    switch (section.id) {
      case 'device':
        return t('file.menu.groupDevice')
      case 'storage':
        return conn.mode === 'supabase'
          ? `${t('file.menu.groupStorage')} · ${t('file.lockerStatusSupabase')}`
          : conn.mode === 'http'
            ? `${t('file.menu.groupStorage')} · ${t('file.lockerStatusHttp')}`
            : t('file.menu.groupStorage')
      case 'book':
        return t('file.menu.groupBook')
      default:
        return null
    }
  }

  function renderRecent(section: BookMenuSection, book: LastBook) {
    const current = book.path === currentPath
    const date = formatBookDateShort(book.source_modified_at, formatLocale)
    return (
      <button
        key={book.path}
        type="button"
        role="menuitem"
        tabIndex={-1}
        className={`book-menu-item book-menu-recent${current ? ' is-current' : ''}`}
        aria-current={current ? 'true' : undefined}
        onClick={() => {
          close()
          if (current) return
          // Storage books need a connection; the storage panel offers it.
          if (section.id === 'storage' && conn.mode === 'off') onOpenServer()
          else onOpenPath(book.path)
        }}
      >
        <span className="book-menu-mark" aria-hidden="true">
          {current ? '●' : ''}
        </span>
        <span className="book-menu-name" title={book.name}>
          {book.name}
        </span>
        {date ? <span className="book-menu-date">{date}</span> : null}
      </button>
    )
  }

  function renderSection(section: BookMenuSection) {
    const title = sectionTitle(section)
    const headId = `${baseId}-${section.id}`
    const actions = section.actions.filter((a) => handlers[a.id])
    return (
      <div
        key={section.id}
        role="group"
        className={`book-menu-section book-menu-${section.id}`}
        aria-labelledby={title ? headId : undefined}
      >
        {title ? (
          <div id={headId} className="book-menu-head" role="presentation">
            {title}
          </div>
        ) : null}
        {actions.map((action) => {
          const off = Boolean(action.disabled)
          const { label, hint } = actionText(action.id, off)
          const labelId = `${baseId}-${action.id}`
          const hintId = `${labelId}-hint`
          return (
            <button
              key={action.id}
              type="button"
              role="menuitem"
              tabIndex={-1}
              className={`book-menu-item book-menu-action${off ? ' is-disabled' : ''}`}
              aria-disabled={off ? 'true' : undefined}
              aria-labelledby={labelId}
              aria-describedby={hintId}
              onClick={() => {
                if (off) return
                close()
                handlers[action.id]?.()
              }}
            >
              <span id={labelId} className="book-menu-label">
                {label}
              </span>
              <span id={hintId} className="book-menu-hint">
                {hint}
              </span>
            </button>
          )
        })}
        {section.recents.length ? (
          <div role="group" className="book-menu-recents" aria-labelledby={`${headId}-recent`}>
            <div id={`${headId}-recent`} className="book-menu-sub" role="presentation">
              {t('file.recent')}
            </div>
            {section.recents.map((book) => renderRecent(section, book))}
          </div>
        ) : null}
      </div>
    )
  }

  const sections = open
    ? buildBookMenu({
        hasBook,
        engine,
        storageKind,
        writableLinked,
        canLinkWritableFile,
        lockerMode: conn.mode,
        dirty,
        recents,
      })
    : []

  const panel = open ? (
    <div
      ref={panelRef}
      className="book-menu-panel"
      role="menu"
      aria-label={t('file.label')}
      style={panelStyle}
      onKeyDown={onPanelKey}
    >
      {sections.map((section, i) => (
        <Fragment key={section.id}>
          {i > 0 ? <div role="separator" className="book-menu-sep" /> : null}
          {renderSection(section)}
        </Fragment>
      ))}
    </div>
  ) : null

  const triggerText = opening
    ? t('file.opening')
    : hasBook
      ? (currentName ?? currentPath)
      : t('file.choose')

  return (
    <div className="file-pick-wrap">
      <button
        ref={toggleRef}
        type="button"
        className="file-pick-select"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={hasBook ? `${t('file.label')}: ${triggerText}` : t('file.label')}
        title={hasBook ? triggerText : undefined}
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault()
            setOpen(true)
          }
        }}
      >
        <span className="file-pick-text">{triggerText}</span>
      </button>
      {panel ? createPortal(panel, document.body) : null}
    </div>
  )
}
