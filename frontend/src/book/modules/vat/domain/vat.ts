import { getSettings } from '../../../access'
import { isPracticeValue } from '../../../clock'
import { asCents } from '../../../cents'
import { PostingError } from '../../../errors'
import { saveVoucher } from '../../../posting'
import { sha256hexSync } from '../../../sha256'
import type { SqliteDb } from '../../../sqlite'
import type { SaveEntryInput } from '../../../types'
import {
  accountByType,
  forceRealizeLines,
  listOpenParkedEras,
  vatPayableAccount,
  vatReceivableAccount,
} from './vatCashBasis'
import { parseJson } from '../../../json'
import {
  addMonthsIso,
  isCashBasisVat,
  periodAlreadyFiled,
  vatDueDate,
  type VatFilingSummary,
  type VatPeriod,
} from './vatPeriod'
import { vatCodeTitle, VAT_BOX_TITLES } from './vatLabels'
import { TYPE_VAT_RETURN } from '../../../vouchers'

export {
  existingVatFilings,
  nextVatPeriod,
  vatDueDate,
  isCashBasisVat,
  periodAlreadyFiled,
  shiftVatPeriod,
} from './vatPeriod'
export {
  creditCashBasisLines,
  paymentRealizeLines,
  forceRealizeLines,
  listOpenParkedEras,
} from './vatCashBasis'
export { vatBoxTitle, vatCodeTitle, VAT_BOX_TITLES, VAT_CODE_TITLES } from './vatLabels'

const BOX_LABELS = VAT_BOX_TITLES

export type VatRow = {
  vat_code: number
  vat_percent: number
  kind: 'sales' | 'purchase' | 'parked'
  net_cents: number
  tax_cents: number
  parked_tax_cents: number
}

export type VatDetailLine = {
  date: string
  voucher_id: number
  doc_number: number | null
  series: string
  account: number
  account_name: string
  partner_name: string
  description: string
  vat_code: number
  vat_percent: number
  debit_cents: number
  credit_cents: number
}

export type VatSummary = {
  start_date: string
  end_date: string
  due_date: string
  cash_basis: boolean
  rows: VatRow[]
  boxes: Record<string, number>
  detail: VatDetailLine[]
  output_vat_cents: number
  input_vat_cents: number
  vat_payable_cents: number
  parked_sales_cents: number
  parked_purchase_cents: number
}

/** GET /api/vat — filings list + optional period preview. */
export type VatResponse = {
  filings: VatFilingSummary[]
  next_period: VatPeriod | null
  period_totals: VatSummary | null
  preview_html: string | null
}

function pctKey(pct: number): number {
  // Kitsas uses hundredths of a percent (2550 = 25.5%)
  return Math.round(pct * 100)
}

/**
 * Kitsas `AlvLaskelma::debetistaKoodilla`: the side that is positive in a code's sum
 * (purchases 2x/4x8, deductions 2xx and 932 from debit; sales and taxes from credit).
 */
export function debitPositive(code: number): boolean {
  const hundreds = Math.floor(code / 100)
  return (
    ((hundreds === 0 || hundreds === 4) && Math.floor((code % 20) / 10) === 0) ||
    hundreds === 2 ||
    code === 932
  )
}

/** One VAT-coded line in the period table (posted lines and the return's own corrections). */
type TableLine = {
  code: number
  rate: number
  account: number
  debit: number
  credit: number
}

function signedOf(l: TableLine): number {
  return debitPositive(l.code) ? l.debit - l.credit : l.credit - l.debit
}

function sumCodes(table: TableLine[], codes: number[], rates?: number[]): number {
  return table
    .filter((l) => codes.includes(l.code) && (!rates || rates.includes(l.rate)))
    .reduce((s, l) => s + signedOf(l), 0)
}

function sumRange(table: TableLine[], from: number, to: number): number {
  return table.filter((l) => l.code >= from && l.code <= to).reduce((s, l) => s + signedOf(l), 0)
}

/** Kitsas `kotimaanmyyntivero`: domestic sales tax codes summed for a rate. */
const DOMESTIC_SALES_TAX_CODES = [111, 112, 118, 113, 151, 129]

