import type { ReactNode } from 'react'
import { useI18n } from '../../../i18n'
import { formatDate } from '../../../shared/dates'
import { DocLine, DocLines } from '../../../shared/DocRows'
import { formatCents } from '../../../shared/money'
import { Pill } from '../../../shared/Pill'
import { SuggestBanner } from '../../../shared/SuggestBanner'
import type { BookedLine, DepositView, LeaseException, LeaseRentAccount, LeaseState, LeaseView, RentPeriod } from '../api'
import {
  deductedText,
  depositText,
  exceptionLineText,
  increaseFigure,
  leasePeriod,
  leaseRentText,
  periodText,
  rentCountedText,
  rentPartsText,
  rentTotal,
  rentVatText,
  waterBalanceText,
} from './format'
import { Figure, Figures, Folds, type Fold } from './FigureTiles'
import { DocSlot, LineLink, LineSources, VoucherLink, WaterStatusPill } from './FormParts'
import { RentAccountView, RentMonths } from './RentAccount'

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
export function LeaseStatePill({ state }: { state: LeaseState }) {
  const { t } = useI18n()
  return <Pill tone={state === 'current' ? 'accent' : 'neutral'}>{t(`properties.lease.state.${state}`)}</Pill>
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
 * A lease's deposit (ADR-029) on a list row: received, returned and kept, and the balance on the
 * as-of date; each booking folded below. The lease's own card shows it as a tile.
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
          <DepositMovements deposit={deposit} onOpen={onOpen} />
        </details>
      ) : null}
    </div>
  )
}

/** A deposit's booked lines: received or returned, a return with the income or costs booked in the same payment. */
function DepositMovements({ deposit, onOpen, className = 'property-doc-list' }: { deposit: DepositView; onOpen: (voucherId: number) => void; className?: string }) {
  const { t } = useI18n()
  return (
    <ul className={className}>
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
  )
}

/** The dot on a list's tab when a line in it has no document, so it shows without opening. */
function absentMark(t: (key: string) => string, items: { voucher: unknown; no_document?: true }[], held: boolean): Fold['mark'] {
  return held && items.some((i) => !i.voucher && !i.no_document) ? { tone: 'crit', title: t('properties.docs.absent') } : undefined
}

/**
 * The lease running on the as-of date as figure tiles: the rent, an exception in force, the rent
 * balance, the next increase or the clause, the water, the latest water settlement, the deposit and
 * the contract; the months, increases, exceptions and the deposit's bookings fold under them.
 */
