/** Voucher files offered for a link. Never reads `Liite.data` (the working copy is lean). */
import { readTilariDataPrefix } from '../../../kernel/tilariData'
import { SQL_POSTED } from '../../../kernel/sqlFragments'
import type { SqliteDb } from '../../../sqlite'
import { TYPE_ATTACHMENT_NOTE } from '../../../vouchers'
import { isUserAttachment } from '../../properties/domain/documents'
import { PROPERTY_KEY_PREFIX } from '../../properties/domain/types'
import { kindsIn } from './suggest'
import type { CompanyDocument, DocCandidate } from './types'

/** Every posted voucher's user files, one row per file; a voucher without files gets one row. */
export function loadVoucherFiles(db: SqliteDb, documents: CompanyDocument[]): DocCandidate[] {
  const rows = db.all<{
    id: number
    pvm: string
    tyyppi: number
    tunniste: number | null
    sarja: string | null
    otsikko: string | null
    att_id: number | null
    att_name: string | null
    att_role: string | null
  }>(
    `SELECT Tosite.id AS id, Tosite.pvm AS pvm, Tosite.tyyppi AS tyyppi, Tosite.tunniste AS tunniste,
            Tosite.sarja AS sarja, Tosite.otsikko AS otsikko,
            Liite.id AS att_id, Liite.nimi AS att_name, Liite.roolinimi AS att_role
     FROM Tosite LEFT OUTER JOIN Liite ON Liite.tosite = Tosite.id
     WHERE ${SQL_POSTED}
     ORDER BY Tosite.pvm DESC, Tosite.id DESC, Liite.id`,
  )
  const files = new Map<number, { id: number; name: string }[]>()
  const vouchers = new Map<number, (typeof rows)[number]>()
  for (const row of rows) {
    const id = Number(row.id)
    if (!vouchers.has(id)) vouchers.set(id, row)
    if (!files.has(id)) files.set(id, [])
    if (row.att_id != null && isUserAttachment(row.att_role)) {
      files.get(id)!.push({ id: Number(row.att_id), name: String(row.att_name || row.att_role || `liite-${row.att_id}`) })
    }
  }
  const out: DocCandidate[] = []
  for (const [id, row] of vouchers) {
    const list = files.get(id)!
    const base = {
      voucher_id: id,
      date: String(row.pvm),
      title: String(row.otsikko || ''),
      type: Number(row.tyyppi),
      doc_number: row.tunniste == null || Number(row.tunniste) === 0 ? null : Number(row.tunniste),
      series: String(row.sarja || ''),
    }
    const linkedHere = documents.filter((d) => d.voucher_id === id)
    const whole = linkedHere.some((d) => d.attachment_id == null)
    if (!list.length) {
      // Only a document can be one without its files: other vouchers without files offer nothing.
      if (base.type === TYPE_ATTACHMENT_NOTE) {
        out.push({ ...base, attachment_id: null, file_id: null, file_name: '', linked: whole })
      }
      continue
    }
    for (const file of list) {
      out.push({
        ...base,
        // A voucher's only file is the voucher: the link survives the file being replaced.
        attachment_id: list.length === 1 ? null : file.id,
        file_id: file.id,
        file_name: file.name,
        linked: whole || linkedHere.some((d) => d.attachment_id === file.id),
      })
    }
  }
  return out
}

/** Documents of rental objects: already somewhere, so neither unlinked nor suggestions. */
export function propertyVoucherIds(db: SqliteDb): Set<number> {
  const out = new Set<number>()
  for (const { value } of readTilariDataPrefix(db, PROPERTY_KEY_PREFIX)) {
    try {
      const doc = JSON.parse(value) as { doc_voucher_ids?: unknown; sale_voucher_ids?: unknown }
      for (const list of [doc.doc_voucher_ids, doc.sale_voucher_ids]) {
        if (Array.isArray(list)) for (const id of list) if (typeof id === 'number') out.add(id)
      }
    } catch {
      // An unreadable object is that module's to report.
    }
  }
  return out
}

/** The picker's list: documents and files whose words fit a document, unless everything is asked for. */
export function selectCandidates(rows: DocCandidate[], all: boolean): DocCandidate[] {
  if (all) return rows
  return rows.filter((r) => {
    if (r.type === TYPE_ATTACHMENT_NOTE) return true
    const name = kindsIn(r.file_name)
    const title = kindsIn(r.title)
    return Boolean(name.period.length || name.company.length || title.period.length || title.company.length)
  })
}
