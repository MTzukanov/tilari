import { canPrimarySave, type FileStorageKind } from './open/fileStorage'
import type { EngineKind } from '../book/service'
import { useI18n } from '../i18n'

export function SaveButton({
  storageKind,
  engine,
  sourceName,
  dirty,
  disabled,
  saving,
  onSave,
}: {
  storageKind: FileStorageKind | null
  engine: EngineKind | null
  sourceName: string | null
  dirty: boolean
  disabled?: boolean
  saving?: boolean
  onSave: () => void
}) {
  const { t } = useI18n()
  if (!storageKind || !engine) return null
  if (engine === 'http' && storageKind !== 'locker') return null

  const canSave = canPrimarySave(storageKind, engine, dirty)

  const title =
    storageKind === 'locker'
      ? t('file.saveBtnLockerHint', { name: sourceName ?? '' })
      : storageKind === 'disk'
        ? t('file.saveBtnDiskHint', { name: sourceName ?? '' })
        : t('file.saveBtnBrowserHint')

  return (
    <button
      type="button"
      className="save-btn"
      disabled={disabled || saving || !canSave}
      title={title}
      onClick={onSave}
    >
      {saving ? t('file.saving') : t('file.saveBtn')}
    </button>
  )
}
