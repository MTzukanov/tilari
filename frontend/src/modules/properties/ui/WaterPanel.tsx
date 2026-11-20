import { Fragment, useState, type ReactNode } from 'react'
import { useI18n } from '../../../i18n'
import { formatCents } from '../../../shared/money'
import { SuggestBanner } from '../../../shared/SuggestBanner'
import type { BookedLine, WaterDetail, WaterSettlementView } from '../api'
import { Figure, Figures, Folds, InfoButton } from './FigureTiles'
import { periodText, waterBalanceText } from './format'
import { DocSlot, LineLink, WaterStatusPill } from './FormParts'
import { SuggestionSource } from './LeasesPanel'

/**
 * A water settlement as figure tiles: the housing company's result with its use and advances, the
 * statement, each tenant's share with its state and letter, and what the owner keeps or bears; the
 * booked lines (the company's, the tenants', others) fold under them.
 */
function SettlementCard({
  s,
  source,
  held = true,
  onEdit,
  onAdd,
  onOpenVoucher,
}: {
  s: WaterSettlementView
  source?: 'company' | 'tenant'
  /** Not sold: only then is a statement with no voucher flagged as missing. */
  held?: boolean
  /** Turns the card into its form; none when it cannot change (sold, read-only). */
  onEdit?: () => void
  /** A suggestion: opens a new card filled from it. */
  onAdd?: () => void
  onOpenVoucher: (voucherId: number) => void
}) {
  const { t } = useI18n()
  const [ownerNoteOpen, setOwnerNoteOpen] = useState(false)
  const ownerNote = t('properties.water.figure.ownerNote')
  const difference = s.difference_snt
  const lineRows: { key: string; label: string; lines: BookedLine[] }[] = [
    { key: 'company', label: t('properties.water.figure.companyLines'), lines: s.booked },
    ...s.shares.map((share) => ({ key: `share-${share.lease_key}`, label: share.tenant ?? t('properties.lease.tenantUnknown'), lines: share.movements })),
    { key: 'other', label: t('properties.water.other'), lines: s.other },
  ].filter((row) => row.lines.length)
  return (
    <div className="property-lease-card property-water-card">
      <p className="property-lease-head">
        <strong>{t('properties.water.period', { period: periodText(t, s.from, s.to) })}</strong>
        {source ? <SuggestionSource source={source === 'company' ? 'waterCompany' : 'waterTenant'} /> : null}
        {onEdit ? (
          <button type="button" className="btn-link" onClick={onEdit}>
            {t('common.edit')}
          </button>
        ) : null}
        {onAdd ? (
          <button type="button" className="btn-small is-primary" onClick={onAdd}>
            {t('properties.edit.addSuggestion')}
          </button>
        ) : null}
      </p>
      <Figures>
        <Figure
          label={t(difference < 0 ? 'properties.water.figure.companyRefund' : difference > 0 ? 'properties.water.figure.companyCharge' : 'properties.water.figure.company')}
          value={formatCents(Math.abs(difference))}
          sub={[
            s.usage_snt != null ? t('properties.water.usage', { amount: formatCents(s.usage_snt) }) : '',
            s.advance_snt != null ? t('properties.water.advances', { amount: formatCents(s.advance_snt) }) : '',
            s.booked.length ? '' : t('properties.water.figure.notBooked'),
          ].filter(Boolean)}
        />
        {/* A suggestion is not stored, so it has no place for a statement to be missing from. */}
        {s.statement || (!source && held) ? (
          <Figure label={t('properties.water.statement')} sub={[<DocSlot key="statement" voucher={s.statement} noDocument={s.no_document} onOpen={onOpenVoucher} />]} />
        ) : null}
        {s.shares.map((share) => (
          <Figure
            key={share.lease_key}
            label={share.tenant ?? t('properties.lease.tenantUnknown')}
            value={waterBalanceText(t, share.balance_snt)}
            sub={[
              t('properties.water.stay', { period: periodText(t, share.from, share.to), days: share.days }),
              share.status !== 'none' || share.letter ? (
                <Fragment key="state">
                  {share.status !== 'none' ? <WaterStatusPill share={share} /> : null}
                  {share.letter ? <DocSlot voucher={share.letter} onOpen={onOpenVoucher} /> : null}
                </Fragment>
              ) : null,
            ].filter(Boolean)}
          />
        ))}
        {s.shares.length && s.owner_snt !== 0 ? (
          <Figure
            label={
              <>
                {t(s.owner_snt < 0 ? 'properties.water.figure.ownerBears' : 'properties.water.figure.ownerKeeps')}
                <InfoButton note={ownerNote} open={ownerNoteOpen} onToggle={() => setOwnerNoteOpen(!ownerNoteOpen)} />
              </>
            }
            value={formatCents(Math.abs(s.owner_snt))}
            sub={ownerNoteOpen ? [ownerNote] : []}
          />
        ) : null}
      </Figures>
      {!s.shares.length ? <p className="muted property-lease-terms">{t('properties.water.noShares')}</p> : null}
      <Folds
        folds={[
          {
            key: 'lines',
            title: t('properties.water.figure.lines'),
            n: lineRows.reduce((n, row) => n + row.lines.length, 0),
            body: () => (
              <ul className="property-doc-list property-fold-body">
                {lineRows.map((row) => (
                  <li key={row.key}>
                    <span>{row.label}</span>
                    {row.lines.map((m) => (
                      <LineLink key={m.line_id} line={m} onOpen={onOpenVoucher} />
                    ))}
                  </li>
                ))}
              </ul>
            ),
          },
        ]}
      />
    </div>
  )
}

