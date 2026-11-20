/**
 * The Talous tab's own edits: each section (acquisition cost, price estimates, sale costs and
 * target, bank loan, other capital) has a small Muokkaa that turns it into its form, with its own
 * Tallenna and Peru. A save writes the object with only that section changed.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { housingShare } from '../../../book/modules/properties/domain/housingLoan'
import { fetchPropertySetup } from '../api'
import { useI18n } from '../../../i18n'
import { formatDate } from '../../../shared/dates'
import { DocLine, DocLines } from '../../../shared/DocRows'
import { EuroInput } from '../../../shared/EuroInput'
import { formatCents, formatEurInput, parseEurInput } from '../../../shared/money'
import { formatPercentInput, parsePercentInput } from '../../../shared/percent'
import { SearchSelect } from '../../../shared/SearchSelect'
import type { EraCandidate, PropertyDetail, PropertyDoc } from '../api'
import type { CapitalDraft, ValuationDraft } from './editDraft'
import { saveErrorText } from './format'

type T = (key: string, vars?: Record<string, string | number>) => string

/** Account numbers typed as a list ("2621, 2835"); null when one is not a number. */
function accountList(raw: string): number[] | null {
  const parts = raw.split(/[\s,;]+/).filter(Boolean)
  if (parts.some((p) => !/^\d+$/.test(p))) return null
  return parts.map(Number)
}

/**
 * One section's form: closed, or open on `state` with Tallenna and Peru. `build` turns the state
 * into the object to save, or says what is wrong.
 */
function useSectionEdit<S>(
  t: T,
  doc: PropertyDoc,
  start: () => S,
  build: (state: S) => PropertyDoc | string,
  onSave: ((doc: PropertyDoc) => Promise<void>) | undefined,
) {
  const [state, setState] = useState<S | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const begin = (edit: (s: S) => S = (s) => s) => {
    setError(null)
    setState(edit(start()))
  }
  async function save() {
    if (!state || !onSave) return
    const next = build(state)
    if (typeof next === 'string') {
      setError(next)
      return
    }
    setSaving(true)
    try {
      await onSave(next)
      setState(null)
    } catch (err) {
      setError(saveErrorText(t, err instanceof Error ? err.message : String(err)))
    } finally {
      setSaving(false)
    }
  }
  return { state, setState, error, saving, begin, cancel: () => setState(null), save, doc }
}

/** A section's title row: its small Muokkaa while closed and editable. */
function SectionHead({ title, onEdit }: { title: string; onEdit?: () => void }) {
  const { t } = useI18n()
  return (
    <div className="property-panel-head">
      <h3>{title}</h3>
      {onEdit ? (
        <button type="button" className="btn-link" onClick={onEdit}>
          {t('common.edit')}
        </button>
      ) : null}
    </div>
  )
}

/** A section form's error, Tallenna and Peru. */
function SectionActions({ error, saving, onSave, onCancel }: { error: string | null; saving: boolean; onSave: () => void; onCancel: () => void }) {
  const { t } = useI18n()
  return (
    <>
      {error ? <p className="error">{error}</p> : null}
      <div className="property-actions">
        <button type="button" className="btn-primary" disabled={saving} onClick={onSave}>
          {saving ? t('common.saving') : t('common.save')}
        </button>
        <button type="button" className="btn-secondary" disabled={saving} onClick={onCancel}>
          {t('common.cancel')}
        </button>
      </div>
    </>
  )
}

type SectionProps = {
  d: PropertyDetail
  /** Saves the object as the section changed it; none when it cannot be changed (read-only). */
  onSave?: (doc: PropertyDoc) => Promise<void>
}

