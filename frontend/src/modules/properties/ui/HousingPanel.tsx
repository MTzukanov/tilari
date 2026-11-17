import { useState, type ReactNode } from 'react'
import { chargeAt, latestCertificate, paidOffOn, rateAt } from '../../../book/modules/properties/domain/housingLoan'
import { useI18n } from '../../../i18n'
import { formatDate } from '../../../shared/dates'
import { DocLine, DocLines } from '../../../shared/DocRows'
import { FileButton } from '../../../shared/FileButton'
import { formatCents } from '../../../shared/money'
import { formatPcm } from '../../../shared/percent'
import { FilePill, Pill } from '../../../shared/Pill'
import { SearchSelect } from '../../../shared/SearchSelect'
import type { DocCandidate, HousingCopySource, HousingLoan, LeaseVoucher, PropertyDetail } from '../api'
import { DocPicker } from './DocPicker'
import { periodText } from './format'
import { DocSlot, VoucherOpen } from './FormParts'

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

/** A loan as the tab shows it on the as-of date: the share, the rahoitusvastike, the rate, the term; every row folded below. */
function LoanCard({
  loan,
  asOf,
  vouchers,
  held,
  onEdit,
  onOpenVoucher,
}: {
  loan: HousingLoan
  asOf: string
  vouchers: Map<number, LeaseVoucher>
  held: boolean
  onEdit?: () => void
  onOpenVoucher: (voucherId: number) => void
}) {
  const { t } = useI18n()
  const voucher = (id: number | undefined) => (id != null ? (vouchers.get(id) ?? null) : null)
  const certificate = latestCertificate(loan, asOf)
  const charge = chargeAt(loan, asOf)
  const rate = rateAt(loan, asOf)
  const paidOff = paidOffOn(loan)
  const reference = t(`properties.housing.reference.${loan.reference}`)
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
          <>
            {t('properties.housing.shareNone')} {held ? <Pill tone="crit">{t('properties.docs.absent')}</Pill> : null}
          </>
        )}
      </p>
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
        {rate
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
            <span>{t('properties.housing.rateRow', { rate: formatPcm(r.reference_pcm), total: formatPcm(r.reference_pcm + loan.margin_pcm) })}</span>
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
              asOf={d.as_of}
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
