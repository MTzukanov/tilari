/**
 * Documents of one object: vouchers linked by the owner (usually type 800 Liitetieto), vouchers
 * reached through its balance-sheet items (purchase and sale deeds) and vouchers with a line on
 * its cost centre. Bank statements span many objects, so they are only counted unless asked.
 * Never reads `Liite.data` (the working copy is lean).
 */
import { SQL_POSTED } from '../../../kernel/sqlFragments'
import type { SqliteDb } from '../../../sqlite'
import { TYPE_ATTACHMENT_NOTE, TYPE_BANK_STATEMENT } from '../../../vouchers'
import type { DocumentGroupKind, DocumentVoucher, PropertyDocuments } from './types'

/** Kitsas system attachments (VAT report, statements, tax calculations) are not documents. */
function isUserAttachment(role: string | null): boolean {
  return !role || role === 'lasku'
}

function idList(ids: number[]): string {
  const safe = ids.filter((id) => Number.isSafeInteger(id))
  return safe.length ? safe.join(',') : 'NULL'
}

export function listPropertyDocuments(
  db: SqliteDb,
  opts: { allocations: number[]; eraids: number[]; linked: number[]; includeBank: boolean },
): PropertyDocuments {
  const rows = db.all<{
    voucher_id: number
    type: number
    date: string
    doc_number: number | null
    series: string | null
    title: string | null
    via: string
    att_id: number | null
    att_name: string | null
    att_type: string | null
    att_role: string | null
  }>(
    `WITH rel(tosite, via) AS (
       SELECT DISTINCT tosite, 'allocation' FROM Vienti WHERE COALESCE(kohdennus, 0) IN (${idList(opts.allocations)})
       UNION SELECT DISTINCT tosite, 'era' FROM Vienti WHERE eraid IN (${idList(opts.eraids)})
       UNION SELECT id, 'linked' FROM Tosite WHERE id IN (${idList(opts.linked)})
     )
     SELECT Tosite.id AS voucher_id, Tosite.tyyppi AS type, Tosite.pvm AS date, Tosite.tunniste AS doc_number,
            Tosite.sarja AS series, Tosite.otsikko AS title, rel.via AS via,
            Liite.id AS att_id, Liite.nimi AS att_name, Liite.tyyppi AS att_type, Liite.roolinimi AS att_role
     FROM rel
     JOIN Tosite ON Tosite.id = rel.tosite AND ${SQL_POSTED}
     LEFT OUTER JOIN Liite ON Liite.tosite = Tosite.id
     ORDER BY Tosite.pvm DESC, Tosite.id DESC, Liite.id`,
  )

  const vouchers = new Map<number, DocumentVoucher & { via: Set<string> }>()
  for (const row of rows) {
    const id = Number(row.voucher_id)
    let v = vouchers.get(id)
    if (!v) {
      v = {
        voucher_id: id,
        date: String(row.date),
        type: Number(row.type),
        doc_number: row.doc_number == null || Number(row.doc_number) === 0 ? null : Number(row.doc_number),
        series: String(row.series || ''),
        title: String(row.title || ''),
        missing: false,
        attachments: [],
        via: new Set(),
      }
      vouchers.set(id, v)
    }
    v.via.add(String(row.via))
    if (row.att_id != null && isUserAttachment(row.att_role) && !v.attachments.some((a) => a.id === Number(row.att_id))) {
      v.attachments.push({
        id: Number(row.att_id),
        name: String(row.att_name || row.att_role || `liite-${row.att_id}`),
        type: String(row.att_type || ''),
      })
    }
  }

  const groups: Record<DocumentGroupKind, DocumentVoucher[]> = { linked: [], acquisition: [], other: [], bank: [] }
  let bankHidden = 0
  for (const { via, ...v } of vouchers.values()) {
    if (via.has('linked')) groups.linked.push(v)
    else if (via.has('era')) groups.acquisition.push(v)
    else if (!v.attachments.length) continue
    else if (v.type === TYPE_BANK_STATEMENT) {
      if (opts.includeBank) groups.bank.push(v)
      else bankHidden += 1
    } else groups.other.push(v)
  }
  // Linked vouchers that are gone (deleted in Kitsas) are shown as missing.
  for (const id of opts.linked) {
    if (vouchers.has(id)) continue
    groups.linked.push({
      voucher_id: id,
      date: '',
      type: 0,
      doc_number: null,
      series: '',
      title: '',
      missing: true,
      attachments: [],
    })
  }
  return {
    groups: (['linked', 'acquisition', 'other', 'bank'] as const)
      .filter((kind) => groups[kind].length)
      .map((kind) => ({ kind, vouchers: groups[kind] })),
    bank_hidden: bankHidden,
  }
}

/** Posted type-800 vouchers (Liitetieto) with their attachment counts, for setup. */
export function listNoteVouchers(db: SqliteDb): {
  voucher_id: number
  date: string
  title: string
  doc_number: number | null
  attachments: number
}[] {
  return db
    .all<{ id: number; pvm: string; otsikko: string | null; tunniste: number | null; n: number }>(
      `SELECT Tosite.id AS id, Tosite.pvm AS pvm, Tosite.otsikko AS otsikko, Tosite.tunniste AS tunniste,
              (SELECT COUNT(*) FROM Liite WHERE Liite.tosite = Tosite.id) AS n
       FROM Tosite WHERE ${SQL_POSTED} AND Tosite.tyyppi = ${TYPE_ATTACHMENT_NOTE}
       ORDER BY Tosite.pvm DESC, Tosite.id DESC`,
    )
    .map((row) => ({
      voucher_id: Number(row.id),
      date: String(row.pvm),
      title: String(row.otsikko || ''),
      doc_number: row.tunniste == null || Number(row.tunniste) === 0 ? null : Number(row.tunniste),
      attachments: Number(row.n || 0),
    }))
}
