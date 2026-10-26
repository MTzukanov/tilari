import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { deleteVoucher, fetchPartners, fetchSettings, saveVoucher, uploadAttachment } from '../../../api'
import { useI18n } from '../../../i18n'
import { formatDate } from '../../../shared/dates'
import { downloadFile, localToday } from '../../../shared/downloadFile'
import { EuroInput } from '../../../shared/EuroInput'
import { formatCents, parseEurInput } from '../../../shared/money'
import { parsePercentInput } from '../../../shared/percent'
import {
  deleteProperty,
  fetchProperty,
  fetchPropertySetup,
  PROPERTY_KINDS,
  saveProperty,
  type DocCandidate,
  type PropertyDetail,
  type PropertyDoc,
  type PropertyKind,
  type SetupResponse,
} from '../api'
import { clearEditDraft, loadEditDraft, saveEditDraft, stateFromDoc, type CapitalDraft, type EditState, type ValuationDraft } from './editDraft'
import { clauseText, saveErrorText } from './format'
import { increaseNoticePdf, noticeTitle, type NoticeAmounts } from './increaseNotice'
import { buildLeases, type AmountsDraft, type Partner } from './leaseDrafts'
import { LeasesEditor } from './LeasesEditor'
import { scrollContainer } from './setupDraft'

function accountList(raw: string): number[] | null {
  const parts = raw.split(/[\s,;]+/).filter(Boolean)
  if (parts.some((p) => !/^\d+$/.test(p))) return null
  return parts.map(Number)
}

const cents = (a: AmountsDraft): NoticeAmounts => ({
  rent: parseEurInput(a.rent),
  water: parseEurInput(a.water),
  parking: parseEurInput(a.parking),
})

/** A file name from free text: letters, digits and dashes. */
function fileSlug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
}

