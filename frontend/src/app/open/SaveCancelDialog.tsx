import { useI18n } from '../../i18n'

export type SaveCancelChoice = 'continue' | 'revert'

/** After aborting a locker save: resume upload, or undo the incomplete shelf write. */
export function SaveCancelDialog({
  open,
  createdNew,
  onChoose,
}: {
  open: boolean
  /** True when this save minted (or would mint) a new shelf kitsas entry. */
  createdNew: boolean
  onChoose: (choice: SaveCancelChoice) => void
}) {
  const { t } = useI18n()
  if (!open) return null

  return (
    <div className="busy-cancel-backdrop" role="presentation">
      <section
        className="engine-dialog file-prompt"
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-cancel-title"
      >
        <h2 id="save-cancel-title">{t('file.saveCancelTitle')}</h2>
        <p className="muted">
          {createdNew ? t('file.saveCancelBodyNew') : t('file.saveCancelBodyUpdate')}
        </p>
        <div className="engine-dialog-actions engine-dialog-actions-stack">
          <button type="button" className="file-btn" onClick={() => onChoose('continue')}>
            {t('file.saveCancelContinue')}
          </button>
          <button type="button" className="file-btn-secondary" onClick={() => onChoose('revert')}>
            {createdNew ? t('file.saveCancelRevertNew') : t('file.saveCancelRevertUpdate')}
          </button>
        </div>
      </section>
    </div>
  )
}
