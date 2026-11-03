import { useEffect, useId, useRef, useState } from 'react'
import { useI18n } from '../../../i18n'
import { Pill } from '../../../shared/Pill'
import { formatEurInput, parseEurInput, sanitizeEurInput } from '../../../shared/money'
import { ANSWERS, openAnswers, type DistributionInput, type ShareholderInput, type TaxReturnInputs, type TaxReturnView } from '../api'
import { formatDay } from './format'
import { anchorId } from './jump'

/** Two choices and neither preselected, so a question nobody has considered cannot pass for a no. */
export function YesNo({ question, value, onChange }: { question: string; value: boolean | null | undefined; onChange: (value: boolean) => void }) {
  const { t } = useI18n()
  const name = useId()
  return (
    <div className={`tax-return-yesno${value == null ? ' tax-return-yesno-open' : ''}`} role="radiogroup" aria-label={question} aria-required="true">
      <span className="tax-return-yesno-question">{question}</span>
      <span className="tax-return-yesno-choices">
        <label>
          <input type="radio" name={name} checked={value === true} onChange={() => onChange(true)} /> {t('taxReturn.fact.yes')}
        </label>
        <label>
          <input type="radio" name={name} checked={value === false} onChange={() => onChange(false)} /> {t('taxReturn.fact.no')}
        </label>
      </span>
    </div>
  )
}

export function EurField({ label, cents, onChange }: { label: string; cents: number; onChange: (cents: number) => void }) {
  const [draft, setDraft] = useState(formatEurInput(cents, { emptyZero: true }))
  return (
    <label>
      {label}
      <input
        type="text"
        inputMode="decimal"
        value={draft}
        onChange={(e) => {
          const next = sanitizeEurInput(e.target.value)
          setDraft(next)
          onChange(parseEurInput(next))
        }}
      />
    </label>
  )
}

const EMPTY_HOLDER: ShareholderInput = { name: '', shares: 0, rents_cents: 0, interest_cents: 0, sales_cents: 0, other_cents: 0, loans_cents: 0 }

function Distribution({
  anchor,
  legend,
  value,
  onChange,
}: {
  anchor: string
  legend: string
  value: DistributionInput | null
  onChange: (value: DistributionInput | null) => void
}) {
  const { t } = useI18n()
  const current = value ?? { decided: '', payable: '', amount_cents: 0 }
  const set = (patch: Partial<DistributionInput>) => {
    const next = { ...current, ...patch }
    onChange(next.decided || next.payable || next.amount_cents ? next : null)
  }
  return (
    <fieldset id={anchorId(anchor)} tabIndex={-1} className="tax-return-fieldset">
      <legend>{legend}</legend>
      <label>
        {t('taxReturn.fact.decided')}
        <input type="date" value={current.decided} onChange={(e) => set({ decided: e.target.value })} />
      </label>
      <label>
        {t('taxReturn.fact.payable')}
        <input type="date" value={current.payable} onChange={(e) => set({ payable: e.target.value })} />
      </label>
      <EurField label={t('taxReturn.fact.amount')} cents={current.amount_cents} onChange={(amount_cents) => set({ amount_cents })} />
    </fieldset>
  )
}