/**
 * Water settlements on the object page: the book's suggestions first (each "Lisää" opens a new card
 * under them), then the stored ones, newest first. A card in edit (`editing`) shows `form` in its place.
 */
export function WaterPanel({
  water,
  held,
  editing = null,
  form = null,
  onEditSettlement,
  onAddSuggestion,
  onAdd,
  onOpenVoucher,
}: {
  water: WaterDetail
  /** Not sold: only then is a statement with no voucher flagged as missing. */
  held: boolean
  /** The settlement card in edit: a settlement key, 'new', or none. */
  editing?: string | null
  form?: ReactNode
  /** Opens a stored settlement's card in edit; none when the object cannot change (sold, read-only). */
  onEditSettlement?: (key: string) => void
  /** Opens a new settlement card filled from suggestion `i`; none when none can be added. */
  onAddSuggestion?: (i: number) => void
  /** Opens a new settlement card; none when none can be added (sold, read-only). */
  onAdd?: () => void
  onOpenVoucher: (voucherId: number) => void
}) {
  const { t } = useI18n()
  return (
    <section className="overview-panel property-water">
      <div className="property-panel-head">
        <h3>{t('properties.water.title')}</h3>
        {onAdd ? (
          <button type="button" className="btn-small" onClick={onAdd}>
            {t('properties.overview.addWater')}
          </button>
        ) : null}
      </div>
      {water.suggestions.length ? (
        <SuggestBanner heading="h4" title={t('properties.water.suggestions', { n: water.suggestions.length })}>
          {water.suggestions.map((s, i) => (
            <SettlementCard
              key={`${s.settlement.from}-${s.settlement.to}`}
              s={s.view}
              source={s.source}
              onAdd={onAddSuggestion ? () => onAddSuggestion(i) : undefined}
              onOpenVoucher={onOpenVoucher}
            />
          ))}
        </SuggestBanner>
      ) : null}
      {editing === 'new' ? form : null}
      {!water.settlements.length && !water.suggestions.length && editing !== 'new' ? <p className="muted">{t('properties.water.none')}</p> : null}
      {water.settlements.map((s) =>
        editing === s.key ? (
          <div key={s.key}>{form}</div>
        ) : (
          <SettlementCard
            key={s.key}
            s={s}
            held={held}
            onEdit={onEditSettlement ? () => onEditSettlement(s.key) : undefined}
            onOpenVoucher={onOpenVoucher}
          />
        ),
      )}
    </section>
  )
}
