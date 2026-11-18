import { useState, type ReactNode } from 'react'
import { loanNow, paidOffOn } from '../../../book/modules/properties/domain/housingLoan'
import { monthEnd } from '../../../book/months'
import { getBcp47, useI18n } from '../../../i18n'
import { formatDate } from '../../../shared/dates'
import { DocLine, DocLines } from '../../../shared/DocRows'
import { FileButton } from '../../../shared/FileButton'
import { formatCents } from '../../../shared/money'
import { LineChart, type PointTip } from '../../../shared/LineChart'
import { formatPcm } from '../../../shared/percent'
import { FilePill, Pill } from '../../../shared/Pill'
import { SearchSelect } from '../../../shared/SearchSelect'
import type { BookedLine, DocCandidate, HousingCopySource, HousingLoan, LeaseVoucher, LoanMonth, LoanPath, PropertyDetail } from '../api'
import { monthLabel } from './Charts'
import { DocPicker } from './DocPicker'
import { monthName, periodText } from './format'
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

/**
 * A loan's share month by month (ADR-034): a line of the share at each month's end with its
 * certificates as dots, and the months newest first - the payments to the housing company, the
 * rahoitusvastike they paid, the interest, what lowered the share, and the share; each certificate
 * under its month with the computed path's gap and the rate it implies.
 */
function LoanMonths({ path, payments, onOpenVoucher }: { path: LoanPath; payments: MonthPayments; onOpenVoucher: (voucherId: number) => void }) {
  const { t } = useI18n()
  const locale = getBcp47()
  const months = path.months
  const [picked, setPicked] = useState<string | null>(null)
  const unpaid = (m: LoanMonth) => m.due_snt > 0 && m.payments === 0 && path.payments_known
  const certificateText = (c: NonNullable<LoanMonth['certificate']>) => {
    const parts = [t('properties.housing.path.certificate', { date: formatDate(c.date), amount: formatCents(c.share_snt) })]
    if (c.gap_snt != null) parts.push(gapText(t, c.gap_snt))
    if (c.implied_pcm != null) parts.push(t('properties.housing.path.implied', { rate: formatPcm(c.implied_pcm) }))
    return parts.join(' · ')
  }
  const tip = (i: number): PointTip => {
    const m = months[i]
    return {
      title: monthName(m.month, locale),
      rows: [
        { label: t('properties.housing.path.col.share'), value: formatCents(m.closing_snt) },
        { label: t('properties.housing.path.col.paid'), value: unpaid(m) ? t('properties.housing.path.unpaid') : formatCents(m.paid_snt) },
        { label: t('properties.housing.path.col.interest'), value: `${formatCents(m.interest_snt)} (${formatPcm(m.rate_pcm)})` },
        { label: t('properties.housing.path.col.principal'), value: formatCents(m.principal_snt + m.extra_snt) },
      ],
      notes: [
        ...(m.certificate ? [certificateText(m.certificate)] : []),
        ...(m.backward ? [t('properties.housing.path.backwardHint')] : []),
      ],
    }
  }
  return (
    <details className="property-sources property-loan-months">
      <summary>{t('properties.housing.path.months', { n: months.length })}</summary>
      <LineChart
        className="overview-chart property-chart"
        keys={months.map((m) => m.month)}
        pointTip={tip}
        onSelect={(i) => setPicked(i == null ? null : months[i].month)}
        series={[
          {
            key: 'share',
            label: t('properties.housing.path.share'),
            values: months.map((m) => m.closing_snt),
            className: 'property-loan-share',
            dots: 'spaced',
          },
          {
            key: 'certificate',
            label: t('properties.housing.field.certificate'),
            values: months.map((m) => m.certificate?.share_snt ?? null),
            className: 'property-loan-certificate',
            dots: true,
          },
        ]}
        labelFor={(key) => monthLabel(key, locale, true)}
        nameFor={(key) => monthName(key, locale)}
        locale={locale}
        label={t('properties.housing.path.share')}
      />
      <p className="muted property-lease-hint">{t('properties.housing.path.chartHint')}</p>
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
                  <td className="amount">{formatCents(m.paid_snt, { emptyZero: true })}</td>
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
    </details>
  )
}