/** Hankintameno: the balance-sheet items linked to the object, shown with their movements (`view`). */
export function ErasSection({ d, onSave, view }: SectionProps & { view: ReactNode }) {
  const { t } = useI18n()
  const [candidates, setCandidates] = useState<EraCandidate[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const edit = useSectionEdit<number[]>(
    t,
    d.doc,
    () => d.doc.eras.map((e) => e.eraid),
    (ids) => {
      const accounts = new Map([...d.doc.eras.map((e) => [e.eraid, e.account] as const), ...(candidates ?? []).map((c) => [c.eraid, c.account] as const)])
      return { ...d.doc, eras: ids.map((eraid) => ({ eraid, account: accounts.get(eraid) ?? 1 })) }
    },
    onSave,
  )
  async function open() {
    setLoadError(null)
    try {
      setCandidates((await fetchPropertySetup()).eras)
      edit.begin()
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err))
    }
  }
  const ids = edit.state
  const byId = new Map((candidates ?? []).map((c) => [c.eraid, c]))
  const shown = new Map(d.eras.map((e) => [e.eraid, e]))
  const available = (candidates ?? [])
    .filter((c) => !ids?.includes(c.eraid) && (c.linked_to == null || c.linked_to === d.id))
    .sort((a, b) => {
      const sa = a.suggestion?.candidates.includes(d.id) ? 0 : 1
      const sb = b.suggestion?.candidates.includes(d.id) ? 0 : 1
      return sa - sb || b.balance_snt - a.balance_snt
    })
  return (
    <section className="property-section property-finance-eras">
      <SectionHead title={t('properties.eras.title')} onEdit={onSave && !ids && d.eras.length ? () => void open() : undefined} />
      {loadError ? <p className="error">{loadError}</p> : null}
      {!ids ? (
        d.eras.length ? (
          view
        ) : (
          <p className="muted">
            {t('properties.eras.none')}{' '}
            {onSave ? (
              <button type="button" className="btn-link" onClick={() => void open()}>
                {t('properties.eras.link')}
              </button>
            ) : null}
          </p>
        )
      ) : (
        <>
          <p className="muted">{t('properties.edit.erasLead')}</p>
          <p className="property-legend">{t('properties.setup.starLegendEdit')}</p>
          <DocLines>
            {ids.map((eraid) => {
              const c = byId.get(eraid)
              const e = shown.get(eraid)
              const title = c
                ? `${c.account} · ${formatDate(c.date)} · ${c.description} · ${formatCents(c.balance_snt)}`
                : e && !e.missing
                  ? `${e.account} · ${e.description} · ${formatCents(e.balance_snt)}`
                  : t('properties.eras.missing', { id: eraid })
              return (
                <DocLine
                  key={eraid}
                  title={title}
                  end={
                    <button type="button" className="btn-link btn-quiet" onClick={() => edit.setState(ids.filter((x) => x !== eraid))}>
                      {t('properties.edit.remove')}
                    </button>
                  }
                />
              )
            })}
          </DocLines>
          {available.length ? (
            <SearchSelect
              aria-label={t('properties.edit.addEra')}
              placeholder={t('properties.edit.addEra')}
              items={available.map((c) => ({
                value: String(c.eraid),
                label: `${c.suggestion?.candidates.includes(d.id) ? '★ ' : ''}${c.account} · ${formatDate(c.date)} · ${c.description} · ${formatCents(c.balance_snt)}`,
              }))}
              value=""
              onChange={(v) => v && edit.setState([...ids, Number(v)])}
            />
          ) : null}
          <SectionActions error={edit.error} saving={edit.saving} onSave={() => void edit.save()} onCancel={edit.cancel} />
        </>
      )}
    </section>
  )
}

const newValuation = (): ValuationDraft => ({ date: new Date().toISOString().slice(0, 10), price: '', debtFree: '', source: '' })

/**
 * Hinta-arviot: the owner's estimates of the selling price. A debt-free price not typed is the price
 * and the housing-company loan share at the estimate's month end (ADR-034). `addRequest` changing
 * opens the form with a new row.
 */