/** Lines the VAT return books itself (brutto/margin corrections, cash-basis nollaus). */
export type VatCorrectionLine = SaveEntryInput & { vat_code: number }

type VatAccounts = { liability: number; receivable: number }

function vatAccounts(db: SqliteDb): VatAccounts {
  return { liability: vatPayableAccount(db), receivable: vatReceivableAccount(db) }
}

/** Kitsas `oikaiseBruttoKirjaukset`: tax out of brutto sales (12) and purchases (22). */
function bruttoCorrections(table: TableLine[], acc: VatAccounts, endDate: string): VatCorrectionLine[] {
  const out: VatCorrectionLine[] = []
  for (const code of [12, 22]) {
    const sales = code === 12
    const groups = new Map<string, { rate: number; account: number; brutto: number }>()
    for (const l of table) {
      if (l.code !== code) continue
      const key = `${l.rate}|${l.account}`
      const g = groups.get(key) ?? { rate: l.rate, account: l.account, brutto: 0 }
      g.brutto += sales ? l.credit - l.debit : l.debit - l.credit
      groups.set(key, g)
    }
    for (const g of groups.values()) {
      const netto = Math.round((g.brutto * 10000) / (10000 + g.rate))
      const vero = g.brutto - netto
      if (!vero) continue
      const pct = g.rate / 100
      const description = `${sales ? 'Bruttomyyntien' : 'Brutto-ostojen'} oikaisu ${g.account}`
      const pos = vero > 0
      const abs = Math.abs(vero)
      // Off the booked account (sales: debit, purchases: credit) ...
      out.push({
        account: g.account,
        debit_cents: sales === pos ? abs : null,
        credit_cents: sales === pos ? null : abs,
        vat_code: code,
        vat_percent: pct,
        entry_type: 91091,
        date: endDate,
        description,
      })
      // ... onto the VAT liability (112) or receivable (222).
      out.push({
        account: sales ? acc.liability : acc.receivable,
        debit_cents: sales === pos ? null : abs,
        credit_cents: sales === pos ? abs : null,
        vat_code: sales ? 112 : 222,
        vat_percent: pct,
        entry_type: 91091,
        date: endDate,
        description,
      })
    }
  }
  return out
}

/** Margin-scheme deficits carried from the previous return (Kitsas json.alv.marginaalialijaama). */
function previousMarginDeficits(db: SqliteDb, startDate: string): Record<string, number> {
  const prevEnd = addDaysIsoLocal(startDate, -1)
  const rows = db.all<{ json: unknown }>(
    'SELECT json FROM Tosite WHERE tyyppi = ? AND tila >= 100',
    [TYPE_VAT_RETURN],
  )
  for (const row of rows) {
    const alv = parseJson(row.json).alv as Record<string, unknown> | undefined
    if (!alv || String(alv.kausipaattyy ?? alv.end_date ?? '') !== prevEnd) continue
    const map = alv.marginaalialijaama
    if (map && typeof map === 'object') return map as Record<string, number>
  }
  return {}
}

function addDaysIsoLocal(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return dt.toISOString().slice(0, 10)
}

