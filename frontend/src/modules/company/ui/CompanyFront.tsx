import { useState } from 'react'
import { deadlineAlerts } from '../../../book/modules/company/domain/deadlines'
import { useI18n } from '../../../i18n'
import { Binder } from '../../../shared/Binder'
import { formatDate } from '../../../shared/dates'
import { DocLines, DocRows } from '../../../shared/DocRows'
import { DueTile, DueTiles } from '../../../shared/DueTile'
import { Pill } from '../../../shared/Pill'
import { COMPANY_KINDS, KIND_SETTINGS, type CompanyOverview, type PeriodView, type Suggestion } from '../api'
import { allSuggestions, deadlineStateText, deadlineTone, errorText, periodLabel, periodRange, suggestionAdd, useCompany } from './format'
import { PeriodBody } from './PeriodBody'
import { Shareholders } from './Shareholders'
import { DocumentRow, SlotRow, SuggestionRows, type SlotActions } from './Slot'

/** What is open: a period by its end date, the company's own documents, or nothing asked for. */
export type CompanyOpen = { ends: string } | 'own' | null

function PeriodBadges({ period }: { period: PeriodView }) {
  const { t } = useI18n()
  const complete = period.docs.required > 0 && period.docs.done === period.docs.required
  const alerts = period.deadlines.filter(deadlineAlerts).length
  const suggestions = period.slots.reduce((n, s) => n + s.suggestions.length, 0)
  return (
    <>
      {period.ended && period.locked ? (
        <Pill>{t('company.periods.locked')}</Pill>
      ) : (
        <Pill tone="accent">{t(period.ended ? 'company.periods.open' : 'company.periods.running')}</Pill>
      )}
      {period.ended ? <Pill tone={complete ? 'ok' : 'warn'}>{t('company.periods.docs', { done: period.docs.done, required: period.docs.required })}</Pill> : null}
      {alerts ? <Pill tone="crit">{t('company.periods.deadlines', { n: alerts })}</Pill> : null}
      {period.problems ? <Pill tone="crit">{t('company.periods.problems', { n: period.problems })}</Pill> : null}
      {suggestions ? <Pill tone="doc">{t('company.periods.suggestions', { n: suggestions })}</Pill> : null}
    </>
  )
}

