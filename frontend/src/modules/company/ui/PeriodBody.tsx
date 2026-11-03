import { useState } from 'react'
import { useI18n } from '../../../i18n'
import { formatDate } from '../../../shared/dates'
import { DocLine, DocLines, DocRow, DocRows } from '../../../shared/DocRows'
import { FilePill, Pill } from '../../../shared/Pill'
import type { CompanyOverview, PeriodView } from '../api'
import { DeadlineTiles } from './Deadlines'
import { DividendSection } from './Dividends'
import { errorText, periodShort } from './format'
import { AttachSelect, OpenVoucher, SlotRow, UnlinkedRow, type SlotActions } from './Slot'

/** What an open period's card holds: its deadlines, documents and dividends. */
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
  // The report goes by the year the dividend was paid, which is not this period's: it is due the January after.
  const reportDue = period.deadlines.find((d) => d.key === 'dividend_report')?.due
  const reportYear = reportDue ? Number(reportDue.slice(0, 4)) - 1 : null
  const rowLabel = (kind: string) => (kind === 'dividend_annual_report' && reportYear ? `${kindLabel(kind)} ${reportYear}` : kindLabel(kind))
  const rowTitle = (kind: string) => (kind === 'dividend_annual_report' && reportYear ? rowLabel(kind) : `${kindLabel(kind)} ${periodShort(period)}`)
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

      <h3 className="section-label">{t('company.period.documents')}</h3>
      <DocRows>
        {period.income_tax.length ? (
          // Booked on the period's last day, so it leads. Read from the book: nothing to upload or link.
          <DocRow name={t('company.incomeTax.title')} status={<Pill tone="ok">{t('company.incomeTax.booked')}</Pill>}>
            <DocLines>
              {period.income_tax.map((v) => (
                <DocLine key={v.voucher_id} voucher={<OpenVoucher voucher={v} actions={actions} />} title={v.title || t('company.incomeTax.title')}>
                  {v.files.map((f) => (
                    <FilePill key={f.id} id={f.id} name={f.name} />
                  ))}
                </DocLine>
              ))}
            </DocLines>
          </DocRow>
        ) : null}
        {period.slots.map((slot) => (
          <SlotRow
            key={slot.kind}
            kind={slot.kind}
            label={rowLabel(slot.kind)}
            status={slot.status}
            documents={slot.documents}
            suggestions={slot.suggestions}
            periodEnds={period.ends}
            defaultTitle={rowTitle(slot.kind)}
            overview={overview}
            today={today}
            actions={actions}
            kitsasStatement={slot.kind === 'financial_statements' ? period.kitsas_statement : undefined}
            notNeededToggle={slot.required}
          />
        ))}
      </DocRows>

      <DividendSection period={period} overview={overview} today={today} actions={actions} />

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
