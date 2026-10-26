import { useState } from 'react'
import { getBcp47, useI18n } from '../../../i18n'
import { formatDate } from '../../../shared/dates'
import { EuroInput } from '../../../shared/EuroInput'
import { formatCents } from '../../../shared/money'
import { SearchSelect } from '../../../shared/SearchSelect'
import { LEASE_INCREASE_KINDS, type DocCandidate, type LeaseIncreaseKind, type LeaseSuggestionView } from '../api'
import { leasePeriod, leaseRentText } from './format'
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

/** Rent, water and parking inputs, three grid cells. */
function Amounts({ value, onChange }: { value: AmountsDraft; onChange: (patch: Partial<AmountsDraft>) => void }) {
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
      <label>
        {t('properties.field.parking')}
        <EuroInput value={value.parking} onChange={(parking) => onChange({ parking })} />
      </label>
    </>
  )
}

export function LeasesEditor({
  drafts,
  onChange,
  partners,
  docs,
  linkedDocs,
  suggestions,
  today,
  onCreateNotice,
}: {
  drafts: LeaseDraft[]
  onChange: (drafts: LeaseDraft[]) => void
  partners: Partner[]
  /** Liitetieto vouchers to pick the contract and increase notices from. */
  docs: DocCandidate[]
  /** This object's linked documents, listed first. */
  linkedDocs: number[]
  /** Leases the book suggests, oldest start first. */
  suggestions: LeaseSuggestionView[]
  today: string
  /** Writes the increase notice (PDF on a Liitetieto voucher) for one increase. */
  onCreateNotice: (lease: number, increase: number) => Promise<void>
}) {
  const { t } = useI18n()
  const [added, setAdded] = useState<Set<number>>(new Set())
  const [creating, setCreating] = useState<string | null>(null)
  const pending = suggestions.flatMap((s, i) => (added.has(i) ? [] : [{ s, i }]))
  const addSuggestions = (indices: number[]) => {
    onChange([...drafts, ...leaseDrafts(indices.map((i) => suggestions[i].lease), partners)])
    setAdded(new Set([...added, ...indices]))
  }
  const partnerItems = partners.map((p) => ({ value: p.name, label: p.name }))
  const docOptions = [...docs].sort((a, b) => {
    const la = linkedDocs.includes(a.voucher_id) ? 0 : 1
    const lb = linkedDocs.includes(b.voucher_id) ? 0 : 1
    return la - lb || b.date.localeCompare(a.date)
  })
  const months = monthNames()
  const set = (i: number, patch: Partial<LeaseDraft>) => onChange(drafts.map((d, j) => (j === i ? { ...d, ...patch } : d)))
  const setIncrease = (i: number, k: number, patch: Partial<IncreaseDraft>) =>
    set(i, { increases: drafts[i].increases.map((r, j) => (j === k ? { ...r, ...patch } : r)) })

  const docSelect = (value: string, onPick: (value: string) => void) => (
    <select value={value} onChange={(e) => onPick(e.target.value)}>
      <option value="">–</option>
      {docOptions.map((doc) => (
        <option key={doc.voucher_id} value={doc.voucher_id}>
          {formatDate(doc.date)} · {doc.title}
        </option>
      ))}
    </select>
  )

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
            <label className="span-3">
              {t('properties.field.contract')}
              {docSelect(d.contractId, (contractId) => set(i, { contractId }))}
            </label>
          </div>

          <h4>{t('properties.lease.initial')}</h4>
          <div className="property-lease-grid">
            <Amounts value={d.initial} onChange={(patch) => set(i, { initial: { ...d.initial, ...patch } })} />
            <div className="property-lease-total">
              {t('properties.field.total')} <strong>{formatCents(draftTotal(d.initial))}</strong>
            </div>
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
            <div key={k} className="property-lease-grid property-lease-increase">
              <label>
                {t('properties.field.increaseFrom')}
                <input type="date" value={r.from} onChange={(e) => setIncrease(i, k, { from: e.target.value })} />
              </label>
              <Amounts value={r} onChange={(patch) => setIncrease(i, k, patch)} />
              <label className="span-2">
                {t('properties.field.increaseNotice')}
                {docSelect(r.voucherId, (voucherId) => setIncrease(i, k, { voucherId }))}
              </label>
              <div className="property-lease-actions span-2">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={creating != null || !r.from}
                  onClick={() => void createNotice(i, k)}
                >
                  {creating === `${i}-${k}` ? t('common.saving') : t('properties.edit.createNotice')}
                </button>
                <button type="button" className="btn-secondary" onClick={() => set(i, { increases: d.increases.filter((_, j) => j !== k) })}>
                  {t('properties.edit.remove')}
                </button>
              </div>
            </div>
          ))}
          <div className="property-lease-foot">
            <button type="button" className="btn-secondary" onClick={() => set(i, { increases: [...d.increases, nextIncrease(d, today)] })}>
              {t('properties.edit.addIncrease')}
            </button>
            <button type="button" className="btn-link property-delete" onClick={() => onChange(drafts.filter((_, j) => j !== i))}>
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
