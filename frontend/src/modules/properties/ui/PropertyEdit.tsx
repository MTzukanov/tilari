import { useEffect, useState } from 'react'
import { useI18n } from '../../../i18n'
import { formatDate } from '../../../shared/dates'
import { EuroInput } from '../../../shared/EuroInput'
import { formatCents, formatEurInput, parseEurInput } from '../../../shared/money'
import { formatPercentInput, parsePercentInput } from '../../../shared/percent'
import {
  deleteProperty,
  fetchProperty,
  fetchPropertySetup,
  PROPERTY_KINDS,
  saveProperty,
  type PropertyDetail,
  type PropertyDoc,
  type PropertyKind,
  type SetupResponse,
} from '../api'
import { saveErrorText } from './format'

type ValuationDraft = { date: string; price: string; debtFree: string; source: string }
type CapitalDraft = { date: string; amount: string; note: string }

function accountList(raw: string): number[] | null {
  const parts = raw.split(/[\s,;]+/).filter(Boolean)
  if (parts.some((p) => !/^\d+$/.test(p))) return null
  return parts.map(Number)
}

function EditForm({ detail, setup, onDone }: { detail: PropertyDetail; setup: SetupResponse; onDone: () => void }) {
  const { t } = useI18n()
  const doc = detail.doc
  const [kind, setKind] = useState<PropertyKind | ''>(doc.kind ?? '')
  const [excluded, setExcluded] = useState(Boolean(doc.excluded))
  const [eras, setEras] = useState<number[]>(doc.eras.map((e) => e.eraid))
  const [docs, setDocs] = useState<number[]>(doc.doc_voucher_ids ?? [])
  const [valuations, setValuations] = useState<ValuationDraft[]>(
    (doc.valuations ?? []).map((v) => ({
      date: v.date,
      price: formatEurInput(v.price_snt),
      debtFree: v.debt_free_price_snt != null ? formatEurInput(v.debt_free_price_snt) : '',
      source: v.source ?? '',
    })),
  )
  const [salePct, setSalePct] = useState(formatPercentInput(doc.sale_costs?.pct_bp))
  const [saleFixed, setSaleFixed] = useState(doc.sale_costs ? formatEurInput(doc.sale_costs.fixed_snt) : '')
  const [target, setTarget] = useState(formatPercentInput(doc.target_return_bp))
  const [loanAccounts, setLoanAccounts] = useState((doc.financing?.loan_accounts ?? []).join(', '))
  const [interestAccounts, setInterestAccounts] = useState((doc.financing?.interest_accounts ?? []).join(', '))
  const [capital, setCapital] = useState<CapitalDraft[]>(
    (doc.manual_capital ?? []).map((c) => ({ date: c.date, amount: formatEurInput(c.amount_snt), note: c.note ?? '' })),
  )
  const [note, setNote] = useState(doc.note ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const eraById = new Map(setup.eras.map((e) => [e.eraid, e]))
  const availableEras = setup.eras
    .filter((e) => !eras.includes(e.eraid) && (e.linked_to == null || e.linked_to === detail.id))
    .sort((a, b) => {
      const sa = a.suggestion?.candidates.includes(detail.id) ? 0 : 1
      const sb = b.suggestion?.candidates.includes(detail.id) ? 0 : 1
      return sa - sb || b.balance_snt - a.balance_snt
    })
  const docById = new Map(setup.docs.map((d) => [d.voucher_id, d]))
  const availableDocs = setup.docs
    .filter((d) => !docs.includes(d.voucher_id))
    .sort((a, b) => {
      const sa = a.suggestion?.candidates.includes(detail.id) ? 0 : 1
      const sb = b.suggestion?.candidates.includes(detail.id) ? 0 : 1
      return sa - sb || b.date.localeCompare(a.date)
    })

  function build(): PropertyDoc | string {
    const pct = parsePercentInput(salePct)
    const targetBp = parsePercentInput(target)
    if (Number.isNaN(pct) || Number.isNaN(targetBp)) return t('properties.error.percent')
    const loans = accountList(loanAccounts)
    const interests = accountList(interestAccounts)
    if (!loans || !interests) return t('properties.error.accounts')
    const next: PropertyDoc = { ...doc, eras: eras.map((eraid) => ({ eraid, account: eraById.get(eraid)?.account ?? 1 })) }
    if (kind) next.kind = kind
    else delete next.kind
    if (excluded) next.excluded = true
    else delete next.excluded
    next.doc_voucher_ids = docs
    next.valuations = valuations
      .filter((v) => v.date || v.price)
      .map((v) => ({
        date: v.date,
        price_snt: parseEurInput(v.price),
        ...(v.debtFree ? { debt_free_price_snt: parseEurInput(v.debtFree) } : {}),
        ...(v.source.trim() ? { source: v.source.trim() } : {}),
      }))
    if (pct != null || saleFixed) next.sale_costs = { pct_bp: pct ?? 0, fixed_snt: parseEurInput(saleFixed) }
    else delete next.sale_costs
    if (targetBp != null) next.target_return_bp = targetBp
    else delete next.target_return_bp
    if (loans.length || interests.length) next.financing = { loan_accounts: loans, interest_accounts: interests }
    else delete next.financing
    next.manual_capital = capital
      .filter((c) => c.date || c.amount)
      .map((c) => ({ date: c.date, amount_snt: parseEurInput(c.amount), ...(c.note.trim() ? { note: c.note.trim() } : {}) }))
    if (note.trim()) next.note = note.trim()
    else delete next.note
    return next
  }

  async function save() {
    const next = build()
    if (typeof next === 'string') {
      setError(next)
      return
    }
    setSaving(true)
    try {
      await saveProperty(detail.id, next)
      onDone()
    } catch (err) {
      setError(saveErrorText(t, err instanceof Error ? err.message : String(err)))
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!window.confirm(t('properties.edit.deleteConfirm'))) return
    try {
      await deleteProperty(detail.id)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="property-edit">
      {detail.read_only ? <p className="property-note">{t('properties.edit.readOnly')}</p> : null}

      <section className="property-section">
        <h3>{t('properties.edit.basics')}</h3>
        <div className="property-form-grid">
          <label>
            {t('properties.field.kind')}
            <select value={kind} onChange={(e) => setKind(e.target.value as PropertyKind | '')}>
              <option value="">–</option>
              {PROPERTY_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`properties.kind.${k}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="allocation-check">
            <input type="checkbox" checked={excluded} onChange={() => setExcluded(!excluded)} />
            {t('properties.field.excluded')}
          </label>
        </div>
      </section>

      <section className="property-section">
        <h3>{t('properties.eras.title')}</h3>
        <p className="muted">{t('properties.edit.erasLead')}</p>
        <ul className="property-doc-list">
          {eras.map((eraid) => {
            const e = eraById.get(eraid)
            return (
              <li key={eraid}>
                {e ? `${e.account} · ${formatDate(e.date)} · ${e.description} · ${formatCents(e.balance_snt)}` : t('properties.eras.missing', { id: eraid })}{' '}
                <button type="button" className="btn-small" onClick={() => setEras(eras.filter((x) => x !== eraid))}>
                  {t('properties.edit.remove')}
                </button>
              </li>
            )
          })}
        </ul>
        {availableEras.length ? (
          <select
            value=""
            onChange={(e) => {
              const id = Number(e.target.value)
              if (id) setEras([...eras, id])
            }}
          >
            <option value="">{t('properties.edit.addEra')}</option>
            {availableEras.map((e) => (
              <option key={e.eraid} value={e.eraid}>
                {e.suggestion?.candidates.includes(detail.id) ? '★ ' : ''}
                {e.account} · {formatDate(e.date)} · {e.description} · {formatCents(e.balance_snt)}
              </option>
            ))}
          </select>
        ) : null}
      </section>

      <section className="property-section">
        <h3>{t('properties.docs.linkedTitle')}</h3>
        <ul className="property-doc-list">
          {docs.map((voucherId) => {
            const d = docById.get(voucherId)
            return (
              <li key={voucherId}>
                {d ? `${formatDate(d.date)} · ${d.title}` : t('properties.docs.missing', { id: voucherId })}{' '}
                <button type="button" className="btn-small" onClick={() => setDocs(docs.filter((x) => x !== voucherId))}>
                  {t('properties.edit.remove')}
                </button>
              </li>
            )
          })}
        </ul>
        {availableDocs.length ? (
          <select
            value=""
            onChange={(e) => {
              const id = Number(e.target.value)
              if (id) setDocs([...docs, id])
            }}
          >
            <option value="">{t('properties.edit.addDoc')}</option>
            {availableDocs.map((d) => (
              <option key={d.voucher_id} value={d.voucher_id}>
                {d.suggestion?.candidates.includes(detail.id) ? '★ ' : ''}
                {formatDate(d.date)} · {d.title}
              </option>
            ))}
          </select>
        ) : null}
      </section>

      <section className="property-section">
        <h3>{t('properties.edit.valuations')}</h3>
        <p className="muted">{t('properties.edit.valuationsLead')}</p>
        {valuations.map((v, i) => (
          <div key={i} className="property-form-row">
            <input type="date" value={v.date} onChange={(e) => setValuations(valuations.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))} />
            <label>
              {t('properties.field.price')}
              <EuroInput value={v.price} onChange={(val) => setValuations(valuations.map((x, j) => (j === i ? { ...x, price: val } : x)))} />
            </label>
            <label>
              {t('properties.field.debtFreePrice')}
              <EuroInput value={v.debtFree} onChange={(val) => setValuations(valuations.map((x, j) => (j === i ? { ...x, debtFree: val } : x)))} />
            </label>
            <label>
              {t('properties.field.source')}
              <input type="text" value={v.source} onChange={(e) => setValuations(valuations.map((x, j) => (j === i ? { ...x, source: e.target.value } : x)))} />
            </label>
            <button type="button" className="btn-small" onClick={() => setValuations(valuations.filter((_, j) => j !== i))}>
              {t('properties.edit.remove')}
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setValuations([...valuations, { date: new Date().toISOString().slice(0, 10), price: '', debtFree: '', source: '' }])}
        >
          {t('properties.edit.addValuation')}
        </button>
      </section>

      <section className="property-section">
        <h3>{t('properties.edit.sale')}</h3>
        <p className="muted">{t('properties.edit.saleLead')}</p>
        <div className="property-form-grid">
          <label>
            {t('properties.field.salePct')}
            <input type="text" inputMode="decimal" value={salePct} onChange={(e) => setSalePct(e.target.value)} />
          </label>
          <label>
            {t('properties.field.saleFixed')}
            <EuroInput value={saleFixed} onChange={setSaleFixed} />
          </label>
          <label>
            {t('properties.field.targetReturn')}
            <input type="text" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} />
          </label>
        </div>
      </section>

      <section className="property-section">
        <h3>{t('properties.edit.financing')}</h3>
        <p className="muted">{t('properties.edit.financingLead')}</p>
        <div className="property-form-grid">
          <label>
            {t('properties.field.loanAccounts')}
            <input type="text" value={loanAccounts} onChange={(e) => setLoanAccounts(e.target.value)} placeholder="2621, 2835" />
          </label>
          <label>
            {t('properties.field.interestAccounts')}
            <input type="text" value={interestAccounts} onChange={(e) => setInterestAccounts(e.target.value)} placeholder="9460" />
          </label>
        </div>
      </section>

      <section className="property-section">
        <h3>{t('properties.edit.capital')}</h3>
        <p className="muted">{t('properties.edit.capitalLead')}</p>
        {capital.map((c, i) => (
          <div key={i} className="property-form-row">
            <input type="date" value={c.date} onChange={(e) => setCapital(capital.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))} />
            <EuroInput value={c.amount} onChange={(val) => setCapital(capital.map((x, j) => (j === i ? { ...x, amount: val } : x)))} />
            <input type="text" value={c.note} placeholder={t('properties.field.note')} onChange={(e) => setCapital(capital.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))} />
            <button type="button" className="btn-small" onClick={() => setCapital(capital.filter((_, j) => j !== i))}>
              {t('properties.edit.remove')}
            </button>
          </div>
        ))}
        <button type="button" className="btn-secondary" onClick={() => setCapital([...capital, { date: '', amount: '', note: '' }])}>
          {t('properties.edit.addCapital')}
        </button>
      </section>

      <section className="property-section">
        <h3>{t('properties.field.note')}</h3>
        <textarea className="property-textarea" rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
      </section>

      {error ? <p className="error">{error}</p> : null}
      <div className="property-actions">
        <button type="button" className="btn-primary" disabled={saving || detail.read_only} onClick={() => void save()}>
          {saving ? t('common.saving') : t('common.save')}
        </button>
        <button type="button" className="btn-secondary" onClick={onDone}>
          {t('common.cancel')}
        </button>
        {detail.configured ? (
          <button type="button" className="btn-secondary property-delete" onClick={() => void remove()}>
            {t('properties.edit.delete')}
          </button>
        ) : null}
      </div>
    </div>
  )
}

export function PropertyEdit({ id, onDone }: { id: number; onDone: () => void }) {
  const { t } = useI18n()
  const [state, setState] = useState<{ detail: PropertyDetail; setup: SetupResponse } | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    Promise.all([fetchProperty(id), fetchPropertySetup()]).then(
      ([detail, setup]) => {
        if (!cancelled) setState({ detail, setup })
      },
      (err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      },
    )
    return () => {
      cancelled = true
    }
  }, [id])
  return (
    <div className="ledger property-detail">
      <button type="button" className="back-btn" onClick={onDone}>
        {t('up.property')}
      </button>
      <div className="ledger-head-intro">
        <h2 className="ledger-page-title">{state ? t('properties.edit.title', { name: state.detail.name }) : '...'}</h2>
      </div>
      {error ? <p className="error">{error}</p> : null}
      {state ? <EditForm detail={state.detail} setup={state.setup} onDone={onDone} /> : null}
    </div>
  )
}
