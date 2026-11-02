import { useI18n } from '../../../i18n'
import { formatDate } from '../../../shared/dates'
import { DocLine, DocLines } from '../../../shared/DocRows'
import { formatCents } from '../../../shared/money'
import { FilePill, Pill, type PillTone } from '../../../shared/Pill'
import { StepRail, type StepTone } from '../../../shared/StepRail'
import type { DividendStepState, DividendView } from '../api'
import { OpenVoucher, type SlotActions } from './Slot'

const STEP_TONE: Record<DividendStepState, StepTone> = {
  done: 'ok',
  not_applicable: 'ok',
  waiting: 'warn',
  overdue: 'crit',
  missing: 'crit',
  no_minutes: 'crit',
  difference: 'crit',
  no_contract: 'crit',
}

/** Dividends from the period's profit: one card each, read from the ledger. */
export function DividendSection({ dividends, actions }: { dividends: DividendView[]; actions: SlotActions }) {
  const { t } = useI18n()
  if (!dividends.length) return null
  return (
    <>
      <h3 className="section-label">{t('company.dividend.title')}</h3>
      {dividends.map((d) => (
        <DividendCard key={`${d.decided_on}-${d.vouchers[0]?.voucher_id ?? ''}`} dividend={d} actions={actions} />
      ))}
    </>
  )
}

function DividendCard({ dividend: d, actions }: { dividend: DividendView; actions: SlotActions }) {
  const { t } = useI18n()
  const tones = d.steps.map((s) => STEP_TONE[s.state])
  // The card's state is the last step reached in order, red when any step has a problem.
  const reached = d.steps.findIndex((s) => STEP_TONE[s.state] !== 'ok')
  const status = reached < 0 ? t('company.dividend.state.done') : t(`company.dividend.step.${d.steps[Math.max(reached - 1, 0)].key}`)
  const statusTone: PillTone = tones.includes('crit') ? 'crit' : reached < 0 ? 'ok' : 'neutral'
  const unpaid = d.amount_snt - d.paid_snt
  const unremitted = d.withheld_snt - d.remitted_snt
  const withholdingLate = d.steps.some((s) => s.key === 'withheld' && s.state === 'overdue')

  return (
    <section className="dividend-card">
      <div className="dividend-head">
        <div>
          <strong className="dividend-name">{t('company.dividend.name')}</strong> <Pill tone={statusTone}>{status}</Pill>
          <div className="muted">{t('company.dividend.decided', { date: formatDate(d.decided_on) })}</div>
        </div>
        <span className="dividend-amount num-text">{formatCents(d.amount_snt)}</span>
      </div>

      <StepRail
        steps={d.steps.map((s) => ({
          label: t(`company.dividend.step.${s.key}`),
          state: t(`company.dividend.state.${s.state}`),
          tone: STEP_TONE[s.state],
          date: s.date ? formatDate(s.date) : undefined,
        }))}
      />

      <ul className="dividend-alerts">
        {d.paid_snt > d.amount_snt ? (
          <li className="dividend-alert dividend-alert-crit">{t('company.dividend.alert.difference', { paid: formatCents(d.paid_snt), decided: formatCents(d.amount_snt) })}</li>
        ) : null}
        {d.no_contract.length ? <li className="dividend-alert dividend-alert-crit">{t('company.dividend.alert.noContract')}</li> : null}
        {unpaid > 0 ? <li className="dividend-alert dividend-alert-warn">{t('company.dividend.alert.unpaid', { amount: formatCents(unpaid) })}</li> : null}
        {d.withheld_snt > 0 && unremitted > 0 ? (
          <li className={`dividend-alert dividend-alert-${withholdingLate ? 'crit' : 'warn'}`}>
            {t('company.dividend.alert.withholdingOpen', { amount: formatCents(unremitted), date: formatDate(d.withholding_due) })}
          </li>
        ) : null}
      </ul>

      <DocLines>
        {d.vouchers.map((v) => (
          <DocLine
            key={`${v.role}-${v.voucher_id}`}
            voucher={<OpenVoucher voucher={v} actions={actions} />}
            title={`${t(`company.dividend.voucher.${v.role}`)} · ${formatCents(v.amount_snt)}`}
            mark={v.role === 'payment' && d.no_contract.includes(v.voucher_id) ? <Pill tone="crit">{t('company.dividend.state.no_contract')}</Pill> : null}
          >
            {v.files.map((f) => (
              <FilePill key={f.id} id={f.id} name={f.name} />
            ))}
          </DocLine>
        ))}
      </DocLines>
    </section>
  )
}
