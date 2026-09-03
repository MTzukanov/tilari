import { useEffect, useState } from 'react'
import type { Period } from '../../../api'
import { createVat, fetchVat, type VatResponse } from '../api'
import { shiftVatPeriod, vatDueDate } from '../../../book/modules/vat/domain/vatPeriod'
import { vatBoxTitle } from '../../../book/modules/vat/domain/vatLabels'
import { VatDeclareDialog } from './VatDeclareDialog'
import { PeriodStepper } from '../../../shared/PeriodNav'
import { vatName } from './vatCodes'
import { formatDate } from '../../../shared/dates'
import { useI18n } from '../../../i18n'
import { formatCents } from '../../../shared/money'

type VatData = VatResponse

type ViewPeriod = {
  start: string
  end: string
  months: 1 | 3 | 12
}

function asVatPeriodMonths(n: number | undefined): 1 | 3 | 12 {
  if (n === 3 || n === 12) return n
  return 1
}

export function VatView({
  periods,
  onOpenVoucher,
}: {
  periods: Period[]
  onOpenVoucher: (id: number) => void
}) {
  const { t } = useI18n()
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<VatData | null>(null)
  const [saving, setSaving] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [view, setView] = useState<ViewPeriod | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchVat('', '')
      .then((res) => {
        if (cancelled) return
        if (res.next_period) {
          setView({
            start: res.next_period.start_date,
            end: res.next_period.end_date,
            months: asVatPeriodMonths(res.next_period.period_months),
          })
        } else {
          setData(res)
          setView(null)
        }
        setError(null)
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!view) return
    let cancelled = false
    fetchVat(view.start, view.end)
      .then((res) => {
        if (cancelled) return
        setData(res)
        setError(null)
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [view])

  const earliest = periods[0]?.starts
  const maxEnd = data?.next_period?.end_date ?? periods.at(-1)?.ends
  const months = view?.months ?? 1

  const canPrev = Boolean(
    view &&
      (!earliest ||
        shiftVatPeriod(view.start, view.end, months, false).start_date >= earliest),
  )
  const canNext = Boolean(
    view &&
      (!maxEnd || shiftVatPeriod(view.start, view.end, months, true).end_date <= maxEnd),
  )

  function goPrev() {
    if (!view) return
    const next = shiftVatPeriod(view.start, view.end, months, false)
    setView({ start: next.start_date, end: next.end_date, months: next.period_months })
  }

  function goNext() {
    if (!view) return
    const next = shiftVatPeriod(view.start, view.end, months, true)
    setView({ start: next.start_date, end: next.end_date, months: next.period_months })
  }

  const alreadyFiled = Boolean(
    view && data?.filings.some((f) => f.start_date === view.start && f.end_date === view.end),
  )
  const isNextOpen =
    Boolean(view && data?.next_period) &&
    data!.next_period!.start_date === view!.start &&
    data!.next_period!.end_date === view!.end
  const canDeclare = Boolean(isNextOpen && !alreadyFiled && data?.preview_html)

  const displayDue =
    data?.period_totals?.due_date || (view ? vatDueDate(view.end, months) : '')

  function openPreview() {
    if (!canDeclare) {
      setError(alreadyFiled ? t('vat.alreadyFiled') : t('vat.noPeriod'))
      return
    }
    setError(null)
    setPreviewOpen(true)
  }

  async function confirmVat() {
    if (!view || !isNextOpen) {
      setError(t('vat.noPeriod'))
      return
    }
    setSaving(true)
    setError(null)
    try {
      const voucher = await createVat(view.start, view.end)
      setPreviewOpen(false)
      const res = await fetchVat('', '')
      if (res.next_period) {
        setView({
          start: res.next_period.start_date,
          end: res.next_period.end_date,
          months: asVatPeriodMonths(res.next_period.period_months),
        })
      } else {
        setData(res)
        setView(null)
      }
      onOpenVoucher(voucher.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const period_totals = data?.period_totals
  const boxes = period_totals?.boxes
  const periodLabel = view
    ? `${formatDate(view.start)} \u2013 ${formatDate(view.end)}`
    : t('vat.noPeriod')

  return (
    <div className="ledger">
      <header className="ledger-head">
        <div className="ledger-head-main">
          <h2>{t('vat.title')}</h2>
        </div>
      </header>
      {error ? <p className="error">{error}</p> : null}

      <section className="vat-new">
        <h3 className="vat-new-title">{t('vat.newReturn')}</h3>
        {view ? (
          <div className="vat-new-row">
            <PeriodStepper
              label={periodLabel}
              canPrev={canPrev}
              canNext={canNext}
              onPrev={goPrev}
              onNext={goNext}
              prevTitle={t('vat.prevPeriod')}
              nextTitle={t('vat.nextPeriod')}
            />
            <p className="vat-new-meta muted">
              {t('vat.dueDate', { date: formatDate(displayDue) })}
              {period_totals?.cash_basis ? ` · ${t('vat.cashBasis')}` : ''}
              {alreadyFiled ? ` · ${t('vat.filed')}` : ''}
            </p>
            <button
              type="button"
              className="btn-primary vat-new-action"
              onClick={openPreview}
              disabled={saving || !canDeclare}
            >
              {t('vat.create')}
            </button>
          </div>
        ) : (
          <p className="muted">{t('vat.noPeriod')}</p>
        )}
      </section>

      {boxes && Object.keys(boxes).length ? (
        <table className="ledger-table zebra">
          <thead>
            <tr>
              <th>{t('vat.box')}</th>
              <th className="amount">{t('vat.tax')}</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(boxes)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([code, cents]) => (
                <tr key={code}>
                  <td>
                    {code} – {vatBoxTitle(Number(code))}
                  </td>
                  <td className="amount">{formatCents(cents)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      ) : null}

      {period_totals ? (
        <table className="ledger-table zebra">
          <thead>
            <tr>
              <th>{t('vat.treatment')}</th>
              <th className="amount">{t('vat.net')}</th>
              <th className="amount">{t('vat.tax')}</th>
            </tr>
          </thead>
          <tbody>
            {period_totals.rows.map((r) => (
              <tr key={`${r.vat_code}-${r.vat_percent}-${r.kind}`}>
                <td>
                  {vatName(r.vat_code, r.vat_percent)}
                  {r.kind === 'parked' ? ` (${t('vat.parked')})` : ''}
                </td>
                <td className="amount">{formatCents(r.net_cents)}</td>
                <td className="amount">
                  {formatCents(r.tax_cents || r.parked_tax_cents || 0)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>{t('vat.payable')}</td>
              <td />
              <td className="amount">{formatCents(period_totals.vat_payable_cents)}</td>
            </tr>
          </tfoot>
        </table>
      ) : (
        <p className="muted">{t('vat.emptySummary')}</p>
      )}

      <h3>{t('vat.previous')}</h3>
      {data?.filings.length ? (
        <table className="ledger-table zebra">
          <thead>
            <tr>
              <th>{t('vat.starts')}</th>
              <th>{t('vat.ends')}</th>
              <th>{t('vat.due')}</th>
              <th className="amount">{t('vat.payable')}</th>
              <th>{t('table.title')}</th>
            </tr>
          </thead>
          <tbody>
            {data.filings.map((i) => (
              <tr
                key={i.id}
                className="clickable"
                tabIndex={0}
                onClick={() => onOpenVoucher(i.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onOpenVoucher(i.id)
                  }
                }}
              >
                <td className="num">{i.start_date ? formatDate(i.start_date) : '—'}</td>
                <td className="num">{i.end_date ? formatDate(i.end_date) : formatDate(i.date)}</td>
                <td className="num">{i.due_date ? formatDate(i.due_date) : '—'}</td>
                <td className="amount">
                  {i.vat_payable_cents != null ? formatCents(i.vat_payable_cents) : '—'}
                </td>
                <td>{i.title}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="muted">{t('vat.emptyPrevious')}</p>
      )}

      {previewOpen && data?.preview_html ? (
        <VatDeclareDialog
          html={data.preview_html}
          saving={saving}
          onCancel={() => {
            if (!saving) setPreviewOpen(false)
          }}
          onConfirm={() => void confirmVat()}
        />
      ) : null}
    </div>
  )
}