/** Kitsas `laskeMarginaaliVerotus` for 24 (+25.5), 14 (+13.5) and 10 %. */
function marginCorrections(
  db: SqliteDb,
  table: TableLine[],
  acc: VatAccounts,
  startDate: string,
  endDate: string,
): { lines: VatCorrectionLine[]; deficits: Record<string, number> } {
  const lines: VatCorrectionLine[] = []
  const deficits: Record<string, number> = {}
  const previous = previousMarginDeficits(db, startDate)
  const travelAgency = /^(on|1|true)$/i.test(String(getSettings(db, ['AlvMatkatoimisto']).AlvMatkatoimisto || ''))
  for (const kanta of [2400, 1400, 1000]) {
    const salesRates = kanta === 2400 ? [2400, 2550] : [kanta]
    const purchaseRates = kanta === 2400 ? [2400, 2550] : kanta === 1400 ? [1400, 1350] : [kanta]
    const laskukanta = kanta === 2400 && endDate > '2024-09-01' ? 2550 : kanta
    const salesLines = table.filter((l) => l.code === 13 && salesRates.includes(l.rate))
    const myynti = salesLines.reduce((s, l) => s + l.credit - l.debit, 0)
    const ostot = table
      .filter((l) => l.code === 23 && purchaseRates.includes(l.rate))
      .reduce((s, l) => s + l.debit - l.credit, 0)
    const key = (kanta / 100).toFixed(2)
    const alijaama = Math.round(Number(previous[key] || 0) * 100)
    const marginaali = myynti - ostot - alijaama
    const vero = Math.round((laskukanta / (10000 + laskukanta)) * marginaali)
    if (vero > 0 || (vero < 0 && travelAgency)) {
      const byAccount = new Map<number, number>()
      for (const l of salesLines) byAccount.set(l.account, (byAccount.get(l.account) || 0) + l.credit - l.debit)
      for (const [account, tilinmyynti] of byAccount) {
        const eurot = myynti ? Math.round((tilinmyynti / myynti) * vero) : 0
        if (!eurot) continue
        const abs = Math.abs(eurot)
        const description = `Voittomarginaalivero (verokanta ${(laskukanta / 100).toFixed(2)} %)`
        lines.push({
          account,
          debit_cents: eurot > 0 ? abs : null,
          credit_cents: eurot > 0 ? null : abs,
          vat_code: 913,
          vat_percent: laskukanta / 100,
          entry_type: 91091,
          date: endDate,
          description,
        })
        lines.push({
          account: acc.liability,
          debit_cents: eurot > 0 ? null : abs,
          credit_cents: eurot > 0 ? abs : null,
          vat_code: 113,
          vat_percent: laskukanta / 100,
          date: endDate,
          description,
        })
      }
    } else if (marginaali < 0) {
      deficits[key] = -marginaali / 100
    }
  }
  return { lines, deficits }
}

function tableLine(l: { vat_code?: number | null; vat_percent?: number | null; account: number; debit_cents?: number | null; credit_cents?: number | null }): TableLine {
  return {
    code: Number(l.vat_code || 0),
    rate: pctKey(Number(l.vat_percent || 0)),
    account: Number(l.account),
    debit: asCents(l.debit_cents),
    credit: asCents(l.credit_cents),
  }
}

/** Box values like Kitsas `kirjoitaYhteenveto` from the finished table. */
function boxesOf(table: TableLine[]): Record<string, number> {
  const verot = sumRange(table, 100, 199)
  const vahennys = sumRange(table, 200, 299)
  const raw: Record<number, number> = {
    301: sumCodes(table, DOMESTIC_SALES_TAX_CODES, [2550, 2400]),
    302: sumCodes(table, DOMESTIC_SALES_TAX_CODES, [1400, 1350]),
    303: sumCodes(table, DOMESTIC_SALES_TAX_CODES, [1000]),
    304: sumCodes(table, [127]),
    305: sumCodes(table, [124]),
    306: sumCodes(table, [125]),
    307: vahennys,
    308: verot - vahennys,
    309: sumCodes(table, [19]),
    310: sumCodes(table, [27]),
    311: sumCodes(table, [14]),
    312: sumCodes(table, [15]),
    313: sumCodes(table, [24]),
    314: sumCodes(table, [25]),
    318: sumCodes(table, [126]),
    319: sumCodes(table, [16]),
    320: sumCodes(table, [26]),
  }
  const boxes: Record<string, number> = {}
  for (const [box, value] of Object.entries(raw)) if (value) boxes[box] = value
  return boxes
}

const SALES_BASE_CODES = new Set([11, 12, 13, 14, 15, 16, 18, 19, 51])

export type VatComputation = {
  summary: VatSummary
  /** Brutto, margin and (for a return) cash-basis nollaus lines the return books. */
  corrections: VatCorrectionLine[]
  marginDeficits: Record<string, number>
}

/**
 * VAT for a period like Kitsas `AlvLaskelma`: every posted VAT-coded line dated in the period
 * except those of VAT returns, plus the corrections the return books (brutto 12/22, margin
 * 13/23, and `extra` such as cash-basis nollaus). Boxes are sums of code ranges.
 */
