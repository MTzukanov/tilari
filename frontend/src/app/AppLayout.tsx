import type { ReactNode, RefObject } from 'react'
import { BookStatusBar } from './BookStatusBar'
import { EngineOpenDialog } from './EngineOpenDialog'
import { FilePick } from './FilePick'
import { LockerPanel } from './open/LockerPanel'
import { SaveButton } from './SaveButton'
import { SessionChangesPanel } from './SessionChangesPanel'
import { SideNav } from './SideNav'
import { TilariMark } from '../shared/TilariMark'
import type { AttachmentSyncState, LockerBook, Meta, SessionPersistState } from '../api'
import type { LastBook } from './open/lastBook'
import type { SessionChange } from '../book/sessionLog'
import type { EngineKind } from '../book/service'
import { fileStorageKind } from './open/fileStorage'
import { useI18n } from '../i18n'
import type { Route } from './routing'
import { canLinkWritableFile } from '../api'
import { PracticeBanner } from './PracticeBanner'
import { DisplayMenu } from '../shared/DisplayMenu'

export type BusyState = {
  title: string
  loaded: number
  total: number | null
  cancellable: boolean
}

export function AppLayout({
  route,
  navOpen,
  onCloseNav,
  onOpenNav,
  onNavigate,
  onHome,
  meta,
  ready,
  dirty,
  opening,
  saving,
  busy,
  attSync,
  sessionPersist,
  sessionChanges,
  writableLinked,
  openEngine,
  recents,
  fileInputRef,
  onFileChosen,
  onReloadDiscard,
  onSavePrimary,
  onChooseNewFile,
  onCreateBook,
  onOpenRecent,
  onOpenServerList,
  onLinkWritableFile,
  onSaveAsName,
  onSaveServerAs,
  onForgetDevice,
  error,
  onDismissError,
  fileNote,
  lockerOpen,
  lockerBooks,
  onPickLocker,
  onCloseLocker,
  onLockerKindChange,
  children,
  asOfDate,
  pendingOpenLabel,
  pendingOpenForcedEngine,
  pendingOpen,
  defaultEngine,
  allowHttpEngine = true,
  onConfirmPendingOpen,
  onCancelPendingOpen,
  onCancelBusy,
  onRefreshRoute,
  onPracticeDate,
}: {
  route: Route
  navOpen: boolean
  onCloseNav: () => void
  onOpenNav: () => void
  onNavigate: (hash: string) => void
  onHome: () => void
  meta: Meta | null
  ready: boolean
  dirty: boolean
  opening: boolean
  saving: boolean
  busy: BusyState | null
  attSync: AttachmentSyncState
  sessionPersist: SessionPersistState
  sessionChanges: SessionChange[]
  writableLinked: boolean
  openEngine: EngineKind | null
  recents: LastBook[]
  fileInputRef: RefObject<HTMLInputElement | null>
  onFileChosen: (file: File | undefined) => void
  onReloadDiscard: () => void
  onSavePrimary: () => void
  onChooseNewFile: () => void
  onCreateBook: () => void
  onOpenRecent: (path: string) => void
  onOpenServerList: () => void
  onLinkWritableFile: () => void
  onSaveAsName: () => void
  onSaveServerAs: () => void
  onForgetDevice: () => void
  error: string | null
  onDismissError: () => void
  fileNote: string | null
  lockerOpen: boolean
  lockerBooks: LockerBook[] | null
  onPickLocker: (id: string, name: string) => void
  onCloseLocker: () => void
  onLockerKindChange: () => void
  children: ReactNode
  asOfDate: string
  pendingOpenLabel: string
  pendingOpenForcedEngine?: EngineKind
  pendingOpen: boolean
  defaultEngine: EngineKind
  allowHttpEngine?: boolean
  onConfirmPendingOpen: (kind: EngineKind) => void
  onCancelPendingOpen: () => void
  onCancelBusy: () => void
  onRefreshRoute: () => void
  onPracticeDate: (iso: string) => void
}) {
  const { t } = useI18n()
  const blocked = opening || Boolean(busy)

  return (
    <div className="app-shell">
      <SideNav
        route={route}
        open={navOpen}
        onClose={onCloseNav}
        onNavigate={onNavigate}
        bookOpen={Boolean(meta)}
      />
      <div className="app-main">
        <header className="topbar">
          <button type="button" className="nav-toggle" aria-label={t('nav.openMenu')} onClick={onOpenNav}>
            <span />
            <span />
            <span />
          </button>
          <div className="topbar-main">
            <button type="button" className="topbar-home" onClick={onHome}>
              <TilariMark className="tilari-mark tilari-mark-top" />
              <span className="brand">{t('app.name')}</span>
            </button>
            <div className="topbar-company">
              <h1>{meta?.name || t('app.name')}</h1>
              <p className="lede">
                {meta ? (
                  <>
                    {meta.business_id}
                    {meta.practice ? ` · ${t('app.practice')}` : ''}
                  </>
                ) : ready ? (
                  t('file.none')
                ) : (
                  t('app.loading')
                )}
              </p>
            </div>
          </div>

          <div className="topbar-controls">
            {meta ? (
              <BookStatusBar
                engine={openEngine}
                storageKind={fileStorageKind(meta.db_path, writableLinked, openEngine)}
                sourceName={meta.source_name}
                dirty={dirty}
                attSync={blocked ? { status: 'idle', loaded: 0, total: null } : attSync}
                sessionPersist={blocked ? null : sessionPersist}
              />
            ) : null}
            <div className="topbar-tools-row">
              <DisplayMenu />
              {meta ? (
                <SessionChangesPanel
                  changes={sessionChanges}
                  disabled={blocked}
                  reloadEnabled={dirty}
                  onReloadDiscard={onReloadDiscard}
                  onNavigate={onRefreshRoute}
                />
              ) : null}
              {meta ? (
                <SaveButton
                  storageKind={fileStorageKind(meta.db_path, writableLinked, openEngine)}
                  engine={openEngine}
                  sourceName={meta.source_name}
                  dirty={dirty}
                  disabled={blocked}
                  saving={saving}
                  onSave={onSavePrimary}
                />
              ) : null}
              <FilePick
                recents={recents}
                currentPath={meta?.db_path ?? null}
                opening={blocked}
                disabled={saving}
                showActions={Boolean(meta)}
                engine={openEngine ?? 'wasm'}
                writableLinked={writableLinked}
                canLinkWritableFile={canLinkWritableFile()}
                onChooseNew={onChooseNewFile}
                onCreateBook={onCreateBook}
                onOpenPath={onOpenRecent}
                onOpenServer={onOpenServerList}
                onLinkFile={openEngine !== 'http' ? onLinkWritableFile : undefined}
                onSaveCopy={openEngine !== 'http' ? onSaveAsName : undefined}
                onDownload={openEngine === 'http' ? onSaveAsName : undefined}
                onSaveServerAs={meta ? onSaveServerAs : undefined}
                onReload={meta ? onReloadDiscard : undefined}
                reloadEnabled={dirty}
                onClose={meta ? onForgetDevice : undefined}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept=".kitsas,application/octet-stream"
                hidden
                onChange={(e) => onFileChosen(e.target.files?.[0])}
              />
            </div>
          </div>
        </header>

        {meta?.practice ? (
          <PracticeBanner
            date={meta.book_date}
            disabled={blocked}
            onChange={onPracticeDate}
          />
        ) : null}

        {error ? (
          <div className="app-alert" role="alert">
            <p className="error">{error}</p>
            <button
              type="button"
              className="app-alert-dismiss"
              aria-label={t('nav.closeMenu')}
              onClick={onDismissError}
            >
              ×
            </button>
          </div>
        ) : null}

        <main className="workspace">
          {fileNote ? <p className="muted">{fileNote}</p> : null}
          {lockerOpen ? (
            <LockerPanel
              books={lockerBooks}
              onPick={onPickLocker}
              onClose={onCloseLocker}
              onKindChange={onLockerKindChange}
            />
          ) : null}

          {children}

          {meta ? (
            <footer className="foot">
              <span>{t('app.asOf', { date: asOfDate })}</span>
              <span className="path" title={meta.db_path}>
                {meta.source_name}
              </span>
            </footer>
          ) : null}

          <footer className="site-foot">
            <p className="disclaimer">{t('app.disclaimer')}</p>
            <p className="copyright">
              {t('app.copyright')}
              {' · '}
              <a href={`${import.meta.env.BASE_URL}LICENSE`}>{t('app.license')}</a>
              {' · '}
              <a href={`${import.meta.env.BASE_URL}THIRD_PARTY.md`}>{t('app.thirdParty')}</a>
            </p>
          </footer>
        </main>
      </div>
      {busy ? (
        <div
          className="busy-overlay"
          role="alertdialog"
          aria-modal="true"
          aria-busy="true"
          aria-labelledby="busy-title"
        >
          <div className="busy-card">
            <div className="busy-spinner" aria-hidden="true" />
            <p id="busy-title">{busy.title}</p>
            {busy.total && busy.total > 0 ? (
              <>
                <progress className="busy-progress" value={busy.loaded} max={busy.total} />
                <p className="muted">
                  {t('file.busyProgress', {
                    loaded: (busy.loaded / (1024 * 1024)).toFixed(1),
                    total: (busy.total / (1024 * 1024)).toFixed(1),
                  })}
                </p>
              </>
            ) : (
              <progress className="busy-progress" />
            )}
            {busy.cancellable ? (
              <button type="button" className="back-btn" onClick={onCancelBusy}>
                {t('file.cancel')}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      <EngineOpenDialog
        open={pendingOpen}
        fileName={pendingOpenLabel}
        defaultEngine={defaultEngine}
        forcedEngine={allowHttpEngine ? pendingOpenForcedEngine : 'wasm'}
        allowHttpEngine={allowHttpEngine}
        onConfirm={onConfirmPendingOpen}
        onCancel={onCancelPendingOpen}
      />
    </div>
  )
}
