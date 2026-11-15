import type { ReactNode } from 'react'
import { useI18n } from '../../../i18n'
import { formatCents } from '../../../shared/money'
import { SuggestBanner } from '../../../shared/SuggestBanner'
import type { WaterDetail, WaterSettlementView } from '../api'
import { companyResultText, periodText, waterBalanceText } from './format'
import { DocSlotLine, LineLink, VoucherLink, WaterStatusPill } from './FormParts'
import { SuggestionSource } from './LeasesPanel'

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
  const company = [
    companyResultText(t, s.difference_snt),
    s.usage_snt != null ? t('properties.water.usage', { amount: formatCents(s.usage_snt) }) : '',
    s.advance_snt != null ? t('properties.water.advances', { amount: formatCents(s.advance_snt) }) : '',
  ].filter(Boolean)
  return (
    <div className="property-lease-card property-water-card">
      <p className="property-lease-head">
        <strong>{t('properties.water.period', { period: periodText(t, s.from, s.to) })}</strong>
        <span className="muted">{t('properties.water.company', { text: company.join(', ') })}</span>
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
      {/* A suggestion is not stored, so it has no place for a statement to be missing from. */}
      {s.statement || (!source && held) ? (
        <DocSlotLine label={t('properties.water.statement')} voucher={s.statement} noDocument={s.no_document} onOpen={onOpenVoucher} />
      ) : null}
      <p className="property-lease-terms">
        {s.booked.length ? (
          <>
            {t('properties.water.booked')}:{' '}
            {s.booked.map((m) => (
              <LineLink key={m.line_id} line={m} onOpen={onOpenVoucher} />
            ))}
          </>
        ) : (
          <span className="muted">{t('properties.water.notBooked')}</span>
        )}
      </p>
      {s.shares.length ? (
        <ul className="property-doc-list property-water-shares">
          {s.shares.map((share) => (
            <li key={share.lease_key}>
              <span>{share.tenant ?? t('properties.lease.tenantUnknown')}</span>
              <span className="muted">
                {t('properties.water.stay', { period: periodText(t, share.from, share.to), days: share.days })}
              </span>
              <span>{waterBalanceText(t, share.balance_snt)}</span>
              <WaterStatusPill share={share} />
              {share.letter ? <VoucherLink voucher={share.letter} onOpen={onOpenVoucher} /> : null}
              {share.movements.map((m) => (
                <LineLink key={m.line_id} line={m} onOpen={onOpenVoucher} />
              ))}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">{t('properties.water.noShares')}</p>
      )}
      {s.other.length ? (
        <p className="property-lease-terms">
          {t('properties.water.other')}:{' '}
          {s.other.map((m) => (
            <LineLink key={m.line_id} line={m} onOpen={onOpenVoucher} />
          ))}
        </p>
      ) : null}
      {s.shares.length && s.owner_snt !== 0 ? (
        <p className="muted">
          {t(s.owner_snt < 0 ? 'properties.water.ownerBears' : 'properties.water.ownerKeeps', { amount: formatCents(Math.abs(s.owner_snt)) })}
        </p>
      ) : null}
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
        <SuggestBanner
          heading="h4"
          title={t('properties.water.suggestions', { n: water.suggestions.length })}
          lead={t('properties.water.suggestionsLead')}
        >
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
