import { useState } from 'react'
import { getBcp47, useI18n } from '../../../i18n'
import { formatDate } from '../../../shared/dates'
import { EuroInput } from '../../../shared/EuroInput'
import { FileButton } from '../../../shared/FileButton'
import { formatCents } from '../../../shared/money'
import { SearchSelect } from '../../../shared/SearchSelect'
import { LEASE_INCREASE_KINDS, type DocCandidate, type Lease, type LeaseIncreaseKind, type LeaseSuggestionView } from '../api'
import { DocPicker } from './DocPicker'
import type { DocEdit } from './editDraft'
import { Shown } from './FormParts'
import { leasePeriod, leaseRentText } from './format'
import { SuggestionSource } from './LeasesPanel'
import {
  draftTotal,
  leaseDrafts,
  newLease,
  nextIncrease,
  type AmountsDraft,
  type IncreaseDraft,
  type LeaseDraft,
  type Partner,
} from './leaseDrafts'

function monthNames(): string[] {
  const fmt = new Intl.DateTimeFormat(getBcp47(), { month: 'long' })
  return Array.from({ length: 12 }, (_, m) => fmt.format(new Date(2024, m, 1)))
}

/** Rent, water and (when the lease has the extra) parking inputs: one grid cell each. */
function Amounts({
  value,
  parking,
  onChange,
}: {
  value: AmountsDraft
  parking: boolean
  onChange: (patch: Partial<AmountsDraft>) => void
}) {
  const { t } = useI18n()
  return (
    <>
      <label>
        {t('properties.field.rent')}
        <EuroInput value={value.rent} onChange={(rent) => onChange({ rent })} />
      </label>
      <label>
        {t('properties.field.water')}
        <EuroInput value={value.water} onChange={(water) => onChange({ water })} />
      </label>
      {parking ? (
        <label>
          {t('properties.field.parking')}
          <EuroInput value={value.parking} onChange={(parking) => onChange({ parking })} />
        </label>
      ) : null}
    </>
  )
}

/** The amounts rows: Alkaen, rent, water, (parking), total; four columns without parking. */
const amountsClass = (d: LeaseDraft) => `property-lease-grid property-lease-amounts${d.parking ? '' : ' no-parking'}`

