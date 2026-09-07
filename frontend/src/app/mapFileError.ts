import { t } from '../i18n'

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === 'AbortError') ||
    (err instanceof Error && err.name === 'AbortError')
  )
}

/** Map machine error codes from book/locker IO to localized user-facing text. */
export function mapFileError(err: unknown): string | null {
  if (isAbortError(err)) return null
  if (!(err instanceof Error)) return String(err)
  switch (err.message) {
    case 'etag_mismatch':
      return t('file.lockerConflict')
    case 'no_writable_link':
      return t('file.noWritableLink')
    case 'permission_denied':
      return t('file.linkPermissionDenied')
    case 'kitsas_required':
      return t('file.kitsasRequired')
    case 'file_picker_unsupported':
      return t('file.linkUnsupported')
    case 'reload_unavailable':
      return t('file.reloadUnavailable')
    case 'locker_http_unsupported':
      return t('file.lockerHttpUnsupported')
    case 'locker_not_configured':
      return t('file.lockerNotConfigured')
    case 'locker_mismatch':
      return t('file.lockerMismatch')
    case 'locker_http_url':
      return t('file.lockerHttpNeedConnect')
    case 'locker_http_unreachable':
      return t('file.lockerHttpUnreachable')
    case 'locker_service_role':
      return t('file.lockerServiceRole')
    case 'locker_bad_secret':
      return t('file.lockerBadSecret')
    case 'locker_secret':
      return t('file.lockerNeedSecret')
    case 'locker_url':
    case 'locker_settings':
      return t('file.lockerNeedConnect')
    case 'no_book':
      return t('file.noBook')
    case 'exists_failed':
      return t('file.lockerExistsFailed')
    case 'download_failed':
      return t('file.lockerDownloadFailed')
    case 'upload_failed':
      return t('file.lockerUploadFailed')
    case 'delete_failed':
      return t('file.lockerDeleteFailed')
    case 'locker_list_failed':
      return t('file.lockerListFailed')
    case 'locker_gc_unsupported':
      return t('file.lockerGcUnsupported')
    case 'locker_id_missing':
      return t('file.lockerIdMissing')
    case 'not_found':
    case 'book_not_found':
      return t('file.lockerBookNotFound')
    case 'duplicate':
      return t('file.lockerDuplicate')
    case 'create_wasm_only':
      return t('file.createWasmOnly')
    case 'name_required':
      return t('file.createNameRequired')
    case 'ytunnus_invalid':
      return t('file.createYtunnusInvalid')
    case 'fiscal_year_invalid':
      return t('file.createYearInvalid')
    default:
      return err.message
  }
}
