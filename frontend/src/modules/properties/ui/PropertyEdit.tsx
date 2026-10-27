import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { deleteVoucher, fetchPartners, fetchSettings, saveVoucher, uploadAttachment } from '../../../api'
import { useI18n } from '../../../i18n'
import { formatDate } from '../../../shared/dates'
import { downloadFile, localToday } from '../../../shared/downloadFile'
import { EuroInput } from '../../../shared/EuroInput'
import { SearchSelect } from '../../../shared/SearchSelect'
import { formatCents, parseEurInput } from '../../../shared/money'
import { parsePercentInput } from '../../../shared/percent'
import {
  deleteProperty,
  fetchProperty,
  fetchPropertySetup,
  PROPERTY_KINDS,
  saveProperty,
  type DocCandidate,
  type Lease,
  type PropertyDetail,
  type PropertyDoc,
  type PropertyKind,
  type SetupResponse,
} from '../api'
import { settlementShares } from '../../../book/modules/properties/domain/water'
import { DocPicker } from './DocPicker'
import {
  clearEditDraft,
  loadEditDraft,
  saveEditDraft,
  stateFromDoc,
  type CapitalDraft,
  type DocEdit,
  type EditState,
  type ValuationDraft,
} from './editDraft'
import { clauseText, saveErrorText } from './format'
import { increaseNoticePdf, noticeTitle, type NoticeAmounts } from './increaseNotice'
import type { LetterCompany } from './letter'
import { buildLeases, withKeys, type AmountsDraft, type Partner } from './leaseDrafts'
import { LeasesEditor } from './LeasesEditor'
import { scrollContainer } from './setupDraft'
import { buildSettlements, draftSettlement, withShare, type SettlementDraft } from './waterDrafts'
import { WaterEditor } from './WaterEditor'
import { statementTitle, waterLetterPdf, waterLetterTitle } from './waterLetter'

function accountList(raw: string): number[] | null {
  const parts = raw.split(/[\s,;]+/).filter(Boolean)
  if (parts.some((p) => !/^\d+$/.test(p))) return null
  return parts.map(Number)
}

const cents = (a: AmountsDraft, withParking: boolean): NoticeAmounts => ({
  rent: parseEurInput(a.rent),
  water: parseEurInput(a.water),
  parking: withParking ? parseEurInput(a.parking) : 0,
})

