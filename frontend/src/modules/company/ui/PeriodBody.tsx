import { Fragment, useState } from 'react'
import { useI18n } from '../../../i18n'
import { formatDate } from '../../../shared/dates'
import { DocLine, DocLines, DocRow, DocRows } from '../../../shared/DocRows'
import { formatCents } from '../../../shared/money'
import { FilePill, Pill } from '../../../shared/Pill'
import type { CompanyOverview, PeriodView, TaxSettlementView } from '../api'
import { DeadlineTiles } from './Deadlines'
import { DividendSection } from './Dividends'
import { errorText, periodShort } from './format'
import { AttachSelect, OpenVoucher, SlotRow, UnlinkedRow, type SlotActions } from './Slot'

/**
 * After the tax decision: what the income tax booking left to pay or to get back, and the vouchers that settled
 * it. Read from the book, so there is nothing to upload or link here.
 */
function TaxSettlementRow({ settlement: s, actions }: { settlement: TaxSettlementView; actions: SlotActions }) {
  const { t } = useI18n()
  const open = s.booked_snt - s.settled_snt
  const key = `company.taxPayment.${s.direction}`
  return (
    <DocRow
      name={t(`${key}.title`)}
      status={<Pill tone={open > 0 ? 'warn' : 'ok'}>{open > 0 ? t(`${key}.open`, { amount: formatCents(open) }) : t(`${key}.done`)}</Pill>}
    >
      <p className="muted company-row-note">{t(`${key}.booked`, { amount: formatCents(s.booked_snt) })}</p>
      <DocLines>
        {s.vouchers.map((v) => (
          <DocLine key={v.voucher_id} voucher={<OpenVoucher voucher={v} actions={actions} />} title={`${v.title || t(`${key}.title`)} · ${formatCents(v.amount_snt)}`}>
            {v.files.map((f) => (
              <FilePill key={f.id} id={f.id} name={f.name} />
            ))}
          </DocLine>
        ))}
      </DocLines>
    </DocRow>
  )
}

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
          <Fragment key={slot.kind}>
            <SlotRow
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
            {slot.kind === 'tax_decision' ? period.tax_settlements.map((s) => <TaxSettlementRow key={s.direction} settlement={s} actions={actions} />) : null}
          </Fragment>
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
