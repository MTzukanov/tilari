import { useState } from 'react'
import { deadlineAlerts } from '../../../book/modules/company/domain/deadlines'
import { useI18n } from '../../../i18n'
import { formatDate } from '../../../shared/dates'
import { COMPANY_KINDS, type CompanyOverview, type NextDeadline, type PeriodView, type Suggestion } from '../api'
import { allSuggestions, deadlineStateText, errorText, periodRange, periodShort, suggestionAdd, useCompany } from './format'
import { DocumentRow, SlotRow, SuggestionRows, type SlotActions } from './Slot'

function PeriodRow({ period, onOpen }: { period: PeriodView; onOpen: () => void }) {
  const { t } = useI18n()
  const complete = period.docs.required > 0 && period.docs.done === period.docs.required
  const alerts = period.deadlines.filter(deadlineAlerts).length
  const suggestions = period.slots.reduce((n, s) => n + s.suggestions.length, 0)
  return (
    <li>
      <button type="button" className="company-period" onClick={onOpen}>
        <strong>{periodRange(period)}</strong>
        <span className="company-status">
          {t(!period.ended ? 'company.periods.running' : period.locked ? 'company.periods.locked' : 'company.periods.open')}
        </span>
        {period.ended ? (
          <span className={`company-status ${complete ? 'company-status-complete' : 'company-status-waiting'}`}>
            {t('company.periods.docs', { done: period.docs.done, required: period.docs.required })}
          </span>
        ) : null}
        {alerts ? <span className="company-status company-status-missing">{t('company.periods.deadlines', { n: alerts })}</span> : null}
        {period.problems ? <span className="company-status company-status-problem">{t('company.periods.problems', { n: period.problems })}</span> : null}
        {suggestions ? <span className="company-status company-status-suggestion">{t('company.periods.suggestions', { n: suggestions })}</span> : null}
      </button>
    </li>
  )
}

