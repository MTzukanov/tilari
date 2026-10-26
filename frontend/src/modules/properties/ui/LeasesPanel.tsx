import { useI18n } from '../../../i18n'
import { formatDate } from '../../../shared/dates'
import type { BookedLine, LeaseException, LeaseRentAccount, LeaseView } from '../api'
import { exceptionText, increaseText, leasePeriod, leaseRentText, periodText, waterBalanceText, waterStatusText } from './format'
import { LineSources, VoucherLink } from './FormParts'
import { RentAccountView } from './RentAccount'

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

function LeaseCard({
  lease,
  account,
  asOf,
  onEdit,
  onOpenVoucher,
  onAddException,
}: {
  lease: LeaseView
  account: LeaseRentAccount | undefined
  asOf: string
  /** Opens the edit page, where the lease's increases and exceptions are entered. */
  onEdit: () => void
  onOpenVoucher: (voucherId: number) => void
  onAddException?: (leaseKey: string, exception: LeaseException) => Promise<void>
}) {
  const { t } = useI18n()
  const terms = [
    leaseRentText(t, lease.rent),
    lease.due_day != null ? t('properties.lease.due', { day: lease.due_day }) : '',
    increaseText(t, lease.increase),
    t(lease.water === 'flat' ? 'properties.water.flat' : 'properties.water.advance'),
  ].filter(Boolean)
  const latest = lease.water_latest
  const exceptionNow = lease.exceptions.find((e) => e.from <= asOf && asOf <= e.to)
  return (
    <div className="property-lease-card">
      <p className="property-lease-head">
        <strong>{lease.tenant ?? t('properties.lease.tenantUnknown')}</strong>
        <span className="muted">{leasePeriod(t, lease)}</span>
      </p>
      {terms.length ? <p className="property-lease-terms">{terms.join(' · ')}</p> : null}
      {exceptionNow ? (
        <p className="property-lease-terms">
          {t('properties.lease.exceptionNow')}: {exceptionText(t, exceptionNow)}
        </p>
      ) : null}
      {lease.contract ? (
        <p className="property-lease-terms">
          {t('properties.lease.contract')}: <VoucherLink voucher={lease.contract} onOpen={onOpenVoucher} />
        </p>
      ) : null}
      {account ? (
        <RentAccountView
          account={account}
          asOf={asOf}
          leaseStarts={lease.starts}
          onOpen={onOpenVoucher}
          onAddException={onAddException ? (e) => onAddException(lease.key, e) : undefined}
        />
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
      {lease.exceptions.length ? (
        <details>
          <summary>
            {t('properties.lease.exceptions')} ({lease.exceptions.length})
          </summary>
          <ul className="property-doc-list">
            {lease.exceptions.map((e) => (
              <li key={e.from}>
                {exceptionText(t, e)}
                {e.voucher ? <VoucherLink voucher={e.voucher} onOpen={onOpenVoucher} /> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <p className="property-lease-terms">
        <button type="button" className="btn-link" onClick={onEdit}>
          {t('properties.lease.editTerms')}
        </button>
      </p>
    </div>
  )
}

/** Tenancies on the object page: the lease running on the as-of date, then the others. */
export function LeasesPanel({
  leases,
  current,
  asOf,
  suggestions,
  accounts = [],
  unassigned = [],
  onEdit,
  onOpenVoucher,
  onAddException,
}: {
  leases: LeaseView[]
  current: LeaseView | null
  /** Leases the book suggests, newest start first. */
  suggestions: LeaseView[]
  /** The stored leases' rent accounts, and the income no lease takes. */
  accounts?: LeaseRentAccount[]
  unassigned?: BookedLine[]
  asOf: string
  onEdit: () => void
  onOpenVoucher: (voucherId: number) => void
  /** Saves an agreed exception to a stored lease from its month table; none when the document is read-only. */
  onAddException?: (leaseKey: string, exception: LeaseException) => Promise<void>
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
      {stored ? (
        <LeaseCard
          lease={stored}
          account={accounts.find((a) => a.lease_key === stored.key)}
          asOf={asOf}
          onEdit={onEdit}
          onOpenVoucher={onOpenVoucher}
          onAddException={onAddException}
        />
      ) : null}
      {others.length ? (
        <>
          <h4 className="property-lease-others">{t('properties.lease.others')}</h4>
          <LeaseList leases={others} accounts={accounts} asOf={asOf} onOpenVoucher={onOpenVoucher} onAddException={onAddException} />
        </>
      ) : null}
      {unassigned.length ? (
        <div className="property-lease-terms">
          <LineSources label={t('properties.rent.unassigned', { n: unassigned.length })} lines={unassigned} onOpen={onOpenVoucher} />
        </div>
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

function LeaseList({
  leases,
  accounts = [],
  asOf = '',
  onOpenVoucher,
  onAddException,
}: {
  leases: LeaseView[]
  accounts?: LeaseRentAccount[]
  asOf?: string
  onOpenVoucher: (voucherId: number) => void
  onAddException?: (leaseKey: string, exception: LeaseException) => Promise<void>
}) {
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
          {!lease.suggested && accounts.some((a) => a.lease_key === lease.key) ? (
            <RentAccountView
              account={accounts.find((a) => a.lease_key === lease.key)!}
              asOf={asOf}
              leaseStarts={lease.starts}
              onOpen={onOpenVoucher}
              onAddException={onAddException ? (e) => onAddException(lease.key, e) : undefined}
            />
          ) : null}
        </li>
      ))}
    </ul>
  )
}
