import { useI18n } from '../../../i18n'
import { Pill, type PillTone } from '../../../shared/Pill'
import type { CheckView, TaxReturnView } from '../api'
import { checkText, checksTitle, passedText } from './checkText'
import { checkJump, type Jump } from './jump'

const TONE: Record<CheckView['state'], PillTone> = { ok: 'ok', warn: 'warn', crit: 'crit' }

/** One thing to fix or look at; its text takes the owner where it is fixed. */
export function IssueRow({ tone, label, text, jump, onJump }: { tone: PillTone; label: string; text: string; jump: Jump | null; onJump: (jump: Jump) => void }) {
  return (
    <li>
      <Pill tone={tone}>{label}</Pill>
      {jump ? (
        <button type="button" className="btn-link tax-return-jump" onClick={() => onJump(jump)}>
          {text}
        </button>
      ) : (
        <span>{text}</span>
      )}
    </li>
  )
}

/** Every reconciliation, exact to the cent. A problem comes first, passed ones stay short. */
export function Checks({ view, onJump }: { view: TaxReturnView; onJump: (jump: Jump) => void }) {
  const { t } = useI18n()
  const open = view.checks.filter((check) => check.state !== 'ok')
  const passed = passedText(t, view.checks)
  return (
    <section className="tax-return-checks" aria-label={t('taxReturn.checks.title')}>
      <h3 className="tax-return-checks-title">{checksTitle(t, view.checks)}</h3>
      {open.length ? (
        <ul className="tax-return-check-list">
          {open.map((check) => (
            <IssueRow
              key={`${check.key}-${check.codes?.join() ?? ''}`}
              tone={TONE[check.state]}
              label={t(`taxReturn.state.${check.state}`)}
              text={checkText(t, check)}
              jump={checkJump(check)}
              onJump={onJump}
            />
          ))}
        </ul>
      ) : null}
      {passed ? (
        <p className="muted tax-return-passed">
          {t('taxReturn.checks.passed')}: {passed}
        </p>
      ) : null}
    </section>
  )
}
