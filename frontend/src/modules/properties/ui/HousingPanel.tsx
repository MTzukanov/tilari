import { useState, type ReactNode } from 'react'
import { estimateFor, limitedReference, loanForecast, loanNow, monthsBetween, paidOffOn } from '../../../book/modules/properties/domain/housingLoan'
import { monthEnd } from '../../../book/months'
import { getBcp47, useI18n } from '../../../i18n'
import { formatDate } from '../../../shared/dates'
import { DocLine, DocLines } from '../../../shared/DocRows'
import { FileButton } from '../../../shared/FileButton'
import { formatCents } from '../../../shared/money'
import { LineChart, type LineSeries, type PointTip } from '../../../shared/LineChart'
import { formatPcm } from '../../../shared/percent'
import { FilePill, Pill } from '../../../shared/Pill'
import { SearchSelect } from '../../../shared/SearchSelect'
import type { BookedLine, DocCandidate, HousingCopySource, HousingLoan, LeaseVoucher, LoanMonth, LoanPath, PropertyDetail, RateEstimates } from '../api'
import { monthLabel } from './Charts'
import { loadLoanChartOptions, saveLoanChartOptions, type LoanChartOptions } from './chartOptions'
import { DocPicker } from './DocPicker'
import { monthName, periodText } from './format'
import { Figure, Figures, Folds, InfoButton, InfoNote, type Fold } from './FigureTiles'
import { DocSlot, LineLink, VoucherOpen } from './FormParts'

/** Titles a housing company's document has: starred in the pick. */
const HOUSING_WORDS = /is[äa]nn[öo]itsij[äa]ntodistu|taloyhti|yhti[öo]kokou|vastike|lainaosuu|velkaosuu/i

/** The tab's own document links, and where new ones come from; none on a read-only book. */
export type HousingDocLinks = {
  /** The pick's documents while it is open. */
  picking: DocCandidate[] | null
  onPick: () => void
  onLink: (voucherId: number) => void
  onUnlink: (voucherId: number) => void
  onUpload: (files: File[]) => Promise<void>
}

/** What each linked voucher is on the tab: its own link, and what the loans use it for. */
function voucherUses(t: (key: string, vars?: Record<string, string | number>) => string, d: PropertyDetail): Map<number, string[]> {
  const uses = new Map<number, string[]>()
  const add = (id: number | undefined, text: string) => {
    if (id != null) uses.set(id, [...(uses.get(id) ?? []), text])
  }
  for (const id of d.doc.housing_doc_voucher_ids ?? []) uses.set(id, uses.get(id) ?? [])
  for (const loan of d.doc.housing_loans ?? []) {
    for (const c of loan.certificates ?? []) add(c.voucher_id, t('properties.housing.use.certificate', { loan: loan.name, date: formatDate(c.date) }))
    for (const c of loan.charges ?? []) add(c.voucher_id, t('properties.housing.use.charge', { loan: loan.name, date: formatDate(c.from) }))
    for (const r of loan.rates ?? []) add(r.voucher_id, t('properties.housing.use.rate', { loan: loan.name, date: formatDate(r.from) }))
    for (const e of loan.events ?? []) add(e.voucher_id, t('properties.housing.use.event', { loan: loan.name, date: formatDate(e.date) }))
  }
  return uses
}