function NextDeadlines({ overview, onOpenPeriod }: { overview: CompanyOverview; onOpenPeriod: (ends: string) => void }) {
  const { t } = useI18n()
  if (!overview.next_deadlines.length) return null
  const periodName = (ends: string) => {
    const period = overview.periods.find((p) => p.ends === ends)
    return period ? periodLabel(period, t) : ends
  }
  return (
    <section className="company-next">
      <h3 className="section-label">{t('company.next.title')}</h3>
      <DueTiles>
        {overview.next_deadlines.map((d) => (
          <DueTile
            key={`${d.period_ends}-${d.key}`}
            label={`${t(`company.deadline.${d.key}`)} · ${periodName(d.period_ends)}`}
            due={t('company.deadlines.due', { date: formatDate(d.due) })}
            state={deadlineStateText(d, t)}
            tone={deadlineTone(d)}
            onOpen={() => onOpenPeriod(d.period_ends)}
          />
        ))}
      </DueTiles>
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
    return [t(`company.kind.${s.kind}`), period ? periodLabel(period, t) : t('company.documents.companyLevel')].join(' · ')
  }
  return (
    <section className="company-suggest">
      <div className="company-suggest-head">
        <div>
          <h3>{t('company.suggest.title')}</h3>
          <p>{t('company.suggest.lead')}</p>
        </div>
        {overview.read_only ? null : (
          <button
            type="button"
            className="btn-primary"
            onClick={() => actions.apply({ add: suggestions.map(suggestionAdd) }).catch((err) => setError(errorText(t, err)))}
          >
            {t('company.suggest.addAll', { n: suggestions.length })}
          </button>
        )}
      </div>
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
  return (
    <details className="property-defaults company-settings">
      <summary>{t('company.settings.title')}</summary>
      <fieldset disabled={overview.read_only}>
        <legend>{t('company.settings.listTitle')}</legend>
        <p className="muted">{t('company.settings.lead')}</p>
        <div className="company-settings-list">
          {Object.entries(KIND_SETTINGS).map(([kind, key]) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={overview.settings[key] === true}
                onChange={(e) => void actions.apply({ settings: { [key]: e.target.checked } }).catch((err) => setError(errorText(t, err)))}
              />
              <span>
                {t(`company.kind.${kind}`)}
                <span className="company-settings-hint">{t(`company.settings.hint.${kind}`)}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {error ? <p className="error">{error}</p> : null}
    </details>
  )
}

function OwnDocuments({ overview, today, actions }: { overview: CompanyOverview; today: string; actions: SlotActions }) {
  const { t } = useI18n()
  return (
    <DocRows>
      {COMPANY_KINDS.map((kind) => {
        const slot = overview.company_slots.find((s) => s.kind === kind)!
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
            overview={overview}
            today={today}
            actions={actions}
          />
        )
      })}
    </DocRows>
  )
}

/**
 * `#/company`: what is due, what the book suggests, and cards that open in place: the company's own
 * documents and each period. The address holds what was opened, so a voucher comes back to it. With
 * nothing asked for, the newest ended period is open: that is the one with work in it.
 */
export function CompanyFront({
  today,
  open,
  onOpen,
  onOpenDocuments,
  onOpenVoucher,
}: {
  today: string | undefined
  open: CompanyOpen
  /** The new address; null when the owner closed the card. */
  onOpen: (target: CompanyOpen) => void
  onOpenDocuments: () => void
  onOpenVoucher: (from: CompanyOpen, voucherId: number) => void
}) {
  const { t } = useI18n()
  const { data, error, loading, apply, refresh } = useCompany(today)
  const [rowError, setRowError] = useState<string | null>(null)
  const [closed, setClosed] = useState(false)
  const [jump, setJump] = useState(0)

  const newestEnded = data?.periods.find((p) => p.ended) ?? data?.periods[0]
  const shown: CompanyOpen = open ?? (!closed && newestEnded ? { ends: newestEnded.ends } : null)
  const actions: SlotActions = { apply, refresh, onOpenVoucher: (voucherId) => onOpenVoucher(shown, voucherId) }
  const dayOf = (overview: CompanyOverview) => today ?? overview.as_of
  const toggle = (target: Exclude<CompanyOpen, null>, isOpen: boolean) => {
    setClosed(isOpen)
    onOpen(isOpen ? null : target)
  }
  // The default on arriving stays where the page starts; asking for a card goes to it.
  const scrollKey = open === null ? null : jump
  const missingPeriod = typeof open === 'object' && open !== null && data ? !data.periods.some((p) => p.ends === open.ends) : false

  return (
    <section className="company-page">
      <div className="company-titlebar">
        <div>
          <h2>{t('company.title')}</h2>
          <p className="lede">{t('company.lead')}</p>
        </div>
        {data ? (
          <button type="button" className="btn-secondary" onClick={onOpenDocuments}>
            {t('company.documents.open', { n: data.documents.length })}
          </button>
        ) : null}
      </div>
      {error ? <p className="error">{error}</p> : null}
      {loading && !data ? <p className="muted">{t('app.loadingGeneric')}</p> : null}
      {data?.corrupt ? <p className="error">{t('company.corrupt')}</p> : null}
      {data?.read_only && !data.corrupt ? <p className="company-note">{t('company.readOnly')}</p> : null}
      {missingPeriod ? <p className="error">{t('company.period.notFound')}</p> : null}
      {data ? (
        <>
          <NextDeadlines
            overview={data}
            onOpenPeriod={(ends) => {
              setJump(jump + 1)
              toggle({ ends }, false)
            }}
          />
          <SuggestionsPanel overview={data} actions={actions} />

          <Binder
            label={t('company.companyDocs.title')}
            sub={t('company.companyDocs.lead')}
            badges={<OwnBadges overview={data} />}
            open={shown === 'own'}
            scrollKey={scrollKey}
            onToggle={() => toggle('own', shown === 'own')}
          >
            <OwnDocuments overview={data} today={dayOf(data)} actions={actions} />
            <Shareholders overview={data} today={dayOf(data)} actions={actions} />
          </Binder>

          <h3 className="section-label">{t('company.periods.title')}</h3>
          {data.periods.length ? (
            data.periods.map((p) => {
              const isOpen = typeof shown === 'object' && shown?.ends === p.ends
              return (
                <Binder
                  key={p.ends}
                  label={<span className="num-text">{periodLabel(p, t)}</span>}
                  sub={<span className="num-text">{periodRange(p)}</span>}
                  badges={<PeriodBadges period={p} />}
                  open={isOpen}
                  scrollKey={scrollKey}
                  onToggle={() => toggle({ ends: p.ends }, isOpen)}
                >
                  <PeriodBody period={p} overview={data} today={dayOf(data)} actions={actions} />
                </Binder>
              )
            })
          ) : (
            <p className="muted">{t('company.periods.empty')}</p>
          )}

          {data.orphans.length ? (
            <section className="company-orphans">
              <h3 className="section-label">{t('company.orphans.title')}</h3>
              <p className="muted">{t('company.orphans.lead')}</p>
              {rowError ? <p className="error">{rowError}</p> : null}
              <DocLines>
                {data.orphans.map((doc) => (
                  <DocumentRow key={doc.key} doc={doc} actions={actions} readOnly={data.read_only} onError={setRowError} />
                ))}
              </DocLines>
            </section>
          ) : null}

          <SettingsPanel overview={data} actions={actions} />
        </>
      ) : null}
    </section>
  )
}

function OwnBadges({ overview }: { overview: CompanyOverview }) {
  const { t } = useI18n()
  const documents = overview.company_slots.reduce((n, s) => n + s.documents.length, 0)
  const suggestions = overview.company_slots.reduce((n, s) => n + s.suggestions.length, 0)
  return (
    <>
      <Pill tone={documents ? 'ok' : 'neutral'}>{t('company.companyDocs.count', { n: documents })}</Pill>
      {suggestions ? <Pill tone="doc">{t('company.periods.suggestions', { n: suggestions })}</Pill> : null}
    </>
  )
}