export function ValuationsSection({ d, onSave, addRequest = 0 }: SectionProps & { addRequest?: number }) {
  const { t } = useI18n()
  const shareOn = (date: string) => (date ? housingShare(d.doc.housing_loans ?? [], d.housing.paths, date.slice(0, 7)) : null)
  const edit = useSectionEdit<ValuationDraft[]>(
    t,
    d.doc,
    () =>
      (d.doc.valuations ?? []).map((v) => ({
        date: v.date,
        price: formatEurInput(v.price_snt),
        debtFree: v.debt_free_price_snt != null ? formatEurInput(v.debt_free_price_snt) : '',
        source: v.source ?? '',
      })),
    (rows) => ({
      ...d.doc,
      valuations: rows
        .filter((v) => v.date || v.price)
        .map((v) => ({
          date: v.date,
          price_snt: parseEurInput(v.price),
          ...(v.debtFree ? { debt_free_price_snt: parseEurInput(v.debtFree) } : {}),
          ...(v.source.trim() ? { source: v.source.trim() } : {}),
        })),
    }),
    onSave,
  )
  // "+ Hinta-arvio" on the tab or the overview: the form opens with a new row.
  useEffect(() => {
    if (addRequest && onSave) edit.begin((rows) => [...rows, newValuation()])
    // Only when asked again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addRequest])
  const rows = edit.state
  const set = (i: number, patch: Partial<ValuationDraft>) => edit.setState(rows!.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const stored = [...(d.doc.valuations ?? [])].sort((a, b) => b.date.localeCompare(a.date))
  return (
    <section className="property-section property-finance-valuations">
      <SectionHead title={t('properties.edit.valuations')} onEdit={onSave && !rows ? () => edit.begin() : undefined} />
      <p className="muted">{t('properties.edit.valuationsLead')}</p>
      {!rows ? (
        stored.length ? (
          <ul className="property-doc-list">
            {stored.map((v, i) => (
              <li key={`${v.date}-${i}`}>
                <span className="muted">{formatDate(v.date)}</span>
                <span>{formatCents(v.price_snt)}</span>
                {v.debt_free_price_snt != null ? (
                  <span className="muted">
                    {t('properties.field.debtFreePrice')} {formatCents(v.debt_free_price_snt)}
                  </span>
                ) : shareOn(v.date) != null ? (
                  <span className="muted">
                    {t('properties.valuation.debtFreeComputed', {
                      price: formatCents(v.price_snt + shareOn(v.date)!),
                      share: formatCents(shareOn(v.date)!),
                    })}
                  </span>
                ) : null}
                {v.source ? <span className="muted">{v.source}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{t('properties.finance.noValuations')}</p>
        )
      ) : (
        <>
          {rows.map((v, i) => (
            <div key={i} className="property-form-row">
              <input type="date" aria-label={t('properties.field.date')} value={v.date} onChange={(e) => set(i, { date: e.target.value })} />
              <label>
                {t('properties.field.price')}
                <EuroInput value={v.price} onChange={(price) => set(i, { price })} />
              </label>
              <label>
                {t('properties.field.debtFreePrice')}
                <EuroInput
                  value={v.debtFree}
                  onChange={(debtFree) => set(i, { debtFree })}
                  placeholder={v.price && shareOn(v.date) != null ? formatEurInput(parseEurInput(v.price) + shareOn(v.date)!) : undefined}
                />
              </label>
              <label>
                {t('properties.field.source')}
                <input type="text" value={v.source} onChange={(e) => set(i, { source: e.target.value })} />
              </label>
              <button
                type="button"
                className="btn-link property-delete property-row-end"
                onClick={() => edit.setState(rows.filter((_, j) => j !== i))}
              >
                {t('properties.edit.remove')}
              </button>
            </div>
          ))}
          <button type="button" className="btn-secondary" onClick={() => edit.setState([...rows, newValuation()])}>
            {t('properties.edit.addValuation')}
          </button>
          <SectionActions error={edit.error} saving={edit.saving} onSave={() => void edit.save()} onCancel={edit.cancel} />
        </>
      )}
    </section>
  )
}

type SaleDraft = { pct: string; fixed: string; target: string }

/** A stored percentage as the owner typed it: 250 -> "2,5 %". */
const percentText = (bp: number) => `${formatPercentInput(bp)} %`

/** Myynti ja tavoite: the object's own sale costs and target return (none: the defaults, else 0). */
export function SaleSection({ d, onSave }: SectionProps) {
  const { t } = useI18n()
  const edit = useSectionEdit<SaleDraft>(
    t,
    d.doc,
    () => ({
      pct: formatPercentInput(d.doc.sale_costs?.pct_bp),
      fixed: d.doc.sale_costs ? formatEurInput(d.doc.sale_costs.fixed_snt) : '',
      target: formatPercentInput(d.doc.target_return_bp),
    }),
    (s) => {
      const pct = parsePercentInput(s.pct)
      const target = parsePercentInput(s.target)
      if (Number.isNaN(pct) || Number.isNaN(target)) return t('properties.error.percent')
      const next: PropertyDoc = { ...d.doc }
      if (pct != null || s.fixed) next.sale_costs = { pct_bp: pct ?? 0, fixed_snt: parseEurInput(s.fixed) }
      else delete next.sale_costs
      if (target != null) next.target_return_bp = target
      else delete next.target_return_bp
      return next
    },
    onSave,
  )
  const s = edit.state
  const own = d.doc.sale_costs
  return (
    <section className="property-section property-finance-sale">
      <SectionHead title={t('properties.edit.sale')} onEdit={onSave && !s ? () => edit.begin() : undefined} />
      <p className="muted">{t('properties.edit.saleLead')}</p>
      {!s ? (
        <p>
          {t('properties.field.salePct')}: {own ? percentText(own.pct_bp) : '–'} · {t('properties.field.saleFixed')}:{' '}
          {own ? formatCents(own.fixed_snt) : '–'} · {t('properties.field.targetReturn')}:{' '}
          {d.doc.target_return_bp != null ? percentText(d.doc.target_return_bp) : '–'}
        </p>
      ) : (
        <>
          <div className="property-form-grid">
            <label>
              {t('properties.field.salePct')}
              <input type="text" inputMode="decimal" value={s.pct} onChange={(e) => edit.setState({ ...s, pct: e.target.value })} />
            </label>
            <label>
              {t('properties.field.saleFixed')}
              <EuroInput value={s.fixed} onChange={(fixed) => edit.setState({ ...s, fixed })} />
            </label>
            <label>
              {t('properties.field.targetReturn')}
              <input type="text" inputMode="decimal" value={s.target} onChange={(e) => edit.setState({ ...s, target: e.target.value })} />
            </label>
          </div>
          <SectionActions error={edit.error} saving={edit.saving} onSave={() => void edit.save()} onCancel={edit.cancel} />
        </>
      )}
    </section>
  )
}

/** Pankkilaina: the loan and interest accounts of the object's own loan. */
export function FinancingSection({ d, onSave }: SectionProps) {
  const { t } = useI18n()
  const edit = useSectionEdit<{ loans: string; interests: string }>(
    t,
    d.doc,
    () => ({
      loans: (d.doc.financing?.loan_accounts ?? []).join(', '),
      interests: (d.doc.financing?.interest_accounts ?? []).join(', '),
    }),
    (s) => {
      const loans = accountList(s.loans)
      const interests = accountList(s.interests)
      if (!loans || !interests) return t('properties.error.accounts')
      const next: PropertyDoc = { ...d.doc }
      if (loans.length || interests.length) next.financing = { loan_accounts: loans, interest_accounts: interests }
      else delete next.financing
      return next
    },
    onSave,
  )
  const s = edit.state
  const f = d.doc.financing
  return (
    <section className="property-section property-finance-loan">
      <SectionHead title={t('properties.edit.financing')} onEdit={onSave && !s ? () => edit.begin() : undefined} />
      <p className="muted">{t('properties.edit.financingLead')}</p>
      {!s ? (
        f && (f.loan_accounts.length || f.interest_accounts.length) ? (
          <p>
            {t('properties.field.loanAccounts')}: {f.loan_accounts.join(', ') || '–'} · {t('properties.field.interestAccounts')}:{' '}
            {f.interest_accounts.join(', ') || '–'}
          </p>
        ) : (
          <p className="muted">{t('properties.finance.noFinancing')}</p>
        )
      ) : (
        <>
          <div className="property-form-grid">
            <label>
              {t('properties.field.loanAccounts')}
              <input type="text" value={s.loans} placeholder="2621, 2835" onChange={(e) => edit.setState({ ...s, loans: e.target.value })} />
            </label>
            <label>
              {t('properties.field.interestAccounts')}
              <input type="text" value={s.interests} placeholder="9460" onChange={(e) => edit.setState({ ...s, interests: e.target.value })} />
            </label>
          </div>
          <SectionActions error={edit.error} saving={edit.saving} onSave={() => void edit.save()} onCancel={edit.cancel} />
        </>
      )}
    </section>
  )
}

/** Muu sijoitettu pääoma: capital put in outside the linked balance-sheet items. */
export function CapitalSection({ d, onSave }: SectionProps) {
  const { t } = useI18n()
  const edit = useSectionEdit<CapitalDraft[]>(
    t,
    d.doc,
    () => (d.doc.manual_capital ?? []).map((c) => ({ date: c.date, amount: formatEurInput(c.amount_snt), note: c.note ?? '' })),
    (rows) => ({
      ...d.doc,
      manual_capital: rows
        .filter((c) => c.date || c.amount)
        .map((c) => ({ date: c.date, amount_snt: parseEurInput(c.amount), ...(c.note.trim() ? { note: c.note.trim() } : {}) })),
    }),
    onSave,
  )
  const rows = edit.state
  const set = (i: number, patch: Partial<CapitalDraft>) => edit.setState(rows!.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const stored = d.doc.manual_capital ?? []
  return (
    <section className="property-section property-finance-capital">
      <SectionHead title={t('properties.edit.capital')} onEdit={onSave && !rows ? () => edit.begin() : undefined} />
      <p className="muted">{t('properties.edit.capitalLead')}</p>
      {!rows ? (
        stored.length ? (
          <ul className="property-doc-list">
            {stored.map((c, i) => (
              <li key={`${c.date}-${i}`}>
                <span className="muted">{formatDate(c.date)}</span>
                <span>{formatCents(c.amount_snt)}</span>
                {c.note ? <span className="muted">{c.note}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{t('properties.finance.noCapital')}</p>
        )
      ) : (
        <>
          {rows.map((c, i) => (
            <div key={i} className="property-form-row">
              <input type="date" aria-label={t('properties.field.date')} value={c.date} onChange={(e) => set(i, { date: e.target.value })} />
              <EuroInput value={c.amount} aria-label={t('properties.field.amount')} onChange={(amount) => set(i, { amount })} />
              <input type="text" value={c.note} placeholder={t('properties.field.note')} onChange={(e) => set(i, { note: e.target.value })} />
              <button
                type="button"
                className="btn-link property-delete property-row-end"
                onClick={() => edit.setState(rows.filter((_, j) => j !== i))}
              >
                {t('properties.edit.remove')}
              </button>
            </div>
          ))}
          <button type="button" className="btn-secondary" onClick={() => edit.setState([...rows, { date: '', amount: '', note: '' }])}>
            {t('properties.edit.addCapital')}
          </button>
          <SectionActions error={edit.error} saving={edit.saving} onSave={() => void edit.save()} onCancel={edit.cancel} />
        </>
      )}
    </section>
  )
}
