import { useEffect, useState } from 'react'
import { isParkingKind } from '../../../book/modules/properties/domain/kind'
import { useI18n } from '../../../i18n'
import { formatDate } from '../../../shared/dates'
import { downloadFile } from '../../../shared/downloadFile'
import { parseEurInput } from '../../../shared/money'
import type { PropertyDetail, PropertyDoc } from '../api'
import { clearCardDraft, loadCardDraft, saveCardDraft, type DocEdit } from './editDraft'
import { clauseText, saveErrorText } from './format'
import { increaseNoticePdf, noticeTitle, type NoticeAmounts } from './increaseNotice'
import { buildLeases, leaseDrafts, newLease, withKeys, type AmountsDraft, type LeaseDraft } from './leaseDrafts'
import { LeasesEditor } from './LeasesEditor'
import { fileSlug, letterCompany, useDocWriter, type CardInputs } from './useDocWriter'

const cents = (a: AmountsDraft, withParking: boolean): NoticeAmounts => ({
  rent: parseEurInput(a.rent),
  water: parseEurInput(a.water),
  parking: withParking ? parseEurInput(a.parking) : 0,
})

/**
 * One lease card in edit, in place on the Vuokrasuhteet tab: the lease's form with its own Tallenna
 * and Peruuta. A save writes the object with only this lease changed (or added, or removed); the
 * other leases go through the same checks, so an overlap shows here.
 */
export function LeaseCardEdit({
  detail,
  inputs,
  bookKey,
  restore = false,
  leaseKey,
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
  /** The stored lease in edit; null for a new one. */
  leaseKey: string | null
  /** A new lease's first draft (e.g. from a suggestion); none: an empty lease. */
  prefill?: LeaseDraft[]
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
  const cardId = `lease:${leaseKey ?? 'new'}`
  const [kept] = useState(() => (restore ? loadCardDraft(bookKey, detail.id, doc.rev, cardId) : null))
  const writer = useDocWriter(detail, inputs, kept?.docs)
  const [stored] = useState(() => withKeys(leaseDrafts(doc.leases, partners)))
  const [initial] = useState<LeaseDraft[]>(() => {
    if (leaseKey) return stored.filter((d) => d.key === leaseKey)
    return withKeys([...stored, ...(prefill ?? [newLease()])]).slice(stored.length)
  })
  const [drafts, setDrafts] = useState(kept?.drafts ?? initial)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const others = stored.filter((d) => d.key !== leaseKey)
  const dirty = JSON.stringify(drafts) !== JSON.stringify(initial) || writer.state.newDocs.length > 0

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

  /** Every lease of the object, this card's in its place (a new one last). */
  const withCard = (list: LeaseDraft[]) =>
    leaseKey ? stored.flatMap((d) => (d.key === leaseKey ? list : [d])) : [...stored, ...list]

  async function save(list: LeaseDraft[] = drafts) {
    setError(null)
    const built = buildLeases(t, withCard(list), partners)
    if (typeof built === 'string') {
      setError(built)
      return
    }
    setSaving(true)
    try {
      await onSave(writer.withDocs({ ...doc, leases: built }))
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

  /** Points the contract (`k` null) or increase `k`'s notice at a voucher. */
  const setRef = (k: number | null, voucherId: string) =>
    setDrafts((prev) =>
      prev.map((l) =>
        k == null ? { ...l, contractId: voucherId } : { ...l, increases: l.increases.map((r, ri) => (ri === k ? { ...r, voucherId } : r)) },
      ),
    )

  /** Writes the notice for increase `k`: a PDF on a new Liitetieto voucher, linked and downloaded. */
  async function createNotice(_i: number, k: number) {
    setError(null)
    const lease = drafts[0]
    const increase = lease.increases[k]
    const before = k === 0 ? lease.initial : lease.increases[k - 1]
    const contract = writer.docById.get(Number(lease.contractId))
    const built = buildLeases(t, [lease], partners)
    const rule = typeof built === 'string' ? undefined : built[0]?.increase
    const pdf = increaseNoticePdf(t, {
      company: letterCompany(inputs.company),
      tenant: writer.tenantOf(lease.tenant),
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
      const id = await writer.createDoc(noticeTitle(t, detail.name, increase.from), lease.tenant, [
        new File([pdf as BlobPart], name, { type: 'application/pdf' }),
      ])
      setRef(k, String(id))
      downloadFile(pdf, name, 'application/pdf')
    } catch (err) {
      fail(err)
    }
  }

  /** Uploads the owner's own contract (`k` null) or increase notice as a new Liitetieto voucher and picks it. */
  async function upload(_i: number, k: number | null, files: File[]) {
    if (!files.length) return
    setError(null)
    const lease = drafts[0]
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
      setRef(k, String(await writer.createDoc(title, lease.tenant, files)))
    } catch (err) {
      fail(err)
    }
  }

  /** Uploads the agreement on exception `k` as a new Liitetieto voucher and picks it. */
  async function uploadException(_i: number, k: number, files: File[]) {
    if (!files.length) return
    setError(null)
    const lease = drafts[0]
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
      const id = String(await writer.createDoc(title, lease.tenant, files))
      setDrafts((prev) => prev.map((l) => ({ ...l, exceptions: l.exceptions.map((x, ei) => (ei === k ? { ...x, voucherId: id } : x)) })))
    } catch (err) {
      fail(err)
    }
  }

  /**
   * Deletes documents written from a form (after asking), clears what pointed at them, then applies
   * `edit`. An edit that leaves no lease removes it: a stored lease goes from the object at once
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
    const cleared = drafts.map((l) => ({
      ...l,
      contractId: gone.has(l.contractId) ? '' : l.contractId,
      increases: l.increases.map((r) => (gone.has(r.voucherId) ? { ...r, voucherId: '' } : r)),
      exceptions: l.exceptions.map((e) => (gone.has(e.voucherId) ? { ...e, voucherId: '' } : e)),
    }))
    const next = edit.leases ? edit.leases(cleared) : cleared
    if (next.length) {
      setDrafts(next)
      return
    }
    if (!leaseKey) {
      await cancel()
      return
    }
    setDrafts(cleared)
    if (window.confirm(t('properties.edit.confirmRemoveLease'))) await save([])
  }

  return (
    <div className="property-lease-card property-lease-card-edit">
      <LeasesEditor
        drafts={drafts}
        onChange={(next) => setDrafts(withKeys([...others, ...next]).slice(others.length))}
        partners={partners}
        docs={writer.allDocs}
        suggestions={[]}
        deposits={detail.deposit_candidates}
        objectId={detail.id}
        today={today}
        onCreateNotice={createNotice}
        onUpload={upload}
        onUploadException={uploadException}
        isCreated={writer.isCreated}
        onDeleteDocs={deleteDocs}
        onOpenVoucher={onOpenVoucher}
        parkingObject={isParkingKind(detail.kind)}
        single
        otherDrafts={others}
      />
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