function HousingDocuments({ d, links, onOpenVoucher }: { d: PropertyDetail; links?: HousingDocLinks; onOpenVoucher: (voucherId: number) => void }) {
  const { t } = useI18n()
  const [uploading, setUploading] = useState(false)
  const uses = voucherUses(t, d)
  const vouchers = new Map(d.housing.vouchers.map((v) => [v.voucher_id, v]))
  const own = new Set(d.doc.housing_doc_voucher_ids ?? [])
  const ids = [...uses.keys()].sort((a, b) => (vouchers.get(b)?.date ?? '').localeCompare(vouchers.get(a)?.date ?? '') || b - a)
  const unlink = (id: number) =>
    links && own.has(id) && !uses.get(id)?.length ? (
      <button type="button" className="btn-link btn-quiet" onClick={() => links.onUnlink(id)}>
        {t('properties.docs.unlink')}
      </button>
    ) : null
  async function upload(files: File[]) {
    if (!links || !files.length) return
    setUploading(true)
    try {
      await links.onUpload(files)
    } finally {
      setUploading(false)
    }
  }
  return (
    <section className="overview-panel property-housing-docs">
      <div className="property-panel-head">
        <h3>{t('properties.housing.docsTitle')}</h3>
        {links ? (
          <span className="property-panel-buttons">
            {!links.picking ? (
              <button type="button" className="btn-small" onClick={links.onPick}>
                {t('properties.housing.addDoc')}
              </button>
            ) : null}
            <FileButton className="btn-small" disabled={uploading} onFiles={(files) => void upload(files)}>
              {uploading ? t('common.saving') : t('properties.housing.uploadDoc')}
            </FileButton>
          </span>
        ) : null}
      </div>
      <p className="muted property-lease-hint">{t('properties.housing.docsLead')}</p>
      {links?.picking ? (
        <div className="property-doc-pick">
          <DocPicker
            docs={links.picking.filter((c) => !uses.has(c.voucher_id))}
            value=""
            placeholder={t('properties.edit.addDoc')}
            starred={(c) => HOUSING_WORDS.test(c.title)}
            onChange={(v) => v && links.onLink(Number(v))}
          />
        </div>
      ) : null}
      {!ids.length ? <p className="muted">{t('properties.housing.noDocs')}</p> : null}
      <DocLines>
        {ids.map((id) => {
          const v = vouchers.get(id)
          const mark = (uses.get(id) ?? []).join(' · ')
          if (!v) {
            return (
              <DocLine
                key={id}
                title={<span className="muted">{t('properties.docs.missing', { id })}</span>}
                mark={<Pill tone="crit">{t('properties.docs.deleted')}</Pill>}
                end={unlink(id)}
              />
            )
          }
          return (
            <DocLine
              key={id}
              voucher={<VoucherOpen voucher={v} onOpen={onOpenVoucher} />}
              title={v.title || t('properties.docs.voucherNoId')}
              mark={mark ? <Pill>{mark}</Pill> : undefined}
              end={unlink(id)}
            >
              {v.files.map((f) => (
                <FilePill key={f.id} id={f.id} name={f.name} />
              ))}
            </DocLine>
          )
        })}
      </DocLines>
    </section>
  )
}

/** The payments to the housing company of a month, as the table shows them. */
type MonthPayments = Map<string, { units: number; lines: BookedLine[] }>

/** How far the computed path was from a certificate: "laskettu 4,43 € enemmän", or that it met it. */
function gapText(t: (key: string, vars?: Record<string, string | number>) => string, gap: number): string {
  if (gap === 0) return t('properties.housing.path.gapNone')
  return t(gap > 0 ? 'properties.housing.path.gapMore' : 'properties.housing.path.gapLess', { amount: formatCents(Math.abs(gap)) })
}

/** The loan chart's line colours, also beside their rows in a month's box (`App.css` has the same). */
const SHARE_COLOR = '#2f6fed'
const PAID_COLOR = 'var(--ink)'
const INTEREST_COLOR = '#c45c26'

/** A month as "11/2026". */
const monthShort = (key: string) => `${Number(key.slice(5, 7))}/${key.slice(0, 4)}`

/** A forecast's months summed by year: the charges, the interest, the repayment, the share at the year's end. */
function forecastYears(months: LoanMonth[]) {
  const years = new Map<string, { year: string; paid: number; interest: number; principal: number; closing: number }>()
  for (const m of months) {
    const y = years.get(m.month.slice(0, 4)) ?? { year: m.month.slice(0, 4), paid: 0, interest: 0, principal: 0, closing: 0 }
    y.paid += m.paid_snt
    y.interest += m.interest_snt
    y.principal += m.principal_snt
    y.closing = m.closing_snt
    years.set(y.year, y)
  }
  return [...years.values()]
}

/**
 * A loan's share month by month (ADR-034): a line of the share at each month's end with its
 * certificates as dots, and the months newest first - the payments to the housing company, the
 * rahoitusvastike they paid, the interest, what lowered the share, and the share; each certificate
 * under its month with the computed path's gap and the rate it implies. The card's "Kuukausittain"
 * opens it. Checkboxes, remembered in this browser, add the interest and the repayment with it summed
 * from the first month (on the share's scale: a month's own would be too small to see), and run the
 * lines on dashed to the loan's end (`loanForecast`), whose months are summed by year under the chart.
 */
