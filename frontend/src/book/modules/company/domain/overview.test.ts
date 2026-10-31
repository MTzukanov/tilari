import { beforeEach, describe, expect, it } from 'vitest'
import { readTilariData } from '../../../kernel/tilariData'
import { buildCompanyFixture, type CompanyFixture } from '../testFixture'
import { parseCompanyDoc } from './doc'
import { computeAlerts, computeOverview, fetchCandidates, isLimitedCompany, saveChanges } from './overview'
import { COMPANY_KEY, type CompanyChanges, type CompanyOverview, type PeriodView } from './types'

const AS_OF = '2033-12-01'
const NOW = '2033-12-01T10:00:00.000Z'

let fx: CompanyFixture

beforeEach(async () => {
  fx = await buildCompanyFixture()
})

function overview(asOf = AS_OF): CompanyOverview {
  return computeOverview(fx.db, { today: asOf, asOf })
}

function period(ends: string, asOf = AS_OF): PeriodView {
  return overview(asOf).periods.find((p) => p.ends === ends)!
}

function slot(ends: string, kind: string) {
  return period(ends).slots.find((s) => s.kind === kind)!
}

function save(changes: CompanyChanges) {
  return saveChanges(fx.db, changes, NOW)
}

function addAll() {
  const data = overview()
  const suggestions = [...data.company_slots.flatMap((s) => s.suggestions), ...data.periods.flatMap((p) => p.slots.flatMap((s) => s.suggestions))]
  save({
    add: suggestions.map((s) => ({ kind: s.kind, period_ends: s.period_ends, voucher_id: s.voucher_id, attachment_id: s.attachment_id })),
  })
}