/** The book's company details (Asetus) as a letter's sender. */
function letterCompany(company: Record<string, string>): LetterCompany {
  return {
    name: company.Nimi ?? '',
    business_id: company.Ytunnus ?? '',
    street: company.Katuosoite ?? '',
    postcode: company.Postinumero ?? '',
    city: company.Kaupunki ?? '',
    email: company.Email ?? '',
    phone: company.Puhelin ?? '',
  }
}

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
  const [leases, setLeases] = useState(() => withKeys(init.leases))
  // A draft kept before water settlements existed has none.
  const [water, setWater] = useState<SettlementDraft[]>(init.water ?? [])
  /** Increase notices written on this page: pickable before the page is saved. */
  const [newDocs, setNewDocs] = useState<DocCandidate[]>(init.newDocs)
  /** Earlier documents written from this form that the owner deleted: deleted from the book on save. */
  const [toDelete, setToDelete] = useState<number[]>(init.toDelete)
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
    water,
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
    toDelete,
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
  /** Documents written from this form, deletable from here: earlier ones (stored) and this visit's. */
  const storedCreated = new Set(doc.created_voucher_ids ?? [])
  const isCreated = (id: number) =>
    !toDelete.includes(id) && (storedCreated.has(id) || newDocs.some((d) => d.voucher_id === id))
  /** The Liitetieto vouchers to pick from: the book's and this visit's, less those to delete on save. */
  const allDocs = [...setup.docs, ...newDocs].filter((d) => !toDelete.includes(d.voucher_id))
  const docById = new Map(allDocs.map((d) => [d.voucher_id, d]))
  const availableDocs = allDocs.filter((d) => !docs.includes(d.voucher_id))

  const addresses = new Map(
    [...detail.leases, ...detail.lease_suggestions.map((s) => s.view)].flatMap((v) =>
      v.tenant_partner_id != null ? [[v.tenant_partner_id, v.tenant_address] as const] : [],
    ),
  )

  const partnerOf = (name: string) => partners.find((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase())
  const tenantOf = (name: string) => {
    const partner = partnerOf(name)
    return { name: name.trim(), address: (partner && addresses.get(partner.id)) || [] }
  }

  /** The leases as the form has them now, for the water shares; none while a lease has a bad field. */
  const builtLeases = buildLeases(t, leases, partners)
  const formLeases: Lease[] = typeof builtLeases === 'string' ? [] : builtLeases
  const leaseTenant = (lease: Lease) => leases.find((l) => l.key === lease.key)?.tenant.trim() ?? ''

  /** A new posted Liitetieto voucher with these files, the tenant as partner; this visit's document. */
  async function createDoc(title: string, tenant: string, files: File[]): Promise<number> {
    const partner = partnerOf(tenant)
    const saved = await saveVoucher({
      date: today,
      type: 800,
      status: 100,
      title,
      partner: partner ? partner.id : tenant.trim() || null,
      entries: [],
    })
    let first: number | null = null
    for (const file of files) {
      const attachment = await uploadAttachment(saved.id, file)
      first ??= attachment.id
    }
    setNewDocs((prev) => [
      ...prev,
      { voucher_id: saved.id, date: today, title, doc_number: null, attachments: files.length, first_attachment: first, linked_to: [], suggestion: null },
    ])
    return saved.id
  }

  /** Points lease `i`'s contract (`k` null) or increase `k`'s notice at a voucher. */
  const setRef = (i: number, k: number | null, voucherId: string) =>
    setLeases((prev) =>
      prev.map((l, li) =>
        li !== i
          ? l
          : k == null
            ? { ...l, contractId: voucherId }
            : { ...l, increases: l.increases.map((r, ri) => (ri === k ? { ...r, voucherId } : r)) },
      ),
    )

  /** Points exception `k` of lease `i` at its agreement voucher. */
  const setExceptionRef = (i: number, k: number, voucherId: string) =>
    setLeases((prev) =>
      prev.map((l, li) => (li !== i ? l : { ...l, exceptions: l.exceptions.map((e, ei) => (ei === k ? { ...e, voucherId } : e)) })),
    )

  /** Writes the notice for increase `k` of lease `i`: a PDF on a new Liitetieto voucher, linked and downloaded. */
  async function createNotice(i: number, k: number) {
    setError(null)
    const lease = leases[i]
    const increase = lease.increases[k]
    const before = k === 0 ? lease.initial : lease.increases[k - 1]
    const contract = docById.get(Number(lease.contractId))
    const built = buildLeases(t, [lease], partners)
    const rule = typeof built === 'string' ? undefined : built[0]?.increase
    const pdf = increaseNoticePdf(t, {
      company: letterCompany(company),
      tenant: tenantOf(lease.tenant),
      object: detail.name,
      contract: contract?.title ?? null,
      lease_starts: lease.starts,
      due_day: Number(lease.dueDay) || null,
      clause: clauseText(t, rule),
      date: today,
      from: increase.from,
      before: cents(before, lease.parking),
      after: cents(increase, lease.parking),
    })
    try {
      const name = `${fileSlug(t('properties.notice.fileName'))}-${fileSlug(detail.name)}-${increase.from}.pdf`
      const id = await createDoc(noticeTitle(t, detail.name, increase.from), lease.tenant, [
        new File([pdf as BlobPart], name, { type: 'application/pdf' }),
      ])
      setRef(i, k, String(id))
      downloadFile(pdf, name, 'application/pdf')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  /** Uploads the owner's own contract (`k` null) or increase notice as a new Liitetieto voucher and picks it. */
  async function upload(i: number, k: number | null, files: File[]) {
    if (!files.length) return
    setError(null)
    const lease = leases[i]
    const title =
      k == null
        ? t('properties.upload.contractTitle', {
            object: detail.name,
            tenant: lease.tenant.trim(),
            date: lease.starts ? formatDate(lease.starts) : '',
          })
            .replace(/\s+/g, ' ')
            .trim()
        : noticeTitle(t, detail.name, lease.increases[k].from)
    try {
      setRef(i, k, String(await createDoc(title, lease.tenant, files)))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  /** Uploads the agreement on exception `k` of lease `i` as a new Liitetieto voucher and picks it. */
  async function uploadException(i: number, k: number, files: File[]) {
    if (!files.length) return
    setError(null)
    const lease = leases[i]
    const e = lease.exceptions[k]
    const title = t('properties.upload.exceptionTitle', {
      object: detail.name,
      tenant: lease.tenant.trim(),
      from: e.from ? formatDate(e.from) : '',
      to: e.to ? formatDate(e.to) : '',
    })
      .replace(/\s+/g, ' ')
      .trim()
    try {
      setExceptionRef(i, k, String(await createDoc(title, lease.tenant, files)))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  /** Points settlement `i`'s statement (`leaseKey` null) or the letter of `leaseKey`'s share at a voucher. */
  const setWaterRef = (i: number, leaseKey: string | null, voucherId: string) =>
    setWater((prev) =>
      prev.map((d, j) =>
        j !== i ? d : leaseKey == null ? { ...d, voucherId } : { ...d, shares: withShare(d.shares, leaseKey, { voucherId }) },
      ),
    )

  /** Writes the water settlement letter to `leaseKey`'s tenant: a PDF on a new Liitetieto voucher, linked and downloaded. */
  async function createLetter(i: number, leaseKey: string) {
    setError(null)
    const settlement = draftSettlement(water[i])
    const share = settlement ? settlementShares(settlement, formLeases).find((s) => s.lease.key === leaseKey) : undefined
    if (!settlement || !share) return
    const tenant = leaseTenant(share.lease)
    const pdf = waterLetterPdf(t, {
      company: letterCompany(company),
      tenant: tenantOf(tenant),
      object: detail.name,
      date: today,
      from: settlement.from,
      to: settlement.to,
      stay: { from: share.from, to: share.to, days: share.days },
      advance_snt: share.advance_snt,
      balance_snt: share.balance_snt,
    })
    try {
      const name = `${fileSlug(t('properties.water.letter.fileName'))}-${fileSlug(detail.name)}-${settlement.to}.pdf`
      const id = await createDoc(waterLetterTitle(t, detail.name, settlement.from, settlement.to), tenant, [
        new File([pdf as BlobPart], name, { type: 'application/pdf' }),
      ])
      setWaterRef(i, leaseKey, String(id))
      downloadFile(pdf, name, 'application/pdf')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  /** Uploads the company's statement (`leaseKey` null) or the owner's own letter to a tenant, and picks it. */
  async function uploadWater(i: number, leaseKey: string | null, files: File[]) {
    if (!files.length) return
    setError(null)
    const d = water[i]
    // The title names the period, so Kitsas search finds the document.
    if (!d.from || !d.to) {
      setError(t('properties.water.needPeriod'))
      return
    }
    const lease = leaseKey != null ? formLeases.find((l) => l.key === leaseKey) : undefined
    const title = (leaseKey == null ? statementTitle : waterLetterTitle)(t, detail.name, d.from, d.to)
    try {
      setWaterRef(i, leaseKey, String(await createDoc(title, lease ? leaseTenant(lease) : '', files)))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  /**
   * Deletes documents written from this form, after asking: this visit's at once (an undo),
   * earlier ones when the form is saved. Clears what pointed at them, then applies `edit` (e.g.
   * removes the row). Other documents are never deleted here; the caller's edit only unlinks them.
   */
  async function deleteDocs(voucherIds: number[], edit: DocEdit = {}) {
    const own = [...new Set(voucherIds)].filter(isCreated)
    if (own.length) {
      const titles = own.map((id) => docById.get(id)?.title ?? `#${id}`)
      if (!window.confirm(t('properties.edit.confirmDeleteDoc', { titles: titles.join(', ') }))) return
      const now = own.filter((id) => newDocs.some((d) => d.voucher_id === id))
      setError(null)
      try {
        for (const id of now) await deleteVoucher(id)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        return
      }
      setNewDocs((prev) => prev.filter((d) => !now.includes(d.voucher_id)))
      setToDelete((prev) => [...prev, ...own.filter((id) => !now.includes(id))])
      setDocs((prev) => prev.filter((id) => !own.includes(id)))
    }
    const gone = new Set(own.map(String))
    const same = <T,>(d: T) => d
    setLeases((prev) =>
      (edit.leases ?? same)(
        prev.map((l) => ({
          ...l,
          contractId: gone.has(l.contractId) ? '' : l.contractId,
          increases: l.increases.map((r) => (gone.has(r.voucherId) ? { ...r, voucherId: '' } : r)),
          exceptions: l.exceptions.map((e) => (gone.has(e.voucherId) ? { ...e, voucherId: '' } : e)),
        })),
      ),
    )
    setWater((prev) =>
      (edit.water ?? same)(
        prev.map((d) => ({
          ...d,
          voucherId: gone.has(d.voucherId) ? '' : d.voucherId,
          shares: d.shares.map((s) => (gone.has(s.voucherId) ? { ...s, voucherId: '' } : s)),
        })),
      ),
    )
  }

  async function cancel() {
    // Documents written on this visit and not saved to the object: keep them (a notice may be sent) or delete them.
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
    if (typeof builtLeases === 'string') return builtLeases
    const settlements = buildSettlements(t, water, new Set(builtLeases.map((l) => l.key)))
    if (typeof settlements === 'string') return settlements
    const next: PropertyDoc = { ...doc, eras: eras.map((eraid) => ({ eraid, account: eraById.get(eraid)?.account ?? 1 })) }
    next.leases = builtLeases
    if (settlements.length) next.water_settlements = settlements
    else delete next.water_settlements
    if (kind) next.kind = kind
    else delete next.kind
    if (excluded) next.excluded = true
    else delete next.excluded
    // This visit's documents are the object's documents, and stay deletable from here.
    const fresh = newDocs.map((d) => d.voucher_id)
    next.doc_voucher_ids = [...new Set([...docs, ...fresh])].filter((id) => !toDelete.includes(id))
    const created = [...new Set([...(doc.created_voucher_ids ?? []), ...fresh])].filter((id) => !toDelete.includes(id))
    if (created.length) next.created_voucher_ids = created
    else delete next.created_voucher_ids
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
      // Earlier documents the owner deleted: gone from the book once nothing points at them.
      for (const id of toDelete) await deleteVoucher(id)
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
          onChange={(next) => setLeases(withKeys(next))}
          partners={partners}
          docs={allDocs}
          suggestions={[...detail.lease_suggestions].reverse()}
          today={today}
          onCreateNotice={createNotice}
          onUpload={upload}
          onUploadException={uploadException}
          isCreated={isCreated}
          onDeleteDocs={deleteDocs}
          onOpenVoucher={openVoucher}
        />
      </section>

      <section className="property-section">
        <h3>{t('properties.water.editTitle')}</h3>
        <p className="muted">{t('properties.water.editLead')}</p>
        <WaterEditor
          drafts={water}
          onChange={setWater}
          leases={formLeases}
          tenantName={(lease) => leaseTenant(lease) || t('properties.lease.tenantUnknown')}
          docs={allDocs}
          suggestions={detail.water.suggestions}
          lines={detail.water.lines}
          onCreateLetter={createLetter}
          onUpload={uploadWater}
          isCreated={isCreated}
          onDeleteDocs={deleteDocs}
          onOpenVoucher={openVoucher}
        />
      </section>

      <section className="property-section">
        <h3>{t('properties.eras.title')}</h3>
        <p className="muted">{t('properties.edit.erasLead')}</p>
        <p className="property-legend">{t('properties.setup.starLegendEdit')}</p>
        <ul className="property-doc-list property-linked-list">
          {eras.map((eraid) => {
            const e = eraById.get(eraid)
            return (
              <li key={eraid}>
                {e ? (
                  <button type="button" className="btn-link" onClick={() => openVoucher(e.voucher_id)}>
                    {e.account} · {formatDate(e.date)} · {e.description} · {formatCents(e.balance_snt)}
                  </button>
                ) : (
                  <span className="muted">{t('properties.eras.missing', { id: eraid })}</span>
                )}{' '}
                <button type="button" className="btn-small" onClick={() => setEras(eras.filter((x) => x !== eraid))}>
                  {t('properties.edit.remove')}
                </button>
              </li>
            )
          })}
        </ul>
        {availableEras.length ? (
          <SearchSelect
            aria-label={t('properties.edit.addEra')}
            placeholder={t('properties.edit.addEra')}
            items={availableEras.map((e) => ({
              value: String(e.eraid),
              label: `${e.suggestion?.candidates.includes(detail.id) ? '★ ' : ''}${e.account} · ${formatDate(e.date)} · ${e.description} · ${formatCents(e.balance_snt)}`,
            }))}
            value=""
            onChange={(v) => v && setEras([...eras, Number(v)])}
          />
        ) : null}
      </section>

      <section className="property-section">
        <h3>{t('properties.docs.linkedTitle')}</h3>
        <ul className="property-doc-list property-linked-list">
          {docs.map((voucherId) => {
            const d = docById.get(voucherId)
            return (
              <li key={voucherId}>
                {d ? (
                  <button type="button" className="btn-link" onClick={() => openVoucher(voucherId)}>
                    {formatDate(d.date)} · {d.title}
                  </button>
                ) : (
                  <span className="muted">{t('properties.docs.missing', { id: voucherId })}</span>
                )}{' '}
                {isCreated(voucherId) ? (
                  <button type="button" className="btn-small" onClick={() => void deleteDocs([voucherId])}>
                    {t('properties.edit.deleteDoc')}
                  </button>
                ) : (
                  <button type="button" className="btn-small" onClick={() => setDocs(docs.filter((x) => x !== voucherId))}>
                    {t('properties.edit.remove')}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
        {availableDocs.length ? (
          <DocPicker
            docs={availableDocs}
            value=""
            placeholder={t('properties.edit.addDoc')}
            starred={(d) => d.suggestion?.candidates.includes(detail.id) ?? false}
            onChange={(v) => v && setDocs([...docs, Number(v)])}
          />
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
