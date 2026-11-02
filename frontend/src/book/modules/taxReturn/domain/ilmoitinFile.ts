/**
 * The return as an Ilmoitin file: `name:value` lines in ISO-8859-1, as Vero's general description of
 * e-filing and the record description `VSY06B26` say. Pure and run in the browser: the personal IDs it
 * writes are typed for this file only, and reach neither the book nor a server.
 */
import { ANSWERS, PNL_GROUPS, BALANCE_GROUPS, SPEC_YEAR, openAnswers } from './fields6b'
import { typedAmount } from './omaVeroText'
import type { TaxReturnView } from './types'

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

  add(0, `VSY06B${String(year).slice(-2)}`)
  add(48, SOFTWARE_NAME)
  add(14, `${company.business_id}${SOFTWARE_SUFFIX}`)
  add(198, stamp(options.now))
  add(10, company.business_id)
  add(54, `${fileDate(view.starts)}-${fileDate(view.ends)}`)

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
  add(999, 1)

  const notices: FileNotice[] = []
  for (const form of view.forms) {
    if (form.in_file && !form.built) notices.push({ key: 'form', form: form.form })
  }
  // Open questions are not a reconciliation to fix, and they already stop the file above.
  if (view.checks.some((check) => check.state === 'crit' && check.key !== 'unanswered')) notices.push({ key: 'checks' })
  if (year !== SPEC_YEAR) notices.push({ key: 'spec_year', year })

  const text = lines.join('\r\n')
  const bytes = problems.length ? null : Uint8Array.from(text, (ch) => ch.charCodeAt(0))
  return { name: `6B_${company.business_id}_${year}.txt`, bytes, text, problems, notices }
}