describe('the company overview', () => {
  it('lists the periods newest first, locked by the book', () => {
    const { periods } = overview()
    expect(periods.map((p) => p.ends)).toEqual(['2034-12-31', '2033-12-31', '2032-12-31', '2031-12-31'])
    expect(periods.map((p) => p.locked)).toEqual([false, false, true, true])
    expect(periods.map((p) => p.ended)).toEqual([false, false, true, true])
  })

  it('leaves out a period that only opens the books', () => {
    fx.db.run("INSERT OR REPLACE INTO Asetus (avain, arvo) VALUES ('TilinavausPvm', '2031-12-31')")
    expect(overview().periods.map((p) => p.ends)).not.toContain('2031-12-31')
  })

  it('finds the documents the book already holds, without storing anything', () => {
    expect(slot('2031-12-31', 'financial_statements').suggestions.map((s) => s.voucher_id)).toEqual([fx.vouchers.statements2031])
    expect(slot('2031-12-31', 'agm_minutes').suggestions.map((s) => s.voucher_id)).toEqual([fx.vouchers.agm2032])
    expect(slot('2032-12-31', 'financial_statements').suggestions.map((s) => s.file_name)).toEqual(['Signeerattu tilinpäätös 2032.pdf'])
    expect(slot('2032-12-31', 'audit_report').suggestions.map((s) => s.file_name)).toEqual(['Signeerattu tt-kertomus 2032.pdf'])
    expect(slot('2032-12-31', 'agm_minutes').suggestions.map((s) => s.file_name)).toEqual(['Yhtiokokouksen poytakirja 2033.pdf'])
    expect(slot('2032-12-31', 'board_minutes').suggestions.map((s) => s.file_name)).toEqual(['Hallituksen poytakirja.pdf'])
    expect(slot('2032-12-31', 'other').suggestions.map((s) => s.file_name)).toEqual(['Ylimaarainen yhtiokokous poytakirja 2033.pdf'])
    expect(slot('2032-12-31', 'tax_decision').suggestions.map((s) => s.voucher_id)).toEqual([fx.vouchers.taxDecision])
    const data = overview()
    expect(data.company_slots.find((s) => s.kind === 'articles')!.suggestions.map((s) => s.voucher_id)).toEqual([fx.vouchers.articles])
    expect(data.company_slots.find((s) => s.kind === 'trade_register_extract')!.suggestions.map((s) => s.voucher_id)).toEqual([fx.vouchers.extract])
    expect(data.suggestion_count).toBe(10)
    expect(readTilariData(fx.db, COMPANY_KEY)).toBeNull()
  })

  it('suggests nothing from look-alikes, deleted vouchers, drafts or rental documents', () => {
    const data = overview()
    const suggested = new Set([...data.company_slots.flatMap((s) => s.suggestions), ...data.periods.flatMap((p) => p.slots.flatMap((s) => s.suggestions))].map((s) => s.voucher_id))
    for (const key of ['vatReturn', 'transferTax', 'statementInvoice', 'hexName', 'deleted', 'draft', 'plain', 'rentalDoc', 'taxPayment']) {
      expect(suggested.has(fx.vouchers[key]), key).toBe(false)
    }
  })

  it('names slots by what is linked, required and due', () => {
    expect(slot('2031-12-31', 'agm_minutes')).toMatchObject({ required: true, status: 'missing' })
    expect(slot('2031-12-31', 'board_minutes')).toMatchObject({ required: false, status: 'optional' })
    expect(slot('2031-12-31', 'annual_report')).toMatchObject({ required: false, status: 'optional' })
    expect(slot('2031-12-31', 'tax_decision')).toMatchObject({ required: true, status: 'waiting' })
    expect(period('2034-12-31').slots.find((s) => s.kind === 'agm_minutes')!.status).toBe('waiting')
  })

  it('fills a slot with a link and counts it', () => {
    save({ add: [{ kind: 'agm_minutes', period_ends: '2031-12-31', voucher_id: fx.vouchers.agm2032 }] })
    const s = slot('2031-12-31', 'agm_minutes')
    expect(s.status).toBe('complete')
    expect(s.documents[0]).toMatchObject({ state: 'ok', title: 'Yhtiökokous 2032', date: '2032-04-20', attachment_id: null })
    expect(s.documents[0].files.map((f) => f.name)).toEqual(['kokous-poytakirja-2032.pdf'])
    expect(s.suggestions).toEqual([])
    expect(period('2031-12-31').docs).toEqual({ done: 1, required: 6 })
    expect(period('2031-12-31').deadlines.find((d) => d.key === 'agm')!.state).toBe('done')
  })

  it('makes required what the settings say', () => {
    save({ settings: { audited: true, annual_report: true } })
    expect(slot('2031-12-31', 'audit_report')).toMatchObject({ required: true, status: 'missing' })
    expect(slot('2031-12-31', 'annual_report')).toMatchObject({ required: true, status: 'missing' })
    expect(period('2031-12-31').docs).toEqual({ done: 0, required: 8 })
  })

  it('takes a slot marked not needed out of the count and the deadline', () => {
    save({ not_needed: [{ period_ends: '2031-12-31', kind: 'tax_return_6b', value: true }] })
    expect(slot('2031-12-31', 'tax_return_6b').status).toBe('not_needed')
    expect(period('2031-12-31').docs).toEqual({ done: 0, required: 5 })
    expect(period('2031-12-31').deadlines.find((d) => d.key === 'tax_return')!.state).toBe('not_needed')
  })

  it('links one file of a voucher, and each file to its own slot', () => {
    save({ add: [{ kind: 'audit_report', period_ends: '2032-12-31', voucher_id: fx.vouchers.decision2033, attachment_id: fx.files['Signeerattu tt-kertomus 2032.pdf'] }] })
    const doc = slot('2032-12-31', 'audit_report').documents[0]
    expect(doc.files.map((f) => f.name)).toEqual(['Signeerattu tt-kertomus 2032.pdf'])
    // The voucher's other files are still suggested.
    expect(slot('2032-12-31', 'financial_statements').suggestions).toHaveLength(1)
  })

  it('shows a link broken later for what it is, and it no longer fills the slot', () => {
    save({ add: [{ kind: 'agm_minutes', period_ends: '2031-12-31', voucher_id: fx.vouchers.agm2032 }] })
    fx.db.run('UPDATE Tosite SET tila = 0 WHERE id = ?', [fx.vouchers.agm2032])
    expect(slot('2031-12-31', 'agm_minutes')).toMatchObject({ status: 'missing', documents: [{ state: 'missing', title: '', date: null, files: [] }] })
    expect(period('2031-12-31').problems).toBe(1)

    fx.db.run('UPDATE Tosite SET tila = 50 WHERE id = ?', [fx.vouchers.agm2032])
    expect(slot('2031-12-31', 'agm_minutes')).toMatchObject({ status: 'missing', documents: [{ state: 'draft' }] })

    fx.db.run('DELETE FROM Tosite WHERE id = ?', [fx.vouchers.agm2032])
    expect(slot('2031-12-31', 'agm_minutes').documents[0].state).toBe('missing')
  })

  it('shows a linked file that was deleted', () => {
    const file = fx.files['Signeerattu tt-kertomus 2032.pdf']
    save({ add: [{ kind: 'audit_report', period_ends: '2032-12-31', voucher_id: fx.vouchers.decision2033, attachment_id: file }] })
    fx.db.run('DELETE FROM Liite WHERE id = ?', [file])
    expect(slot('2032-12-31', 'audit_report')).toMatchObject({ documents: [{ state: 'file_missing', files: [] }] })
  })

  it('keeps links of a period that no longer exists in sight', () => {
    save({ add: [{ kind: 'agm_minutes', period_ends: '2031-12-31', voucher_id: fx.vouchers.agm2032 }] })
    fx.db.run("UPDATE Tilikausi SET loppuu = '2031-11-30' WHERE loppuu = '2031-12-31'")
    expect(overview().orphans.map((d) => d.voucher_id)).toEqual([fx.vouchers.agm2032])
  })

  it("shows Kitsas's own statement PDF, which marks the statements prepared but fills no slot", () => {
    const p = period('2031-12-31')
    expect(p.kitsas_statement?.attachment_id).toBe(fx.files['tilinpaatos.pdf'])
    expect(p.deadlines.find((d) => d.key === 'statements_prepared')!.state).toBe('done')
    expect(p.slots.find((s) => s.kind === 'financial_statements')!.status).toBe('missing')
    expect(period('2032-12-31').kitsas_statement).toBeNull()
  })

  it('reports the day confirmed in the statement, not as the AGM', () => {
    fx.db.run(`UPDATE Tilikausi SET json = '{"vahvistettu":"2032-09-09"}' WHERE loppuu = '2031-12-31'`)
    const p = period('2031-12-31')
    expect(p.confirmed_at).toBe('2032-09-09')
    expect(p.deadlines.find((d) => d.key === 'agm')!.state).not.toBe('done')
  })

  it('lists documents linked nowhere, under the period after which they are dated', () => {
    const data = overview()
    const ids = data.unlinked.map((u) => u.voucher_id)
    expect(ids).toContain(fx.vouchers.plain)
    expect(ids).not.toContain(fx.vouchers.rentalDoc)
    expect(ids).not.toContain(fx.vouchers.deleted)
    expect(ids).not.toContain(fx.vouchers.draft)
    expect(ids).not.toContain(fx.vouchers.decision2033)
    expect(new Set(ids).size).toBe(ids.length)
    expect(period('2032-12-31').unlinked.map((u) => u.voucher_id)).toContain(fx.vouchers.plain)
    expect(period('2031-12-31').unlinked.map((u) => u.voucher_id)).not.toContain(fx.vouchers.plain)

    save({ add: [{ kind: 'other', period_ends: '2032-12-31', voucher_id: fx.vouchers.plain }] })
    expect(overview().unlinked.map((u) => u.voucher_id)).not.toContain(fx.vouchers.plain)
  })

  it('lists what is due in order, and only the near and the recently missed', () => {
    const { next_deadlines: due } = overview()
    expect(due.map((d) => `${d.period_ends}:${d.key}`)).toEqual(['2032-12-31:statements_prepared', '2032-12-31:tax_return', '2032-12-31:agm', '2032-12-31:prh_filing'])
    expect(due.map((d) => d.state)).toEqual(['overdue', 'overdue', 'overdue', 'overdue'])
    // Earlier in the year, the period before is within its year of being missed, and this one is near.
    expect(overview('2033-04-10').next_deadlines.map((d) => `${d.period_ends}:${d.key}:${d.state}`)).toEqual([
      '2031-12-31:tax_return:overdue',
      '2031-12-31:agm:overdue',
      '2031-12-31:prh_filing:overdue',
      '2032-12-31:statements_prepared:upcoming',
      '2032-12-31:tax_return:upcoming',
    ])
  })

  it('reads an unchanged book the same way twice', () => {
    expect(overview()).toEqual(overview())
  })
})

