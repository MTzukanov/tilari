import { t } from '../i18n'

/** Kitsas TositeTyyppi codes (from tositetyyppimodel.h / .cpp). */

export function voucherTypeName(type: number | null | undefined): string {
  if (type == null) return ''
  const key = `voucherType.${type}`
  const label = t(key)
  return label === key ? t('voucherType.unknown', { code: type }) : label
}

/** Tosite.tila thresholds used by Kitsas. */
export function voucherStatusName(status: number | null | undefined): string {
  if (status == null) return ''
  if (status === 0) return t('voucherStatus.deleted')
  if (status < 50) return t('voucherStatus.template')
  if (status < 100) return t('voucherStatus.draft')
  return t('voucherStatus.posted')
}

export function allocationTypeName(type: number | null | undefined): string {
  if (type == null) return ''
  const key = `allocationType.${type}`
  const label = t(key)
  return label === key ? String(type) : label
}
