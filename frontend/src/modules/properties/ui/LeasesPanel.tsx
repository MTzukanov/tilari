import { useI18n } from '../../../i18n'
import { formatDate } from '../../../shared/dates'
import type { LeaseView } from '../api'
import { increaseText, leasePeriod, leaseRentText, periodText, waterBalanceText, waterStatusText } from './format'
import { LineSources, VoucherLink } from './FormParts'

/**
 * Where a suggestion comes from (hover explains): a lease from a linked contract or from rent
 * payments alone; a water settlement from the company's booked line or the tenant's alone.
 */
export function SuggestionSource({ source }: { source: 'contract' | 'payments' | 'waterCompany' | 'waterTenant' }) {
  const { t } = useI18n()
  return (
    <span className="muted property-lease-source" title={t(`properties.lease.sourceHint.${source}`)}>
      {t(`properties.lease.source.${source}`)}
    </span>
  )
}

/** What a suggested lease was read from, each to open: the contract, the increase notices, the rent payments. */
export function LeaseSources({ lease, onOpen }: { lease: LeaseView; onOpen: (voucherId: number) => void }) {
  const { t } = useI18n()
  const notices = lease.steps.flatMap((step) => (step.voucher ? [step.voucher] : []))
  const payments = lease.sources ?? []
  return (
    <>
      {lease.contract ? <VoucherLink voucher={lease.contract} onOpen={onOpen} /> : null}
      {notices.map((voucher) => (
        <VoucherLink key={voucher.voucher_id} voucher={voucher} onOpen={onOpen} />
      ))}
      <LineSources label={t('properties.lease.payments', { n: payments.length })} lines={payments} onOpen={onOpen} />
    </>
  )
}

function LeaseCard({ lease, onOpenVoucher }: { lease: LeaseView; onOpenVoucher: (voucherId: number) => void }) {
  const { t } = useI18n()
  const terms = [
    leaseRentText(t, lease.rent),
    lease.due_day != null ? t('properties.lease.due', { day: lease.due_day }) : '',
    increaseText(t, lease.increase),
    t(lease.water === 'flat' ? 'properties.water.flat' : 'properties.water.advance'),
  ].filter(Boolean)
  const latest = lease.water_latest
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
      {latest ? (
        <p className="property-lease-terms">
          {t('properties.water.latest', { period: periodText(t, latest.from, latest.to) })}: {waterBalanceText(t, latest.balance_snt)}
          {latest.status !== 'none' ? ` · ${waterStatusText(t, latest.status, latest.balance_snt, latest.settled_snt)}` : ''}
        </p>
      ) : null}
      {lease.steps.length > 1 ? (
        <details>
          <summary>
            {t('properties.lease.increases')} ({lease.steps.length - 1})
          </summary>
          <ul className="property-doc-list">
            {lease.steps.slice(1).map((step) => (
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
          {lease.suggested ? <SuggestionSource source={lease.suggested} /> : null}
          {lease.suggested ? (
            <LeaseSources lease={lease} onOpen={onOpenVoucher} />
          ) : lease.contract ? (
            <VoucherLink voucher={lease.contract} onOpen={onOpenVoucher} />
          ) : null}
        </li>
      ))}
    </ul>
  )
}
