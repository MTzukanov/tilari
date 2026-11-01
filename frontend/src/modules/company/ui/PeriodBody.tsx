import { useState } from 'react'
import { useI18n } from '../../../i18n'
import { formatDate } from '../../../shared/dates'
import { DocLines, DocRows } from '../../../shared/DocRows'
import { TaxReturnButton } from '../../taxReturn/ui/TaxReturnButton'
import type { CompanyOverview, PeriodView } from '../api'
import { DeadlineTiles } from './Deadlines'
import { errorText, periodShort } from './format'
import { AttachSelect, SlotRow, UnlinkedRow, type SlotActions } from './Slot'

function taxDocuments(period: PeriodView) {
  const held = (kind: string) => period.slots.some((slot) => slot.kind === kind && slot.documents.length > 0)
  return {
    statements: held('financial_statements') || Boolean(period.kitsas_statement),
    audit_report: held('audit_report'),
    minutes: held('agm_minutes'),
  }
}

/** What an open period's card holds: its deadlines and documents. */
export function PeriodBody({
  period,
  overview,
  today,
  actions,
}: {
  period: PeriodView
  overview: CompanyOverview
  today: string
  actions: SlotActions
}) {
  const { t } = useI18n()
  const [rowError, setRowError] = useState<string | null>(null)
  const kindLabel = (kind: string) => t(`company.kind.${kind}`)
  return (
    <>
      {period.confirmed_at ? <p className="muted company-confirmed">{t('company.period.confirmed', { date: formatDate(period.confirmed_at) })}</p> : null}

      <h3 className="section-label">{t('company.deadlines.title')}</h3>
      <DeadlineTiles
        deadlines={period.deadlines}
        listed={(kind) => period.slots.some((s) => s.kind === kind)}
        onSetHandled={
          overview.read_only || !period.ended
            ? undefined
            : (kind, value) => {
                setRowError(null)
                actions.apply({ not_needed: [{ period_ends: period.ends, kind, value }] }).catch((err) => setRowError(errorText(t, err)))
              }
        }
      />
      {rowError ? <p className="error">{rowError}</p> : null}
      <p className="muted company-footnote">{t('company.deadlines.footnote')}</p>
      <TaxReturnButton ends={period.ends} documents={taxDocuments(period)} />

      <h3 className="section-label">{t('company.period.documents')}</h3>
      <DocRows>
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
              overview={overview}
              today={today}
              actions={actions}
              kitsasStatement={slot.kind === 'financial_statements' ? period.kitsas_statement : undefined}
              notNeededToggle={slot.required}
            />
          )
        })}
      </DocRows>

      {period.unlinked.length ? (
        <details className="company-unlinked">
          <summary className="section-label">
            {t('company.unlinked.title')} ({period.unlinked.length})
          </summary>
          <p className="muted">{t('company.unlinked.lead')}</p>
          <DocLines>
            {period.unlinked.map((c) => (
              <UnlinkedRow key={c.voucher_id} candidate={c} actions={actions}>
                {overview.read_only ? null : (
                  <AttachSelect candidate={c} kinds={period.slots.map((s) => s.kind)} periodEnds={period.ends} kindLabel={kindLabel} actions={actions} onError={setRowError} />
                )}
              </UnlinkedRow>
            ))}
          </DocLines>
        </details>
      ) : null}
    </>
  )
}