function NextDeadlines({ overview, onOpenPeriod }: { overview: CompanyOverview; onOpenPeriod: (ends: string) => void }) {
  const { t } = useI18n()
  const label = (d: NextDeadline) => {
    const period = overview.periods.find((p) => p.ends === d.period_ends)
    return period ? periodShort(period) : d.period_ends
  }
  if (!overview.next_deadlines.length) return null
  return (
    <section className="overview-panel company-next">
      <h3>{t('company.next.title')}</h3>
      <ul className="property-doc-list">
        {overview.next_deadlines.map((d) => (
          <li key={`${d.period_ends}-${d.key}`}>
            <button type="button" className="btn-link" onClick={() => onOpenPeriod(d.period_ends)}>
              {formatDate(d.due)} · {t(`company.deadline.${d.key}`)} · {label(d)}
            </button>
            <span className={`company-status ${d.state === 'overdue' ? 'company-status-missing' : 'company-status-waiting'}`}>{deadlineStateText(d, t)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function SuggestionsPanel({ overview, actions }: { overview: CompanyOverview; actions: SlotActions }) {
  const { t } = useI18n()
  const [error, setError] = useState<string | null>(null)
  const suggestions = allSuggestions(overview)
  if (!suggestions.length) return null
  const target = (s: Suggestion) => {
    const period = overview.periods.find((p) => p.ends === s.period_ends)
    return [t(`company.kind.${s.kind}`), period ? periodShort(period) : t('company.documents.companyLevel')].join(' · ')
  }
  return (
    <section className="overview-panel company-suggest">
      <h3>{t('company.suggest.title')}</h3>
      <p className="muted">{t('company.suggest.lead')}</p>
      {overview.read_only ? null : (
        <button
          type="button"
          className="btn-primary"
          onClick={() => actions.apply({ add: suggestions.map(suggestionAdd) }).catch((err) => setError(errorText(t, err)))}
        >
          {t('company.suggest.addAll', { n: suggestions.length })}
        </button>
      )}
      {error ? <p className="error">{error}</p> : null}
      <details className="company-suggest-list">
        <summary>{t('company.suggest.show')}</summary>
        <SuggestionRows suggestions={suggestions} actions={actions} readOnly={overview.read_only} onError={setError} showTarget={target} />
      </details>
    </section>
  )
}

function SettingsPanel({ overview, actions }: { overview: CompanyOverview; actions: SlotActions }) {
  const { t } = useI18n()
  const [error, setError] = useState<string | null>(null)
  const change = (key: 'audited' | 'annual_report', value: boolean) =>
    actions.apply({ settings: { [key]: value } }).catch((err) => setError(errorText(t, err)))
  return (
    <details className="property-defaults">
      <summary>{t('company.settings.title')}</summary>
      <label className="allocation-check">
        <input
          type="checkbox"
          disabled={overview.read_only}
          checked={overview.settings.audited === true}
          onChange={(e) => void change('audited', e.target.checked)}
        />
        {t('company.settings.audited')}
      </label>
      <label className="allocation-check">
        <input
          type="checkbox"
          disabled={overview.read_only}
          checked={overview.settings.annual_report === true}
          onChange={(e) => void change('annual_report', e.target.checked)}
        />
        {t('company.settings.annualReport')}
      </label>
      {error ? <p className="error">{error}</p> : null}
    </details>
  )
}

/** `#/company`: what is due, what the book suggests, the company's own documents and the periods. */
export function CompanyFront({
  today,
  onOpenPeriod,
  onOpenDocuments,
  onOpenVoucher,
}: {
  today: string | undefined
  onOpenPeriod: (ends: string) => void
  onOpenDocuments: () => void
  onOpenVoucher: (voucherId: number) => void
}) {
  const { t } = useI18n()
  const { data, error, loading, apply, refresh } = useCompany(today)
  const [rowError, setRowError] = useState<string | null>(null)
  const actions: SlotActions = { apply, refresh, onOpenVoucher }
  return (
    <section className="company-page">
      <h2>{t('company.title')}</h2>
      <p className="lede">{t('company.lead')}</p>
      {error ? <p className="error">{error}</p> : null}
      {loading && !data ? <p className="muted">{t('app.loadingGeneric')}</p> : null}
      {data?.corrupt ? <p className="error">{t('company.corrupt')}</p> : null}
      {data?.read_only && !data.corrupt ? <p className="company-note">{t('company.readOnly')}</p> : null}
      {data ? (
        <>
          <NextDeadlines overview={data} onOpenPeriod={onOpenPeriod} />
          <SuggestionsPanel overview={data} actions={actions} />

          <section className="overview-panel">
            <h3>{t('company.periods.title')}</h3>
            {data.periods.length ? (
              <ul className="company-periods">
                {data.periods.map((p) => (
                  <PeriodRow key={p.ends} period={p} onOpen={() => onOpenPeriod(p.ends)} />
                ))}
              </ul>
            ) : (
              <p className="muted">{t('company.periods.empty')}</p>
            )}
          </section>

          <section className="overview-panel">
            <h3>{t('company.companyDocs.title')}</h3>
            <p className="muted">{t('company.companyDocs.lead')}</p>
            {COMPANY_KINDS.map((kind) => {
              const slot = data.company_slots.find((s) => s.kind === kind)!
              const label = t(`company.kind.${kind}`)
              return (
                <SlotRow
                  key={kind}
                  kind={kind}
                  label={label}
                  documents={slot.documents}
                  suggestions={slot.suggestions}
                  periodEnds={null}
                  defaultTitle={label}
                  overview={data}
                  today={today ?? data.as_of}
                  actions={actions}
                />
              )
            })}
          </section>

          {data.orphans.length ? (
            <section className="overview-panel">
              <h3>{t('company.orphans.title')}</h3>
              <p className="muted">{t('company.orphans.lead')}</p>
              {rowError ? <p className="error">{rowError}</p> : null}
              <ul className="property-doc-list">
                {data.orphans.map((doc) => (
                  <DocumentRow key={doc.key} doc={doc} actions={actions} readOnly={data.read_only} onError={setRowError} />
                ))}
              </ul>
            </section>
          ) : null}

          <p>
            <button type="button" className="btn-secondary" onClick={onOpenDocuments}>
              {t('company.documents.open', { n: data.documents.length })}
            </button>
          </p>
          <SettingsPanel overview={data} actions={actions} />
        </>
      ) : null}
    </section>
  )
}
