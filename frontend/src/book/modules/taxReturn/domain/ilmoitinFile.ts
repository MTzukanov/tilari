/**
 * The return as an Ilmoitin file: `name:value` lines in ISO-8859-1, as Vero's general description of
 * e-filing and the record description `VSY06B26` say. Pure and run in the browser: the personal IDs it
 * writes are typed for this file only, and reach neither the book nor a server.
 */
import { isValidFinnishBusinessId } from '../../../businessId'
import { ANSWERS, PNL_GROUPS, BALANCE_GROUPS, SPEC_YEAR, openAnswers } from './fields6b'
import { SALE_GAIN_CODES, SALE_LOSS_CODES, SALE_SUMMARY_GAINS, SALE_SUMMARY_RESULT } from './form71b'
import { FORM_73_LISTED_COMPANY, FORM_73_TAXABLE, FORM_73_TAXFREE, FORM_73_TOTAL } from './form73'
import { FORM_8A_COST_TOTAL, FORM_8A_VALUE_TOTAL, HOLDING_GROUPS, parseShares, parseUnitValue } from './form8a'
import { typedAmount } from './omaVeroText'
import type { SaleRow, TaxReturnView } from './types'

/** Tilari is the software for this file: the filer's own ID plus two characters, as Vero instructs. */
const SOFTWARE_NAME = 'Tilari'
const SOFTWARE_SUFFIX = '_TL'

export type FileProblem =
  | { key: 'business_id' }
  | { key: 'contact_name' }
  | { key: 'contact_phone' }
  | { key: 'audit' }
  | { key: 'audit_remarks' }
  | { key: 'no_shareholders' }
  | { key: 'shareholder_id'; name: string }
  | { key: 'negative'; code: number }
  | { key: 'text'; code: number }
  | { key: 'distribution'; code: number }
  | { key: 'answer'; answer: string }
  | { key: 'unanswered'; count: number }
  | { key: 'form62_negative'; row: string }
  | { key: 'form73_listed' }
  | { key: 'form73_ownership'; row: string }
  | { key: 'holding_name'; row: string }
  | { key: 'holding_id'; row: string }
  | { key: 'holding_shares'; row: string }
  | { key: 'holding_unit'; row: string }
  | { key: 'holding_cost'; row: string }
  | { key: 'sale_fields'; row: string }
  | { key: 'sale_id'; row: string }
  | { key: 'sale_share'; row: string }

/** Vero's own remarks: the file still goes through. */
export type FileRemark = { key: 'holding_no_id' | 'holding_no_value'; count: number }

export type FileNotice =
  | { key: 'form'; form: string }
  | { key: 'checks' }
  | { key: 'spec_year'; year: number }

export type IlmoitinFile = {
  name: string
  /** `null` while a problem stops the file. */
  bytes: Uint8Array | null
  text: string
  problems: FileProblem[]
  /** Reasons the file can be checked in Ilmoitin but not yet sent. */
  notices: FileNotice[]
  remarks: FileRemark[]
}

function fileDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return y && m && d ? `${d}${m}${y}` : ''
}

function stamp(now: Date): string {
  const two = (n: number) => String(n).padStart(2, '0')
  return `${two(now.getDate())}${two(now.getMonth() + 1)}${now.getFullYear()}${two(now.getHours())}${two(now.getMinutes())}${two(now.getSeconds())}`
}

const BUSINESS_ID = /^\d{7}-\d$/
/** Also Vero's dummy code `ddmmyyAUUUU`, which it allows in test files. */
const PERSON_ID = /^\d{6}(?:[-+A-FU-Y]\d{3}[0-9A-Y]|AUUUU)$/

/** ISO-8859-1 printable characters only: no euro sign, no line breaks. */
function validText(value: string): boolean {
  return [...value].every((ch) => {
    const code = ch.codePointAt(0) ?? 0
    return (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff)
  })
}

/** Vero's `MAATUNNUS`: two capital letters. */
const COUNTRY = /^[A-Z]{2}$/
/** Vero's `+D3,2`: up to 100, two decimals. */
const PERCENT = /^(?:100(?:,0{1,2})?|\d{1,2}(?:,\d{1,2})?)$/

function validSaleId(row: SaleRow): boolean {
  if (row.id_type === 1) return isValidFinnishBusinessId(row.id_code)
  if (row.id_type === 3) return COUNTRY.test(row.id_code)
  return row.id_code.length > 0 && row.id_code.length <= 23
}

