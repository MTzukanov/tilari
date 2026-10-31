import { describe, expect, it } from 'vitest'
import { TYPE_ATTACHMENT_NOTE, TYPE_BANK_STATEMENT, TYPE_EXPENSE, TYPE_OTHER, TYPE_TRANSFER } from '../../../vouchers'
import { foldText, kindsIn, suggestDocuments, yearIn } from './suggest'
import type { DocCandidate } from './types'

const periods = [
  { starts: '2032-01-01', ends: '2032-12-31' },
  { starts: '2031-01-01', ends: '2031-12-31' },
  { starts: '2033-01-01', ends: '2033-12-31' },
]

let nextId = 1
function row(partial: Partial<DocCandidate> & { title: string; file_name: string }): DocCandidate {
  const id = nextId++
  return {
    voucher_id: id,
    attachment_id: null,
    file_id: 1000 + id,
    date: '2032-04-01',
    type: TYPE_ATTACHMENT_NOTE,
    doc_number: null,
    series: '',
    linked: false,
    ...partial,
  }
}

function suggest(rows: DocCandidate[], options: { excluded?: number[]; dismissed?: string[] } = {}) {
  return suggestDocuments({
    rows,
    periods,
    excludedVouchers: new Set(options.excluded ?? []),
    dismissed: new Set(options.dismissed ?? []),
  })
}

function pairs(rows: DocCandidate[]) {
  return suggest(rows)
    .map((s) => [s.kind, s.period_ends])
    .sort()
}

describe('reading document kinds from text', () => {
  it('folds case, diacritics, separators and dates', () => {
    expect(foldText('Yhtiökokous_pöytäkirja-2032.pdf')).toBe('yhtiokokous poytakirja 2032')
    expect(foldText('Verotuspaatos (pdf)_12.06.2033.pdf')).toBe('verotuspaatos pdf')
    expect(foldText('2032-02-14-prh-ilmoitus.pdf')).toBe('prh ilmoitus')
  })

  it.each([
    ['Tilinpäätös 2031 allekirjoitettu', 'financial_statements'],
    ['Signeeratun tilinpäätöksen sivut', 'financial_statements'],
    ['Tase-erittelyt 2031', 'balance_sheet_specs'],
    ['Toimintakertomus', 'annual_report'],
    ['Signeerattu tt-kertomus 2031', 'audit_report'],
    ['Tilintarkastuskertomus', 'audit_report'],
    ['Varsinainen yhtiökokous', 'agm_minutes'],
    ['Yhtiokokouksen poytakirja 2032', 'agm_minutes'],
    ['Yhtiökokouksen pöytäkirjanote', 'agm_minutes'],
    ['Hallituksen kokous 2032', 'board_minutes'],
    ['hallituksenkokous', 'board_minutes'],
    ['Hallituken kokous', 'board_minutes'],
    ['Hallituksen kokouksen pöytäkirja', 'board_minutes'],
    ['PRH:n kuitti', 'prh_filing_receipt'],
    ['Lomake 6B', 'tax_return_6b'],
    ['Veroilmoitus 2031', 'tax_return_6b'],
    ['Yhteisöveroilmoitus', 'tax_return_6b'],
    ['Verotuspäätöksen liite', 'tax_decision'],
  ])('%s is %s', (text, kind) => {
    expect(kindsIn(text).period).toContain(kind)
  })

  it.each([
    ['Yhtiöjärjestys', 'articles'],
    ['Yhteisösäännöt', 'articles'],
    ['Kaupparekisteriote', 'trade_register_extract'],
    ['Osakasluettelo', 'shareholder_register'],
    ['Perustajaosakassopimus', 'shareholder_agreement'],
  ])('%s belongs to the company as %s', (text, kind) => {
    expect(kindsIn(text)).toEqual({ company: [kind], period: [], extraordinary: false })
  })

  it.each([
    'Arvonlisäveroilmoitus 01.03.2032 - 31.03.2032',
    'Varainsiirtoveroilmoitus_14.02.2031.pdf',
    'f3c90d17ab6b42e08c5d6b7719e0a2cd41be6f08',
    'Tilinpäätöspalvelu',
    'Yhtiömaksu',
    'PRHX',
  ])('%s is no document kind', (text) => {
    expect(kindsIn(text).period).toEqual([])
    expect(kindsIn(text).company).toEqual([])
  })

  it('does not take an extraordinary meeting for the AGM', () => {
    expect(kindsIn('Ylimääräinen yhtiökokous 2032')).toMatchObject({ period: [], extraordinary: true })
    expect(kindsIn('Ylimäräinen yhtiökokous 2032')).toMatchObject({ period: [], extraordinary: true })
  })

  it('reads the year, not a date, and the end of a range', () => {
    expect(yearIn('Verotuspäätös 2031')).toBe(2031)
    expect(yearIn('Verotuspaatos (pdf)_12.06.2033.pdf')).toBeNull()
    expect(yearIn('Tilinpäätös 2031/32')).toBe(2032)
    expect(yearIn('scan_20320401.pdf')).toBeNull()
  })
})