export function LeasesEditor({
  drafts,
  onChange,
  partners,
  docs,
  suggestions,
  today,
  onCreateNotice,
  onUpload,
  isCreated,
  onDeleteDocs,
}: {
  drafts: LeaseDraft[]
  onChange: (drafts: LeaseDraft[]) => void
  partners: Partner[]
  /** Liitetieto vouchers to pick the contract and increase notices from. */
  docs: DocCandidate[]
  /** Leases the book suggests, oldest start first. */
  suggestions: LeaseSuggestionView[]
  today: string
  /** Writes the increase notice (PDF on a Liitetieto voucher) for one increase. */
  onCreateNotice: (lease: number, increase: number) => Promise<void>
  /** Uploads the owner's own contract (`increase` null) or increase notice as a Liitetieto voucher. */
  onUpload: (lease: number, increase: number | null, files: File[]) => Promise<void>
  /** A document written from this form (deletable from here). */
  isCreated: (voucherId: number) => boolean
  /** Deletes such documents after asking, clears what pointed at them, then applies `edit`. */
  onDeleteDocs: (voucherIds: number[], edit?: DocEdit) => Promise<void>
}) {
  const { t } = useI18n()
  const [creating, setCreating] = useState<string | null>(null)
  const names = new Map(partners.map((p) => [p.id, p.name.trim().toLowerCase()]))
  /** A suggestion already in the form: its contract, or its tenant from the same day. */
  const inForm = (lease: Lease) =>
    drafts.some(
      (d) =>
        (lease.doc_voucher_id != null && d.contractId === String(lease.doc_voucher_id)) ||
        (d.starts === lease.starts &&
          d.tenant.trim().toLowerCase() === ((lease.tenant_partner_id != null ? names.get(lease.tenant_partner_id) : lease.tenant_name) ?? '').toLowerCase()),
    )
  const pending = suggestions.flatMap((s, i) => (inForm(s.lease) ? [] : [{ s, i }]))
  const addSuggestions = (indices: number[]) => onChange([...drafts, ...leaseDrafts(indices.map((i) => suggestions[i].lease), partners)])
  const partnerItems = partners.map((p) => ({ value: p.name, label: p.name }))
  const months = monthNames()
  const set = (i: number, patch: Partial<LeaseDraft>) => onChange(drafts.map((d, j) => (j === i ? { ...d, ...patch } : d)))
  const setIncrease = (i: number, k: number, patch: Partial<IncreaseDraft>) =>
    set(i, { increases: drafts[i].increases.map((r, j) => (j === k ? { ...r, ...patch } : r)) })

  const created = (ids: string[]) => ids.filter((id) => id && isCreated(Number(id))).map(Number)
  const removeIncrease = (i: number, k: number) =>
    onDeleteDocs(created([drafts[i].increases[k].voucherId]), {
      leases: (l) => l.map((d, j) => (j === i ? { ...d, increases: d.increases.filter((_, kk) => kk !== k) } : d)),
    })
  const removeLease = (i: number) =>
    onDeleteDocs(created([drafts[i].contractId, ...drafts[i].increases.map((r) => r.voucherId)]), {
      leases: (l) => l.filter((_, j) => j !== i),
    })

  async function createNotice(i: number, k: number) {
    setCreating(`${i}-${k}`)
    try {
      await onCreateNotice(i, k)
    } finally {
      setCreating(null)
    }
  }

  return (
    <>
      {pending.length ? (
        <div className="property-lease-suggestions">
          <p className="muted">{t('properties.edit.suggestions', { n: pending.length })}</p>
          <ul className="property-doc-list">
            {pending.map(({ s, i }) => (
              <li key={i}>
                <span>{s.view.tenant ?? t('properties.lease.tenantUnknown')}</span>
                <span className="muted">{leasePeriod(t, s.view)}</span>
                <span>{leaseRentText(t, s.view.rent)}</span>
                {s.view.suggested ? <SuggestionSource source={s.view.suggested} /> : null}
                {s.view.contract ? <span className="muted">{s.view.contract.title}</span> : null}
                <button type="button" className="btn-small" onClick={() => addSuggestions([i])}>
                  {t('properties.edit.addSuggestion')}
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="btn-secondary" onClick={() => addSuggestions(pending.map((p) => p.i))}>
            {t('properties.edit.addAllSuggestions')}
          </button>
        </div>
      ) : null}

      {drafts.map((d, i) => (
        <div key={d.base?.key || `new-${i}`} className="property-lease-edit">
          <div className="property-lease-grid">
            <label className="span-2">
              {t('properties.field.tenant')}
              <SearchSelect
                aria-label={t('properties.field.tenant')}
                items={partnerItems}
                value={d.tenant}
                allowCustom
                onChange={(tenant) => set(i, { tenant })}
              />
            </label>
            <label>
              {t('properties.field.leaseStarts')}
              <input type="date" value={d.starts} onChange={(e) => set(i, { starts: e.target.value })} />
            </label>
            <label>
              {t('properties.field.leaseEnds')}
              <input type="date" value={d.ends} onChange={(e) => set(i, { ends: e.target.value })} />
            </label>
            <label>
              {t('properties.field.dueDay')}
              <input type="text" inputMode="numeric" value={d.dueDay} onChange={(e) => set(i, { dueDay: e.target.value })} />
            </label>
            <div className="property-lease-notice span-3">
              <DocPicker label={t('properties.field.contract')} docs={docs} value={d.contractId} onChange={(contractId) => set(i, { contractId })} />
              {d.contractId && isCreated(Number(d.contractId)) ? (
                <button type="button" className="btn-secondary" onClick={() => void onDeleteDocs([Number(d.contractId)])}>
                  {t('properties.edit.deleteDoc')}
                </button>
              ) : null}
              <FileButton onFiles={(files) => void onUpload(i, null, files)}>{t('properties.edit.uploadContract')}</FileButton>
            </div>
          </div>

          <div className="property-lease-head">
            <h4>{t('properties.lease.initial')}</h4>
            <span className="property-lease-extras">
              <span>{t('properties.lease.extras')}</span>
              <label className="allocation-check">
                <input type="checkbox" checked={d.parking} onChange={() => set(i, { parking: !d.parking })} />
                {t('properties.field.parkingExtra')}
              </label>
            </span>
            <label className="allocation-check property-lease-extras">
              <input type="checkbox" checked={!d.waterFlat} onChange={() => set(i, { waterFlat: !d.waterFlat })} />
              {t('properties.field.waterSettled')}
            </label>
          </div>
          <div className={amountsClass(d)}>
            <Shown label={t('properties.field.increaseFrom')} value={d.starts ? formatDate(d.starts) : '–'} />
            <Amounts value={d.initial} parking={d.parking} onChange={(patch) => set(i, { initial: { ...d.initial, ...patch } })} />
            <Shown label={t('properties.field.total')} value={formatCents(draftTotal(d.initial, d.parking))} strong />
          </div>
          <div className="property-lease-grid">
            <label>
              {t('properties.field.increaseKind')}
              <select value={d.increaseKind} onChange={(e) => set(i, { increaseKind: e.target.value as LeaseIncreaseKind })}>
                {LEASE_INCREASE_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {t(`properties.lease.kind.${kind}`)}
                  </option>
                ))}
              </select>
            </label>
            {d.increaseKind === 'percent' || d.increaseKind === 'amount' ? (
              <label>
                {t(d.increaseKind === 'percent' ? 'properties.field.increasePct' : 'properties.field.increaseEur')}
                <input
                  type="text"
                  inputMode="decimal"
                  value={d.increaseValue}
                  onChange={(e) => set(i, { increaseValue: e.target.value })}
                />
              </label>
            ) : null}
            <label>
              {t('properties.field.increaseMonth')}
              <select value={d.increaseMonth} onChange={(e) => set(i, { increaseMonth: e.target.value })}>
                <option value="">–</option>
                {months.map((name, m) => (
                  <option key={m} value={m + 1}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <h4>{t('properties.lease.increases')}</h4>
          {d.increases.map((r, k) => (
            <div key={k} className={`${amountsClass(d)} property-lease-increase`}>
              <label>
                {t('properties.field.increaseFrom')}
                <input type="date" value={r.from} onChange={(e) => setIncrease(i, k, { from: e.target.value })} />
              </label>
              <Amounts value={r} parking={d.parking} onChange={(patch) => setIncrease(i, k, patch)} />
              <Shown label={t('properties.field.total')} value={formatCents(draftTotal(r, d.parking))} strong />
              <div className="property-lease-notice">
                <DocPicker
                  label={t('properties.field.increaseNotice')}
                  docs={docs}
                  value={r.voucherId}
                  onChange={(voucherId) => setIncrease(i, k, { voucherId })}
                />
                {r.voucherId && isCreated(Number(r.voucherId)) ? (
                  <button type="button" className="btn-secondary" onClick={() => void onDeleteDocs([Number(r.voucherId)])}>
                    {t('properties.edit.deleteNotice')}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={creating != null || !r.from}
                    onClick={() => void createNotice(i, k)}
                  >
                    {creating === `${i}-${k}` ? t('common.saving') : t('properties.edit.createNotice')}
                  </button>
                )}
                <FileButton onFiles={(files) => void onUpload(i, k, files)}>{t('properties.edit.uploadNotice')}</FileButton>
                <button type="button" className="btn-secondary" onClick={() => void removeIncrease(i, k)}>
                  {t('properties.edit.remove')}
                </button>
              </div>
            </div>
          ))}
          <div className="property-lease-foot">
            <button type="button" className="btn-secondary" onClick={() => set(i, { increases: [...d.increases, nextIncrease(d, today)] })}>
              {t('properties.edit.addIncrease')}
            </button>
            <button type="button" className="btn-link property-delete" onClick={() => void removeLease(i)}>
              {t('properties.edit.removeLease')}
            </button>
          </div>
        </div>
      ))}
      <button type="button" className="btn-secondary" onClick={() => onChange([...drafts, newLease()])}>
        {t('properties.edit.addLease')}
      </button>
    </>
  )
}