export type FileOptions = {
  /** Shareholder IDs by position in `inputs.shareholders`. */
  ids: string[]
  now: Date
}

export function ilmoitinFile(view: TaxReturnView, options: FileOptions): IlmoitinFile {
  const { inputs, values, company } = view
  const problems: FileProblem[] = []
  const year = Number(view.ends.slice(0, 4))
  const lines: string[] = []

  const add = (code: number, value: string | number) => lines.push(`${String(code).padStart(3, '0')}:${value}`)
  const addText = (code: number, value: string, max: number) => {
    const clean = value.trim()
    if (!validText(clean) || clean.length > max) problems.push({ key: 'text', code })
    add(code, clean)
  }
  const addMoney = (code: number, cents: number) => {
    if (cents) add(code, typedAmount(cents))
  }

  if (!BUSINESS_ID.test(company.business_id)) problems.push({ key: 'business_id' })
  if (!company.contact_name.trim()) problems.push({ key: 'contact_name' })
  if (!company.contact_phone.trim()) problems.push({ key: 'contact_phone' })

  const yy = String(year).slice(-2)
  const formHeader = (record: string) => {
    add(0, `${record}${yy}`)
    add(48, SOFTWARE_NAME)
    add(14, `${company.business_id}${SOFTWARE_SUFFIX}`)
    add(198, stamp(options.now))
    add(10, company.business_id)
    add(54, `${fileDate(view.starts)}-${fileDate(view.ends)}`)
  }

  formHeader('VSY06B')

  const unanswered = openAnswers(inputs.answers).length
  if (unanswered) problems.push({ key: 'unanswered', count: unanswered })
  for (const answer of ANSWERS) {
    if (!inputs.answers[answer.key]) continue
    if (answer.blocksFile) problems.push({ key: 'answer', answer: answer.key })
    if (answer.fileCode != null && answer.fileCode !== 586) add(answer.fileCode, 1)
  }

  addText(41, company.contact_name, 70)
  addText(42, company.contact_phone, 35)
  if (inputs.contact_email) addText(44, inputs.contact_email, 70)

  if (inputs.shareholders.length) {
    add(1, inputs.shareholders.length)
    inputs.shareholders.forEach((holder, index) => {
      const id = (options.ids[index] ?? '').trim()
      if (!BUSINESS_ID.test(id) && !PERSON_ID.test(id)) problems.push({ key: 'shareholder_id', name: holder.name })
      addText(701, holder.name, 70)
      add(703, id)
      add(570, holder.shares)
      addMoney(706, holder.rents_cents)
      addMoney(708, holder.interest_cents)
      addMoney(707, holder.sales_cents)
      addMoney(709, holder.other_cents)
      addMoney(864, holder.loans_cents)
      add(9, index + 1)
    })
  } else if (!inputs.all_below_10_percent) {
    problems.push({ key: 'no_shareholders' })
  }
  if (inputs.all_below_10_percent) add(185, 1)
  if (inputs.own_shares) add(571, inputs.own_shares)

  const distribution = (
    item: TaxReturnView['inputs']['dividend'],
    [decided, payable, amount]: [number, number, number],
  ) => {
    if (!item) return
    if (!item.decided || !item.payable || !item.amount_cents) problems.push({ key: 'distribution', code: amount })
    add(1, 1)
    add(decided, fileDate(item.decided))
    add(payable, fileDate(item.payable))
    add(amount, typedAmount(item.amount_cents))
    add(9, 1)
  }
  distribution(inputs.dividend, [537, 538, 522])
  distribution(inputs.free_equity, [294, 295, 293])
  if (inputs.answers.own_shares_changed) add(586, 1)

  const addRows = (groups: typeof PNL_GROUPS) => {
    for (const group of groups) {
      for (const row of group.rows) {
        const book = values[row.code] ?? 0
        if (!row.signed && book < 0) problems.push({ key: 'negative', code: row.code })
        addMoney(row.code, book)
        if (row.taxCode != null) addMoney(row.taxCode, values[row.taxCode] ?? 0)
      }
      for (const total of group.totals ?? []) addMoney(total.code, values[total.code] ?? 0)
    }
  }
  addRows(PNL_GROUPS)
  if (values[505] || values[504]) {
    addMoney(504, values[504] ?? 0)
    add(505, typedAmount(values[505] ?? 0))
  } else {
    add(500, typedAmount(values[500] ?? 0))
  }
  addRows(BALANCE_GROUPS.filter((group) => group.key !== 'debts' && group.key !== 'equity'))

  const debts = BALANCE_GROUPS.find((group) => group.key === 'debts')
  for (const row of debts?.rows ?? []) {
    const cents = values[row.code] ?? 0
    if (cents < 0) problems.push({ key: 'negative', code: row.code })
    addMoney(row.code, cents)
  }
  addMoney(460, values[460] ?? 0)
  addMoney(461, values[461] ?? 0)
  addMoney(462, values[462] ?? 0)
  if (values[574]) add(574, typedAmount(values[574]))
  else add(573, typedAmount(values[573] ?? 0))

  const equity = BALANCE_GROUPS.find((group) => group.key === 'equity')
  for (const row of equity?.rows ?? []) {
    const cents = values[row.code] ?? 0
    if (!row.signed && cents < 0) problems.push({ key: 'negative', code: row.code })
    addMoney(row.code, cents)
  }
  add(478, typedAmount(values[478] ?? 0))

  // Vero added this field to the 2026 record description; earlier years reject it.
  if (year >= 2026) add(179, inputs.statements_prepared ? 1 : 2)
  if (inputs.audit == null) problems.push({ key: 'audit' })
  else add(177, inputs.audit)
  if (inputs.audit === 1) {
    if (inputs.audit_remarks == null) problems.push({ key: 'audit_remarks' })
    else add(178, inputs.audit_remarks ? 1 : 2)
  }
  if (inputs.ownership_change_year) add(531, inputs.ownership_change_year)
  let formNumber = 1
  add(999, formNumber)

  if (view.form62.used) {
    formHeader('VSY062')
    for (const section of view.form62.sections) {
      for (const row of section.rows) {
        if (row.role !== 'difference' && row.cents < 0) problems.push({ key: 'form62_negative', row: row.label })
        addMoney(row.code, row.cents)
      }
    }
    add(999, (formNumber += 1))
  }

  // Form 73 goes in only once it has amounts: until then its check says what is missing.
  if (view.forms.some((form) => form.form === '73') && view.form73.typed) {
    formHeader('VSY073')
    if (view.form73.company_listed == null) problems.push({ key: 'form73_listed' })
    if (view.form73.company_listed) add(FORM_73_LISTED_COMPANY, 1)
    for (const row of view.form73.classes) {
      if (!row.cents) continue
      if (row.codes.listed != null && row.listed) add(row.codes.listed, 1)
      addMoney(row.codes.total, row.cents)
      addMoney(row.codes.share, row.share_cents)
      if (row.codes.ownership != null && row.ownership) {
        if (!PERCENT.test(row.ownership)) problems.push({ key: 'form73_ownership', row: row.title })
        add(row.codes.ownership, row.ownership.replace('.', ','))
      }
    }
    addMoney(FORM_73_TOTAL, view.form73.total_cents)
    addMoney(FORM_73_TAXFREE, view.form73.taxfree_cents)
    addMoney(FORM_73_TAXABLE, view.form73.taxable_cents)
    add(999, (formNumber += 1))
  }

  const remarks: FileRemark[] = []
  const holdingRows = view.form8a.groups.flatMap((group) => group.lines)
  if (holdingRows.length) {
    formHeader('VSY08A')
    for (const group of view.form8a.groups) {
      const codes = HOLDING_GROUPS.find((def) => def.key === group.key)?.codes
      if (!codes || !group.lines.length) continue
      add(1, group.lines.length)
      group.lines.forEach((line, index) => {
        const label = line.name || line.business_id || `${group.title} ${index + 1}`
        if (!line.name) problems.push({ key: 'holding_name', row: label })
        if (line.cost_cents < 0) problems.push({ key: 'holding_cost', row: label })
        if (line.business_id && !isValidFinnishBusinessId(line.business_id)) problems.push({ key: 'holding_id', row: label })
        addText(codes.name, line.name, 140)
        if (line.business_id) add(codes.id, line.business_id)
        if (parseShares(line.shares)) add(codes.shares, line.shares)
        addMoney(codes.cost, line.cost_cents)
        if (line.unit_value) {
          if (parseUnitValue(line.unit_value) == null) problems.push({ key: 'holding_unit', row: label })
          add(codes.unit, line.unit_value.replace('.', ','))
        }
        addMoney(codes.total, line.value_cents)
        add(9, index + 1)
      })
      if (parseShares(group.shares_total)) add(codes.sharesTotal, group.shares_total)
      addMoney(codes.costTotal, group.cost_cents)
      addMoney(codes.valueTotal, group.value_cents)
    }
    addMoney(FORM_8A_COST_TOTAL, view.form8a.cost_cents)
    addMoney(FORM_8A_VALUE_TOTAL, view.form8a.value_cents)
    add(999, (formNumber += 1))

    for (const row of view.form8a.groups.flatMap((group) => group.rows)) {
      if (parseShares(row.shares) == null) problems.push({ key: 'holding_shares', row: row.name || row.era_text })
    }
    const noId = holdingRows.filter((line) => !line.business_id).length
    if (noId) remarks.push({ key: 'holding_no_id', count: noId })
    // Housing shares bought since 2006 have no separate comparison value (Vero's guide to 8A): no remark in Muu omaisuus.
    const noValue = view.form8a.groups.filter((group) => group.key !== 'other').flatMap((group) => group.lines).filter((line) => !line.value_cents).length
    if (noValue) remarks.push({ key: 'holding_no_value', count: noValue })
  }

  const { rows: saleRows } = view.form71b
  if (saleRows.length) {
    formHeader('VSY71B')
    const gains = saleRows.filter((row) => row.result_cents >= 0)
    const losses = saleRows.filter((row) => row.result_cents < 0)
    for (const row of saleRows) {
      const label = row.name || row.id_code || row.sold
      if (!row.name) problems.push({ key: 'sale_fields', row: label })
      if (!validSaleId(row)) problems.push({ key: 'sale_id', row: label })
    }
    if (gains.length) {
      const codes = SALE_GAIN_CODES
      add(1, gains.length)
      gains.forEach((row, index) => {
        const label = row.name || row.id_code || row.sold
        if (!row.acquired || !row.sold) problems.push({ key: 'sale_fields', row: label })
        if (!PERCENT.test(row.share_after)) problems.push({ key: 'sale_share', row: label })
        add(codes.idType, row.id_type)
        addText(codes.name, row.name, 70)
        addText(codes.id, row.id_code, 23)
        if (row.apartment) addText(codes.apartment, row.apartment, 5)
        add(codes.acquired, fileDate(row.acquired))
        add(codes.sold, fileDate(row.sold))
        add(codes.shareAfter, row.share_after)
        add(codes.price, typedAmount(row.price_cents))
        add(codes.cost, typedAmount(row.cost_cents))
        add(codes.expenses, typedAmount(row.expenses_cents))
        add(codes.result, typedAmount(row.result_cents))
        add(9, index + 1)
      })
      add(codes.total, typedAmount(view.form71b.gains_cents))
    }
    if (losses.length) {
      const codes = SALE_LOSS_CODES
      add(1, losses.length)
      losses.forEach((row, index) => {
        add(codes.idType, row.id_type)
        addText(codes.name, row.name, 70)
        addText(codes.id, row.id_code, 23)
        add(codes.price, typedAmount(row.price_cents))
        add(codes.cost, typedAmount(row.cost_cents))
        add(codes.expenses, typedAmount(row.expenses_cents))
        add(codes.result, typedAmount(-row.result_cents))
        add(9, index + 1)
      })
      add(codes.total, typedAmount(view.form71b.losses_cents))
    }
    if (gains.length) {
      add(SALE_SUMMARY_GAINS, typedAmount(view.form71b.gains_cents))
      add(SALE_SUMMARY_RESULT, typedAmount(view.form71b.gains_cents))
    }
    add(999, (formNumber += 1))
  }

  const notices: FileNotice[] = []
  for (const form of view.forms) {
    if (form.in_file && !form.built) notices.push({ key: 'form', form: form.form })
  }
  // Open questions are not a reconciliation to fix, and they already stop the file above.
  if (view.checks.some((check) => check.state === 'crit' && check.key !== 'unanswered')) notices.push({ key: 'checks' })
  if (year !== SPEC_YEAR) notices.push({ key: 'spec_year', year })

  const text = lines.join('\r\n')
  const bytes = problems.length ? null : Uint8Array.from(text, (ch) => ch.charCodeAt(0))
  return { name: `6B_${company.business_id}_${year}.txt`, bytes, text, problems, notices, remarks }
}