describe('suggestions from the book', () => {
  it('reads each file of a voucher by its own name', () => {
    const shared = { date: '2033-08-09', type: TYPE_TRANSFER, title: 'Varsinainen yhtiökokous, tilinpäätös 2033' }
    const voucher_id = 900
    expect(
      pairs([
        row({ ...shared, voucher_id, attachment_id: 1, file_name: 'Signeerattu tilinpäätös 2032.pdf' }),
        row({ ...shared, voucher_id, attachment_id: 2, file_name: 'Signeerattu tt-kertomus 2032.pdf' }),
        row({ ...shared, voucher_id, attachment_id: 3, file_name: 'Yhtiokokouksen poytakirja 2033.pdf' }),
      ]),
    ).toEqual([
      ['agm_minutes', '2032-12-31'],
      ['audit_report', '2032-12-31'],
      ['financial_statements', '2032-12-31'],
    ])
  })

  it('takes the title for a voucher with one file, and both kinds when it names two', () => {
    expect(pairs([row({ title: 'Hallituksen kokous ja yhtiökokous 2032', file_name: 'poytakirja.pdf' })])).toEqual([
      ['agm_minutes', '2031-12-31'],
      ['board_minutes', '2031-12-31'],
    ])
  })

  it('files minutes under the last period ended before the voucher, whatever year they name', () => {
    expect(pairs([row({ date: '2032-05-11', title: 'Yhtiökokous 2032', file_name: 'kokous-poytakirja-2032.pdf' })])).toEqual([['agm_minutes', '2031-12-31']])
  })

  it('files statements under the year they name', () => {
    expect(pairs([row({ date: '2033-06-14', title: 'Tilinpäätös 2031', file_name: 'liite.pdf' })])).toEqual([['financial_statements', '2031-12-31']])
  })

  it('reads a tax decision by the title when the file name only has its own date', () => {
    expect(pairs([row({ date: '2033-09-21', title: 'Verotuspäätös 2031', file_name: 'Verotuspaatos (pdf)_21.09.2033.pdf' })])).toEqual([['tax_decision', '2031-12-31']])
  })

  it('falls back to the last ended period when the named year has none', () => {
    expect(pairs([row({ date: '2033-03-01', title: 'Tilinpäätös 2099', file_name: 'a.pdf' })])).toEqual([['financial_statements', '2032-12-31']])
  })

  it('suggests nothing when no period has ended', () => {
    expect(pairs([row({ date: '2031-03-01', title: 'Yhtiökokous', file_name: 'a.pdf' })])).toEqual([])
  })

  it('files an extraordinary meeting under other', () => {
    expect(pairs([row({ date: '2032-09-01', title: 'Ylimääräinen yhtiökokous', file_name: 'a.pdf' })])).toEqual([['other', '2031-12-31']])
  })

  it('leaves out purchases and statements, wherever the words are', () => {
    expect(pairs([row({ type: TYPE_EXPENSE, title: 'Tilinpäätös 2031', file_name: 'lasku.pdf' })])).toEqual([])
    expect(pairs([row({ type: TYPE_BANK_STATEMENT, title: 'PRH', file_name: 'kuitti.pdf' })])).toEqual([])
  })

  it('reads a file with a generated name by the title, even among other files', () => {
    const voucher_id = 901
    const shared = { voucher_id, date: '2032-04-01', title: 'Tilinpäätös 2031', type: TYPE_OTHER }
    expect(
      pairs([
        row({ ...shared, attachment_id: 1, file_name: 'f3c90d17ab6b42e08c5d6b7719e0a2cd41be6f08.pdf' }),
        row({ ...shared, attachment_id: 2, file_name: 'Tq8wZmK3xLd7PvN2yQ_HfA__.pdf' }),
      ]),
    ).toEqual([
      ['financial_statements', '2031-12-31'],
      ['financial_statements', '2031-12-31'],
    ])
  })

  it('does not take a name with a date for a generated one', () => {
    const voucher_id = 902
    const shared = { voucher_id, date: '2032-04-01', title: 'Tilinpäätös 2031', type: TYPE_OTHER }
    expect(pairs([row({ ...shared, attachment_id: 1, file_name: 'Liite_Kuvat_03_05_2032.pdf' }), row({ ...shared, attachment_id: 2, file_name: 'muu.pdf' })])).toEqual([])
  })

  it('offers a file on two vouchers once, the type-800 one', () => {
    const name = 'Verotuspaatos (pdf)_12.06.2032.pdf'
    const out = suggest([
      row({ voucher_id: 10, date: '2032-08-17', type: TYPE_OTHER, title: 'Maksu', file_name: name }),
      row({ voucher_id: 20, date: '2032-06-12', title: 'Verotuspäätös 2031', file_name: name }),
    ])
    expect(out.map((s) => s.voucher_id)).toEqual([20])
  })

  it('does not offer a file again once it is linked', () => {
    const name = 'Verotuspaatos (pdf)_12.06.2032.pdf'
    expect(
      suggest([
        row({ voucher_id: 11, type: TYPE_OTHER, title: 'Maksu', file_name: name }),
        row({ voucher_id: 21, title: 'Verotuspäätös 2031', file_name: name, linked: true }),
      ]),
    ).toEqual([])
  })

  it("leaves out another module's documents and rejected suggestions", () => {
    const rows = [row({ voucher_id: 30, title: 'Hallituksen kokous', file_name: 'a.pdf' }), row({ voucher_id: 31, title: 'Hallituksen kokous', file_name: 'b.pdf' })]
    expect(suggest(rows, { excluded: [30] }).map((s) => s.voucher_id)).toEqual([31])
    expect(suggest(rows, { dismissed: ['31::board_minutes'] }).map((s) => s.voucher_id)).toEqual([30])
  })

  it('keeps a rejected duplicate rejected', () => {
    const name = 'poytakirja.pdf'
    const rows = [
      row({ voucher_id: 40, title: 'Yhtiökokous', file_name: name }),
      row({ voucher_id: 41, title: 'Yhtiökokous', type: TYPE_OTHER, file_name: name }),
    ]
    expect(suggest(rows, { dismissed: ['40::agm_minutes'] })).toEqual([])
  })

  it('sends a whole voucher back as a whole voucher', () => {
    const [s] = suggest([row({ voucher_id: 50, title: 'Kaupparekisteriote', file_name: 'ote.pdf' })])
    expect(s).toMatchObject({ key: '50::trade_register_extract', kind: 'trade_register_extract', period_ends: null, attachment_id: null })
  })
})