describe('the header count', () => {
  it('counts what the page lists', () => {
    expect(computeAlerts(fx.db, { today: AS_OF, asOf: AS_OF })).toEqual({ applicable: true, deadlines: overview().next_deadlines.length })
    save({ add: [{ kind: 'agm_minutes', period_ends: '2032-12-31', voucher_id: fx.vouchers.decision2033, attachment_id: fx.files['Yhtiokokouksen poytakirja 2033.pdf'] }] })
    expect(computeAlerts(fx.db, { today: AS_OF, asOf: AS_OF }).deadlines).toBe(3)
    expect(overview().next_deadlines).toHaveLength(3)
  })

  it('does not count a link to a deleted voucher as done', () => {
    save({ add: [{ kind: 'agm_minutes', period_ends: '2032-12-31', voucher_id: fx.vouchers.agm2032 }] })
    fx.db.run('UPDATE Tosite SET tila = 0 WHERE id = ?', [fx.vouchers.agm2032])
    expect(computeAlerts(fx.db, { today: AS_OF, asOf: AS_OF }).deadlines).toBe(4)
  })

  it('applies to limited companies and to books that do not say', () => {
    expect(isLimitedCompany(fx.db)).toBe(true)
    fx.db.run("INSERT OR REPLACE INTO Asetus (avain, arvo) VALUES ('muoto', 'oy')")
    expect(isLimitedCompany(fx.db)).toBe(true)
    fx.db.run("UPDATE Asetus SET arvo = 'tmi' WHERE avain = 'muoto'")
    expect(computeAlerts(fx.db, { today: AS_OF, asOf: AS_OF })).toEqual({ applicable: false, deadlines: 0 })
    fx.db.run("DELETE FROM Asetus WHERE avain = 'muoto'")
    expect(isLimitedCompany(fx.db)).toBe(true)
  })
})