export function computeVatDetailed(
  db: SqliteDb,
  startDate: string,
  endDate: string,
  extra: VatCorrectionLine[] = [],
): VatComputation {
  const rows = db.all<{
    vat_code: number | null
    vat_percent: number | null
    debetsnt: number | null
    kreditsnt: number | null
    voucher_type: number | null
    voucher_id: number
    doc_number: number | null
    series: string | null
    date: string
    account: number
    account_name: string | null
    partner_name: string | null
    description: string | null
  }>(
    `SELECT
       Vienti.alvkoodi AS vat_code,
       Vienti.alvprosentti AS vat_percent,
       Vienti.debetsnt AS debetsnt,
       Vienti.kreditsnt AS kreditsnt,
       Tosite.tyyppi AS voucher_type,
       Tosite.id AS voucher_id,
       Tosite.tunniste AS doc_number,
       Tosite.sarja AS series,
       Vienti.pvm AS date,
       Vienti.tili AS account,
       COALESCE(json_extract(Tili.json, '$.nimi.fi'), '') AS account_name,
       COALESCE(Kumppani.nimi, '') AS partner_name,
       Vienti.selite AS description
     FROM Vienti
     JOIN Tosite ON Vienti.tosite = Tosite.id
     LEFT JOIN Tili ON Tili.numero = Vienti.tili
     LEFT JOIN Kumppani ON Kumppani.id = COALESCE(Vienti.kumppani, Tosite.kumppani)
     WHERE Tosite.tila >= 100 AND Tosite.tyyppi <> ? AND Vienti.alvkoodi <> 0
       AND Vienti.pvm >= ? AND Vienti.pvm <= ?
     ORDER BY Vienti.pvm, Tosite.tunniste, Vienti.rivi`,
    [TYPE_VAT_RETURN, startDate, endDate],
  )

  const table: TableLine[] = []
  const detail: VatDetailLine[] = []
  for (const row of rows) {
    const line = tableLine({
      vat_code: row.vat_code,
      vat_percent: row.vat_percent,
      account: row.account,
      debit_cents: row.debetsnt,
      credit_cents: row.kreditsnt,
    })
    table.push(line)
    detail.push({
      date: String(row.date),
      voucher_id: Number(row.voucher_id),
      doc_number: row.doc_number == null ? null : Number(row.doc_number),
      series: String(row.series || ''),
      account: line.account,
      account_name: String(row.account_name || ''),
      partner_name: String(row.partner_name || ''),
      description: row.description || '',
      vat_code: line.code,
      vat_percent: Number(row.vat_percent || 0),
      debit_cents: line.debit,
      credit_cents: line.credit,
    })
  }

  const acc = vatAccounts(db)
  const brutto = bruttoCorrections(table, acc, endDate)
  const margin = marginCorrections(db, table, acc, startDate, endDate)
  const corrections = [...brutto, ...margin.lines, ...extra]
  for (const c of corrections) {
    table.push(tableLine(c))
    detail.push({
      date: endDate,
      voucher_id: 0,
      doc_number: null,
      series: '',
      account: Number(c.account),
      account_name: '',
      partner_name: '',
      description: c.description || '',
      vat_code: Number(c.vat_code),
      vat_percent: Number(c.vat_percent || 0),
      debit_cents: asCents(c.debit_cents),
      credit_cents: asCents(c.credit_cents),
    })
  }

  // Rows for the UI: base code + rate, net amount and the tax (1xx sales / 2xx deduction).
  const groups = new Map<string, VatRow>()
  for (const l of table) {
    if (l.code === 901 || l.code === 913 || l.code === 932) continue
    const parked = l.code >= 400 && l.code < 500
    const base = parked ? l.code : l.code % 100
    const key = `${base}|${l.rate}`
    let g = groups.get(key)
    if (!g) {
      g = {
        vat_code: base,
        vat_percent: l.rate / 100,
        kind: parked ? 'parked' : SALES_BASE_CODES.has(base) ? 'sales' : 'purchase',
        net_cents: 0,
        tax_cents: 0,
        parked_tax_cents: 0,
      }
      groups.set(key, g)
    }
    if (parked) g.parked_tax_cents += signedOf(l)
    else if (l.code < 100) g.net_cents += signedOf(l)
    else if (g.kind === 'sales' ? l.code < 200 : l.code >= 200) g.tax_cents += signedOf(l)
  }
  const outRows = [...groups.values()]
    .filter((r) => r.net_cents || r.tax_cents || r.parked_tax_cents)
    .sort((a, b) => a.vat_code - b.vat_code || a.vat_percent - b.vat_percent)

  const verot = sumRange(table, 100, 199)
  const vahennys = sumRange(table, 200, 299)
  const kausi = Number(getSettings(db, ['AlvKausi']).AlvKausi || 1)
  const summary: VatSummary = {
    start_date: startDate,
    end_date: endDate,
    due_date: vatDueDate(endDate, kausi === 3 || kausi === 12 ? kausi : 1),
    cash_basis: isCashBasisVat(db, endDate),
    rows: outRows,
    boxes: boxesOf(table),
    detail,
    output_vat_cents: verot,
    input_vat_cents: vahennys,
    vat_payable_cents: verot - vahennys,
    parked_sales_cents: sumCodes(table, [418]),
    parked_purchase_cents: sumCodes(table, [428]),
  }
  return { summary, corrections, marginDeficits: margin.deficits }
}

