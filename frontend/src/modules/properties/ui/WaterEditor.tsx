import { useState } from 'react'
import { fromBookedLines, settlementViews } from '../../../book/modules/properties/domain/water'
import { useI18n } from '../../../i18n'
import { EuroInput } from '../../../shared/EuroInput'
import { FileButton } from '../../../shared/FileButton'
import { formatCents, parseEurInput } from '../../../shared/money'
import type { DocCandidate, Lease, WaterBookedLine, WaterSettlement, WaterSuggestionView } from '../api'
import { DocPicker } from './DocPicker'
import type { DocEdit } from './editDraft'
import { companyResultText, periodText, waterBalanceText, waterStatusText } from './format'
import { LineLink, NoDocumentCheck, Shown } from './FormParts'
import { SuggestionSource } from './LeasesPanel'
import {
  draftDifference,
  draftSettlement,
  newSettlement,
  settlementDrafts,
  shareDraft,
  withShare,
  type SettlementDraft,
  type ShareDraft,
} from './waterDrafts'

/** A suggestion already in the form: a settlement ending within a month of it. */
function inForm(drafts: SettlementDraft[], to: string): boolean {
  const at = Date.parse(to)
  return drafts.some((d) => d.to && Math.abs(Date.parse(d.to) - at) <= 31 * 86_400_000)
}

