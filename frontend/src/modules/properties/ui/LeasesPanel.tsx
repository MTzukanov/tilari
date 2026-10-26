import { getBcp47, useI18n } from '../../../i18n'
import { formatDate } from '../../../shared/dates'
import { formatVoucherId } from '../../../shared/formatVoucherId'
import { formatBp } from '../../../shared/percent'
import type { LeaseView, LeaseVoucher } from '../api'
import { leasePeriod, leaseRentText } from './format'

type T = (key: string, vars?: Record<string, string | number>) => string

function monthName(month: number): string {
  return new Intl.DateTimeFormat(getBcp47(), { month: 'long' }).format(new Date(2024, month - 1, 1))
}

function increaseText(t: T, lease: LeaseView): string {
  const rule = lease.increase
  if (!rule || rule.kind === 'none') return ''
  const month = rule.month ? monthName(rule.month) : ''
  if (rule.kind === 'index') return t(month ? 'properties.lease.increase.indexMonth' : 'properties.lease.increase.index', { month })
  const pct = formatBp(rule.pct_bp ?? 0)
  return t(month ? 'properties.lease.increase.fixedMonth' : 'properties.lease.increase.fixed', { pct, month })
}

function VoucherLink({ voucher, onOpen }: { voucher: LeaseVoucher; onOpen: (voucherId: number) => void }) {
  return (
    <button type="button" className="btn-link" onClick={() => onOpen(voucher.voucher_id)}>
      {formatVoucherId(voucher.series, voucher.doc_number, voucher.date)} · {voucher.title}
    </button>
  )
}

function LeaseCard({ lease, onOpenVoucher }: { lease: LeaseView; onOpenVoucher: (voucherId: number) => void }) {
  const { t } = useI18n()
  const terms = [
    leaseRentText(t, lease.rent),
    lease.due_day != null ? t('properties.lease.due', { day: lease.due_day }) : '',
    lease.notice_months != null ? t('properties.lease.notice', { n: lease.notice_months }) : '',
    increaseText(t, lease),
  ].filter(Boolean)
  return (
    <div className="property-lease-card">
      <p className="property-lease-head">
        <strong>{lease.tenant ?? t('properties.lease.tenantUnknown')}</strong>
        <span className="muted">{leasePeriod(t, lease)}</span>
      </p>
      {terms.length ? <p className="property-lease-terms">{terms.join(' · ')}</p> : null}
      {lease.contract ? (
        <p className="property-lease-terms">
          {t('properties.lease.contract')}: <VoucherLink voucher={lease.contract} onOpen={onOpenVoucher} />
        </p>
      ) : null}
      {lease.steps.length > 1 ? (
        <details>
          <summary>
            {t('properties.lease.steps')} ({lease.steps.length})
          </summary>
          <ul className="property-doc-list">
            {lease.steps.map((step) => (
              <li key={step.from}>
                {formatDate(step.from)} · {leaseRentText(t, step)}
                {step.voucher ? <VoucherLink voucher={step.voucher} onOpen={onOpenVoucher} /> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  )
}

/** Tenancies on the object page: the lease running on the as-of date, then the others. */
export function LeasesPanel({
  leases,
  current,
  asOf,
  suggestions,
  onEdit,
  onOpenVoucher,
}: {
  leases: LeaseView[]
  current: LeaseView | null
  /** Leases the book suggests, newest start first. */
  suggestions: LeaseView[]
  asOf: string
  onEdit: () => void
  onOpenVoucher: (voucherId: number) => void
}) {
  const { t } = useI18n()
  const stored = current && !current.suggested ? current : null
  const others = leases.filter((l) => l.key !== stored?.key)
  return (
    <section className="overview-panel property-leases">
      <h3>{t('properties.lease.title')}</h3>
      {!leases.length && !suggestions.length ? (
        <p className="muted">
          {t('properties.lease.none')}{' '}
          <button type="button" className="btn-link" onClick={onEdit}>
            {t('properties.edit.addLease')}
          </button>
        </p>
      ) : null}
      {leases.length > 0 && !stored ? <p className="muted">{t('properties.lease.noCurrent', { date: formatDate(asOf) })}</p> : null}
      {stored ? <LeaseCard lease={stored} onOpenVoucher={onOpenVoucher} /> : null}
      {others.length ? (
        <>
          <h4 className="property-lease-others">{t('properties.lease.others')}</h4>
          <LeaseList leases={others} onOpenVoucher={onOpenVoucher} />
        </>
      ) : null}
      {suggestions.length ? (
        <div className="property-lease-suggestions">
          <h4 className="property-lease-others">{t('properties.lease.suggestions', { n: suggestions.length })}</h4>
          <p className="muted">{t('properties.lease.suggestionsLead')}</p>
          <LeaseList leases={suggestions} onOpenVoucher={onOpenVoucher} />
          <button type="button" className="btn-secondary" onClick={onEdit}>
            {t('properties.lease.review')}
          </button>
        </div>
      ) : null}
    </section>
  )
}

function LeaseList({ leases, onOpenVoucher }: { leases: LeaseView[]; onOpenVoucher: (voucherId: number) => void }) {
  const { t } = useI18n()
  return (
    <ul className="property-doc-list">
      {leases.map((lease, i) => (
        <li key={`${lease.key}-${lease.starts}-${i}`}>
          <span>{t(`properties.lease.state.${lease.state}`)}</span>
          <span>{lease.tenant ?? t('properties.lease.tenantUnknown')}</span>
          <span className="muted">{leasePeriod(t, lease)}</span>
          <span>{leaseRentText(t, lease.rent)}</span>
          {lease.suggested ? <span className="muted">({t(`properties.lease.source.${lease.suggested}`)})</span> : null}
          {lease.contract ? <VoucherLink voucher={lease.contract} onOpen={onOpenVoucher} /> : null}
        </li>
      ))}
    </ul>
  )
}