export function computeVat(db: SqliteDb, startDate: string, endDate: string): VatSummary {
  return computeVatDetailed(db, startDate, endDate).summary
}

function formatEur(cents: number): string {
  const neg = cents < 0
  const abs = Math.abs(cents)
  const whole = Math.floor(abs / 100)
  const frac = String(abs % 100).padStart(2, '0')
  const withSpaces = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0')
  return `${neg ? '−' : ''}${withSpaces},${frac}`
}

/** Empty cell when amount is zero (Kitsas-style erittely). */
function formatEurCell(cents: number): string {
  return cents ? formatEur(cents) : ''
}

function formatPct(pct: number): string {
  if (!pct) return ''
  return String(pct).replace('.', ',')
}

function formatFiDateHtml(iso: string): string {
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${Number(d)}.${Number(m)}.${y}`
}

/** Kitsas voucher title dates (dd.MM.yyyy). */
function formatKitsasDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d.padStart(2, '0')}.${m.padStart(2, '0')}.${y}`
}

function formatTositeRef(line: VatDetailLine): string {
  const year = line.date.slice(0, 4)
  const num = line.doc_number != null ? String(line.doc_number) : String(line.voucher_id)
  const series = line.series.trim()
  if (series) return `${series} ${num}/${year}`
  return `${num}/${year}`
}

