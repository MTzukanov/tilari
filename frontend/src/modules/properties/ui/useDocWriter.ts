/**
 * Documents a card form writes while it is open (an increase notice, an uploaded contract or
 * agreement): new Liitetieto vouchers, linked to the object when the card is saved, and deletable
 * from the card until then (and later, as the object's own `created_voucher_ids`).
 * The edit page keeps its own copy of this until it goes (plan: property-edit-in-place.md, step 4).
 */
import { useState } from 'react'
import { deleteVoucher, saveVoucher, uploadAttachment } from '../../../api'
import { useI18n } from '../../../i18n'
import type { DocCandidate, PropertyDetail, PropertyDoc, VoucherFile } from '../api'
import type { LetterCompany } from './letter'
import type { Partner } from './leaseDrafts'
import { candidateDoc } from './waterDrafts'

/** What a card form needs besides the object: loaded once, when the first card opens. */
export type CardInputs = {
  /** Liitetieto vouchers to pick from (`fetchPropertySetup().docs`). */
  docs: DocCandidate[]
  partners: Partner[]
  /** The book's company details (Asetus), for letters. */
  company: Record<string, string>
  /** The book's date (a practice book's simulated day): letters and their vouchers carry it. */
  today: string
}

/** The book's company details (Asetus) as a letter's sender. */
export function letterCompany(company: Record<string, string>): LetterCompany {
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
export function fileSlug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
}

export type DocWriterState = { newDocs: DocCandidate[]; toDelete: number[] }

export function useDocWriter(detail: PropertyDetail, inputs: CardInputs, init?: DocWriterState) {
  const { t } = useI18n()
  /** Documents written on this card: pickable before the card is saved. */
  const [newDocs, setNewDocs] = useState<DocCandidate[]>(init?.newDocs ?? [])
  /** Earlier documents written from a form that the owner deleted here: deleted from the book on save. */
  const [toDelete, setToDelete] = useState<number[]>(init?.toDelete ?? [])
  const { partners, today } = inputs

  const storedCreated = new Set(detail.doc.created_voucher_ids ?? [])
  /** A document written from a form, deletable from here: an earlier one (stored) or this card's. */
  const isCreated = (id: number) =>
    !toDelete.includes(id) && (storedCreated.has(id) || newDocs.some((d) => d.voucher_id === id))
  /** The Liitetieto vouchers to pick from: the book's and this card's, less those to delete on save. */
  const allDocs = [...inputs.docs, ...newDocs].filter((d) => !toDelete.includes(d.voucher_id))
  // A water settlement's statement can be an invoice: linked, it is one of the object's documents too.
  const docById = new Map([...detail.water.statement_candidates.map(candidateDoc), ...allDocs].map((d) => [d.voucher_id, d]))

  const addresses = new Map(
    [...detail.leases, ...detail.lease_suggestions.map((s) => s.view)].flatMap((v) =>
      v.tenant_partner_id != null ? [[v.tenant_partner_id, v.tenant_address] as const] : [],
    ),
  )
  const partnerOf = (name: string) => partners.find((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase())
  /** A letter's addressee: the tenant's name and, for a book partner, the address the book has. */
  const tenantOf = (name: string) => {
    const partner = partnerOf(name)
    return { name: name.trim(), address: (partner && addresses.get(partner.id)) || [] }
  }

  /** A new posted Liitetieto voucher with these files, the tenant as partner; this card's document. */
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
    const uploaded: VoucherFile[] = []
    for (const file of files) {
      const attachment = await uploadAttachment(saved.id, file)
      uploaded.push({ id: attachment.id, name: file.name })
    }
    setNewDocs((prev) => [
      ...prev,
      {
        voucher_id: saved.id,
        date: today,
        title,
        doc_number: saved.doc_number || null,
        series: saved.series || null,
        attachments: files.length,
        files: uploaded,
        linked_to: [],
        suggestion: null,
      },
    ])
    return saved.id
  }

  /**
   * Deletes documents written from a form, after asking: this card's at once (an undo), earlier ones
   * when the card is saved. Returns the ids now gone from the form (to clear what pointed at them),
   * or null when the owner said no. Other documents are never deleted here.
   */
  async function deleteOwn(voucherIds: number[]): Promise<Set<string> | null> {
    const own = [...new Set(voucherIds)].filter(isCreated)
    if (!own.length) return new Set()
    const titles = own.map((id) => docById.get(id)?.title ?? `#${id}`)
    if (!window.confirm(t('properties.edit.confirmDeleteDoc', { titles: titles.join(', ') }))) return null
    const now = own.filter((id) => newDocs.some((d) => d.voucher_id === id))
    for (const id of now) await deleteVoucher(id)
    setNewDocs((prev) => prev.filter((d) => !now.includes(d.voucher_id)))
    setToDelete((prev) => [...prev, ...own.filter((id) => !now.includes(id))])
    return new Set(own.map(String))
  }

  /** On Peruuta: this card's documents, not saved to the object, are kept (a notice may be sent) or deleted. */
  async function discardUnsaved() {
    const unsaved = newDocs.map((d) => d.voucher_id)
    if (unsaved.length && window.confirm(t('properties.edit.confirmDeleteUnsaved', { n: unsaved.length }))) {
      for (const id of unsaved) await deleteVoucher(id)
    }
  }

  /** `next` with this card's documents linked to the object and the deleted ones dropped. */
  function withDocs(next: PropertyDoc): PropertyDoc {
    const fresh = newDocs.map((d) => d.voucher_id)
    const out = { ...next }
    const linked = [...new Set([...(next.doc_voucher_ids ?? []), ...fresh])].filter((id) => !toDelete.includes(id))
    if (linked.length) out.doc_voucher_ids = linked
    else delete out.doc_voucher_ids
    const created = [...new Set([...(next.created_voucher_ids ?? []), ...fresh])].filter((id) => !toDelete.includes(id))
    if (created.length) out.created_voucher_ids = created
    else delete out.created_voucher_ids
    return out
  }

  /** After a save: earlier documents the owner deleted go from the book once nothing points at them. */
  async function flushDeletes() {
    for (const id of toDelete) await deleteVoucher(id)
  }

  return {
    state: { newDocs, toDelete } as DocWriterState,
    allDocs,
    docById,
    isCreated,
    tenantOf,
    createDoc,
    deleteOwn,
    discardUnsaved,
    withDocs,
    flushDeletes,
  }
}

export type DocWriter = ReturnType<typeof useDocWriter>