describe('picking a voucher to link', () => {
  it('offers documents and fitting files, one row per file', () => {
    const rows = fetchCandidates(fx.db, false)
    const names = rows.map((r) => r.file_name)
    expect(names).toContain('muistio.pdf')
    expect(names).toContain('Signeerattu tt-kertomus 2032.pdf')
    expect(names).not.toContain('Varainsiirtoveroilmoitus_01.06.2032.pdf')
    expect(names).not.toContain('poistettu.pdf')
    expect(names).not.toContain('luonnos.pdf')
    const decision = rows.filter((r) => r.voucher_id === fx.vouchers.decision2033)
    expect(decision.map((r) => r.attachment_id)).toEqual(decision.map((r) => r.file_id))
  })

  it('offers a voucher with one file as the whole voucher', () => {
    const row = fetchCandidates(fx.db, false).find((r) => r.voucher_id === fx.vouchers.plain)!
    expect(row).toMatchObject({ attachment_id: null, file_id: fx.files['muistio.pdf'], file_name: 'muistio.pdf' })
  })

  it('offers a document without files, and every other voucher file only when asked', () => {
    const empty = fx.voucher('empty', '2033-04-01', 800, 'Tyhjä asiakirja')
    expect(fetchCandidates(fx.db, false).find((r) => r.voucher_id === empty)).toMatchObject({ attachment_id: null, file_id: null, file_name: '' })
    const all = fetchCandidates(fx.db, true).map((r) => r.file_name)
    expect(all).toContain('Varainsiirtoveroilmoitus_01.06.2032.pdf')
    expect(all).not.toContain('alv.pdf')
    expect(all).not.toContain('poistettu.pdf')
  })

  it('marks what is already linked', () => {
    save({ add: [{ kind: 'other', period_ends: '2032-12-31', voucher_id: fx.vouchers.plain }] })
    expect(fetchCandidates(fx.db, false).find((r) => r.voucher_id === fx.vouchers.plain)!.linked).toBe(true)
  })
})

