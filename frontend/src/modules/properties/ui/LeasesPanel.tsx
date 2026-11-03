import { useI18n } from '../../../i18n'
import { formatDate } from '../../../shared/dates'
import { DocLine, DocLines } from '../../../shared/DocRows'
import { Pill } from '../../../shared/Pill'
import { SuggestBanner } from '../../../shared/SuggestBanner'
import type { BookedLine, DepositView, LeaseException, LeaseRentAccount, LeaseState, LeaseView, RentPeriod } from '../api'
import {
  deductedText,
  depositText,
  exceptionLineText,
  exceptionText,
  increaseText,
  leasePeriod,
  leaseRentText,
  periodText,
  waterBalanceText,
} from './format'
import { DocSlot, DocSlotLine, LineLink, LineSources, VoucherLink, WaterStatusPill } from './FormParts'
import { RentAccountView } from './RentAccount'

/**
 * Where a suggestion comes from (hover explains): a lease from a linked contract or from rent
 * payments alone; a water settlement from the company's booked line or the tenant's alone.
 */
export function SuggestionSource({ source }: { source: 'contract' | 'payments' | 'waterCompany' | 'waterTenant' }) {
  const { t } = useI18n()
  return (
    <span className="property-lease-source" title={t(`properties.lease.sourceHint.${source}`)}>
      <Pill tone="doc">{t(`properties.lease.source.${source}`)}</Pill>
    </span>
  )
}

/** A lease's state on the as-of date: running, or a plain fact. */
function LeaseStatePill({ state }: { state: LeaseState }) {
  const { t } = useI18n()
  return <Pill tone={state === 'current' ? 'accent' : 'neutral'}>{t(`properties.lease.state.${state}`)}</Pill>
}

/** "Puuttuu" in a closed list's summary when a line in it has no document, so it shows without opening. */
function AbsentMark({ items, held }: { items: { voucher: unknown; no_document?: true }[]; held: boolean }) {
  const { t } = useI18n()
  return held && items.some((i) => !i.voucher && !i.no_document) ? <Pill tone="crit">{t('properties.docs.absent')}</Pill> : null
}

