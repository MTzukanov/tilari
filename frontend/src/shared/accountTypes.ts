import { t } from '../i18n'

export function accountTypeDescription(type: string | undefined | null): string {
  if (!type) return ''
  const key = `accountType.${type}`
  const label = t(key)
  return label === key ? t('accountType.unknown', { code: type }) : label
}