describe('saving changes', () => {
  it('writes only TilariData, also for a closed year', () => {
    const counts = () =>
      ['Tosite', 'Vienti', 'Liite', 'Tositeloki', 'Asetus', 'Tilikausi'].map((t) => Number(fx.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t}`)!.n))
    const before = counts()
    expect(save({ add: [{ kind: 'agm_minutes', period_ends: '2031-12-31', voucher_id: fx.vouchers.agm2032 }] })).toBe(true)
    expect(counts()).toEqual(before)
    expect(parseCompanyDoc(readTilariData(fx.db, COMPANY_KEY)).doc.documents).toHaveLength(1)
  })

  it('adds every suggestion at once and leaves none behind', () => {
    addAll()
    expect(overview().suggestion_count).toBe(0)
    expect(parseCompanyDoc(readTilariData(fx.db, COMPANY_KEY)).doc.documents).toHaveLength(10)
    expect(period('2032-12-31').slots.find((s) => s.kind === 'financial_statements')!.status).toBe('complete')
    expect(overview().documents.every((d) => d.state === 'ok')).toBe(true)
  })

  it('removes a link and suggests the file again; a rejected one stays away', () => {
    save({ add: [{ kind: 'agm_minutes', period_ends: '2031-12-31', voucher_id: fx.vouchers.agm2032 }] })
    const key = overview().documents[0].key
    save({ remove: [key] })
    const suggestion = slot('2031-12-31', 'agm_minutes').suggestions[0]
    expect(suggestion.voucher_id).toBe(fx.vouchers.agm2032)
    save({ dismissed: [suggestion.key] })
    expect(slot('2031-12-31', 'agm_minutes').suggestions).toEqual([])
  })

  it('writes nothing for what is already stored', () => {
    const add = { kind: 'agm_minutes', period_ends: '2031-12-31', voucher_id: fx.vouchers.agm2032 }
    expect(save({ add: [add] })).toBe(true)
    const stored = readTilariData(fx.db, COMPANY_KEY)
    expect(save({ add: [add] })).toBe(false)
    expect(readTilariData(fx.db, COMPANY_KEY)).toBe(stored)
  })

  it.each([
    ['a period that does not exist', { kind: 'agm_minutes', period_ends: '2099-12-31' }, 'unknown_period'],
    ['a kind that does not exist', { kind: 'shares', period_ends: '2031-12-31' }, 'unknown_kind'],
  ])('refuses %s', (_name, add, code) => {
    expect(() => save({ add: [{ ...add, voucher_id: fx.vouchers.agm2032 }] })).toThrow(code)
  })

  it('refuses a draft, a deleted voucher and one that is not there', () => {
    const add = { kind: 'agm_minutes', period_ends: '2031-12-31' }
    expect(() => save({ add: [{ ...add, voucher_id: fx.vouchers.draft }] })).toThrow('voucher_not_posted')
    expect(() => save({ add: [{ ...add, voucher_id: fx.vouchers.deleted }] })).toThrow('voucher_not_posted')
    expect(() => save({ add: [{ ...add, voucher_id: 99999 }] })).toThrow('voucher_not_posted')
  })

  it("refuses another voucher's file and a system file", () => {
    const add = { kind: 'agm_minutes', period_ends: '2031-12-31', voucher_id: fx.vouchers.agm2032 }
    expect(() => save({ add: [{ ...add, attachment_id: fx.files['muistio.pdf'] }] })).toThrow('attachment_not_on_voucher')
    expect(() => save({ add: [{ ...add, voucher_id: fx.vouchers.vatReturn, attachment_id: fx.files['alv.pdf'] }] })).toThrow('attachment_not_on_voucher')
  })

  it('refuses to remove a link that is not there', () => {
    expect(() => save({ remove: ['d99'] })).toThrow('unknown_link')
  })
})