function LeaseCard({
  lease,
  account,
  period,
  asOf,
  held,
  onEdit,
  onOpenVoucher,
  onSaveException,
  parkingObject,
}: {
  lease: LeaseView
  account: LeaseRentAccount | undefined
  period: RentPeriod
  asOf: string
  /** Not sold: only then is a document with no voucher flagged as missing. */
  held: boolean
  /** Turns the card into its form (terms, increases, exceptions, documents); none when it cannot change. */
  onEdit?: () => void
  onOpenVoucher: (voucherId: number) => void
  onSaveException?: (leaseKey: string, exception: LeaseException | null, replaces?: LeaseException) => Promise<void>
  parkingObject: boolean
}) {
  const { t } = useI18n()
  const rent = lease.rent
  const perMonth = (snt: number) => t('properties.lease.perMonth', { amount: formatCents(snt) })
  const latest = lease.water_latest
  const exceptionNow = lease.exceptions.find((e) => e.from <= asOf && asOf <= e.to)
  const deposit = lease.deposit
  const rule = lease.increase && lease.increase.kind !== 'none' ? lease.increase : null
  const ruleFigure = rule ? increaseFigure(t, rule) : null
  /** The next increase after the as-of date, and the step it raises. */
  const nextAt = lease.steps.findIndex((step, i) => i > 0 && step.from > asOf)
  const next = nextAt > 0 ? lease.steps[nextAt] : null
  const raise = next ? rentTotal(next) - rentTotal(lease.steps[nextAt - 1]) : 0
  const lastIncrease = lease.steps.slice(1).findLast((step) => step.from <= asOf)
  const balance = account?.balance_snt ?? 0
  const folds: Fold[] = [
    {
      key: 'months',
      title: t('properties.rent.monthsTitle'),
      n: account?.months.length ?? 0,
      body: () =>
        account ? (
          <div className="property-fold-body">
            <RentMonths
              account={account}
              onOpen={onOpenVoucher}
              onSaveException={onSaveException ? (e, replaces) => onSaveException(lease.key, e, replaces) : undefined}
              parkingObject={parkingObject}
            />
          </div>
        ) : null,
    },
    {
      key: 'increases',
      title: t('properties.lease.increases'),
      n: lease.steps.length - 1,
      mark: absentMark(t, lease.steps.slice(1), held),
      body: () => (
        // The day an increase applies from says more than its notice's date, which its pill shows.
        <div className="property-fold-body">
          <DocLines>
            {lease.steps.slice(1).map((step) => (
              <DocLine key={step.from} date={formatDate(step.from)} title={leaseRentText(t, step)}>
                <DocSlot voucher={step.voucher} noDocument={step.no_document} held={held} onOpen={onOpenVoucher} />
              </DocLine>
            ))}
          </DocLines>
        </div>
      ),
    },
    {
      key: 'exceptions',
      title: t('properties.lease.exceptions'),
      n: lease.exceptions.length,
      mark: absentMark(t, lease.exceptions, held),
      body: () => (
        <div className="property-fold-body">
          <DocLines>
            {lease.exceptions.map((e) => (
              <DocLine key={e.from} date={formatDate(e.from)} title={exceptionLineText(t, e)}>
                <DocSlot voucher={e.voucher} noDocument={e.no_document} held={held} onOpen={onOpenVoucher} />
              </DocLine>
            ))}
          </DocLines>
        </div>
      ),
    },
    {
      key: 'deposit',
      title: t('properties.deposit.movementsTitle'),
      n: deposit?.movements.length ?? 0,
      body: () => (deposit ? <DepositMovements deposit={deposit} onOpen={onOpenVoucher} className="property-doc-list property-fold-body property-deposit-lines" /> : null),
    },
  ]
  return (
    <div className="property-lease-card">
      <p className="property-lease-head">
        <strong>{lease.tenant ?? t('properties.lease.tenantUnknown')}</strong>
        <span className="muted">{leasePeriod(t, lease)}</span>
        <LeaseStatePill state={lease.state} />
        {onEdit ? (
          <button type="button" className="btn-link" onClick={onEdit}>
            {t('properties.lease.edit')}
          </button>
        ) : null}
      </p>
      <Figures>
        <Figure
          label={t('properties.lease.figure.rent')}
          value={rent ? perMonth(rentTotal(rent)) : ''}
          sub={
            rent
              ? [
                  rentPartsText(t, rent),
                  lease.vat ? rentVatText(t, rent, lease.vat) : '',
                  lease.due_day != null ? t('properties.lease.due', { day: lease.due_day }) : '',
                ].filter(Boolean)
              : []
          }
        />
        {exceptionNow ? (
          <Figure
            label={t('properties.lease.exceptionNow')}
            value={perMonth(rentTotal(exceptionNow))}
            sub={[
              periodText(t, exceptionNow.from, exceptionNow.to),
              t('properties.lease.normal', { amount: formatCents(exceptionNow.normal_snt) }),
              exceptionNow.note ?? '',
            ].filter(Boolean)}
          />
        ) : null}
        {account ? (
          <Figure
            label={t(balance > 0 ? 'properties.rent.figure.arrears' : balance < 0 ? 'properties.rent.figure.ahead' : 'properties.rent.balanceOn', {
              date: formatDate(asOf),
            })}
            value={formatCents(Math.abs(balance))}
            neg={balance > 0}
            sub={rentCountedText(t, account, lease.starts, period)}
          />
        ) : null}
        {next ? (
          <Figure
            label={t('properties.lease.figure.nextIncrease')}
            value={perMonth(rentTotal(next))}
            sub={[
              `${t('properties.lease.since', { date: formatDate(next.from) })} · ${raise >= 0 ? '+' : ''}${formatCents(raise)}`,
              ruleFigure ? [ruleFigure.value, ruleFigure.month].filter(Boolean).join(', ') : '',
              <DocSlot key="notice" voucher={next.voucher} noDocument={next.no_document} held={held} onOpen={onOpenVoucher} />,
            ].filter(Boolean)}
          />
        ) : ruleFigure ? (
          <Figure
            label={t('properties.lease.figure.increase')}
            value={ruleFigure.value}
            sub={[ruleFigure.month, lastIncrease ? t('properties.lease.figure.lastIncrease', { date: formatDate(lastIncrease.from) }) : ''].filter(Boolean)}
          />
        ) : null}
        {rent?.water_snt || lease.water === 'flat' ? (
          <Figure
            label={t('properties.lease.figure.water')}
            value={rent?.water_snt ? perMonth(rent.water_snt) : ''}
            sub={[t(lease.water === 'flat' ? 'properties.water.flat' : 'properties.water.advance')]}
          />
        ) : null}
        {latest ? (
          <Figure
            label={t('properties.water.latest', { period: periodText(t, latest.from, latest.to) })}
            value={waterBalanceText(t, latest.balance_snt)}
            sub={latest.status !== 'none' ? [<WaterStatusPill key="status" share={latest} />] : []}
          />
        ) : null}
        {deposit ? (
          <Figure
            label={t('properties.deposit.title')}
            value={formatCents(deposit.balance_snt)}
            neg={deposit.balance_snt < 0}
            sub={[
              t('properties.deposit.received', { amount: formatCents(deposit.received_snt) }),
              deposit.returned_snt
                ? [t('properties.deposit.returned', { amount: formatCents(deposit.returned_snt) }), deposit.deducted_snt ? deductedText(t, deposit.deducted_snt) : '']
                    .filter(Boolean)
                    .join(', ')
                : '',
              deposit.missing ? t('properties.deposit.missingCount', { n: deposit.missing }) : '',
            ].filter(Boolean)}
          />
        ) : null}
        {lease.contract || held ? (
          <Figure label={t('properties.lease.contract')} sub={[<DocSlot key="contract" voucher={lease.contract} held={held} onOpen={onOpenVoucher} />]} />
        ) : null}
      </Figures>
      <Folds folds={folds} />
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
  rentDates = null,
  editing = null,
  form = null,
  onEditLease,
  onAddSuggestion,
  onAdd,
  onOpenVoucher,
  onSaveException,
  parkingObject,
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
  /** The owner's rent days under the title (`RentDates`). */
  rentDates?: ReactNode
  /** The lease card in edit: a lease key, 'new', or none; `form` is shown in its place. */
  editing?: string | null
  form?: ReactNode
  /** Opens a stored lease's card in edit; none when the object cannot change (sold, read-only). */
  onEditLease?: (key: string) => void
  /** Opens a new lease card filled from suggestion `i`; none when no lease can be added. */
  onAddSuggestion?: (i: number) => void
  /** Opens a new lease card; none when no lease can be added (sold, read-only). */
  onAdd?: () => void
  onOpenVoucher: (voucherId: number) => void
  /** Saves an agreed exception to a stored lease from its month table; none when the document is read-only. */
  onSaveException?: (leaseKey: string, exception: LeaseException | null, replaces?: LeaseException) => Promise<void>
  /** A parking space or garage: its exceptions have no water to give. */
  parkingObject: boolean
}) {
  const { t } = useI18n()
  const stored = current && !current.suggested ? current : null
  const others = leases.filter((l) => l.key !== stored?.key)
  return (
    <section className="overview-panel property-leases">
      <div className="property-panel-head">
        <h3>{t('properties.lease.title')}</h3>
        {onAdd ? (
          <button type="button" className="btn-small" onClick={onAdd}>
            {t('properties.overview.addLease')}
          </button>
        ) : null}
      </div>
      {rentDates}
      {/* What the book suggests comes first: its "Lisää" opens the new card right under it. */}
      {suggestions.length ? (
        <SuggestBanner
          heading="h4"
          title={t('properties.lease.suggestions', { n: suggestions.length })}
          lead={t('properties.lease.suggestionsLead')}
        >
          <LeaseList leases={suggestions} onOpenVoucher={onOpenVoucher} onAdd={onAddSuggestion} />
        </SuggestBanner>
      ) : null}
      {editing === 'new' ? form : null}
      {!leases.length && !suggestions.length && editing !== 'new' ? <p className="muted">{t('properties.lease.none')}</p> : null}
      {leases.length > 0 && !stored ? <p className="muted">{t('properties.lease.noCurrent', { date: formatDate(asOf) })}</p> : null}
      {stored && editing === stored.key ? form : null}
      {stored && editing !== stored.key ? (
        <LeaseCard
          lease={stored}
          account={accounts.find((a) => a.lease_key === stored.key)}
          period={period}
          asOf={asOf}
          held={held}
          onEdit={onEditLease ? () => onEditLease(stored.key) : undefined}
          onOpenVoucher={onOpenVoucher}
          onSaveException={onSaveException}
          parkingObject={parkingObject}
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
            parkingObject={parkingObject}
            editing={editing}
            form={form}
            onEdit={onEditLease}
          />
        </>
      ) : null}
      {unassigned.length ? (
        <div className="property-lease-terms">
          <LineSources label={t('properties.rent.unassigned', { n: unassigned.length })} lines={unassigned} onOpen={onOpenVoucher} />
        </div>
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
  parkingObject = false,
  editing = null,
  form = null,
  onEdit,
  onAdd,
}: {
  leases: LeaseView[]
  accounts?: LeaseRentAccount[]
  /** With the accounts: the owner's rent days on the object. */
  period?: RentPeriod
  asOf?: string
  onOpenVoucher: (voucherId: number) => void
  onSaveException?: (leaseKey: string, exception: LeaseException | null, replaces?: LeaseException) => Promise<void>
  /** With the accounts: a parking space or garage. */
  parkingObject?: boolean
  /** The lease key whose row shows `form` instead. */
  editing?: string | null
  form?: ReactNode
  /** A stored lease's "Muokkaa". */
  onEdit?: (key: string) => void
  /** A suggestion's "Lisää" (row `i`). */
  onAdd?: (i: number) => void
}) {
  const { t } = useI18n()
  return (
    <ul className="property-doc-list">
      {leases.map((lease, i) =>
        !lease.suggested && editing === lease.key ? (
          <li key={`${lease.key}-${lease.starts}-${i}`} className="property-lease-row-edit">
            {form}
          </li>
        ) : (
        <li key={`${lease.key}-${lease.starts}-${i}`}>
          <LeaseStatePill state={lease.state} />
          <span>{lease.tenant ?? t('properties.lease.tenantUnknown')}</span>
          <span className="muted">{leasePeriod(t, lease)}</span>
          <span>{leaseRentText(t, lease.rent, lease.vat)}</span>
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
              parkingObject={parkingObject}
            />
          ) : null}
          {!lease.suggested && lease.deposit ? <DepositSummary deposit={lease.deposit} onOpen={onOpenVoucher} /> : null}
          {!lease.suggested && onEdit ? (
            <button type="button" className="btn-link" onClick={() => onEdit(lease.key)}>
              {t('properties.lease.edit')}
            </button>
          ) : null}
          {lease.suggested && onAdd ? (
            <button type="button" className="btn-small is-primary" onClick={() => onAdd(i)}>
              {t('properties.edit.addSuggestion')}
            </button>
          ) : null}
        </li>
        ),
      )}
    </ul>
  )
}
