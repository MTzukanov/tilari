import type { ReactNode } from 'react'
import type { PropertyTab } from '../../../app/routing'
import { useI18n } from '../../../i18n'
import { formatDate } from '../../../shared/dates'
import type { DocumentSkip, PropertyDetail, Warning } from '../api'
import { companyResultText, depositText, leasePeriod, leaseRentText, periodText, waterBalanceText } from './format'
import { DocSlotLine, WaterStatusPill } from './FormParts'
import { IrrKpi, RentKpi, ResultKpi, T12mKpi } from './Kpi'
import { LeaseStatePill } from './LeasesPanel'
import { Warnings } from './Warnings'

/** A card on the overview: its title, a quiet link to its tab, then a few lines. */
function NowCard({ title, more, onMore, children }: { title: string; more: string; onMore: () => void; children: ReactNode }) {
  return (
    <section className="overview-panel property-now">
      <div className="property-now-head">
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
 * The object at a glance (the first tab): every warning, the running lease and the latest water
 * settlement, four key figures, the things most often added, and the note.
 */
export function PropertyOverview({
  d,
  showWater,
  onTab,
  onAdd,
  onOpenDue,
  onSkip,
  onOpenVoucher,
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
}) {
  const { t } = useI18n()
  const held = d.status !== 'sold'
  const lease = d.lease && !d.lease.suggested ? d.lease : null
  const latestShare = lease?.water_latest ?? null
  const latest = d.water.settlements[0] ?? null
  const terms = lease
    ? [leaseRentText(t, lease.rent, lease.vat), lease.due_day != null ? t('properties.lease.due', { day: lease.due_day }) : ''].filter(Boolean)
    : []
  return (
    <>
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
              {terms.length ? <p className="property-lease-terms">{terms.join(' · ')}</p> : null}
              {lease.deposit ? (
                <p className="property-lease-terms">
                  {t('properties.deposit.title')}: {depositText(t, lease.deposit)}
                </p>
              ) : null}
              {lease.contract || held ? (
                <DocSlotLine label={t('properties.lease.contract')} voucher={lease.contract} onOpen={onOpenVoucher} />
              ) : null}
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
              <p className="property-lease-terms">
                {t('properties.water.latest', { period: periodText(t, latestShare.from, latestShare.to) })}:{' '}
                {waterBalanceText(t, latestShare.balance_snt)} <WaterStatusPill share={latestShare} />
              </p>
            ) : latest ? (
              <p className="property-lease-terms">
                {t('properties.water.latest', { period: periodText(t, latest.from, latest.to) })}: {companyResultText(t, latest.difference_snt)}
              </p>
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
      </div>

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
        <button type="button" className="btn-secondary" disabled={d.read_only} onClick={() => onAdd('docs')}>
          {t('properties.overview.addDoc')}
        </button>
        <button type="button" className="btn-secondary" disabled={d.read_only} onClick={() => onAdd('finance')}>
          {t('properties.overview.addValuation')}
        </button>
      </div>

      {d.doc.note ? (
        <section className="property-section">
          <h3>{t('properties.field.note')}</h3>
          <p className="property-note-text">{d.doc.note}</p>
        </section>
      ) : null}
    </>
  )
}