function LoanMonths({
  loan,
  path,
  payments,
  estimates,
  onOpenVoucher,
}: {
  loan: HousingLoan
  path: LoanPath
  payments: MonthPayments
  /** The portfolio's reference rate estimates, for the forecast (ADR-035); null: no forecast (a sold object). */
  estimates: RateEstimates | null
  onOpenVoucher: (voucherId: number) => void
}) {
  const { t } = useI18n()
  const locale = getBcp47()
  const months = path.months
  const [picked, setPicked] = useState<string | null>(null)
  const [options, setOptionsState] = useState(loadLoanChartOptions)
  const setOptions = (next: LoanChartOptions) => {
    setOptionsState(next)
    saveLoanChartOptions(next)
  }
  const future = estimates ? loanForecast(loan, path, { rates: estimates }) : []
  // The same with the reference rate a point higher from the next reset: what a rise would cost.
  const higher = estimates && options.plus1 ? loanForecast(loan, path, { rates: estimates, shift_pcm: 1000 }) : []
  const curved = estimates != null && estimateFor(loan, estimates) != null
  const [ruleOpen, setRuleOpen] = useState(false)
  const shown = options.forecast && future.length ? [...months, ...future] : months
  const known = months.length
  let interestSoFar = 0
  let paidSoFar = 0
  const interestSum = shown.map((m) => (interestSoFar += m.interest_snt))
  const paidSum = shown.map((m) => (paidSoFar += m.principal_snt + m.extra_snt + m.interest_snt))
  /** A line solid over the months followed and, with the estimate on, dashed after them. */
  const line = (key: string, label: string, values: number[], className: string, dots?: 'spaced'): LineSeries[] => [
    { key, label, values: values.map((v, i) => (i < known ? v : null)), className, dots },
    ...(shown.length > known
      ? [{ key: `${key}-ahead`, label, values: values.map((v, i) => (i >= known - 1 ? v : null)), className: `${className} property-loan-ahead`, dashed: true }]
      : []),
  ]
  const check = (key: keyof LoanChartOptions, label: string, swatch: string) => (
    <label className="allocation-check">
      <input type="checkbox" checked={options[key]} onChange={() => setOptions({ ...options, [key]: !options[key] })} />
      <i className={`overview-swatch ${swatch}`} />
      {label}
    </label>
  )
  const unpaid = (m: LoanMonth) => m.due_snt > 0 && m.payments === 0 && path.payments_known
  const certificateText = (c: NonNullable<LoanMonth['certificate']>) => {
    const parts = [t('properties.housing.path.certificate', { date: formatDate(c.date), amount: formatCents(c.share_snt) })]
    if (c.gap_snt != null) parts.push(gapText(t, c.gap_snt))
    return parts.join(' · ')
  }
  const tip = (i: number): PointTip => {
    const m = shown[i]
    return {
      title: m.forecast ? t('properties.housing.path.forecastMonth', { month: monthName(m.month, locale) }) : monthName(m.month, locale),
      rows: [
        { label: t('properties.housing.path.col.share'), value: formatCents(m.closing_snt), color: SHARE_COLOR },
        { label: t('properties.housing.path.col.paid'), value: unpaid(m) ? t('properties.housing.path.unpaid') : formatCents(m.paid_snt) },
        { label: t('properties.housing.path.col.interest'), value: `${formatCents(m.interest_snt)} (${formatPcm(m.rate_pcm)})` },
        { label: t('properties.housing.path.col.principal'), value: formatCents(m.principal_snt + m.extra_snt) },
        ...(options.paid ? [{ label: t('properties.housing.path.paidSum'), value: formatCents(paidSum[i]), color: PAID_COLOR }] : []),
        ...(options.interest ? [{ label: t('properties.housing.path.interestSum'), value: formatCents(interestSum[i]), color: INTEREST_COLOR }] : []),
      ],
      notes: [
        ...(m.certificate ? [certificateText(m.certificate)] : []),
        ...(m.backward ? [t('properties.housing.path.backwardHint')] : []),
      ],
    }
  }
  const years = forecastYears(future)
  const higherYears = new Map(forecastYears(higher).map((y) => [y.year, y]))
  const sum = (pick: (y: (typeof years)[number]) => number) => years.reduce((total, y) => total + pick(y), 0)
  const interestAhead = future.reduce((total, m) => total + m.interest_snt, 0)
  const interestHigher = higher.reduce((total, m) => total + m.interest_snt, 0)
  /** The estimated payoff against the loan's last due date, in whole months. */
  const payoffText = () => {
    if (!loan.ends || !future.length) return null
    const early = monthsBetween(future.at(-1)!.month, loan.ends.slice(0, 7))
    const ends = formatDate(loan.ends)
    return early > 0
      ? t('properties.housing.forecast.beforeEnds', { count: early, date: ends })
      : early < 0
        ? t('properties.housing.forecast.afterEnds', { count: -early, date: ends })
        : t('properties.housing.forecast.atEnds', { date: ends })
  }
  const payoff = payoffText()
  return (
    <div className="property-loan-months">
      <div className="overview-legend legend-columns">
        <span className="allocation-check">
          <i className="overview-swatch property-swatch-loan" />
          {t('properties.housing.path.share')}
        </span>
        <span className="allocation-check">
          <i className="overview-swatch property-swatch-certificate" />
          {t('properties.housing.field.certificate')}
        </span>
        {check('paid', t('properties.housing.path.paidSum'), 'property-swatch-loan-paid')}
        {check('interest', t('properties.housing.path.interestSum'), 'property-swatch-loan-interest')}
        {future.length ? check('forecast', t('properties.housing.path.forecast'), 'property-swatch-forecast') : null}
      </div>
      <LineChart
        className="overview-chart property-chart"
        keys={shown.map((m) => m.month)}
        pointTip={tip}
        onSelect={(i) => setPicked(i == null ? null : shown[i].month)}
        series={[
          ...line('share', t('properties.housing.path.share'), shown.map((m) => m.closing_snt), 'property-loan-share', 'spaced'),
          ...(options.paid ? line('paid', t('properties.housing.path.paidSum'), paidSum, 'property-loan-paid') : []),
          ...(options.interest ? line('interest', t('properties.housing.path.interestSum'), interestSum, 'property-loan-interest') : []),
          {
            key: 'certificate',
            label: t('properties.housing.field.certificate'),
            values: shown.map((m) => m.certificate?.share_snt ?? null),
            className: 'property-loan-certificate',
            dots: true,
          },
        ]}
        labelFor={(key) => monthLabel(key, locale, true)}
        nameFor={(key) => monthName(key, locale)}
        locale={locale}
        label={t('properties.housing.path.share')}
      />
      {shown.length > months.length ? (
        <div className="property-loan-forecast-years">
          <h5>{t('properties.housing.path.forecastYears')}</h5>
          <Figures>
            <Figure
              label={
                <>
                  {t('properties.housing.forecast.payoff')}{' '}
                  <InfoButton note={t(`properties.housing.path.forecastRule.${loan.type}`)} open={ruleOpen} onToggle={() => setRuleOpen(!ruleOpen)} />
                </>
              }
              value={formatDate(monthEnd(future.at(-1)!.month))}
              sub={payoff ? [payoff] : []}
            />
            <Figure
              label={t('properties.housing.forecast.interest')}
              value={formatCents(interestAhead)}
              sub={higher.length ? [t('properties.housing.forecast.interestHigher', { amount: formatCents(interestHigher), diff: formatCents(interestHigher - interestAhead) })] : []}
            />
            <Figure
              label={t('properties.housing.forecast.rate')}
              value={formatPcm(future.at(-1)!.rate_pcm)}
              sub={[curved ? t('properties.housing.forecast.byCurve') : t('properties.housing.forecast.held')]}
            />
          </Figures>
          {ruleOpen ? <InfoNote note={t(`properties.housing.path.forecastRule.${loan.type}`)} /> : null}
          {loan.reference !== 'fixed' ? (
            <label className="allocation-check property-loan-plus1">
              <input type="checkbox" checked={options.plus1} onChange={() => setOptions({ ...options, plus1: !options.plus1 })} />
              {t('properties.housing.forecast.plus1')}
            </label>
          ) : null}
          <div className="property-loan-table-scroll">
            <table className="ledger-table compact property-rent-table property-loan-table">
              <thead>
                <tr>
                  <th>{t('properties.housing.path.col.year')}</th>
                  <th className="amount">{t('properties.housing.path.col.paid')}</th>
                  <th className="amount">{t('properties.housing.path.col.interest')}</th>
                  <th className="amount">{t('properties.housing.path.col.principal')}</th>
                  <th className="amount">{t('properties.housing.path.col.shareYearEnd')}</th>
                  {higher.length ? <th className="amount">{t('properties.housing.forecast.col.paidHigher')}</th> : null}
                </tr>
              </thead>
              <tbody>
                {years.map((y) => (
                  <tr key={y.year}>
                    <td>{y.year}</td>
                    <td className="amount">{formatCents(y.paid)}</td>
                    <td className="amount">{formatCents(y.interest)}</td>
                    <td className="amount">{formatCents(y.principal)}</td>
                    <td className="amount">{formatCents(y.closing)}</td>
                    {higher.length ? <td className="amount">{formatCents(higherYears.get(y.year)?.paid ?? 0, { emptyZero: true })}</td> : null}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>{t('properties.housing.path.forecastTotal')}</td>
                  <td className="amount">{formatCents(sum((y) => y.paid))}</td>
                  <td className="amount">{formatCents(sum((y) => y.interest))}</td>
                  <td className="amount">{formatCents(sum((y) => y.principal))}</td>
                  <td />
                  {higher.length ? <td className="amount">{formatCents(higher.reduce((total, m) => total + m.paid_snt, 0))}</td> : null}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : null}
      <div className="property-loan-table-scroll">
        <table className="ledger-table compact property-rent-table property-loan-table">
          <thead>
            <tr>
              <th>{t('properties.rent.col.month')}</th>
              <th>{t('properties.housing.path.col.payments')}</th>
              <th className="amount">{t('properties.housing.path.col.paid')}</th>
              <th className="amount">{t('properties.housing.path.col.interest')}</th>
              <th className="amount">{t('properties.housing.path.col.principal')}</th>
              <th className="amount">{t('properties.housing.path.col.share')}</th>
            </tr>
          </thead>
          <tbody>
            {[...months].reverse().flatMap((m: LoanMonth) => {
              const paid = payments.get(m.month)
              const row = (
                <tr
                  key={m.month}
                  className={[m.backward ? 'property-loan-backward' : '', m.month === picked ? 'is-selected' : ''].filter(Boolean).join(' ') || undefined}
                  title={m.backward ? t('properties.housing.path.backwardHint') : undefined}
                >
                  <td>{monthName(m.month, locale)}</td>
                  <td>
                    {paid?.lines.map((line) => <LineLink key={line.line_id} line={line} onOpen={onOpenVoucher} />)}
                    {m.payments > 1 ? <span className="muted"> ×{m.payments}</span> : null}
                    {unpaid(m) ? (
                      <span className="property-loan-unpaid">{t('properties.housing.path.unpaid')}</span>
                    ) : null}
                  </td>
                  <td
                    className={m.invoiced ? 'amount property-loan-invoiced' : 'amount'}
                    title={m.invoiced ? t('properties.housing.path.invoicedHint') : undefined}
                  >
                    {formatCents(m.paid_snt, { emptyZero: true })}
                  </td>
                  <td className="amount" title={t('properties.housing.path.rateHint', { rate: formatPcm(m.rate_pcm) })}>
                    {formatCents(m.interest_snt)}
                  </td>
                  <td className="amount" title={m.extra_snt ? t('properties.housing.path.extraHint', { amount: formatCents(m.extra_snt) }) : undefined}>
                    {formatCents(m.principal_snt + m.extra_snt)}
                  </td>
                  <td className="amount">{formatCents(m.closing_snt)}</td>
                </tr>
              )
              if (!m.certificate) return [row]
              return [
                row,
                <tr key={`${m.month}-certificate`} className="property-loan-certificate-row">
                  <td colSpan={6}>{certificateText(m.certificate)}</td>
                </tr>,
              ]
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** A loan as the tab shows it on `on` (`loanNow`): the share, the rahoitusvastike, the rate, the term; every row folded below. */
function LoanCard({
  loan,
  on,
  path,
  payments,
  vouchers,
  held,
  estimates,
  onEdit,
  onOpenVoucher,
}: {
  loan: HousingLoan
  on: string
  /** The share month by month; none before it is computed. */
  path?: LoanPath
  payments: MonthPayments
  vouchers: Map<number, LeaseVoucher>
  held: boolean
  estimates: RateEstimates
  onEdit?: () => void
  onOpenVoucher: (voucherId: number) => void
}) {
  const { t } = useI18n()
  const [noteOpen, setNoteOpen] = useState(false)
  const voucher = (id: number | undefined) => (id != null ? (vouchers.get(id) ?? null) : null)
  const { certificate, charge, rate } = loanNow(loan, on)
  const paidOff = paidOffOn(loan)
  const reference = t(`properties.housing.reference.${loan.reference}`)
  const fixed = loan.reference === 'fixed'
  // With no rate row the share is counted on the estimate (ADR-034).
  const estimate = !rate ? estimateFor(loan, estimates) : null
  // The reference rate as the loan pays it: held between a floor and a ceiling in force (ADR-034).
  const bounded = rate ? limitedReference(loan, on.slice(0, 7), rate.reference_pcm) : estimate != null ? limitedReference(loan, on.slice(0, 7), estimate) : null
  const limitLines = (loan.rate_limits ?? [])
    .filter((l) => l.to >= on)
    .map((l) =>
      [
        l.floor_pcm != null ? t('properties.housing.limit.floor', { rate: formatPcm(l.floor_pcm) }) : '',
        l.ceiling_pcm != null ? t('properties.housing.limit.ceiling', { rate: formatPcm(l.ceiling_pcm) }) : '',
        l.from && l.from > on ? periodText(t, l.from, l.to) : t('properties.housing.limit.until', { date: formatDate(l.to) }),
      ]
        .filter(Boolean)
        .join(' · '),
    )
  const first = path?.months[0]
  const last = path?.months.at(-1)
  const note = path && !path.payments_known ? t('properties.housing.path.paymentsUnknown') : null
  const certificateSlot = certificate ? (
    <DocSlot voucher={voucher(certificate.voucher_id)} noDocument={certificate.no_document} held={held} onOpen={onOpenVoucher} />
  ) : null
  const list = (rows: ReactNode[]) => <ul className="property-doc-list property-fold-body">{rows}</ul>
  const folds: Fold[] = [
    {
      key: 'months',
      title: t('properties.housing.path.months'),
      n: path?.months.length ?? 0,
      body: () => (path ? <LoanMonths loan={loan} path={path} payments={payments} estimates={held ? estimates : null} onOpenVoucher={onOpenVoucher} /> : null),
    },
    {
      key: 'certificates',
      title: t('properties.housing.certificates'),
      n: loan.certificates?.length ?? 0,
      body: () =>
        list(
          [...(loan.certificates ?? [])].reverse().map((c) => (
            <li key={c.date}>
              <span>{formatDate(c.date)}</span>
              <span>{formatCents(c.share_snt)}</span>
              <DocSlot voucher={voucher(c.voucher_id)} noDocument={c.no_document} held={held} onOpen={onOpenVoucher} />
            </li>
          )),
        ),
    },
    {
      key: 'charges',
      title: t('properties.housing.charges'),
      n: loan.charges?.length ?? 0,
      body: () =>
        list(
          [...(loan.charges ?? [])].reverse().map((c) => (
            <li key={c.from}>
              <span>{t('properties.housing.fromDate', { date: formatDate(c.from) })}</span>
              <span>{t('properties.housing.perMonth', { amount: formatCents(c.amount_snt) })}</span>
              {c.rahastoitu ? <Pill tone="doc">{t('properties.housing.field.rahastoitu')}</Pill> : null}
              <DocSlot voucher={voucher(c.voucher_id)} noDocument={c.no_document} held={held} onOpen={onOpenVoucher} />
            </li>
          )),
        ),
    },
    {
      key: 'rates',
      title: t('properties.housing.rates'),
      n: loan.rates?.length ?? 0,
      body: () =>
        list(
          [...(loan.rates ?? [])].reverse().map((r) => (
            <li key={r.from}>
              <span>{t('properties.housing.fromDate', { date: formatDate(r.from) })}</span>
              <span>
                {fixed
                  ? formatPcm(r.reference_pcm)
                  : t('properties.housing.rateRow', { rate: formatPcm(r.reference_pcm), total: formatPcm(r.reference_pcm + loan.margin_pcm) })}
              </span>
              {r.voucher_id != null ? <DocSlot voucher={voucher(r.voucher_id)} onOpen={onOpenVoucher} /> : null}
            </li>
          )),
        ),
    },
    {
      key: 'events',
      title: t('properties.housing.events'),
      n: loan.events?.length ?? 0,
      body: () =>
        list(
          [...(loan.events ?? [])].reverse().map((e, i) => (
            <li key={`${e.date}-${i}`}>
              <span>{formatDate(e.date)}</span>
              <span>{t(`properties.housing.event.${e.kind}`)}</span>
              {e.amount_snt ? <span>{formatCents(e.amount_snt)}</span> : null}
              {e.note ? <span className="muted">{e.note}</span> : null}
              {e.voucher_id != null ? <DocSlot voucher={voucher(e.voucher_id)} onOpen={onOpenVoucher} /> : null}
            </li>
          )),
        ),
    },
  ]
  return (
    <div className="property-lease-card property-loan-card">
      <p className="property-lease-head">
        <strong>{loan.name}</strong>
        <span className="muted">{[t(`properties.housing.type.${loan.type}`), loan.lender ?? ''].filter(Boolean).join(' · ')}</span>
        {paidOff ? <Pill tone="ok">{t('properties.housing.paidOff', { date: formatDate(paidOff) })}</Pill> : null}
        {onEdit ? (
          <button type="button" className="btn-link" onClick={onEdit}>
            {t('common.edit')}
          </button>
        ) : null}
      </p>
      <Figures>
        <Figure
          label={
            <>
              {last
                ? t('properties.housing.figure.shareComputed', { date: formatDate(monthEnd(last.month)) })
                : certificate
                  ? t('properties.housing.figure.share', { date: formatDate(certificate.date) })
                  : t('properties.housing.figure.shareLabel')}
              {note ? <InfoButton note={note} open={noteOpen} onToggle={() => setNoteOpen(!noteOpen)} /> : null}
            </>
          }
          value={last ? formatCents(last.closing_snt) : certificate ? formatCents(certificate.share_snt) : ''}
          sub={
            certificate
              ? [
                  <>
                    {last ? `${t('properties.housing.figure.certificate', { date: formatDate(certificate.date), amount: formatCents(certificate.share_snt) })} ` : null}
                    {certificateSlot}
                  </>,
                ]
              : [t('properties.housing.shareNone')]
          }
        />
        {first && last ? (
          <Figure
            label={t('properties.housing.figure.repaid')}
            value={formatCents(first.opening_snt - last.closing_snt)}
            sub={[
              t('properties.housing.figure.span', { from: monthShort(first.month), to: monthShort(last.month) }),
              t('properties.housing.figure.interest', { amount: formatCents(path!.months.reduce((sum, m) => sum + m.interest_snt, 0)) }),
            ]}
          />
        ) : null}
        <Figure
          label={t('properties.housing.figure.charge')}
          value={charge ? t('properties.housing.perMonth', { amount: formatCents(charge.amount_snt) }) : ''}
          sub={
            charge
              ? [
                  t('properties.housing.fromDate', { date: formatDate(charge.from) }),
                  <>
                    {charge.rahastoitu ? <Pill tone="doc">{t('properties.housing.field.rahastoitu')}</Pill> : null}{' '}
                    <DocSlot voucher={voucher(charge.voucher_id)} noDocument={charge.no_document} held={held} onOpen={onOpenVoucher} />
                  </>,
                ]
              : [t('properties.housing.chargeNone')]
          }
        />
        <Figure
          label={t('properties.housing.figure.rate')}
          value={rate ? formatPcm((fixed ? rate.reference_pcm : bounded!) + (fixed ? 0 : loan.margin_pcm)) : bounded != null ? formatPcm(bounded + loan.margin_pcm) : ''}
          sub={
            fixed
              ? rate
                ? [t('properties.housing.figure.fixed'), t('properties.housing.fromDate', { date: formatDate(rate.from) })]
                : [t('properties.housing.rateNoneFixed')]
              : rate
                ? [
                    t('properties.housing.figure.rateParts', { reference, rate: formatPcm(bounded!), margin: formatPcm(loan.margin_pcm) }),
                    t('properties.housing.fromDate', { date: formatDate(rate.from) }),
                    ...limitLines,
                  ]
                : bounded != null
                  ? [
                      t('properties.housing.figure.rateParts', { reference, rate: formatPcm(bounded), margin: formatPcm(loan.margin_pcm) }),
                      t('properties.housing.figure.rateEstimated'),
                      ...limitLines,
                    ]
                  : [t('properties.housing.figure.rateMissing', { reference, margin: formatPcm(loan.margin_pcm) }), ...limitLines]
          }
        />
        <Figure
          label={t('properties.housing.figure.term')}
          value={
            loan.starts && loan.ends
              ? periodText(t, loan.starts, loan.ends)
              : loan.starts
                ? t('properties.housing.termOpen', { date: formatDate(loan.starts) })
                : loan.ends
                  ? t('properties.housing.termUntil', { date: formatDate(loan.ends) })
                  : ''
          }
          sub={[
            ...(loan.starts ? [] : [t('properties.housing.startsFromPurchase')]),
            ...(loan.reset_months ? [t('properties.housing.reset', { months: loan.reset_months })] : []),
            ...(loan.total_snt != null ? [t('properties.housing.total', { amount: formatCents(loan.total_snt) })] : []),
            ...(loan.grace ?? []).map((g) => t('properties.housing.graceText', { period: periodText(t, g.from, g.to) })),
          ]}
        />
      </Figures>
      {note && noteOpen ? <InfoNote note={note} /> : null}
      <Folds folds={folds} />
    </div>
  )
}

/**
 * The Taloyhtiö tab (ADR-034): the housing company's documents, then the object's share of each of
 * its loans. A card in edit (`editing`) shows `form` in its place; a new one comes first.
 */
export function HousingPanel({
  d,
  on,
  held,
  editing = null,
  form = null,
  links,
  onEditLoan,
  onAdd,
  onCopy,
  onOpenVoucher,
}: {
  d: PropertyDetail
  /** The day the loans are read on: the later of the as-of date and the book's day (`loanDay`). */
  on: string
  /** Not sold: only then is a missing document flagged, and an estimate to the loan's end offered. */
  held: boolean
  /** The loan card in edit: a loan key, 'new', or none. */
  editing?: string | null
  form?: ReactNode
  links?: HousingDocLinks
  /** Opens a stored loan's card in edit; none on a read-only book (a sold object's loans can change). */
  onEditLoan?: (key: string) => void
  /** Opens a new loan card; none when none can be added. */
  onAdd?: () => void
  /** Opens a new loan card copied from another object's loan. */
  onCopy?: (source: HousingCopySource) => void
  onOpenVoucher: (voucherId: number) => void
}) {
  const { t } = useI18n()
  const [copying, setCopying] = useState(false)
  const loans = d.doc.housing_loans ?? []
  const vouchers = new Map(d.housing.vouchers.map((v) => [v.voucher_id, v]))
  const payments: MonthPayments = new Map(d.housing.payments.map((p) => [p.month, p]))
  const sources = d.housing.copy_sources
  const sourceItems = sources.map((s, i) => ({
    value: String(i),
    label: `${s.same_company ? '★ ' : ''}${s.object_name} · ${s.loan.name}`,
  }))
  return (
    <>
      <HousingDocuments d={d} links={links} onOpenVoucher={onOpenVoucher} />
      <section className="overview-panel property-housing-loans">
        <div className="property-panel-head">
          <h3>{t('properties.housing.loansTitle')}</h3>
          <span className="property-panel-buttons">
            {onCopy && sources.length && !copying ? (
              <button type="button" className="btn-small" onClick={() => setCopying(true)}>
                {t('properties.housing.copy')}
              </button>
            ) : null}
            {onAdd ? (
              <button type="button" className="btn-small" onClick={onAdd}>
                {t('properties.housing.add')}
              </button>
            ) : null}
          </span>
        </div>
        <p className="muted property-lease-hint">{t('properties.housing.loansLead')}</p>
        {onCopy && copying ? (
          <div className="property-doc-pick property-loan-copy">
            <SearchSelect
              aria-label={t('properties.housing.copy')}
              placeholder={t('properties.housing.copyPick')}
              items={sourceItems}
              value=""
              onChange={(v) => {
                const source = v ? sources[Number(v)] : undefined
                if (!source) return
                setCopying(false)
                onCopy(source)
              }}
            />
            {sources.some((s) => s.same_company) ? <p className="muted property-lease-hint">{t('properties.housing.copySame')}</p> : null}
          </div>
        ) : null}
        {editing === 'new' ? form : null}
        {!loans.length && editing !== 'new' ? <p className="muted">{t('properties.housing.none')}</p> : null}
        {loans.map((loan) =>
          editing === loan.key ? (
            <div key={loan.key}>{form}</div>
          ) : (
            <LoanCard
              key={loan.key}
              loan={loan}
              on={on}
              path={d.housing.paths.find((p) => p.loan_key === loan.key)}
              payments={payments}
              vouchers={vouchers}
              held={held}
              estimates={d.housing.rate_estimates}
              onEdit={onEditLoan ? () => onEditLoan(loan.key) : undefined}
              onOpenVoucher={onOpenVoucher}
            />
          ),
        )}
      </section>
    </>
  )
}
