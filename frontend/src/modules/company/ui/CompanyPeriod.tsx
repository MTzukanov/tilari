import { useState } from 'react'
import { useI18n } from '../../../i18n'
import { formatDate } from '../../../shared/dates'
import { PERIOD_KINDS } from '../api'
import { DeadlineTiles } from './Deadlines'
import { periodRange, periodShort, useCompany } from './format'
import { AttachSelect, SlotRow, UnlinkedRow, type SlotActions } from './Slot'

/** `#/company/period/{ends}`: one period's deadlines and documents. */
export function CompanyPeriod({
  ends,
  today,
  onBack,
  onOpenVoucher,
}: {
  ends: string
  today: string | undefined
  onBack: () => void
  onOpenVoucher: (voucherId: number) => void
}) {
  const { t } = useI18n()
  const { data, error, loading, apply, refresh } = useCompany(today)
  const [rowError, setRowError] = useState<string | null>(null)
  const actions: SlotActions = { apply, refresh, onOpenVoucher }
  const period = data?.periods.find((p) => p.ends === ends)
  const kindLabel = (kind: string) => t(`company.kind.${kind}`)
  return (
    <section className="company-page">
      <button type="button" className="back-btn" onClick={onBack}>
        {t('up.company')}
      </button>
      {error ? <p className="error">{error}</p> : null}
      {loading && !data ? <p className="muted">{t('app.loadingGeneric')}</p> : null}
      {data && !period ? <p className="error">{t('company.period.notFound')}</p> : null}
      {data && period ? (
        <>
          <h2>{t('company.period.title', { period: periodRange(period) })}</h2>
          <p className="lede">
            {t(!period.ended ? 'company.periods.running' : period.locked ? 'company.periods.locked' : 'company.periods.open')}
            {period.confirmed_at ? ` · ${t('company.period.confirmed', { date: formatDate(period.confirmed_at) })}` : ''}
          </p>

          <section className="overview-panel">
            <h3>{t('company.deadlines.title')}</h3>
            <DeadlineTiles deadlines={period.deadlines} />
            <p className="muted company-footnote">{t('company.deadlines.footnote')}</p>
          </section>

          <section className="overview-panel">
            <h3>{t('company.period.documents')}</h3>
            {period.slots.map((slot) => {
              const label = kindLabel(slot.kind)
              return (
                <SlotRow
                  key={slot.kind}
                  kind={slot.kind}
                  label={label}
                  status={slot.status}
                  documents={slot.documents}
                  suggestions={slot.suggestions}
                  periodEnds={period.ends}
                  defaultTitle={`${label} ${periodShort(period)}`}
                  overview={data}
                  today={today ?? data.as_of}
                  actions={actions}
                  kitsasStatement={slot.kind === 'financial_statements' ? period.kitsas_statement : undefined}
                  notNeededToggle={slot.required}
                />
              )
            })}
          </section>

          {period.unlinked.length ? (
            <details className="overview-panel company-unlinked">
              <summary>
                {t('company.unlinked.title')} ({period.unlinked.length})
              </summary>
              <p className="muted">{t('company.unlinked.lead')}</p>
              {rowError ? <p className="error">{rowError}</p> : null}
              <ul className="property-doc-list">
                {period.unlinked.map((c) => (
                  <UnlinkedRow key={c.voucher_id} candidate={c} actions={actions}>
                    {data.read_only ? null : (
                      <AttachSelect candidate={c} kinds={PERIOD_KINDS} periodEnds={period.ends} kindLabel={kindLabel} actions={actions} onError={setRowError} />
                    )}
                  </UnlinkedRow>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      ) : null}
    </section>
  )
}