function buildErittelyHtml(detail: VatDetailLine[]): string {
  if (!detail.length) return '<p>Ei vientejä.</p>'

  // Group by vat code, then percent, then account
  type AccGroup = { account: number; account_name: string; lines: VatDetailLine[] }
  type CodeGroup = { code: number; pct: number; accounts: Map<number, AccGroup> }

  const groups = new Map<string, CodeGroup>()
  for (const line of detail) {
    const gk = `${line.vat_code}|${line.vat_percent}`
    let g = groups.get(gk)
    if (!g) {
      g = { code: line.vat_code, pct: line.vat_percent, accounts: new Map() }
      groups.set(gk, g)
    }
    let acc = g.accounts.get(line.account)
    if (!acc) {
      acc = { account: line.account, account_name: line.account_name, lines: [] }
      g.accounts.set(line.account, acc)
    }
    if (!acc.account_name && line.account_name) acc.account_name = line.account_name
    acc.lines.push(line)
  }

  const sorted = [...groups.values()].sort((a, b) => a.code - b.code || a.pct - b.pct)
  const rows: string[] = []

  for (const g of sorted) {
    let catDebit = 0
    let catCredit = 0
    for (const acc of g.accounts.values()) {
      for (const l of acc.lines) {
        catDebit += l.debit_cents
        catCredit += l.credit_cents
      }
    }
    const title = escapeHtml(vatCodeTitle(g.code))
    const pct = formatPct(g.pct)
    rows.push(
      `<tr class="cat"><td colspan="4"><strong>${title}</strong></td><td class="pct">${pct}</td><td class="amt">${formatEurCell(catDebit)}</td><td class="amt">${formatEurCell(catCredit)}</td></tr>`,
    )

    const accounts = [...g.accounts.values()].sort((a, b) => a.account - b.account)
    for (const acc of accounts) {
      const name = escapeHtml(acc.account_name || '')
      rows.push(
        `<tr class="acc"><td colspan="7">${acc.account}${name ? ` ${name}` : ''}</td></tr>`,
      )
      let accDebit = 0
      let accCredit = 0
      for (const l of acc.lines) {
        accDebit += l.debit_cents
        accCredit += l.credit_cents
        const partner = escapeHtml(l.partner_name)
        const desc = escapeHtml(l.description)
        rows.push(
          `<tr><td class="num">${formatFiDateHtml(l.date)}</td><td class="num">${escapeHtml(formatTositeRef(l))}</td><td>${partner}</td><td>${desc}</td><td class="pct">${formatPct(l.vat_percent)}</td><td class="amt">${formatEurCell(l.debit_cents)}</td><td class="amt">${formatEurCell(l.credit_cents)}</td></tr>`,
        )
      }
      rows.push(
        `<tr class="sub"><td colspan="5"></td><td class="amt">${formatEurCell(accDebit)}</td><td class="amt">${formatEurCell(accCredit)}</td></tr>`,
      )
    }
  }

  return `<table class="erittely">
<thead><tr><th>Pvm</th><th>Tosite</th><th>Kumppani</th><th>Selite</th><th>ALV&nbsp;%</th><th class="amt">Debet</th><th class="amt">Kredit</th></tr></thead>
<tbody>
${rows.join('\n')}
</tbody>
</table>`
}

