import { useI18n } from '../../i18n'

export type DisconnectChoice = 'save' | 'abandon' | 'cancel'

/** Confirm before dropping BYO connection while a dirty locker book is open. */
export function LockerDisconnectDialog({
  open,
  closesServerSession = false,
  onChoose,
}: {
  open: boolean
  /** HTTP-engine locker books: disconnect ends the Node editing session (no browser ledger). */
  closesServerSession?: boolean
  onChoose: (choice: DisconnectChoice) => void
}) {
  const { t } = useI18n()
  if (!open) return null

  return (
    <div className="engine-dialog-backdrop" role="presentation" onClick={() => onChoose('cancel')}>
      <section
        className="engine-dialog file-prompt"
        role="dialog"
        aria-modal="true"
        aria-labelledby="locker-disconnect-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="locker-disconnect-title">{t('file.lockerDisconnectTitle')}</h2>
        <p className="muted">
          {closesServerSession
            ? t('file.lockerDisconnectUnsavedHttp')
            : t('file.lockerDisconnectUnsaved')}
        </p>
        <div className="engine-dialog-actions engine-dialog-actions-stack">
          <button type="button" className="file-btn" onClick={() => onChoose('save')}>
            {closesServerSession
              ? t('file.lockerDisconnectSaveHttp')
              : t('file.lockerDisconnectSave')}
          </button>
          <button type="button" className="file-btn-secondary" onClick={() => onChoose('abandon')}>
            {closesServerSession
              ? t('file.lockerDisconnectAbandonHttp')
              : t('file.lockerDisconnectAbandon')}
          </button>
          <button type="button" className="file-btn-secondary" onClick={() => onChoose('cancel')}>
            {t('file.lockerDisconnectCancel')}
          </button>
        </div>
      </section>
    </div>
  )
}