function EditForm({
  detail,
  setup,
  partners,
  company,
  today,
  bookKey,
  onDone,
  onOpenVoucher,
}: {
  detail: PropertyDetail
  setup: SetupResponse
  partners: Partner[]
  /** The book's company details (Asetus), for letters. */
  company: Record<string, string>
  /** The book's date (a practice book's simulated day): letters and their vouchers carry it. */
  today: string
  /** This book's session: an unsaved form is kept only for it. */
  bookKey: string
  onDone: () => void
  onOpenVoucher: (voucherId: number) => void
}) {
  const { t } = useI18n()
  const doc = detail.doc
  const [draft] = useState(() => loadEditDraft(bookKey, detail.id, doc.rev))
  const [init] = useState<EditState>(() => draft?.state ?? stateFromDoc(doc, partners))
  const [kind, setKind] = useState<PropertyKind | ''>(init.kind)
  const [leases, setLeases] = useState(init.leases)
  /** Increase notices written on this page: pickable before the page is saved. */
  const [newDocs, setNewDocs] = useState<DocCandidate[]>(init.newDocs)
  const [excluded, setExcluded] = useState(init.excluded)
  const [eras, setEras] = useState<number[]>(init.eras)
  const [docs, setDocs] = useState<number[]>(init.docs)
  const [valuations, setValuations] = useState<ValuationDraft[]>(init.valuations)
  const [salePct, setSalePct] = useState(init.salePct)
  const [saleFixed, setSaleFixed] = useState(init.saleFixed)
  const [target, setTarget] = useState(init.target)
  const [loanAccounts, setLoanAccounts] = useState(init.loanAccounts)
  const [interestAccounts, setInterestAccounts] = useState(init.interestAccounts)
  const [capital, setCapital] = useState<CapitalDraft[]>(init.capital)
  const [note, setNote] = useState(init.note)

  // While a voucher is open, the unsaved form and the scroll position wait for the way back (this tab only).
  const current: EditState = {
    kind,
    excluded,
    leases,
    newDocs,
    eras,
    docs,
    valuations,
    salePct,
    saleFixed,
    target,
    loanAccounts,
    interestAccounts,
    capital,
    note,
  }
  const stateRef = useRef(current)
  stateRef.current = current
  const scrollTop = useRef(draft?.scrollTop ?? 0)
  const keepDraft = useRef(false)

  useLayoutEffect(() => {
    const box = scrollContainer()
    if (!box) return
    if (draft?.scrollTop) {
      box.scrollTop = draft.scrollTop
      requestAnimationFrame(() => {
        box.scrollTop = draft.scrollTop
      })
    }
    const onScroll = () => {
      scrollTop.current = box.scrollTop
    }
    box.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      box.removeEventListener('scroll', onScroll)
      if (!keepDraft.current) clearEditDraft()
    }
    // Mount/unmount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openVoucher = (voucherId: number) => {
    keepDraft.current = true
    saveEditDraft({ book: bookKey, id: detail.id, rev: doc.rev, state: stateRef.current, scrollTop: scrollTop.current })
    onOpenVoucher(voucherId)
  }

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

  const addresses = new Map(
    [...detail.leases, ...detail.lease_suggestions.map((s) => s.view)].flatMap((v) =>
      v.tenant_partner_id != null ? [[v.tenant_partner_id, v.tenant_address] as const] : [],
    ),
  )

  /** Writes the notice for increase `k` of lease `i`: a PDF on a new Liitetieto voucher, linked and downloaded. */
  async function createNotice(i: number, k: number) {
    setError(null)
    const lease = leases[i]
    const increase = lease.increases[k]
    const before = k === 0 ? lease.initial : lease.increases[k - 1]
    const partner = partners.find((p) => p.name.trim().toLowerCase() === lease.tenant.trim().toLowerCase())
    const contract = [...setup.docs, ...newDocs].find((d) => String(d.voucher_id) === lease.contractId)
    const built = buildLeases(t, [lease], partners)
    const rule = typeof built === 'string' ? undefined : built[0]?.increase
    const pdf = increaseNoticePdf(t, {
      company: {
        name: company.Nimi ?? '',
        business_id: company.Ytunnus ?? '',
        street: company.Katuosoite ?? '',
        postcode: company.Postinumero ?? '',
        city: company.Kaupunki ?? '',
        email: company.Email ?? '',
        phone: company.Puhelin ?? '',
      },
      tenant: { name: lease.tenant.trim(), address: (partner && addresses.get(partner.id)) || [] },
      object: detail.name,
      contract: contract?.title ?? null,
      lease_starts: lease.starts,
      due_day: Number(lease.dueDay) || null,
      clause: clauseText(t, rule),
      date: today,
      from: increase.from,
      before: cents(before),
      after: cents(increase),
    })
    const title = noticeTitle(t, detail.name, increase.from)
    try {
      const saved = await saveVoucher({
        date: today,
        type: 800,
        status: 100,
        title,
        partner: partner ? partner.id : lease.tenant.trim() || null,
        entries: [],
      })
      const name = `${fileSlug(t('properties.notice.fileName'))}-${fileSlug(detail.name)}-${increase.from}.pdf`
      const attachment = await uploadAttachment(saved.id, new File([pdf as BlobPart], name, { type: 'application/pdf' }))
      setNewDocs([
        ...newDocs,
        { voucher_id: saved.id, date: today, title, doc_number: null, attachments: 1, first_attachment: attachment.id, linked_to: [], suggestion: null },
      ])
      setLeases(
        leases.map((l, li) =>
          li === i ? { ...l, increases: l.increases.map((r, ri) => (ri === k ? { ...r, voucherId: String(saved.id) } : r)) } : l,
        ),
      )
      downloadFile(pdf, name, 'application/pdf')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  /**
   * Deletes notices written on this page (an undo), after asking. Returns false when the owner
   * keeps them. Only these: a document that was already in the book is only unlinked.
   */
  async function deleteCreated(voucherIds: number[]): Promise<boolean> {
    const own = voucherIds.filter((id) => newDocs.some((d) => d.voucher_id === id))
    if (!own.length) return true
    const titles = newDocs.filter((d) => own.includes(d.voucher_id)).map((d) => d.title)
    if (!window.confirm(t('properties.edit.confirmDeleteNotice', { titles: titles.join(', ') }))) return false
    setError(null)
    try {
      for (const id of own) await deleteVoucher(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      return false
    }
    setNewDocs(newDocs.filter((d) => !own.includes(d.voucher_id)))
    return true
  }

  async function cancel() {
    // Notices written here but not saved to the object: keep them (they may be sent) or delete them.
    const unsaved = newDocs.map((d) => d.voucher_id)
    if (unsaved.length && window.confirm(t('properties.edit.confirmDeleteUnsaved', { n: unsaved.length }))) {
      try {
        for (const id of unsaved) await deleteVoucher(id)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        return
      }
    }
    onDone()
  }

  function build(): PropertyDoc | string {
    const pct = parsePercentInput(salePct)
    const targetBp = parsePercentInput(target)
    if (Number.isNaN(pct) || Number.isNaN(targetBp)) return t('properties.error.percent')
    const loans = accountList(loanAccounts)
    const interests = accountList(interestAccounts)
    if (!loans || !interests) return t('properties.error.accounts')
    const builtLeases = buildLeases(t, leases, partners)
    if (typeof builtLeases === 'string') return builtLeases
    const next: PropertyDoc = { ...doc, eras: eras.map((eraid) => ({ eraid, account: eraById.get(eraid)?.account ?? 1 })) }
    next.leases = builtLeases
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
      {draft ? <p className="property-note">{t('properties.edit.restored')}</p> : null}

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
        <h3>{t('properties.edit.leases')}</h3>
        <p className="muted">{t('properties.edit.leasesLead')}</p>
        <LeasesEditor
          drafts={leases}
          onChange={setLeases}
          partners={partners}
          docs={[...setup.docs, ...newDocs]}
          suggestions={[...detail.lease_suggestions].reverse()}
          today={today}
          onCreateNotice={createNotice}
          created={new Set(newDocs.map((d) => d.voucher_id))}
          onDeleteCreated={deleteCreated}
        />
      </section>

      <section className="property-section">
        <h3>{t('properties.eras.title')}</h3>
        <p className="muted">{t('properties.edit.erasLead')}</p>
        <p className="property-legend">{t('properties.setup.starLegendEdit')}</p>
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
                {d ? (
                  <button type="button" className="btn-link" onClick={() => openVoucher(voucherId)}>
                    {formatDate(d.date)} · {d.title}
                  </button>
                ) : (
                  t('properties.docs.missing', { id: voucherId })
                )}{' '}
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
        <button type="button" className="btn-secondary" onClick={() => void cancel()}>
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

export function PropertyEdit({
  id,
  bookKey,
  today,
  onDone,
  onOpenVoucher,
}: {
  id: number
  bookKey: string
  today?: string
  onDone: () => void
  onOpenVoucher: (voucherId: number) => void
}) {
  const { t } = useI18n()
  const [state, setState] = useState<{
    detail: PropertyDetail
    setup: SetupResponse
    partners: Partner[]
    company: Record<string, string>
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    Promise.all([fetchProperty(id), fetchPropertySetup(), fetchPartners(), fetchSettings()]).then(
      ([detail, setup, { partners }, settings]) => {
        if (!cancelled) {
          setState({ detail, setup, partners: partners.map((p) => ({ id: p.id, name: p.name })), company: settings.company })
        }
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
      {state ? (
        <EditForm
          detail={state.detail}
          setup={state.setup}
          partners={state.partners}
          company={state.company}
          today={today || localToday()}
          bookKey={bookKey}
          onDone={onDone}
          onOpenVoucher={onOpenVoucher}
        />
      ) : null}
    </div>
  )
}
