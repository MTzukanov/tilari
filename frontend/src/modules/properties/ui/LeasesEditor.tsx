import { useState } from 'react'
import { getBcp47, useI18n } from '../../../i18n'
import { formatDate } from '../../../shared/dates'
import { EuroInput } from '../../../shared/EuroInput'
import { SearchSelect } from '../../../shared/SearchSelect'
import { LEASE_INCREASE_KINDS, type DocCandidate, type LeaseIncreaseKind, type LeaseSuggestionView } from '../api'
import { leasePeriod, leaseRentText } from './format'
import { emptyRent, leaseDrafts, newLease, type LeaseDraft, type Partner, type RentDraft } from './leaseDrafts'

function monthNames(): string[] {
  const fmt = new Intl.DateTimeFormat(getBcp47(), { month: 'long' })
  return Array.from({ length: 12 }, (_, m) => fmt.format(new Date(2024, m, 1)))
}

export function LeasesEditor({
  drafts,
  onChange,
  partners,
  docs,
  linkedDocs,
  suggestions,
}: {
  drafts: LeaseDraft[]
  onChange: (drafts: LeaseDraft[]) => void
  partners: Partner[]
  /** Liitetieto vouchers to pick the contract and notices from. */
  docs: DocCandidate[]
  /** This object's linked documents, listed first. */
  linkedDocs: number[]
  /** Leases the book suggests, oldest start first. */
  suggestions: LeaseSuggestionView[]
}) {
  const { t } = useI18n()
  const [added, setAdded] = useState<Set<number>>(new Set())
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
  const setRent = (i: number, k: number, patch: Partial<RentDraft>) =>
    set(i, { rents: drafts[i].rents.map((r, j) => (j === k ? { ...r, ...patch } : r)) })

  const docSelect = (value: string, onPick: (value: string) => void, label: string) => (
    <label>
      {label}
      <select value={value} onChange={(e) => onPick(e.target.value)}>
        <option value="">–</option>
        {docOptions.map((doc) => (
          <option key={doc.voucher_id} value={doc.voucher_id}>
            {formatDate(doc.date)} · {doc.title}
          </option>
        ))}
      </select>
    </label>
  )

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
          <div className="property-form-grid">
            <label>
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
              <input
                type="date"
                value={d.starts}
                onChange={(e) => {
                  const starts = e.target.value
                  // A new lease's first rent starts with it.
                  const rents = d.rents.length === 1 && !d.rents[0].from ? [{ ...d.rents[0], from: starts }] : d.rents
                  set(i, { starts, rents })
                }}
              />
            </label>
            <label>
              {t('properties.field.leaseEnds')}
              <input type="date" value={d.ends} onChange={(e) => set(i, { ends: e.target.value })} />
            </label>
            <label>
              {t('properties.field.dueDay')}
              <input type="text" inputMode="numeric" value={d.dueDay} onChange={(e) => set(i, { dueDay: e.target.value })} />
            </label>
            <label>
              {t('properties.field.noticeMonths')}
              <input type="text" inputMode="numeric" value={d.notice} onChange={(e) => set(i, { notice: e.target.value })} />
            </label>
            {docSelect(d.contractId, (contractId) => set(i, { contractId }), t('properties.field.contract'))}
          </div>

          {d.rents.map((r, k) => (
            <div key={k} className="property-form-row">
              <label>
                {t('properties.field.rentFrom')}
                <input type="date" value={r.from} onChange={(e) => setRent(i, k, { from: e.target.value })} />
              </label>
              <label>
                {t('properties.field.rent')}
                <EuroInput value={r.rent} onChange={(rent) => setRent(i, k, { rent })} />
              </label>
              <label>
                {t('properties.field.charges')}
                <EuroInput value={r.charges} onChange={(charges) => setRent(i, k, { charges })} />
              </label>
              {docSelect(r.voucherId, (voucherId) => setRent(i, k, { voucherId }), t('properties.field.stepDoc'))}
              <button type="button" className="btn-small" onClick={() => set(i, { rents: d.rents.filter((_, j) => j !== k) })}>
                {t('properties.edit.remove')}
              </button>
            </div>
          ))}
          <button type="button" className="btn-secondary" onClick={() => set(i, { rents: [...d.rents, emptyRent()] })}>
            {t('properties.edit.addStep')}
          </button>

          <div className="property-form-grid">
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
            <label>
              {t('properties.field.increasePct')}
              <input type="text" inputMode="decimal" value={d.increasePct} onChange={(e) => set(i, { increasePct: e.target.value })} />
            </label>
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
            <label>
              {t('properties.field.note')}
              <input type="text" value={d.note} onChange={(e) => set(i, { note: e.target.value })} />
            </label>
          </div>
          <button type="button" className="btn-small" onClick={() => onChange(drafts.filter((_, j) => j !== i))}>
            {t('properties.edit.removeLease')}
          </button>
        </div>
      ))}
      <button type="button" className="btn-secondary" onClick={() => onChange([...drafts, newLease()])}>
        {t('properties.edit.addLease')}
      </button>
    </>
  )
}