/** What a suggested lease was read from, each to open: the contract, the increase notices, the rent payments. */
function LeaseSources({ lease, onOpen }: { lease: LeaseView; onOpen: (voucherId: number) => void }) {
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

/**
 * A lease's deposit (ADR-029): received, returned and kept, and the balance on the as-of date;
 * each booking folded below, a return with the income or costs booked in the same payment.
 */
function DepositSummary({ deposit, onOpen }: { deposit: DepositView; onOpen: (voucherId: number) => void }) {
  const { t } = useI18n()
  return (
    <div className="property-lease-terms property-deposit">
      <p>
        {t('properties.deposit.title')}: {depositText(t, deposit)}
        {deposit.missing ? <span className="muted"> · {t('properties.deposit.missingCount', { n: deposit.missing })}</span> : null}
      </p>
      {deposit.movements.length ? (
        <details className="property-sources">
          <summary>{t('properties.deposit.movements', { n: deposit.movements.length })}</summary>
          <ul className="property-doc-list">
            {deposit.movements.map((m) => (
              <li key={m.line_id}>
                <span>{t(`properties.deposit.kind.${m.kind}`)}</span>
                <LineLink line={m} onOpen={onOpen} />
                {m.deductions.length ? (
                  <span title={t('properties.deposit.deductionsHint')}>
                    {deductedText(t, m.deducted_snt)}:{' '}
                    {m.deductions.map((d) => (
                      <LineLink key={d.line_id} line={d} onOpen={onOpen} />
                    ))}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  )
}

function LeaseCard({
  lease,
  account,
  period,
  asOf,
  held,
  onEdit,
  onOpenVoucher,
  onSaveException,
}: {
  lease: LeaseView
  account: LeaseRentAccount | undefined
  period: RentPeriod
  asOf: string
  /** Not sold: only then is a document with no voucher flagged as missing. */
  held: boolean
  /** Opens the edit page, where the lease's increases and exceptions are entered. */
  onEdit: () => void
  onOpenVoucher: (voucherId: number) => void
  onSaveException?: (leaseKey: string, exception: LeaseException | null, replaces?: LeaseException) => Promise<void>
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
        <LeaseStatePill state={lease.state} />
      </p>
      {terms.length ? <p className="property-lease-terms">{terms.join(' · ')}</p> : null}
      {exceptionNow ? (
        <p className="property-lease-terms">
          {t('properties.lease.exceptionNow')}: {exceptionText(t, exceptionNow)}
        </p>
      ) : null}
      {lease.contract || held ? (
        <DocSlotLine label={t('properties.lease.contract')} voucher={lease.contract} onOpen={onOpenVoucher} />
      ) : null}
      {account ? (
        <RentAccountView
          account={account}
          asOf={asOf}
          leaseStarts={lease.starts}
          period={period}
          onOpen={onOpenVoucher}
          onSaveException={onSaveException ? (e, replaces) => onSaveException(lease.key, e, replaces) : undefined}
        />
      ) : null}
      {latest ? (
        <p className="property-lease-terms">
          {t('properties.water.latest', { period: periodText(t, latest.from, latest.to) })}: {waterBalanceText(t, latest.balance_snt)}{' '}
          <WaterStatusPill share={latest} />
        </p>
      ) : null}
      {lease.deposit ? <DepositSummary deposit={lease.deposit} onOpen={onOpenVoucher} /> : null}
      {lease.steps.length > 1 ? (
        <details>
          <summary>
            {t('properties.lease.increases')} ({lease.steps.length - 1}) <AbsentMark items={lease.steps.slice(1)} held={held} />
          </summary>
          {/* The day an increase applies from says more than its notice's date, which its pill shows. */}
          <DocLines>
            {lease.steps.slice(1).map((step) => (
              <DocLine key={step.from} date={formatDate(step.from)} title={leaseRentText(t, step)}>
                <DocSlot voucher={step.voucher} noDocument={step.no_document} held={held} onOpen={onOpenVoucher} />
              </DocLine>
            ))}
          </DocLines>
        </details>
      ) : null}
      {lease.exceptions.length ? (
        <details>
          <summary>
            {t('properties.lease.exceptions')} ({lease.exceptions.length}) <AbsentMark items={lease.exceptions} held={held} />
          </summary>
          <DocLines>
            {lease.exceptions.map((e) => (
              <DocLine key={e.from} date={formatDate(e.from)} title={exceptionLineText(t, e)}>
                <DocSlot voucher={e.voucher} noDocument={e.no_document} held={held} onOpen={onOpenVoucher} />
              </DocLine>
            ))}
          </DocLines>
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
  period,
  held,
  onEdit,
  onOpenVoucher,
  onSaveException,
}: {
  leases: LeaseView[]
  current: LeaseView | null
  /** Leases the book suggests, newest start first. */
  suggestions: LeaseView[]
  /** The stored leases' rent accounts, and the income no lease takes. */
  accounts?: LeaseRentAccount[]
  unassigned?: BookedLine[]
  /** The owner's rent days on the object. */
  period: RentPeriod
  asOf: string
  /** Not sold: only then is a document with no voucher flagged as missing. */
  held: boolean
  onEdit: () => void
  onOpenVoucher: (voucherId: number) => void
  /** Saves an agreed exception to a stored lease from its month table; none when the document is read-only. */
  onSaveException?: (leaseKey: string, exception: LeaseException | null, replaces?: LeaseException) => Promise<void>
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
          period={period}
          asOf={asOf}
          held={held}
          onEdit={onEdit}
          onOpenVoucher={onOpenVoucher}
          onSaveException={onSaveException}
        />
      ) : null}
      {others.length ? (
        <>
          <h4 className="property-lease-others">{t('properties.lease.others')}</h4>
          <LeaseList
            leases={others}
            accounts={accounts}
            period={period}
            asOf={asOf}
            onOpenVoucher={onOpenVoucher}
            onSaveException={onSaveException}
          />
        </>
      ) : null}
      {unassigned.length ? (
        <div className="property-lease-terms">
          <LineSources label={t('properties.rent.unassigned', { n: unassigned.length })} lines={unassigned} onOpen={onOpenVoucher} />
        </div>
      ) : null}
      {suggestions.length ? (
        <SuggestBanner
          heading="h4"
          title={t('properties.lease.suggestions', { n: suggestions.length })}
          lead={t('properties.lease.suggestionsLead')}
          action={
            <button type="button" className="btn-primary" onClick={onEdit}>
              {t('properties.lease.review')}
            </button>
          }
        >
          <LeaseList leases={suggestions} onOpenVoucher={onOpenVoucher} />
        </SuggestBanner>
      ) : null}
    </section>
  )
}

function LeaseList({
  leases,
  accounts = [],
  period,
  asOf = '',
  onOpenVoucher,
  onSaveException,
}: {
  leases: LeaseView[]
  accounts?: LeaseRentAccount[]
  /** With the accounts: the owner's rent days on the object. */
  period?: RentPeriod
  asOf?: string
  onOpenVoucher: (voucherId: number) => void
  onSaveException?: (leaseKey: string, exception: LeaseException | null, replaces?: LeaseException) => Promise<void>
}) {
  const { t } = useI18n()
  return (
    <ul className="property-doc-list">
      {leases.map((lease, i) => (
        <li key={`${lease.key}-${lease.starts}-${i}`}>
          <LeaseStatePill state={lease.state} />
          <span>{lease.tenant ?? t('properties.lease.tenantUnknown')}</span>
          <span className="muted">{leasePeriod(t, lease)}</span>
          <span>{leaseRentText(t, lease.rent)}</span>
          {lease.suggested ? <SuggestionSource source={lease.suggested} /> : null}
          {lease.suggested ? (
            <LeaseSources lease={lease} onOpen={onOpenVoucher} />
          ) : lease.contract ? (
            <VoucherLink voucher={lease.contract} onOpen={onOpenVoucher} />
          ) : null}
          {period && !lease.suggested && accounts.some((a) => a.lease_key === lease.key) ? (
            <RentAccountView
              account={accounts.find((a) => a.lease_key === lease.key)!}
              asOf={asOf}
              leaseStarts={lease.starts}
              period={period}
              onOpen={onOpenVoucher}
              onSaveException={onSaveException ? (e, replaces) => onSaveException(lease.key, e, replaces) : undefined}
            />
          ) : null}
          {!lease.suggested && lease.deposit ? <DepositSummary deposit={lease.deposit} onOpen={onOpenVoucher} /> : null}
        </li>
      ))}
    </ul>
  )
}
