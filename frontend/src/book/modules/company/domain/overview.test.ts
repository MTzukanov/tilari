import { beforeEach, describe, expect, it } from 'vitest'
import { readTilariData } from '../../../kernel/tilariData'
import { saveVoucher } from '../../../posting'
import { TYPE_ATTACHMENT_NOTE, TYPE_BANK_STATEMENT, TYPE_INCOME_TAX, TYPE_OPENING, TYPE_OTHER, TYPE_TRANSFER } from '../../../vouchers'
import { buildCompanyFixture, type CompanyFixture } from '../testFixture'
import { decisionDraft, paymentDraft } from './dividendVouchers'
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
    expect(slot('2032-12-31', 'agm_minutes').suggestions.map((s) => s.file_name)).toEqual(['Yhtiokokouksen poytakirja 2033.pdf'])
    expect(slot('2032-12-31', 'board_minutes').suggestions.map((s) => s.file_name)).toEqual(['Hallituksen poytakirja.pdf'])
    expect(slot('2032-12-31', 'extra_agm_minutes').suggestions.map((s) => s.file_name)).toEqual(['Ylimaarainen yhtiokokous poytakirja 2033.pdf'])
    expect(slot('2032-12-31', 'tax_decision').suggestions.map((s) => s.voucher_id)).toEqual([fx.vouchers.taxDecision])
    const data = overview()
    expect(data.company_slots.find((s) => s.kind === 'articles')!.suggestions.map((s) => s.voucher_id)).toEqual([fx.vouchers.articles])
    expect(data.company_slots.find((s) => s.kind === 'trade_register_extract')!.suggestions.map((s) => s.voucher_id)).toEqual([fx.vouchers.extract])
    expect(data.suggestion_count).toBe(9)
    expect(readTilariData(fx.db, COMPANY_KEY)).toBeNull()
  })

  it('suggests for a chosen kind only when it is ticked', () => {
    save({ settings: { audited: true } })
    expect(slot('2032-12-31', 'audit_report').suggestions.map((s) => s.file_name)).toEqual(['Signeerattu tt-kertomus 2032.pdf'])
    expect(overview().suggestion_count).toBe(10)
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
    expect(period('2031-12-31').docs).toEqual({ done: 1, required: 4 })
    expect(period('2031-12-31').deadlines.find((d) => d.key === 'agm')!.state).toBe('done')
  })

  it('makes required what the settings say', () => {
    save({ settings: { audited: true, annual_report: true } })
    expect(slot('2031-12-31', 'audit_report')).toMatchObject({ required: true, status: 'missing' })
    expect(slot('2031-12-31', 'annual_report')).toMatchObject({ required: true, status: 'missing' })
    expect(period('2031-12-31').docs).toEqual({ done: 0, required: 6 })
  })

  it('lists a chosen kind only when ticked, and then it is required', () => {
    const listed = () => period('2031-12-31').slots.map((s) => s.kind)
    expect(listed()).toEqual(['financial_statements', 'board_minutes', 'tax_return_6b', 'agm_minutes', 'tax_decision', 'other'])
    save({ settings: { balance_sheet_specs: true, prh_receipt: true } })
    expect(slot('2031-12-31', 'balance_sheet_specs')).toMatchObject({ required: true, status: 'missing' })
    expect(slot('2031-12-31', 'prh_filing_receipt')).toMatchObject({ required: true, status: 'missing' })
    expect(period('2031-12-31').docs).toEqual({ done: 0, required: 6 })
    save({ settings: { balance_sheet_specs: false, prh_receipt: false } })
    expect(listed()).not.toContain('balance_sheet_specs')
    expect(period('2031-12-31').docs).toEqual({ done: 0, required: 4 })
  })

  it('lists the rows in the order a year produces them', () => {
    save({ settings: { audited: true, annual_report: true, balance_sheet_specs: true, prh_receipt: true } })
    expect(period('2031-12-31').slots.map((s) => s.kind)).toEqual([
      'financial_statements',
      'balance_sheet_specs',
      'annual_report',
      'board_minutes',
      'audit_report',
      'tax_return_6b',
      'agm_minutes',
      'prh_filing_receipt',
      'tax_decision',
      'other',
    ])
  })

  it('lists the documents of a row oldest first, whatever order they were linked in', () => {
    const add = (voucher_id: number) => ({ kind: 'board_minutes', period_ends: '2032-12-31', voucher_id })
    save({ add: [add(fx.vouchers.decision2033), add(fx.vouchers.board2033)] })
    expect(slot('2032-12-31', 'board_minutes').documents.map((d) => d.voucher_id)).toEqual([fx.vouchers.board2033, fx.vouchers.decision2033])
  })

  it('keeps an unticked row that holds a document: unticking does not hide what was attached', () => {
    save({ settings: { balance_sheet_specs: true } })
    save({ add: [{ kind: 'balance_sheet_specs', period_ends: '2031-12-31', voucher_id: fx.vouchers.agm2032 }] })
    save({ settings: { balance_sheet_specs: false } })
    expect(slot('2031-12-31', 'balance_sheet_specs')).toMatchObject({ required: false, status: 'filled' })
    expect(period('2032-12-31').slots.map((s) => s.kind)).not.toContain('balance_sheet_specs')
  })

  it('takes a slot marked not needed out of the count and the deadline', () => {
    save({ not_needed: [{ period_ends: '2031-12-31', kind: 'tax_return_6b', value: true }] })
    expect(slot('2031-12-31', 'tax_return_6b').status).toBe('not_needed')
    expect(period('2031-12-31').docs).toEqual({ done: 0, required: 3 })
    expect(period('2031-12-31').deadlines.find((d) => d.key === 'tax_return')!.state).toBe('not_needed')
  })

  it('lists a calculation with the tax return, but it neither fills the slot nor meets the deadline', () => {
    const alerts = computeAlerts(fx.db, { today: AS_OF, asOf: AS_OF }).deadlines
    save({ add: [{ kind: 'tax_return_6b', period_ends: '2032-12-31', voucher_id: fx.vouchers.board2033, calculation: true }] })
    const listed = slot('2032-12-31', 'tax_return_6b')
    expect(listed.documents.map((d) => [d.voucher_id, d.calculation])).toEqual([[fx.vouchers.board2033, true]])
    expect(listed.status).toBe('missing')
    expect(period('2032-12-31').deadlines.find((d) => d.key === 'tax_return')!.state).not.toBe('done')
    expect(computeAlerts(fx.db, { today: AS_OF, asOf: AS_OF }).deadlines).toBe(alerts)

    save({ add: [{ kind: 'tax_return_6b', period_ends: '2032-12-31', voucher_id: fx.vouchers.decision2033 }] })
    expect(slot('2032-12-31', 'tax_return_6b').status).toBe('complete')
    expect(period('2032-12-31').deadlines.find((d) => d.key === 'tax_return')!.state).toBe('done')
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
    expect(due.map((d) => `${d.period_ends}:${d.key}`)).toEqual(['2032-12-31:statements_prepared', '2032-12-31:tax_return', '2032-12-31:agm'])
    expect(due.map((d) => d.state)).toEqual(['overdue', 'overdue', 'overdue'])
    // The PRH date counts as missed only when its document is required.
    save({ settings: { prh_receipt: true } })
    expect(overview().next_deadlines.at(-1)).toMatchObject({ key: 'prh_filing', state: 'overdue' })
    save({ settings: { prh_receipt: false } })
    // Earlier in the year, the period before is within its year of being missed, and this one is near.
    expect(overview('2033-04-10').next_deadlines.map((d) => `${d.period_ends}:${d.key}:${d.state}`)).toEqual([
      '2031-12-31:tax_return:overdue',
      '2031-12-31:agm:overdue',
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
    expect(computeAlerts(fx.db, { today: AS_OF, asOf: AS_OF }).deadlines).toBe(2)
    expect(overview().next_deadlines).toHaveLength(2)
  })

  it('does not count a link to a deleted voucher as done', () => {
    save({ add: [{ kind: 'agm_minutes', period_ends: '2032-12-31', voucher_id: fx.vouchers.agm2032 }] })
    fx.db.run('UPDATE Tosite SET tila = 0 WHERE id = ?', [fx.vouchers.agm2032])
    expect(computeAlerts(fx.db, { today: AS_OF, asOf: AS_OF }).deadlines).toBe(3)
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
    expect(parseCompanyDoc(readTilariData(fx.db, COMPANY_KEY)).doc.documents).toHaveLength(9)
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

  it('refuses a deleted voucher and one that is not there', () => {
    const add = { kind: 'agm_minutes', period_ends: '2031-12-31' }
    expect(() => save({ add: [{ ...add, voucher_id: fx.vouchers.deleted }] })).toThrow('voucher_missing')
    expect(() => save({ add: [{ ...add, voucher_id: 99999 }] })).toThrow('voucher_missing')
  })

  it('links a draft, which waits to be posted without filling its row or counting as a problem', () => {
    save({ add: [{ kind: 'agm_minutes', period_ends: '2031-12-31', voucher_id: fx.vouchers.draft }] })
    const row = slot('2031-12-31', 'agm_minutes')
    expect(row.documents.map((d) => d.state)).toEqual(['draft'])
    expect(row.status).toBe('missing')
    expect(period('2031-12-31').problems).toBe(0)
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

describe("the dividends' annual report", () => {
  const REPORT = 'dividend_annual_report'

  function dividendLine(key: string, date: string, side: 'debetsnt' | 'kreditsnt', status = 100) {
    const voucher = fx.voucher(key, date, TYPE_TRANSFER, 'Osinko', [], status)
    fx.db.run(`INSERT INTO Vienti (rivi, tosite, pvm, tili, ${side}) VALUES (1, ?, ?, 2261, 100)`, [voucher, date])
  }

  /** Decided in 2033 from period 2032's profit, and paid. */
  function decideAndPay(paid = '2033-06-15') {
    dividendLine('decided', '2033-05-02', 'kreditsnt')
    dividendLine('paid', paid, 'debetsnt')
  }

  const row = (ends: string, asOf: string) => period(ends, asOf).slots.find((s) => s.kind === REPORT)
  const tile = (ends: string, asOf: string) => period(ends, asOf).deadlines.find((d) => d.key === 'dividend_report')

  it('is not listed for a period the book shows no dividend from', () => {
    decideAndPay()
    expect(row('2031-12-31', AS_OF)).toBeUndefined()
    expect(row('2033-12-31', AS_OF)).toBeUndefined()
    expect(tile('2031-12-31', AS_OF)).toBeUndefined()
  })

  it('goes on the period whose profit was distributed, and is dated from the payment', () => {
    decideAndPay()
    expect(row('2032-12-31', '2033-07-01')).toMatchObject({ required: true, status: 'waiting' })
    expect(tile('2032-12-31', '2033-07-01')).toMatchObject({ due: '2034-01-31', state: 'later' })
  })

  it('waits without a date until the dividend is paid; a draft payment does not count', () => {
    dividendLine('decided', '2033-05-02', 'kreditsnt')
    dividendLine('draftPayment', '2033-06-15', 'debetsnt', 50)
    expect(row('2032-12-31', '2035-01-01')).toMatchObject({ required: true, status: 'waiting' })
    expect(tile('2032-12-31', '2035-01-01')).toBeUndefined()
  })

  it('is missing only after its date, not after the period ends', () => {
    decideAndPay()
    expect(row('2032-12-31', '2034-01-31')?.status).toBe('waiting')
    expect(row('2032-12-31', '2034-02-01')?.status).toBe('missing')
    expect(tile('2032-12-31', '2034-02-01')?.state).toBe('overdue')
  })

  it('is answered by a document stored after the fact', () => {
    decideAndPay()
    save({ add: [{ kind: REPORT, period_ends: '2032-12-31', voucher_id: fx.vouchers.plain, doc_date: '2034-01-20' }] })
    expect(row('2032-12-31', '2034-06-01')).toMatchObject({ required: true, status: 'complete' })
    expect(tile('2032-12-31', '2034-06-01')?.state).toBe('done')
  })

  it('counts in the X/Y documents and in the header', () => {
    const before = computeAlerts(fx.db, { today: '2034-01-20', asOf: '2034-01-20' }).deadlines
    const required = period('2032-12-31', '2034-01-20').docs.required
    decideAndPay()
    expect(period('2032-12-31', '2034-01-20').docs.required).toBe(required + 1)
    expect(computeAlerts(fx.db, { today: '2034-01-20', asOf: '2034-01-20' }).deadlines).toBe(before + 1)
  })

  it('keeps a row holding a document when the book shows no dividend', () => {
    save({ add: [{ kind: REPORT, period_ends: '2031-12-31', voucher_id: fx.vouchers.plain }] })
    expect(row('2031-12-31', AS_OF)).toMatchObject({ required: false, status: 'filled' })
  })

  it('keeps each dividend on its own period, and ignores an opening balance', () => {
    fx.voucher('opening', '2031-01-01', TYPE_OPENING, 'Avaus')
    fx.db.run('INSERT INTO Vienti (rivi, tosite, pvm, tili, kreditsnt) VALUES (1, ?, ?, 2261, 100)', [fx.vouchers.opening, '2031-01-01'])
    decideAndPay()
    dividendLine('decided2034', '2034-04-02', 'kreditsnt')
    dividendLine('paid2034', '2034-04-03', 'debetsnt')
    expect(tile('2032-12-31', '2034-05-01')?.due).toBe('2034-01-31')
    expect(tile('2033-12-31', '2034-05-01')?.due).toBe('2035-01-31')
  })
})

describe('dividends from the ledger', () => {
  type LineSpec = [account: number, debit: number, credit: number]

  function book(key: string, date: string, type: number, lines: LineSpec[], files: string[] = [], status = 100) {
    const voucher = fx.voucher(key, date, type, key, files, status)
    lines.forEach(([account, debit, credit], i) =>
      fx.db.run('INSERT INTO Vienti (rivi, tosite, pvm, tili, debetsnt, kreditsnt) VALUES (?, ?, ?, ?, ?, ?)', [i + 1, voucher, date, account, debit || null, credit || null]),
    )
    return voucher
  }

  /** From period 2032's profit: decided with the minutes on the voucher, paid as a debt with its contract. */
  function cycle({ paid = 100000, debt = true, contract = true, withheld = 7500 } = {}) {
    book('decision', '2033-05-02', TYPE_TRANSFER, [[2251, 100000, 0], [2261, 0, 100000]], ['poytakirja.pdf'])
    const lines: LineSpec[] = [[2261, paid, 0], [debt ? 2943 : 1910, 0, paid - withheld]]
    if (withheld) lines.push([2921, 0, withheld])
    book('payment', '2033-06-15', TYPE_OTHER, lines, contract ? ['velkakirja.pdf'] : [])
  }

  const dividend = (asOf: string, ends = '2032-12-31') => period(ends, asOf).dividends[0]
  const steps = (asOf: string) => Object.fromEntries(dividend(asOf).steps.map((s) => [s.key, s.state]))

  it('reads the five steps of a dividend paid as a debt, with its withholding remitted', () => {
    cycle()
    book('remit', '2033-07-12', TYPE_BANK_STATEMENT, [[2921, 7500, 0], [1910, 0, 7500]])
    const d = dividend('2033-08-01')
    expect(d).toMatchObject({ decided_on: '2033-05-02', amount_snt: 100000, paid_snt: 100000, withheld_snt: 7500, remitted_snt: 7500, no_contract: [] })
    expect(d.steps).toEqual([
      { key: 'decided', state: 'done', date: '2033-05-02' },
      { key: 'booked', state: 'done', date: '2033-05-02' },
      { key: 'paid', state: 'done', date: '2033-06-15' },
      { key: 'withheld', state: 'done', date: '2033-07-12' },
      { key: 'reported', state: 'waiting', date: '2034-01-31' },
    ])
    expect(d.vouchers.map((v) => [v.role, v.voucher_id, v.amount_snt])).toEqual([
      ['decision', fx.vouchers.decision, 100000],
      ['payment', fx.vouchers.payment, 100000],
      ['remittance', fx.vouchers.remit, 7500],
    ])
    expect(d.vouchers[1].files.map((f) => f.name)).toEqual(['velkakirja.pdf'])
    expect(period('2031-12-31', '2033-08-01').dividends).toEqual([])
  })

  it('takes the report from its row', () => {
    cycle()
    expect(steps('2034-02-01').reported).toBe('missing')
    save({ add: [{ kind: 'dividend_annual_report', period_ends: '2032-12-31', voucher_id: fx.vouchers.plain, doc_date: '2034-01-20' }] })
    expect(dividend('2034-02-01').steps.at(-1)).toEqual({ key: 'reported', state: 'done', date: '2034-01-20' })
  })

  it('wants a file on a payment that left a debt, not on one from the bank', () => {
    cycle({ contract: false })
    expect(steps('2033-08-01').paid).toBe('no_contract')
    expect(dividend('2033-08-01').no_contract).toEqual([fx.vouchers.payment])
    expect(period('2032-12-31', '2033-08-01').problems).toBe(1)
  })

  it('needs no contract when the bank paid', () => {
    cycle({ debt: false, contract: false })
    expect(steps('2033-08-01').paid).toBe('done')
    expect(period('2032-12-31', '2033-08-01').problems).toBe(0)
  })

  it('shows a payment over the decision as a difference, exact to the cent', () => {
    cycle({ paid: 100001 })
    expect(steps('2033-08-01').paid).toBe('difference')
    expect(dividend('2033-08-01')).toMatchObject({ amount_snt: 100000, paid_snt: 100001 })
    expect(period('2032-12-31', '2033-08-01').problems).toBe(1)
  })

  it('waits while part is unpaid', () => {
    cycle({ paid: 50000 })
    expect(steps('2033-08-01').paid).toBe('waiting')
    expect(dividend('2033-08-01').paid_snt).toBe(50000)
  })

  it('makes withholding late after the 12th of the next month, and counts it in the header', () => {
    cycle()
    expect(steps('2033-07-12').withheld).toBe('waiting')
    expect(steps('2033-07-13').withheld).toBe('overdue')
    const tile = period('2032-12-31', '2033-07-13').deadlines.find((d) => d.key === 'dividend_withholding')
    expect(tile).toMatchObject({ due: '2033-07-12', state: 'overdue' })
    expect(computeAlerts(fx.db, { today: '2033-07-13', asOf: '2033-07-13' }).deadlines).toBeGreaterThan(0)
  })

  it('remits the oldest withholding first, whatever it came from', () => {
    book('payroll', '2033-05-31', TYPE_OTHER, [[5000, 3000, 0], [2921, 0, 3000]])
    cycle()
    book('remit', '2033-07-10', TYPE_BANK_STATEMENT, [[2921, 7500, 0], [1910, 0, 7500]])
    expect(dividend('2033-08-01')).toMatchObject({ withheld_snt: 7500, remitted_snt: 4500 })
    expect(steps('2033-08-01').withheld).toBe('overdue')
    book('remit2', '2033-07-20', TYPE_BANK_STATEMENT, [[2921, 3000, 0], [1910, 0, 3000]])
    expect(steps('2033-08-01').withheld).toBe('done')
  })

  it('has nothing to remit when nothing was withheld', () => {
    cycle({ withheld: 0 })
    expect(steps('2033-08-01').withheld).toBe('not_applicable')
    expect(period('2032-12-31', '2033-08-01').deadlines.map((d) => d.key)).not.toContain('dividend_withholding')
  })

  it('takes the minutes from the AGM row when the decision holds no file', () => {
    book('decision', '2033-05-02', TYPE_TRANSFER, [[2251, 100000, 0], [2261, 0, 100000]])
    expect(steps('2033-06-01').decided).toBe('no_minutes')
    save({ add: [{ kind: 'agm_minutes', period_ends: '2032-12-31', voucher_id: fx.vouchers.agm2032 }] })
    expect(steps('2033-06-01').decided).toBe('done')
    expect(steps('2033-06-01').paid).toBe('waiting')
  })

  it('names an extra dividend by its own meeting, and lists that row once there is one', () => {
    book('decision', '2033-05-02', TYPE_TRANSFER, [[2251, 100000, 0], [2261, 0, 100000]], ['poytakirja.pdf'])
    // Without a document, a file named so or a second dividend, the row is not there.
    expect(period('2031-12-31', '2033-06-01').slots.map((s) => s.kind)).not.toContain('extra_agm_minutes')
    book('extra', '2033-10-02', TYPE_TRANSFER, [[2251, 20000, 0], [2261, 0, 20000]])
    const p = period('2032-12-31', '2033-11-01')
    expect(p.dividends.map((d) => [d.meeting, d.steps[0].state])).toEqual([
      ['agm', 'done'],
      ['extra', 'no_minutes'],
    ])
    // A second dividend wants a second meeting's minutes.
    expect(p.slots.find((s) => s.kind === 'extra_agm_minutes')).toMatchObject({ required: true, status: 'missing' })
    save({ add: [{ kind: 'extra_agm_minutes', period_ends: '2032-12-31', voucher_id: fx.vouchers.plain, doc_date: '2033-10-02' }] })
    expect(period('2032-12-31', '2033-11-01').dividends[1].steps[0].state).toBe('done')
  })

  it('takes the meeting from the row its minutes are linked to, also for a draft decision', () => {
    const id = saveVoucher(fx.db, decisionDraft({ date: '2033-05-02', amount_snt: 500_00, title: 'Lisäosinko' }))
    fx.addFile(id, 'ylimaarainen.pdf')
    save({ add: [{ kind: 'extra_agm_minutes', period_ends: '2032-12-31', voucher_id: id, attachment_id: fx.files['ylimaarainen.pdf'] }] })
    expect(slot('2032-12-31', 'extra_agm_minutes').documents.map((d) => d.state)).toEqual(['draft'])
    fx.db.run('UPDATE Tosite SET tila = 100 WHERE id = ?', [id])
    const d = period('2032-12-31', '2033-06-01').dividends[0]
    expect([d.meeting, d.steps[0].state]).toEqual(['extra', 'done'])
  })

  it('books a decision on the voucher its stored minutes are on, so the file is kept once', () => {
    const minutes = fx.voucher('minutes', '2033-05-02', TYPE_ATTACHMENT_NOTE, 'Yhtiökokous', ['kokous.pdf'])
    save({ add: [{ kind: 'agm_minutes', period_ends: '2032-12-31', voucher_id: minutes }] })
    saveVoucher(fx.db, decisionDraft({ date: '2033-05-02', amount_snt: 500_00, title: 'Osingonjako' }), minutes)
    expect(slot('2032-12-31', 'agm_minutes').documents.map((d) => [d.voucher_id, d.state, d.files.map((f) => f.name)])).toEqual([[minutes, 'draft', ['kokous.pdf']]])
    fx.db.run('UPDATE Tosite SET tila = 100 WHERE id = ?', [minutes])
    const d = period('2032-12-31', '2033-06-01').dividends[0]
    expect([d.meeting, d.steps[0].state, d.vouchers[0].files.map((f) => f.name)]).toEqual(['agm', 'done', ['kokous.pdf']])
  })

  it('lists the income tax vouchers of the period', () => {
    book('incomeTax', '2032-12-31', TYPE_INCOME_TAX, [[9960, 500, 0], [2968, 0, 500]])
    expect(period('2032-12-31', AS_OF).income_tax.map((v) => v.voucher_id)).toEqual([fx.vouchers.incomeTax])
    expect(period('2033-12-31', AS_OF).income_tax).toEqual([])
  })
})

describe('the income tax after the tax decision', () => {
  type LineSpec = [account: number, debit: number, credit: number]

  function book(key: string, date: string, type: number, lines: LineSpec[]) {
    const voucher = fx.voucher(key, date, type, key, [])
    lines.forEach(([account, debit, credit], i) =>
      fx.db.run('INSERT INTO Vienti (rivi, tosite, pvm, tili, debetsnt, kreditsnt) VALUES (?, ?, ?, ?, ?, ?)', [i + 1, voucher, date, account, debit || null, credit || null]),
    )
    return voucher
  }

  const settlements = (ends: string) => period(ends, AS_OF).tax_settlements

  it('waits for the tax the closing left to pay, and settles it oldest first', () => {
    book('tax2032', '2032-12-31', TYPE_INCOME_TAX, [[9940, 400_00, 0], [2968, 0, 400_00]])
    book('tax2033', '2033-12-31', TYPE_INCOME_TAX, [[9940, 300_00, 0], [2968, 0, 300_00]])
    expect(settlements('2032-12-31')).toEqual([{ direction: 'pay', booked_snt: 400_00, settled_snt: 0, vouchers: [] }])
    book('paid', '2033-09-01', TYPE_OTHER, [[2968, 450_00, 0], [1910, 0, 450_00]])
    expect(settlements('2032-12-31')[0]).toMatchObject({ settled_snt: 400_00, vouchers: [{ voucher_id: fx.vouchers.paid, amount_snt: 400_00 }] })
    // What paid more goes to the next booking, even when it came first.
    expect(settlements('2033-12-31')[0]).toMatchObject({ booked_snt: 300_00, settled_snt: 50_00, vouchers: [{ voucher_id: fx.vouchers.paid, amount_snt: 50_00 }] })
  })

  it('adds a correction after the period to the period it corrects', () => {
    book('tax2032', '2032-12-31', TYPE_INCOME_TAX, [[9940, 400_00, 0], [2968, 0, 400_00]])
    book('decision', '2033-08-20', TYPE_OTHER, [[8740, 25_50, 0], [2968, 0, 25_50]])
    book('paid', '2033-09-01', TYPE_OTHER, [[2968, 425_50, 0], [1910, 0, 425_50]])
    expect(settlements('2032-12-31')).toEqual([
      { direction: 'pay', booked_snt: 425_50, settled_snt: 425_50, vouchers: [expect.objectContaining({ voucher_id: fx.vouchers.paid, amount_snt: 425_50 })] },
    ])
  })

  it('waits for a refund on the receivable', () => {
    book('tax2032', '2032-12-31', TYPE_INCOME_TAX, [[1813, 120_00, 0], [9940, 0, 120_00]])
    expect(settlements('2032-12-31')).toEqual([{ direction: 'refund', booked_snt: 120_00, settled_snt: 0, vouchers: [] }])
    book('refund', '2033-10-01', TYPE_BANK_STATEMENT, [[1910, 120_00, 0], [1813, 0, 120_00]])
    expect(settlements('2032-12-31')[0]).toMatchObject({ settled_snt: 120_00 })
  })

  it('reads the accounts from Kitsas\'s settings, and leaves the opening balance to the first payments', () => {
    fx.db.run("INSERT OR REPLACE INTO Asetus (avain, arvo) VALUES ('Tuloverosiirtovelat', '2969')")
    book('opening', '2031-01-01', TYPE_OPENING, [[2969, 0, 100_00]])
    book('tax2032', '2032-12-31', TYPE_INCOME_TAX, [[9940, 400_00, 0], [2969, 0, 400_00]])
    book('paid', '2033-09-01', TYPE_OTHER, [[2969, 400_00, 0], [1910, 0, 400_00]])
    expect(settlements('2032-12-31')[0]).toMatchObject({ booked_snt: 400_00, settled_snt: 300_00 })
    expect(settlements('2031-12-31')).toEqual([])
  })
})

describe('shareholders and dividend drafts', () => {
  type LineSpec = [account: number, debit: number, credit: number]

  function book(key: string, date: string, type: number, lines: LineSpec[], files: string[] = []) {
    const voucher = fx.voucher(key, date, type, key, files)
    lines.forEach(([account, debit, credit], i) =>
      fx.db.run('INSERT INTO Vienti (rivi, tosite, pvm, tili, debetsnt, kreditsnt) VALUES (?, ?, ?, ?, ?, ?)', [i + 1, voucher, date, account, debit || null, credit || null]),
    )
    return voucher
  }

  /** Two people: one with 3 shares, one from 2033 with 1. */
  function holders() {
    save({
      shareholders: [
        { partner_name: 'Osakas Yksi', kind: 'person', resident: true, holdings: [{ from: '2031-01-01', shares: 3 }] },
        { partner_name: 'Osakas Kaksi', kind: 'estate', resident: true, holdings: [{ from: '2033-01-01', shares: 1 }] },
      ],
    })
  }

  it('keeps shareholders by Kumppani, making a new one from a name', () => {
    holders()
    const list = overview().shareholders
    expect(list.map((s) => [s.key, s.name, s.kind, s.shares])).toEqual([
      ['s1', 'Osakas Yksi', 'person', 3],
      ['s2', 'Osakas Kaksi', 'estate', 1],
    ])
    const ids = list.map((s) => s.partner_id)
    expect(fx.db.all('SELECT nimi FROM Kumppani WHERE id IN (?, ?) ORDER BY id', ids)).toEqual([{ nimi: 'Osakas Yksi' }, { nimi: 'Osakas Kaksi' }])
    // Saved again under its key, a name already known is not made twice.
    save({ shareholders: [{ key: 's1', partner_name: 'Osakas Yksi', kind: 'person', resident: true, holdings: [{ from: '2031-01-01', shares: 5 }] }] })
    expect(overview().shareholders.map((s) => [s.key, s.partner_id, s.shares])).toEqual([['s1', ids[0], 5]])
  })

  it('refuses a shareholder twice, an unknown partner and a bad holding', () => {
    holders()
    const id = overview().shareholders[0].partner_id
    const one = { kind: 'person' as const, resident: true, holdings: [{ from: '2031-01-01', shares: 1 }] }
    expect(() => save({ shareholders: [{ ...one, partner_id: id }, { ...one, partner_id: id }] })).toThrow(/duplicate_shareholder/)
    expect(() => save({ shareholders: [{ ...one, partner_id: 999999 }] })).toThrow(/unknown_partner/)
    expect(() => save({ shareholders: [{ ...one, partner_id: id, holdings: [{ from: '2031-01-01', shares: -1 }] }] })).toThrow(/invalid_field/)
    expect(() => save({ shareholders: [{ ...one, partner_id: id, rate_bp: 10001 }] })).toThrow(/invalid_field/)
  })

  it('splits a dividend over the holders of its decision day', () => {
    book('decision', '2033-05-02', TYPE_TRANSFER, [[2251, 1000_00, 0], [2261, 0, 1000_00]])
    expect(period('2032-12-31', '2033-06-01').dividends[0].split_problem).toBe('no_shareholders')
    holders()
    const d = period('2032-12-31', '2033-06-01').dividends[0]
    expect(d.split_problem).toBeNull()
    expect(d.recipients.map((r) => [r.name, r.shares, r.gross_snt, r.withholding_snt, r.net_snt])).toEqual([
      ['Osakas Yksi', 3, 750_00, 56_25, 693_75],
      ['Osakas Kaksi', 1, 250_00, 18_75, 231_25],
    ])
    expect(d.open_recipients.map((r) => r.gross_snt)).toEqual([750_00, 250_00])
  })

  it('waits for a rate when a shareholder lives abroad', () => {
    save({ shareholders: [{ partner_name: 'Ulkomainen', kind: 'person', resident: false, holdings: [{ from: '2031-01-01', shares: 1 }] }] })
    book('decision', '2033-05-02', TYPE_TRANSFER, [[2251, 1000_00, 0], [2261, 0, 1000_00]])
    expect(period('2032-12-31', '2033-06-01').dividends[0].split_problem).toBe('rate_missing')
  })

  it('lists draft decisions on the period they distribute, and offers the newest ended period', () => {
    const id = saveVoucher(fx.db, decisionDraft({ date: '2033-05-02', amount_snt: 500_00, title: 'Osingonjako' }))
    const p = period('2032-12-31', '2033-06-01')
    expect(p.dividend_drafts.map((v) => v.voucher_id)).toEqual([id])
    // A draft is no decision yet.
    expect(p.dividends).toEqual([])
    expect(p.decide_here).toBe(true)
    expect(period('2031-12-31', '2033-06-01').decide_here).toBe(false)
  })

  it('puts a draft payment on the dividend it would pay, with the withholding and net per recipient', () => {
    holders()
    book('decision', '2033-05-02', TYPE_TRANSFER, [[2251, 1000_00, 0], [2261, 0, 1000_00]])
    const open = period('2032-12-31', '2033-06-01').dividends[0].open_recipients
    const draft = paymentDraft({ date: '2033-06-15', title: 'Osingon maksu', withholding: 'Ennakonpidätys', recipients: open, account: 2943 })
    expect(draft.entries!.map((e) => [e.account, e.debit_cents ?? 0, e.credit_cents ?? 0])).toEqual([
      [2261, 1000_00, 0],
      [2921, 0, 56_25],
      [2943, 0, 693_75],
      [2921, 0, 18_75],
      [2943, 0, 231_25],
    ])
    const id = saveVoucher(fx.db, draft)
    const d = period('2032-12-31', '2033-06-01').dividends[0]
    expect(d.payment_drafts.map((v) => v.voucher_id)).toEqual([id])
    expect(d.paid_snt).toBe(0)
    expect(period('2032-12-31', '2033-06-01').dividend_drafts).toEqual([])
    const partners = fx.db.all<{ kumppani: number }>('SELECT kumppani FROM Vienti WHERE tosite = ? AND tili = 2943 ORDER BY id', [id])
    expect(partners.map((p) => p.kumppani)).toEqual(open.map((r) => r.partner_id))
  })
})
