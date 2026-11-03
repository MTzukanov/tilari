import { fieldName, type CheckView } from '../api'
import { formatDay, formatFigure } from './format'

type T = (key: string, params?: Record<string, string | number>) => string

function params(check: CheckView): Record<string, string | number> {
  const out: Record<string, string | number> = {}
  if (check.cents != null) out.amount = formatFigure(check.cents)
  if (check.count != null) out.count = check.count
  if (check.date) out.date = formatDay(check.date)
  if (check.codes) out.fields = check.codes.map(fieldName).join(', ')
  return out
}

export function checkText(t: T, check: CheckView): string {
  return t(`taxReturn.check.${check.key}`, params(check))
}

/** What passed, once each: "kirjanpidon tulos, ...". */
export function passedText(t: T, checks: CheckView[]): string {
  return [...new Set(checks.filter((check) => check.state === 'ok').map((check) => t(`taxReturn.checkOk.${check.key}`, params(check))))].join(', ')
}

/** The heading over the checks: what is left, in words. */
export function checksTitle(t: T, checks: CheckView[]): string {
  if (checks.some((check) => check.state === 'crit')) return t('taxReturn.checks.blocked')
  return t(checks.some((check) => check.state !== 'ok') ? 'taxReturn.checks.review' : 'taxReturn.checks.clean')
}