export function WaterEditor({
  drafts,
  onChange,
  leases,
  tenantName,
  docs,
  suggestions,
  lines,
  onCreateLetter,
  onUpload,
  isCreated,
  onDeleteDocs,
  onOpenVoucher,
}: {
  drafts: SettlementDraft[]
  onChange: (drafts: SettlementDraft[]) => void
  /** The leases as the form has them now: shares follow them as they are edited. */
  leases: Lease[]
  tenantName: (lease: Lease) => string
  docs: DocCandidate[]
  /** Settlements the book suggests, newest first. */
  suggestions: WaterSuggestionView[]
  /** The object's water settlement lines: each settlement shows those it takes, as the page will. */
  lines: WaterBookedLine[]
  /** Writes the letter to the tenant of `leaseKey` (PDF on a Liitetieto voucher). */
  onCreateLetter: (settlement: number, leaseKey: string) => Promise<void>
  /** Uploads the company's statement (`leaseKey` null) or a tenant's letter as a Liitetieto voucher. */
  onUpload: (settlement: number, leaseKey: string | null, files: File[]) => Promise<void>
  isCreated: (voucherId: number) => boolean
  onDeleteDocs: (voucherIds: number[], edit?: DocEdit) => Promise<void>
  /** Opens a suggestion's booked line; the unsaved form waits for the way back. */
  onOpenVoucher: (voucherId: number) => void
}) {
  const { t } = useI18n()
  const [creating, setCreating] = useState<string | null>(null)
  const pending = suggestions.filter((s) => !inForm(drafts, s.settlement.to))
  const settlements = drafts.map(draftSettlement)
  const dated = settlements.filter((s): s is WaterSettlement => s != null)
  const booked = fromBookedLines(lines)
  const views = settlementViews(dated, booked.lines, leases, { ...booked.ctx, tenantName })
  const set = (i: number, patch: Partial<SettlementDraft>) => onChange(drafts.map((d, j) => (j === i ? { ...d, ...patch } : d)))
  const setShare = (i: number, leaseKey: string, patch: Partial<ShareDraft>) => set(i, { shares: withShare(drafts[i].shares, leaseKey, patch) })
  const created = (ids: string[]) => ids.filter((id) => id && isCreated(Number(id))).map(Number)
  const removeSettlement = (i: number) =>
    onDeleteDocs(created([drafts[i].voucherId, ...drafts[i].shares.map((s) => s.voucherId)]), {
      water: (list) => list.filter((_, j) => j !== i),
    })

  async function createLetter(i: number, leaseKey: string) {
    setCreating(`${i}-${leaseKey}`)
    try {
      await onCreateLetter(i, leaseKey)
    } finally {
      setCreating(null)
    }
  }

  return (
    <>
      {pending.length ? (
        <div className="property-lease-suggestions">
          <p className="muted">{t('properties.water.editSuggestions', { n: pending.length })}</p>
          <ul className="property-doc-list">
            {pending.map((s) => (
              <li key={`${s.settlement.from}-${s.settlement.to}`}>
                <span>{periodText(t, s.settlement.from, s.settlement.to)}</span>
                <span>{companyResultText(t, s.settlement.difference_snt)}</span>
                <SuggestionSource source={s.source === 'company' ? 'waterCompany' : 'waterTenant'} />
                {s.lines.map((line) => (
                  <LineLink key={line.line_id} line={line} onOpen={onOpenVoucher} />
                ))}
                <button type="button" className="btn-small" onClick={() => onChange([...drafts, ...settlementDrafts([s.settlement])])}>
                  {t('properties.edit.addSuggestion')}
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => onChange([...drafts, ...settlementDrafts(pending.map((s) => s.settlement))])}
          >
            {t('properties.edit.addAllSuggestions')}
          </button>
        </div>
      ) : null}

      {drafts.map((d, i) => {
        const settlement = settlements[i]
        const view = settlement ? views[dated.indexOf(settlement)] : null
        const shares = view?.shares ?? []
        const usage = d.usage.trim() ? Math.abs(parseEurInput(d.usage)) : null
        return (
          <div key={d.base?.key || `new-${i}`} className="property-lease-edit property-water-edit">
            <div className="property-lease-grid">
              <label>
                {t('properties.field.waterFrom')}
                <input type="date" value={d.from} onChange={(e) => set(i, { from: e.target.value })} />
              </label>
              <label>
                {t('properties.field.waterTo')}
                <input type="date" value={d.to} onChange={(e) => set(i, { to: e.target.value })} />
              </label>
              <label>
                {t('properties.field.waterResult')}
                <select value={d.direction} onChange={(e) => set(i, { direction: e.target.value as SettlementDraft['direction'] })}>
                  <option value="refund">{t('properties.water.direction.refund')}</option>
                  <option value="charge">{t('properties.water.direction.charge')}</option>
                </select>
              </label>
              <label>
                {t('properties.field.waterAmount')}
                <EuroInput value={d.amount} onChange={(amount) => set(i, { amount })} />
              </label>
              <label>
                {t('properties.field.waterUsage')}
                <EuroInput value={d.usage} placeholder="" onChange={(value) => set(i, { usage: value })} />
              </label>
              <Shown
                label={t('properties.field.waterAdvances')}
                value={usage != null ? formatCents(usage - draftDifference(d)) : '–'}
              />
              <div className="property-lease-notice">
                <DocPicker label={t('properties.field.waterStatement')} docs={docs} value={d.voucherId} onChange={(voucherId) => set(i, { voucherId })} />
                {!d.voucherId ? <NoDocumentCheck checked={d.noDocument} onChange={(noDocument) => set(i, { noDocument })} /> : null}
                {d.voucherId && isCreated(Number(d.voucherId)) ? (
                  <button type="button" className="btn-secondary" onClick={() => void onDeleteDocs([Number(d.voucherId)])}>
                    {t('properties.edit.deleteDoc')}
                  </button>
                ) : null}
                <FileButton onFiles={(files) => void onUpload(i, null, files)}>{t('properties.water.uploadStatement')}</FileButton>
              </div>
            </div>
            {view ? (
              <p className="property-lease-terms">
                {view.booked.length ? (
                  <>
                    {t('properties.water.booked')}:{' '}
                    {view.booked.map((m) => (
                      <LineLink key={m.line_id} line={m} onOpen={onOpenVoucher} />
                    ))}
                  </>
                ) : (
                  <span className="muted">{t('properties.water.notBooked')}</span>
                )}
              </p>
            ) : null}

            <h4>{t('properties.water.shares')}</h4>
            <p className="muted property-lease-hint">{t(d.usage.trim() ? 'properties.water.sharesByUsage' : 'properties.water.sharesByDifference')}</p>
            {!settlement ? <p className="muted property-lease-hint">{t('properties.water.needPeriod')}</p> : null}
            {settlement && !shares.length ? <p className="muted property-lease-hint">{t('properties.water.noShares')}</p> : null}
            {shares.map((share) => {
              const key = share.lease_key
              const own = d.shares.find((s) => s.leaseKey === key) ?? shareDraft(key)
              return (
                <div key={key} className="property-lease-grid property-lease-increase property-water-share">
                  <Shown label={t('properties.field.tenant')} value={share.tenant ?? t('properties.lease.tenantUnknown')} />
                  <Shown
                    label={t('properties.field.waterStay')}
                    value={t('properties.water.stay', { period: periodText(t, share.from, share.to), days: share.days })}
                  />
                  <Shown label={t('properties.field.waterAdvancesTenant')} value={formatCents(share.advance_snt)} />
                  <Shown label={t('properties.field.waterComputed')} value={waterBalanceText(t, share.computed_snt)} strong />
                  {share.movements.length || share.status !== 'none' ? (
                    <p className="property-lease-terms property-water-booked">
                      {share.movements.length ? (
                        <span>
                          {t('properties.water.booked')}:{' '}
                          {share.movements.map((m) => (
                            <LineLink key={m.line_id} line={m} onOpen={onOpenVoucher} />
                          ))}
                        </span>
                      ) : null}
                      {share.status !== 'none' ? (
                        <span className={`property-water-status property-water-status-${share.status}`}>
                          {waterStatusText(t, share.status, share.balance_snt, share.settled_snt)}
                        </span>
                      ) : null}
                    </p>
                  ) : null}
                  <div className="property-lease-notice">
                    <label className="property-water-mode">
                      {t('properties.field.waterBalance')}
                      <select value={own.mode} onChange={(e) => setShare(i, key, { mode: e.target.value as ShareDraft['mode'] })}>
                        <option value="computed">{t('properties.water.mode.computed')}</option>
                        <option value="refund">{t('properties.water.mode.refund')}</option>
                        <option value="charge">{t('properties.water.mode.charge')}</option>
                      </select>
                    </label>
                    {own.mode !== 'computed' ? (
                      <label className="property-water-mode">
                        {t('properties.field.waterAmount')}
                        <EuroInput value={own.amount} onChange={(amount) => setShare(i, key, { amount })} />
                      </label>
                    ) : null}
                    <DocPicker
                      label={t('properties.field.waterLetter')}
                      docs={docs}
                      value={own.voucherId}
                      onChange={(voucherId) => setShare(i, key, { voucherId })}
                    />
                    {own.voucherId && isCreated(Number(own.voucherId)) ? (
                      <button type="button" className="btn-secondary" onClick={() => void onDeleteDocs([Number(own.voucherId)])}>
                        {t('properties.water.deleteLetter')}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={creating != null || share.balance_snt === 0}
                        onClick={() => void createLetter(i, key)}
                      >
                        {creating === `${i}-${key}` ? t('common.saving') : t('properties.water.createLetter')}
                      </button>
                    )}
                    <FileButton onFiles={(files) => void onUpload(i, key, files)}>{t('properties.water.uploadLetter')}</FileButton>
                  </div>
                </div>
              )
            })}
            {view?.other.length ? (
              <p className="property-lease-terms">
                {t('properties.water.other')}:{' '}
                {view.other.map((m) => (
                  <LineLink key={m.line_id} line={m} onOpen={onOpenVoucher} />
                ))}
              </p>
            ) : null}
            <div className="property-lease-foot">
              <span />
              <button type="button" className="btn-link property-delete" onClick={() => void removeSettlement(i)}>
                {t('properties.water.remove')}
              </button>
            </div>
          </div>
        )
      })}
      <button type="button" className="btn-secondary" onClick={() => onChange([...drafts, newSettlement()])}>
        {t('properties.water.add')}
      </button>
    </>
  )
}