export function buildVatHtml(
  summary: VatSummary,
  companyName: string,
  opts: { practice?: boolean } = {},
): string {
  const boxRows = Object.keys(BOX_LABELS)
    .map(Number)
    .sort((a, b) => a - b)
    .filter((n) => summary.boxes[String(n)])
    .map(
      (n) =>
        `<tr><td>${n}</td><td>${BOX_LABELS[n]}</td><td class="amt">${formatEur(summary.boxes[String(n)])}\u00a0€</td></tr>`,
    )
    .join('\n')

  const erittely = buildErittelyHtml(summary.detail)

  const starts = formatFiDateHtml(summary.start_date)
  const ends = formatFiDateHtml(summary.end_date)
  const due = formatFiDateHtml(summary.due_date)

  return `<!DOCTYPE html>
<html lang="fi">
<head>
<meta charset="utf-8"/>
<title>Arvonlisäverolaskelma ${starts} – ${ends}</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 1.25rem; color: #122; line-height: 1.35; }
  h1 { font-size: 1.35rem; letter-spacing: 0.02em; margin: 0 0 0.5rem; }
  h2 { font-size: 1.1rem; margin: 1.5rem 0 0.5rem; }
  .meta { margin: 0.25rem 0 1rem; }
  .warn { background: #fff6e8; border: 1px solid #e8d4b0; padding: 0.65rem 0.85rem; margin: 0.75rem 0 1rem; }
  .banner { background: #eef6f0; padding: 0.65rem 0.85rem; margin: 0.75rem 0; font-weight: 600; }
  .note { color: #456; font-size: 0.92rem; margin-top: 1.5rem; }
  .practice { color: #1f6b54; font-weight: 700; letter-spacing: 0.06em; }
  table { border-collapse: collapse; width: 100%; margin: 0.5rem 0 1rem; }
  th, td { border-bottom: 1px solid #ccd; padding: 0.3rem 0.45rem; text-align: left; vertical-align: top; }
  th.amt, td.amt { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; width: 6.5rem; }
  td.pct, th:nth-child(5) { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; width: 4rem; }
  td.num { white-space: nowrap; }
  tr.cat td { border-bottom: 1px solid #99a; padding-top: 0.7rem; }
  tr.acc td { border-bottom: none; font-weight: 600; padding-top: 0.55rem; color: #234; }
  tr.sub td { border-top: 1px solid #99a; border-bottom: 2px solid #99a; font-weight: 600; }
  table.erittely { margin-bottom: 1.5rem; }
</style>
</head>
<body>
<p class="warn">Kaikki arvonlisäverolliset kirjaukset pitää tehdä ennen alv-ilmoituksen antamista.</p>
<h1>ARVONLISÄVEROLASKELMA</h1>
<p class="meta"><strong>${escapeHtml(companyName)}</strong>${opts.practice ? ' · <span class="practice">HARJOITUS</span>' : ''}<br/>${starts} – ${ends}<br/>Eräpäivä ${due}</p>
<h2>Arvonlisäveroilmoituksen tiedot</h2>
${summary.cash_basis ? '<div class="banner">Maksuperusteinen arvonlisävero</div>' : ''}
<table>
<thead><tr><th>Koodi</th><th>Selite</th><th class="amt">Euro</th></tr></thead>
<tbody>
${boxRows || '<tr><td colspan="3">Ei ilmoitettavia määriä</td></tr>'}
</tbody>
</table>
${summary.parked_sales_cents || summary.parked_purchase_cents ? `<p>Kohdentamaton maksuperusteinen ALV jaksolla (ei tilitettävä): myynnit ${formatEur(summary.parked_sales_cents)}\u00a0€, ostot ${formatEur(summary.parked_purchase_cents)}\u00a0€</p>` : ''}
<h2>Erittely</h2>
${erittely}
<p class="note">Sähköisen ilmoittamisen rajapinta ei ole käytössä. Tee itse ilmoitus verottajalle OmaVero-palvelussa.${opts.practice ? '<br/>Kirjanpito on laadittu harjoittelutilassa.' : ''}</p>
</body>
</html>`
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function applyForceNollaus(db: SqliteDb, startDate: string, endDate: string) {
  const settings = getSettings(db, ['MaksuAlvAlkaa', 'MaksuAlvLoppuu'])
  const loppuu = (settings.MaksuAlvLoppuu || '').trim()
  const schemeEnds = Boolean(loppuu && loppuu === startDate)

  if (!isCashBasisVat(db, endDate) && !schemeEnds) return [] as ReturnType<typeof forceRealizeLines>

  if (schemeEnds) {
    // All remaining eras (sales + purchases)
    return forceRealizeLines(db, listOpenParkedEras(db), 'Maksuperusteisen ALV:n päättyminen')
  }
  // 12-month rule: eras dated on or before end − 1 year (Kitsas addYears(-1))
  const cutoffPrecise = addMonthsIso(endDate, -12)
  return forceRealizeLines(
    db,
    listOpenParkedEras(db, { onOrBefore: cutoffPrecise, salesOnly: true }),
    'Vanhentunut maksuperusteinen alv',
  )
}

/** Kitsas `kirjaaVerot`: settle 1xx on the VAT liability, 2xx on the receivable, net to tax. */
function settlementLines(db: SqliteDb, verot: number, vahennys: number, label: string): SaveEntryInput[] {
  const settings = getSettings(db, [
    'AlvMaksutilinKautta',
    'AlvMaksettava',
    'AlvPalautettava',
    'AlvPalautusSaatavaTilille',
  ])
  const on = (v: string | undefined) => /^(on|1|true)$/i.test(String(v || '').trim())
  const acc = vatAccounts(db)
  const lines: SaveEntryInput[] = []
  const side = (cents: number, debitWhenPositive: boolean) =>
    cents > 0 === debitWhenPositive
      ? { debit_cents: Math.abs(cents), credit_cents: null }
      : { debit_cents: null, credit_cents: Math.abs(cents) }
  if (verot) lines.push({ account: acc.liability, ...side(verot, true), vat_code: 901, description: label })
  if (vahennys) lines.push({ account: acc.receivable, ...side(vahennys, false), vat_code: 901, description: label })
  if (verot !== vahennys) {
    let account: number
    if (verot > vahennys && on(settings.AlvMaksutilinKautta) && Number(settings.AlvMaksettava)) {
      account = Number(settings.AlvMaksettava)
    } else if (vahennys > verot && on(settings.AlvMaksutilinKautta) && Number(settings.AlvPalautettava)) {
      account = Number(settings.AlvPalautettava)
    } else if (vahennys > verot && on(settings.AlvPalautusSaatavaTilille)) {
      account = accountByType(db, 'AV', accountByType(db, 'BV', 2920))
    } else {
      account = accountByType(db, 'BV', 2920)
    }
    lines.push({ account, ...side(verot - vahennys, false), vat_code: 901, description: label })
  }
  return lines
}

export function createVatReturn(db: SqliteDb, startDate: string, endDate: string): number {
  if (periodAlreadyFiled(db, startDate, endDate)) {
    throw new PostingError(`ALV-jakso ${startDate} – ${endDate} on jo ilmoitettu`, 409)
  }

  // Cash-basis nollaus first (Kitsas laske -> tilaaNollausLista), then brutto/margin, then tax.
  const nollaus: VatCorrectionLine[] = applyForceNollaus(db, startDate, endDate).map((n) => ({
    account: n.account,
    debit_cents: n.debit_cents,
    credit_cents: n.credit_cents,
    vat_code: n.vat_code,
    vat_percent: n.vat_percent,
    description: n.description,
    item_id: n.item_id ?? null,
    partner: n.partner ?? null,
    date: endDate,
  }))
  const { summary, corrections, marginDeficits } = computeVatDetailed(db, startDate, endDate, nollaus)
  if (!summary.output_vat_cents && !summary.input_vat_cents && !corrections.length) {
    throw new PostingError('Ei ALV-vientia talle jaksolle')
  }

  const settings = getSettings(db, ['Nimi', 'Harjoitus'])
  const label = `Arvonlisävero ${formatKitsasDate(startDate)} - ${formatKitsasDate(endDate)}`
  const lines: SaveEntryInput[] = [
    ...corrections,
    ...settlementLines(db, summary.output_vat_cents, summary.input_vat_cents, label),
  ].map((l, i) => ({ ...l, line_no: i + 1, date: endDate }))

  // Kitsas json.alv: koodit (box -> cents), period, due date, maksettava (euros), deficits.
  const koodit: Record<string, number> = { ...summary.boxes }
  if (summary.cash_basis && endDate < '2025-01-01') koodit['337'] = 1
  const voucherId = saveVoucher(db, {
    date: endDate,
    type: TYPE_VAT_RETURN,
    status: 100,
    title: `Arvonlisäveroilmoitus ${formatKitsasDate(startDate)} - ${formatKitsasDate(endDate)}`,
    json: {
      alv: {
        koodit,
        kausialkaa: startDate,
        kausipaattyy: endDate,
        erapvm: summary.due_date,
        maksettava: summary.vat_payable_cents / 100,
        ...(Object.keys(marginDeficits).length ? { marginaalialijaama: marginDeficits } : {}),
        // tilari keys (VAT page, filings list)
        start_date: startDate,
        end_date: endDate,
        due_date: summary.due_date,
        vat_payable_cents: summary.vat_payable_cents,
        output_vat_cents: summary.output_vat_cents,
        input_vat_cents: summary.input_vat_cents,
        boxes: summary.boxes,
        cash_basis: summary.cash_basis,
      },
    },
    entries: lines,
  })

  const detail = summary.detail.map((d) => (d.voucher_id === 0 ? { ...d, voucher_id: voucherId } : d))
  const html = buildVatHtml({ ...summary, detail }, settings.Nimi || '', {
    practice: isPracticeValue(settings.Harjoitus),
  })
  const bytes = new TextEncoder().encode(html)
  const sha = sha256hexSync(bytes)
  db.run(
    'INSERT INTO Liite (tosite, nimi, roolinimi, tyyppi, sha, data) VALUES (?, ?, ?, ?, ?, ?)',
    [voucherId, 'alv.html', 'alv', 'text/html', sha, bytes],
  )
  return voucherId
}
