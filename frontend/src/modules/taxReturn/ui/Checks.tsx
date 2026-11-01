import { useI18n } from '../../../i18n'
import { Pill, type PillTone } from '../../../shared/Pill'
import { fieldName, type CheckView, type TaxReturnView } from '../api'
import { formatDay, formatFigure } from './format'

const TONE: Record<CheckView['state'], PillTone> = { ok: 'ok', warn: 'warn', crit: 'crit' }

function params(check: CheckView): Record<string, string | number> {
  const out: Record<string, string | number> = {}
  if (check.cents != null) out.amount = formatFigure(check.cents)
  if (check.count != null) out.count = check.count
  if (check.date) out.date = formatDay(check.date)
  if (check.codes) out.fields = check.codes.map(fieldName).join(', ')
  return out
}

/** Every reconciliation, exact to the cent. A problem comes first, passed ones stay short. */
export function Checks({ view }: { view: TaxReturnView }) {
  const { t } = useI18n()
  const open = view.checks.filter((check) => check.state !== 'ok')
  const passed = view.checks.filter((check) => check.state === 'ok')
  const blocked = view.checks.some((check) => check.state === 'crit')
  return (
    <section className="tax-return-checks" aria-label={t('taxReturn.checks.title')}>
      <p>
        <Pill tone={blocked ? 'crit' : open.length ? 'warn' : 'ok'}>{t(blocked ? 'taxReturn.checks.blocked' : open.length ? 'taxReturn.checks.review' : 'taxReturn.checks.clean')}</Pill>
      </p>
      {open.length ? (
        <ul className="tax-return-check-list">
          {open.map((check) => (
            <li key={check.key}>
              <Pill tone={TONE[check.state]}>{t(`taxReturn.state.${check.state}`)}</Pill>
              <span>{t(`taxReturn.check.${check.key}`, params(check))}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {passed.length ? (
        <p className="muted tax-return-passed">
          {t('taxReturn.checks.passed')}: {passed.map((check) => t(`taxReturn.checkOk.${check.key}`)).join(', ')}
        </p>
      ) : null}
    </section>
  )
}