/** The share the path ends at, and what the last twelve months paid off and paid as interest. */
function ComputedShare({ path }: { path: LoanPath }) {
  const { t } = useI18n()
  const last = path.months.at(-1)!
  const year = path.months.slice(-12)
  const principal = year.reduce((sum, m) => sum + m.principal_snt + m.extra_snt, 0)
  const interest = year.reduce((sum, m) => sum + m.interest_snt, 0)
  return (
    <p className="property-lease-terms">
      <strong>{t('properties.housing.path.computed', { date: formatDate(monthEnd(last.month)), amount: formatCents(last.closing_snt) })}</strong>{' '}
      <span className="muted">{t('properties.housing.path.year', { count: year.length, principal: formatCents(principal), interest: formatCents(interest) })}</span>
    </p>
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
  onEdit?: () => void
  onOpenVoucher: (voucherId: number) => void
}) {
  const { t } = useI18n()
  const voucher = (id: number | undefined) => (id != null ? (vouchers.get(id) ?? null) : null)
  const { certificate, charge, rate } = loanNow(loan, on)
  const paidOff = paidOffOn(loan)
  const reference = t(`properties.housing.reference.${loan.reference}`)
  const fixed = loan.reference === 'fixed'
  const fold = (title: string, rows: ReactNode[]) =>
    rows.length ? (
      <details className="property-sources">
        <summary>{t('properties.housing.fold', { title, n: rows.length })}</summary>
        <ul className="property-doc-list">{rows}</ul>
      </details>
    ) : null
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
      <p className="property-lease-terms">
        {certificate ? (
          <>
            {t('properties.housing.shareNow', { amount: formatCents(certificate.share_snt), date: formatDate(certificate.date) })}{' '}
            <DocSlot voucher={voucher(certificate.voucher_id)} noDocument={certificate.no_document} held={held} onOpen={onOpenVoucher} />
          </>
        ) : (
          t('properties.housing.shareNone')
        )}
      </p>
      {path?.months.length ? <ComputedShare path={path} /> : null}
      {path && !path.payments_known ? <p className="muted property-lease-hint">{t('properties.housing.path.paymentsUnknown')}</p> : null}
      <p className="property-lease-terms">
        {charge ? (
          <>
            {t('properties.housing.chargeNow', { amount: formatCents(charge.amount_snt), date: formatDate(charge.from) })}{' '}
            {charge.rahastoitu ? <Pill tone="doc">{t('properties.housing.field.rahastoitu')}</Pill> : null}{' '}
            <DocSlot voucher={voucher(charge.voucher_id)} noDocument={charge.no_document} held={held} onOpen={onOpenVoucher} />
          </>
        ) : (
          <span className="muted">{t('properties.housing.chargeNone')}</span>
        )}
      </p>
      <p className="property-lease-terms">
        {fixed
          ? rate
            ? t('properties.housing.rateNowFixed', { rate: formatPcm(rate.reference_pcm), date: formatDate(rate.from) })
            : t('properties.housing.rateNoneFixed')
          : rate
            ? t('properties.housing.rateNow', {
                reference,
                rate: formatPcm(rate.reference_pcm),
                margin: formatPcm(loan.margin_pcm),
                total: formatPcm(rate.reference_pcm + loan.margin_pcm),
                date: formatDate(rate.from),
              })
            : t('properties.housing.rateNone', { reference, margin: formatPcm(loan.margin_pcm) })}
      </p>
      <p className="property-lease-terms muted">
        {[
          loan.ends ? t('properties.housing.term', { period: periodText(t, loan.starts, loan.ends) }) : t('properties.housing.termOpen', { date: formatDate(loan.starts) }),
          loan.reset_months ? t('properties.housing.reset', { months: loan.reset_months }) : '',
          loan.total_snt != null ? t('properties.housing.total', { amount: formatCents(loan.total_snt) }) : '',
          ...(loan.grace ?? []).map((g) => t('properties.housing.graceText', { period: periodText(t, g.from, g.to) })),
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      {path?.months.length ? <LoanMonths path={path} payments={payments} onOpenVoucher={onOpenVoucher} /> : null}
      {fold(
        t('properties.housing.certificates'),
        [...(loan.certificates ?? [])].reverse().map((c) => (
          <li key={c.date}>
            <span>{formatDate(c.date)}</span>
            <span>{formatCents(c.share_snt)}</span>
            <DocSlot voucher={voucher(c.voucher_id)} noDocument={c.no_document} held={held} onOpen={onOpenVoucher} />
          </li>
        )),
      )}
      {fold(
        t('properties.housing.charges'),
        [...(loan.charges ?? [])].reverse().map((c) => (
          <li key={c.from}>
            <span>{t('properties.housing.fromDate', { date: formatDate(c.from) })}</span>
            <span>{t('properties.housing.perMonth', { amount: formatCents(c.amount_snt) })}</span>
            {c.rahastoitu ? <Pill tone="doc">{t('properties.housing.field.rahastoitu')}</Pill> : null}
            <DocSlot voucher={voucher(c.voucher_id)} noDocument={c.no_document} held={held} onOpen={onOpenVoucher} />
          </li>
        )),
      )}
      {fold(
        t('properties.housing.rates'),
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
      )}
      {fold(
        t('properties.housing.events'),
        [...(loan.events ?? [])].reverse().map((e, i) => (
          <li key={`${e.date}-${i}`}>
            <span>{formatDate(e.date)}</span>
            <span>{t(`properties.housing.event.${e.kind}`)}</span>
            {e.amount_snt ? <span>{formatCents(e.amount_snt)}</span> : null}
            {e.note ? <span className="muted">{e.note}</span> : null}
            {e.voucher_id != null ? <DocSlot voucher={voucher(e.voucher_id)} onOpen={onOpenVoucher} /> : null}
          </li>
        )),
      )}
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
  /** Not sold: only then is a missing document flagged. */
  held: boolean
  /** The loan card in edit: a loan key, 'new', or none. */
  editing?: string | null
  form?: ReactNode
  links?: HousingDocLinks
  /** Opens a stored loan's card in edit; none when the object cannot change (sold, read-only). */
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
              onEdit={onEditLoan ? () => onEditLoan(loan.key) : undefined}
              onOpenVoucher={onOpenVoucher}
            />
          ),
        )}
      </section>
    </>
  )
}