/** What the book cannot know, saved with the book. The personal ID is not asked here. */
export function FactsTab({ view, onSave }: { view: TaxReturnView; onSave: (inputs: TaxReturnInputs) => Promise<void> }) {
  const { t } = useI18n()
  const [draft, setDraft] = useState<TaxReturnInputs>(view.inputs)
  const [dirty, setDirty] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setDraft(view.inputs)
    setDirty(false)
  }, [view.inputs])

  // Leaving the tab keeps what was typed, so moving to the file does not lose it.
  const pending = useRef<TaxReturnInputs | null>(null)
  const save = useRef(onSave)
  save.current = onSave
  useEffect(() => {
    pending.current = dirty ? draft : null
  }, [dirty, draft])
  useEffect(
    () => () => {
      if (pending.current) void save.current(pending.current)
    },
    [],
  )

  const patch = (next: Partial<TaxReturnInputs>) => {
    setDraft((old) => ({ ...old, ...next }))
    setDirty(true)
    setSaved(false)
  }
  const setHolder = (index: number, next: Partial<ShareholderInput>) => {
    patch({ shareholders: draft.shareholders.map((row, i) => (i === index ? { ...row, ...next } : row)) })
  }
  const unanswered = openAnswers(draft.answers).length

  return (
    <form
      className="tax-return-facts"
      onSubmit={(e) => {
        e.preventDefault()
        void onSave(draft).then(() => setSaved(true))
      }}
    >
      {view.carried_from ? <p className="muted">{t('taxReturn.carried', { date: formatDay(view.carried_from) })}</p> : null}
      <p className="muted">{t('taxReturn.fact.lead')}</p>

      <fieldset id={anchorId('contact')} tabIndex={-1} className="tax-return-fieldset">
        <legend>{t('taxReturn.fact.contact')}</legend>
        <p className="muted">{t('taxReturn.fact.contactLead')}</p>
        <label>
          {t('taxReturn.fact.contactName')}
          <input type="text" value={draft.contact_name} placeholder={view.company.contact_name} onChange={(e) => patch({ contact_name: e.target.value })} />
        </label>
        <label>
          {t('taxReturn.fact.contactPhone')}
          <input type="tel" value={draft.contact_phone} placeholder={view.company.contact_phone} onChange={(e) => patch({ contact_phone: e.target.value })} />
        </label>
        <label>
          {t('taxReturn.fact.email')}
          <input type="email" value={draft.contact_email} onChange={(e) => patch({ contact_email: e.target.value })} />
        </label>
      </fieldset>

      <fieldset id={anchorId('shareholders')} tabIndex={-1} className="tax-return-fieldset">
        <legend>{t('taxReturn.fact.shareholders')}</legend>
        <p className="muted">{t('taxReturn.fact.shareholdersLead')}</p>
        <p className="muted">{t('taxReturn.fact.idLater')}</p>
        <label className="tax-return-toggle">
          <input type="checkbox" checked={draft.all_below_10_percent} onChange={(e) => patch({ all_below_10_percent: e.target.checked })} /> {t('taxReturn.fact.allBelow10')}
        </label>
        {draft.shareholders.map((holder, index) => (
          <div key={index} className="tax-return-holder">
            <label className="tax-return-holder-name">
              {t('taxReturn.fact.holderName')}
              <input type="text" value={holder.name} onChange={(e) => setHolder(index, { name: e.target.value })} />
            </label>
            <label>
              {t('taxReturn.fact.shares')}
              <input type="number" min={0} step={1} value={holder.shares} onChange={(e) => setHolder(index, { shares: Number(e.target.value) || 0 })} />
            </label>
            <button type="button" className="btn-link tax-return-holder-delete" onClick={() => patch({ shareholders: draft.shareholders.filter((_, i) => i !== index) })}>
              {t('common.delete')}
            </button>
            <EurField label={t('taxReturn.fact.rents')} cents={holder.rents_cents} onChange={(rents_cents) => setHolder(index, { rents_cents })} />
            <EurField label={t('taxReturn.fact.interest')} cents={holder.interest_cents} onChange={(interest_cents) => setHolder(index, { interest_cents })} />
            <EurField label={t('taxReturn.fact.sales')} cents={holder.sales_cents} onChange={(sales_cents) => setHolder(index, { sales_cents })} />
            <EurField label={t('taxReturn.fact.other')} cents={holder.other_cents} onChange={(other_cents) => setHolder(index, { other_cents })} />
            <EurField label={t('taxReturn.fact.loans')} cents={holder.loans_cents} onChange={(loans_cents) => setHolder(index, { loans_cents })} />
          </div>
        ))}
        <button type="button" className="btn-secondary" onClick={() => patch({ shareholders: [...draft.shareholders, { ...EMPTY_HOLDER }] })}>
          {t('taxReturn.fact.addHolder')}
        </button>
        <label>
          {t('taxReturn.fact.ownShares')}
          <input type="number" min={0} step={1} value={draft.own_shares} onChange={(e) => patch({ own_shares: Number(e.target.value) || 0 })} />
        </label>
      </fieldset>

      <Distribution anchor="dividend" legend={t('taxReturn.fact.dividend')} value={draft.dividend} onChange={(dividend) => patch({ dividend })} />
      <Distribution anchor="free-equity" legend={t('taxReturn.fact.freeEquity')} value={draft.free_equity} onChange={(free_equity) => patch({ free_equity })} />

      <fieldset id={anchorId('statements')} tabIndex={-1} className="tax-return-fieldset">
        <legend>{t('taxReturn.fact.statements')}</legend>
        <label>
          {t('taxReturn.fact.audit')}
          <select
            value={draft.audit ?? ''}
            onChange={(e) => {
              const value = Number(e.target.value)
              patch({ audit: value === 1 || value === 2 || value === 3 ? value : null })
            }}
          >
            <option value="">{t('taxReturn.fact.choose')}</option>
            <option value="1">{t('taxReturn.fact.audit1')}</option>
            <option value="2">{t('taxReturn.fact.audit2')}</option>
            <option value="3">{t('taxReturn.fact.audit3')}</option>
          </select>
        </label>
        {draft.audit === 1 ? <YesNo question={t('taxReturn.fact.auditRemarks')} value={draft.audit_remarks} onChange={(audit_remarks) => patch({ audit_remarks })} /> : null}
        <label className="tax-return-toggle">
          <input type="checkbox" checked={draft.statements_prepared} onChange={(e) => patch({ statements_prepared: e.target.checked })} /> {t('taxReturn.fact.prepared')}
        </label>
        <label>
          {t('taxReturn.fact.ownershipYear')}
          <input
            type="number"
            min={2000}
            step={1}
            value={draft.ownership_change_year ?? ''}
            onChange={(e) => patch({ ownership_change_year: Number(e.target.value) || null })}
          />
        </label>
      </fieldset>

      <fieldset id={anchorId('answers')} tabIndex={-1} className="tax-return-fieldset">
        <legend>{t('taxReturn.fact.answers')}</legend>
        <p className="muted">{t('taxReturn.fact.answersLead')}</p>
        {ANSWERS.map((answer) => (
          <YesNo
            key={answer.key}
            question={answer.label}
            value={draft.answers[answer.key]}
            onChange={(value) => patch({ answers: { ...draft.answers, [answer.key]: value } })}
          />
        ))}
      </fieldset>

      <p className="tax-return-actions">
        <button type="submit" className="btn-primary" disabled={!dirty && view.saved}>
          {t('common.save')}
        </button>
        {saved && !dirty ? <span className="muted">{t('taxReturn.fact.saved')}</span> : null}
        {unanswered ? <Pill tone="crit">{t('taxReturn.fact.unanswered', { count: unanswered })}</Pill> : null}
      </p>
    </form>
  )
}
