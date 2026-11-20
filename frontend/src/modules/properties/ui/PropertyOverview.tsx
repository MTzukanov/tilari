import type { ReactNode } from 'react'
import type { PropertyTab } from '../../../app/routing'
import { useI18n } from '../../../i18n'
import { formatDate } from '../../../shared/dates'
import type { DocumentSkip, PropertyDetail, Warning } from '../api'
import { Figure, Figures } from './FigureTiles'
import { companyResultText, leasePeriod, periodText } from './format'
import { HousingShareKpi, IrrKpi, RentKpi, ResultKpi, T12mKpi } from './Kpi'
import { ContractFigure, DepositFigure, LeaseStatePill, RentBalanceFigure, RentFigure, WaterLatestFigure } from './LeasesPanel'
import { Warnings } from './Warnings'

/** A card on the overview: its title, a quiet link to its tab, then a few figures. */
function NowCard({ title, more, onMore, children }: { title: string; more: string; onMore: () => void; children: ReactNode }) {
  return (
    <section className="overview-panel property-now">
      <div className="property-panel-head">
        <h3>{title}</h3>
        <button type="button" className="btn-link btn-quiet" onClick={onMore}>
          {more}
        </button>
      </div>
      {children}
    </section>
  )
}

/**
 * The object at a glance (the first tab): the things most often added, every warning, the running
 * lease and the latest water settlement, the key figures, the cash flow, and the note.
 */
export function PropertyOverview({
  d,
  showWater,
  onTab,
  onAdd,
  onOpenDue,
  onSkip,
  onOpenVoucher,
  cashFlow,
}: {
  d: PropertyDetail
  /** The water card and its action: not on a parking space or garage with nothing stored. */
  showWater: boolean
  onTab: (tab: PropertyTab) => void
  /** Opens the edit page on `tab` with a new row there. */
  onAdd: (tab: PropertyTab) => void
  /** Where a dated reminder's tile goes: the lease it is about, on the edit page. */
  onOpenDue: (w: Warning) => void
  onSkip?: (skip: DocumentSkip) => Promise<unknown>
  onOpenVoucher: (voucherId: number) => void
  /** The cash flow chart with its month lines (`CashFlowPanel`). */
  cashFlow: ReactNode
}) {
  const { t } = useI18n()
  const held = d.status !== 'sold'
  const lease = d.lease && !d.lease.suggested ? d.lease : null
  const latestShare = lease?.water_latest ?? null
  const latest = d.water.settlements[0] ?? null
  const account = lease ? d.rent_account?.leases.find((a) => a.lease_key === lease.key) : undefined
  return (
    <>
      <div className="property-quick">
        {held ? (
          <button type="button" className="btn-secondary" disabled={d.read_only} onClick={() => onAdd('leases')}>
            {t('properties.overview.addLease')}
          </button>
        ) : null}
        {held && showWater ? (
          <button type="button" className="btn-secondary" disabled={d.read_only} onClick={() => onAdd('water')}>
            {t('properties.overview.addWater')}
          </button>
        ) : null}
        {held ? (
          <button type="button" className="btn-secondary" disabled={d.read_only} onClick={() => onAdd('housing')}>
            {t('properties.overview.addLoan')}
          </button>
        ) : null}
        <button type="button" className="btn-secondary" disabled={d.read_only} onClick={() => onAdd('docs')}>
          {t('properties.overview.addDoc')}
        </button>
        <button type="button" className="btn-secondary" disabled={d.read_only} onClick={() => onAdd('finance')}>
          {t('properties.overview.addValuation')}
        </button>
      </div>

      {d.warnings.length ? (
        <div className="property-warnings">
          <Warnings warnings={d.warnings} asOf={d.as_of} onOpenDue={onOpenDue} onSkip={onSkip} />
        </div>
      ) : null}

      <div className="property-now-cards">
        <NowCard title={t('properties.overview.leaseNow')} more={t('properties.overview.allLeases')} onMore={() => onTab('leases')}>
          {lease ? (
            <>
              <p className="property-lease-head">
                <strong>{lease.tenant ?? t('properties.lease.tenantUnknown')}</strong>
                <span className="muted">{leasePeriod(t, lease)}</span>
                <LeaseStatePill state={lease.state} />
              </p>
              <Figures>
                <RentFigure lease={lease} />
                {account ? <RentBalanceFigure lease={lease} account={account} period={{ start: d.rent_start, end: d.rent_end }} asOf={d.as_of} /> : null}
                {lease.deposit ? <DepositFigure deposit={lease.deposit} /> : null}
                {lease.contract || held ? <ContractFigure lease={lease} held={held} onOpenVoucher={onOpenVoucher} /> : null}
              </Figures>
            </>
          ) : (
            <p className="muted">
              {d.leases.length ? t('properties.lease.noCurrent', { date: formatDate(d.as_of) }) : t('properties.lease.none')}
            </p>
          )}
        </NowCard>

        {showWater ? (
          <NowCard title={t('properties.overview.water')} more={t('properties.overview.allWater')} onMore={() => onTab('water')}>
            {latestShare ? (
              <Figures>
                <WaterLatestFigure latest={latestShare} />
              </Figures>
            ) : latest ? (
              <Figures>
                <Figure
                  label={t('properties.water.latest', { period: periodText(t, latest.from, latest.to) })}
                  value={companyResultText(t, latest.difference_snt)}
                />
              </Figures>
            ) : (
              <p className="muted">{t('properties.water.none')}</p>
            )}
          </NowCard>
        ) : null}
      </div>

      <div className="overview-kpis">
        {d.rent ? <RentKpi rent={d.rent} /> : null}
        <T12mKpi d={d} />
        <IrrKpi d={d} />
        <ResultKpi d={d} />
        <HousingShareKpi d={d} />
      </div>

      {cashFlow}

      {d.doc.note ? (
        <section className="property-section">
          <h3>{t('properties.field.note')}</h3>
          <p className="property-note-text">{d.doc.note}</p>
        </section>
      ) : null}
    </>
  )
}
