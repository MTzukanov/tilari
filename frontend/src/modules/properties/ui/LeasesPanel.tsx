import { getBcp47, useI18n } from '../../../i18n'
import { formatDate } from '../../../shared/dates'
import { formatVoucherId } from '../../../shared/formatVoucherId'
import { formatCents } from '../../../shared/money'
import { formatBp } from '../../../shared/percent'
import type { LeaseView, LeaseVoucher } from '../api'

type T = (key: string, vars?: Record<string, string | number>) => string

function period(t: T, lease: LeaseView): string {
  return lease.ends
    ? t('properties.lease.period', { from: formatDate(lease.starts), to: formatDate(lease.ends) })
    : t('properties.lease.since', { date: formatDate(lease.starts) })
}

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

/** "680,00 €/kk + maksut 20,00 €/kk" for the step in effect. */
function rentText(t: T, rent: { rent_snt: number; charges_snt?: number } | null): string {
  if (!rent) return ''
  const base = t('properties.lease.perMonth', { amount: formatCents(rent.rent_snt) })
  return rent.charges_snt ? `${base} ${t('properties.lease.charges', { amount: formatCents(rent.charges_snt) })}` : base
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
    rentText(t, lease.rent),
    lease.due_day != null ? t('properties.lease.due', { day: lease.due_day }) : '',
    lease.notice_months != null ? t('properties.lease.notice', { n: lease.notice_months }) : '',
    increaseText(t, lease),
  ].filter(Boolean)
  return (
    <div className="property-lease-card">
      <p className="property-lease-head">
        <strong>{lease.tenant ?? t('properties.lease.tenantUnknown')}</strong>
        <span className="muted">{period(t, lease)}</span>
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
                {formatDate(step.from)} · {rentText(t, step)}
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
  onEdit,
  onOpenVoucher,
}: {
  leases: LeaseView[]
  current: LeaseView | null
  asOf: string
  onEdit: () => void
  onOpenVoucher: (voucherId: number) => void
}) {
  const { t } = useI18n()
  const others = leases.filter((l) => l.key !== current?.key)
  return (
    <section className="overview-panel property-leases">
      <h3>{t('properties.lease.title')}</h3>
      {!leases.length ? (
        <p className="muted">
          {t('properties.lease.none')}{' '}
          <button type="button" className="btn-link" onClick={onEdit}>
            {t('properties.edit.addLease')}
          </button>
        </p>
      ) : null}
      {leases.length > 0 && !current ? <p className="muted">{t('properties.lease.noCurrent', { date: formatDate(asOf) })}</p> : null}
      {current ? <LeaseCard lease={current} onOpenVoucher={onOpenVoucher} /> : null}
      {others.length ? (
        <>
          <h4 className="property-lease-others">{t('properties.lease.others')}</h4>
          <ul className="property-doc-list">
            {others.map((lease) => (
              <li key={lease.key}>
                <span>{t(`properties.lease.state.${lease.state}`)}</span>
                <span>{lease.tenant ?? t('properties.lease.tenantUnknown')}</span>
                <span className="muted">{period(t, lease)}</span>
                <span>{rentText(t, lease.rent)}</span>
                {lease.contract ? <VoucherLink voucher={lease.contract} onOpen={onOpenVoucher} /> : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  )
}
