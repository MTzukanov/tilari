import { useEffect, useRef, useState } from 'react'
import { settlementShares } from '../../../book/modules/properties/domain/water'
import { useI18n } from '../../../i18n'
import { downloadFile } from '../../../shared/downloadFile'
import type { Lease, PropertyDetail, PropertyDoc } from '../api'
import { clearCardDraft, loadCardDraft, saveCardDraft, type DocEdit } from './editDraft'
import { saveErrorText } from './format'
import { useIssueFocus } from './formIssues'
import { FormIssueList } from './FormParts'
import { leaseDrafts } from './leaseDrafts'
import { fileSlug, letterCompany, useDocWriter, type CardInputs } from './useDocWriter'
import { buildSettlements, draftSettlement, newSettlement, settlementDrafts, settlementId, withShare, type SettlementDraft } from './waterDrafts'
import { WaterEditor } from './WaterEditor'
import { statementTitle, waterLetterPdf, waterLetterTitle } from './waterLetter'

/**
 * One water settlement card in edit, in place on the Vesimaksut tab, with its own Tallenna and
 * Peruuta. A save writes the object with only this settlement changed (or added, or removed);
 * the shares follow the stored leases.
 */
export function WaterCardEdit({
  detail,
  inputs,
  bookKey,
  restore = false,
  settlementKey,
  prefill,
  onSave,
  onClose,
  onDirty,
  onOpenVoucher,
}: {
  detail: PropertyDetail
  inputs: CardInputs
  /** The open book's session: the card's unsaved form is kept for it. */
  bookKey: string
  /** Opened from the address (back from a voucher): start from the form kept for this card, if any. */
  restore?: boolean
  /** The stored settlement in edit; null for a new one. */
  settlementKey: string | null
  /** A new settlement's first draft (e.g. from a suggestion); none: an empty settlement. */
  prefill?: SettlementDraft[]
  /** Saves the object as given and shows it; throws on a refused save. */
  onSave: (doc: PropertyDoc) => Promise<void>
  onClose: () => void
  /** Whether the card holds changes not saved. */
  onDirty: (dirty: boolean) => void
  onOpenVoucher: (voucherId: number) => void
}) {
  const { t } = useI18n()
  const doc = detail.doc
  const { partners, today } = inputs
  const cardId = `water:${settlementKey ?? 'new'}`
  const [kept] = useState(() => (restore ? loadCardDraft<SettlementDraft>(bookKey, detail.id, doc.rev, cardId) : null))
  const writer = useDocWriter(detail, inputs, kept?.docs)
  const [stored] = useState(() => settlementDrafts(doc.water_settlements))
  const [initial] = useState<SettlementDraft[]>(() =>
    settlementKey ? stored.filter((d) => d.base?.key === settlementKey) : (prefill ?? [newSettlement()]),
  )
  const [drafts, setDrafts] = useState(kept?.drafts ?? initial)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const others = stored.filter((d) => settlementKey == null || d.base?.key !== settlementKey)
  const dirty = JSON.stringify(drafts) !== JSON.stringify(initial) || writer.state.newDocs.length > 0

  const leases: Lease[] = doc.leases ?? []
  const tenants = new Map(leaseDrafts(leases, partners).map((l) => [l.key, l.tenant.trim()]))
  const leaseTenant = (lease: Lease) => tenants.get(lease.key) ?? ''

  useEffect(() => {
    onDirty(dirty)
  }, [dirty, onDirty])

  // The unsaved form, kept for the way back from a voucher (any voucher opened from the page).
  const { newDocs, toDelete } = writer.state
  useEffect(() => {
    if (dirty) saveCardDraft({ book: bookKey, id: detail.id, rev: doc.rev, card: cardId, drafts, docs: { newDocs, toDelete } })
    else clearCardDraft()
  }, [dirty, drafts, newDocs, toDelete, bookKey, detail.id, doc.rev, cardId])

  const fail = (err: unknown) => setError(err instanceof Error ? err.message : String(err))

  /** Every settlement of the object, this card's in its place (a new one last). */
  const withCard = (list: SettlementDraft[]) =>
    settlementKey ? stored.flatMap((d) => (d.base?.key === settlementKey ? list : [d])) : [...stored, ...list]

  /** The settlements as a save would store them, or this card's fields to fix. */
  const build = (list: SettlementDraft[]) =>
    buildSettlements(t, withCard(list), new Set(leases.map((l) => l.key)), new Set(list.map(settlementId)))

  /** A save was tried: from then on the fields to fix are marked as the form changes. */
  const [tried, setTried] = useState(false)
  /** Counts the saves that found fields to fix: each moves to the first of them. */
  const [refused, setRefused] = useState(0)
  const cardRef = useRef<HTMLDivElement>(null)
  const current = build(drafts)
  const issues = tried && 'issues' in current ? current.issues : []
  useIssueFocus(cardRef, refused)

  async function save(list: SettlementDraft[] = drafts) {
    setError(null)
    const built = build(list)
    if ('issues' in built) {
      setTried(true)
      setRefused((n) => n + 1)
      return
    }
    const next: PropertyDoc = { ...doc }
    if (built.length) next.water_settlements = built
    else delete next.water_settlements
    setSaving(true)
    try {
      await onSave(writer.withDocs(next))
      await writer.flushDeletes()
      clearCardDraft()
      onDirty(false)
      onClose()
    } catch (err) {
      setError(saveErrorText(t, err instanceof Error ? err.message : String(err)))
    } finally {
      setSaving(false)
    }
  }

  async function cancel() {
    try {
      await writer.discardUnsaved()
    } catch (err) {
      fail(err)
      return
    }
    clearCardDraft()
    onDirty(false)
    onClose()
  }

  /** Points the statement (`leaseKey` null) or the letter of `leaseKey`'s share at a voucher. */
  const setRef = (leaseKey: string | null, voucherId: string) =>
    setDrafts((prev) =>
      prev.map((d) => (leaseKey == null ? { ...d, voucherId } : { ...d, shares: withShare(d.shares, leaseKey, { voucherId }) })),
    )

  /** Writes the settlement letter to `leaseKey`'s tenant: a PDF on a new Liitetieto voucher, linked and downloaded. */
  async function createLetter(_i: number, leaseKey: string) {
    setError(null)
    const settlement = draftSettlement(drafts[0])
    const share = settlement ? settlementShares(settlement, leases).find((s) => s.lease.key === leaseKey) : undefined
    if (!settlement || !share) return
    const tenant = leaseTenant(share.lease)
    const pdf = waterLetterPdf(t, {
      company: letterCompany(inputs.company),
      tenant: writer.tenantOf(tenant),
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
      const id = await writer.createDoc(waterLetterTitle(t, detail.name, settlement.from, settlement.to), tenant, [
        new File([pdf as BlobPart], name, { type: 'application/pdf' }),
      ])
      setRef(leaseKey, String(id))
      downloadFile(pdf, name, 'application/pdf')
    } catch (err) {
      fail(err)
    }
  }

  /** Uploads the company's statement (`leaseKey` null) or the owner's own letter to a tenant, and picks it. */
  async function upload(_i: number, leaseKey: string | null, files: File[]) {
    if (!files.length) return
    setError(null)
    const d = drafts[0]
    // The title names the period, so Kitsas search finds the document.
    if (!d.from || !d.to) {
      setError(t('properties.water.needPeriod'))
      return
    }
    const lease = leaseKey != null ? leases.find((l) => l.key === leaseKey) : undefined
    const title = (leaseKey == null ? statementTitle : waterLetterTitle)(t, detail.name, d.from, d.to)
    try {
      setRef(leaseKey, String(await writer.createDoc(title, lease ? leaseTenant(lease) : '', files)))
    } catch (err) {
      fail(err)
    }
  }

  /**
   * Deletes documents written from a form (after asking), clears what pointed at them, then applies
   * `edit`. An edit that leaves no settlement removes it: a stored one goes from the object at once
   * (after asking), a new one is simply not added.
   */
  async function deleteDocs(voucherIds: number[], edit: DocEdit = {}) {
    setError(null)
    let gone: Set<string> | null
    try {
      gone = await writer.deleteOwn(voucherIds)
    } catch (err) {
      fail(err)
      return
    }
    if (!gone) return
    const cleared = drafts.map((d) => ({
      ...d,
      voucherId: gone.has(d.voucherId) ? '' : d.voucherId,
      shares: d.shares.map((s) => (gone.has(s.voucherId) ? { ...s, voucherId: '' } : s)),
    }))
    const next = edit.water ? edit.water(cleared) : cleared
    if (next.length) {
      setDrafts(next)
      return
    }
    if (!settlementKey) {
      await cancel()
      return
    }
    setDrafts(cleared)
    if (window.confirm(t('properties.water.confirmRemove'))) await save([])
  }

  return (
    <div ref={cardRef} className="property-lease-card property-lease-card-edit property-water-card-edit">
      <WaterEditor
        drafts={drafts}
        onChange={setDrafts}
        otherDrafts={others}
        leases={leases}
        tenantName={(lease) => leaseTenant(lease) || t('properties.lease.tenantUnknown')}
        docs={writer.allDocs}
        lines={detail.water.lines}
        candidates={detail.water.statement_candidates}
        onCreateLetter={createLetter}
        onUpload={upload}
        isCreated={writer.isCreated}
        onDeleteDocs={deleteDocs}
        onOpenVoucher={onOpenVoucher}
        issues={issues}
      />
      <FormIssueList issues={issues} />
      {error ? <p className="error">{error}</p> : null}
      <div className="property-actions">
        <button type="button" className="btn-primary" disabled={saving || detail.read_only} onClick={() => void save()}>
          {saving ? t('common.saving') : t('common.save')}
        </button>
        <button type="button" className="btn-secondary" disabled={saving} onClick={() => void cancel()}>
          {t('common.cancel')}
        </button>
      </div>
    </div>
  )
}
