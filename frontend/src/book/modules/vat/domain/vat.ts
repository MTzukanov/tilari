import { getSettings } from '../../../access'
import { isPracticeValue } from '../../../clock'
import { asCents } from '../../../cents'
import { PostingError } from '../../../errors'
import { saveVoucher } from '../../../posting'
import { sha256hexSync } from '../../../sha256'
import type { SqliteDb } from '../../../sqlite'
import type { SaveEntryInput } from '../../../types'
import {
  forceRealizeLines,
  listOpenParkedEras,
} from './vatCashBasis'
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

const IN_SCOPE_CODES = new Set([
  0, 11, 111, 12, 112, 21, 221, 18, 118, 418, 28, 228, 428, 29, 129, 229, 19, 25, 125, 225, 901,
])

/** Realized tax that counts toward the return (not parked 418/428). */
const OUTPUT_TAX_CODES = new Set([111, 112, 118, 129, 125])
const INPUT_TAX_CODES = new Set([221, 228, 229, 225])
const NET_SALES_CODES = new Set([11, 12, 18, 19])
const NET_PURCHASE_CODES = new Set([21, 28, 29, 25])
const PARKED_CODES = new Set([418, 428])

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

export function computeVat(db: SqliteDb, startDate: string, endDate: string): VatSummary {
  const rows = db.all<{
    id: number
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
       Vienti.id AS id,
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
     WHERE Tosite.tila >= 100 AND Vienti.pvm >= ? AND Vienti.pvm <= ?`,
    [startDate, endDate],
  )

  const buckets = new Map<
    string,
    { code: number; pct: number; net_cents: number; tax_cents: number; parked_tax_cents: number }
  >()
  const keyOf = (code: number, pct: number) => `${code}|${pct}`
  const bucket = (code: number, pct: number) => {
    const k = keyOf(code, pct)
    let b = buckets.get(k)
    if (!b) {
      b = { code, pct, net_cents: 0, tax_cents: 0, parked_tax_cents: 0 }
      buckets.set(k, b)
    }
    return b
  }

  let box301 = 0
  let box302 = 0
  let box303 = 0
  let box306 = 0
  let box307 = 0
  let box309 = 0
  let box314 = 0
  let parkedSales = 0
  let parkedPurchase = 0
  const detail: VatDetailLine[] = []

  for (const row of rows) {
    if (Number(row.voucher_type || 0) === TYPE_VAT_RETURN) continue
    const code = Number(row.vat_code || 0)
    if (!IN_SCOPE_CODES.has(code) || code === 0 || code === 901) continue
    const pct = Number(row.vat_percent || 0)
    const d = asCents(row.debetsnt)
    const k = asCents(row.kreditsnt)
    const base = code >= 100 ? code % 100 : code

    detail.push({
      date: String(row.date),
      voucher_id: Number(row.voucher_id),
      doc_number: row.doc_number == null ? null : Number(row.doc_number),
      series: String(row.series || ''),
      account: Number(row.account),
      account_name: String(row.account_name || ''),
      partner_name: String(row.partner_name || ''),
      description: row.description || '',
      vat_code: code,
      vat_percent: pct,
      debit_cents: d,
      credit_cents: k,
    })

    if (PARKED_CODES.has(code)) {
      const parked = code === 418 ? k - d : d - k
      if (code === 418) parkedSales += parked
      else parkedPurchase += parked
      const b = bucket(code, pct)
      b.parked_tax_cents += parked
      continue
    }

    const b = bucket(base, pct)
    if (NET_SALES_CODES.has(code)) {
      b.net_cents += k - d
      if (code === 19) box309 += k - d
    } else if (NET_PURCHASE_CODES.has(code)) {
      b.net_cents += d - k
      if (code === 25) box314 += d - k
    } else if (OUTPUT_TAX_CODES.has(code)) {
      const tax = k - d
      b.tax_cents += tax
      if (code === 125) box306 += tax
      else {
        const pk = pctKey(pct)
        if (pk === 2550 || pk === 2400) box301 += tax
        else if (pk === 1400 || pk === 1350) box302 += tax
        else if (pk === 1000) box303 += tax
        else box301 += tax
      }
    } else if (INPUT_TAX_CODES.has(code)) {
      const tax = d - k
      b.tax_cents += tax
      box307 += tax
    }
  }

  const outRows: VatRow[] = []
  let outputVat = 0
  let inputVat = 0
  const sorted = [...buckets.values()].sort((a, b) => a.code - b.code || a.pct - b.pct)
  for (const amounts of sorted) {
    if (amounts.net_cents === 0 && amounts.tax_cents === 0 && amounts.parked_tax_cents === 0) continue
    let kind: VatRow['kind'] = 'purchase'
    if (PARKED_CODES.has(amounts.code)) kind = 'parked'
    else if ([11, 12, 18, 19].includes(amounts.code)) kind = 'sales'
    if (kind === 'sales') outputVat += amounts.tax_cents
    else if (kind === 'purchase') inputVat += amounts.tax_cents
    // EU reverse charge 25/125: tax on 125 is in output; 225 deduction in input — already via OUTPUT/INPUT sets on base 25 bucket
    if (amounts.code === 25) {
      // base 25 bucket may hold net + tax from 125/225 via base% — wait, 125 % 100 = 25, so 125 tax went into bucket 25
      // And 125 is OUTPUT so tax was added to b.tax_cents for base 25. Kind would be purchase because 25 not in sales list.
      // Fix kind for 25:
      kind = 'purchase'
    }
    outRows.push({
      vat_code: amounts.code,
      vat_percent: amounts.pct,
      kind,
      net_cents: amounts.net_cents,
      tax_cents: amounts.tax_cents,
      parked_tax_cents: amounts.parked_tax_cents,
    })
  }

  // Recalculate output/input from codes correctly (125 is output, 225 input)
  outputVat = box301 + box302 + box303 + box306
  inputVat = box307
  const payable = outputVat - inputVat

  const boxes: Record<string, number> = {}
  const put = (n: number, v: number) => {
    if (v) boxes[String(n)] = v
  }
  put(301, box301)
  put(302, box302)
  put(303, box303)
  put(306, box306)
  put(307, box307)
  put(308, payable)
  put(309, box309)
  put(314, box314)

  const kausi = Number(getSettings(db, ['AlvKausi']).AlvKausi || 1)
  return {
    start_date: startDate,
    end_date: endDate,
    due_date: vatDueDate(endDate, kausi === 3 || kausi === 12 ? kausi : 1),
    cash_basis: isCashBasisVat(db, endDate),
    rows: outRows,
    boxes,
    detail,
    output_vat_cents: outputVat,
    input_vat_cents: inputVat,
    vat_payable_cents: payable,
    parked_sales_cents: parkedSales,
    parked_purchase_cents: parkedPurchase,
  }
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

export function createVatReturn(db: SqliteDb, startDate: string, endDate: string): number {
  if (periodAlreadyFiled(db, startDate, endDate)) {
    throw new PostingError(`ALV-jakso ${startDate} – ${endDate} on jo ilmoitettu`, 409)
  }

  const nollausLines = applyForceNollaus(db, startDate, endDate)
  // Preview summary after hypothetically applying nollaus: compute includes only existing rows.
  // So we must post nollaus first on a draft, then settle — or include nollaus tax in settlement.
  // Approach: build all lines (nollaus + settlement from post-nollaus summary).
  // Post nollaus lines into DB temporarily? Cleaner: compute payable from current + add nollaus 118/228 amounts.

  let extraOutput = 0
  let extraInput = 0
  for (const line of nollausLines) {
    if (line.vat_code === 118) extraOutput += asCents(line.credit_cents) - asCents(line.debit_cents)
    if (line.vat_code === 228) extraInput += asCents(line.debit_cents) - asCents(line.credit_cents)
  }

  const base = computeVat(db, startDate, endDate)
  const outputVat = base.output_vat_cents + extraOutput
  const inputVat = base.input_vat_cents + extraInput
  if (outputVat === 0 && inputVat === 0 && !nollausLines.length) {
    throw new PostingError('Ei ALV-vientia talle jaksolle')
  }

  const settings = getSettings(db, [
    'AlvMaksettava',
    'AlvPalautettava',
    'AlvVelkatili',
    'Nimi',
    'Harjoitus',
  ])
  const payableAccount = Number(settings.AlvMaksettava || 2920)
  const receivableAccount = Number(settings.AlvPalautettava || 1763)
  const liabilityAccount = Number(settings.AlvVelkatili || 2939)

  const lines: SaveEntryInput[] = []
  let lineNo = 1
  for (const n of nollausLines) {
    lines.push({
      line_no: lineNo++,
      account: n.account,
      debit_cents: n.debit_cents,
      credit_cents: n.credit_cents,
      vat_code: n.vat_code,
      vat_percent: n.vat_percent,
      description: n.description,
      item_id: n.item_id ?? null,
      partner: n.partner ?? null,
    })
  }

  if (outputVat) {
    lines.push({
      line_no: lineNo++,
      account: liabilityAccount,
      debit_cents: outputVat,
      credit_cents: null,
      vat_code: 901,
      description: 'ALV myynnit',
    })
    lines.push({
      line_no: lineNo++,
      account: payableAccount,
      debit_cents: null,
      credit_cents: outputVat,
      vat_code: 901,
      description: 'ALV myynnit',
    })
  }
  if (inputVat) {
    lines.push({
      line_no: lineNo++,
      account: receivableAccount,
      debit_cents: null,
      credit_cents: inputVat,
      vat_code: 901,
      description: 'ALV ostot',
    })
    lines.push({
      line_no: lineNo++,
      account: payableAccount,
      debit_cents: inputVat,
      credit_cents: null,
      vat_code: 901,
      description: 'ALV ostot',
    })
  }

  // Recompute summary after nollaus will be stored: merge boxes for extra realized tax
  const summary: VatSummary = {
    ...base,
    output_vat_cents: outputVat,
    input_vat_cents: inputVat,
    vat_payable_cents: outputVat - inputVat,
    boxes: {
      ...base.boxes,
      '301': (base.boxes['301'] || 0) + extraOutput,
      '307': (base.boxes['307'] || 0) + extraInput,
      '308': outputVat - inputVat,
    },
  }
  if (!summary.boxes['301']) delete summary.boxes['301']
  if (!summary.boxes['307']) delete summary.boxes['307']

  const voucherId = saveVoucher(db, {
    date: endDate,
    type: TYPE_VAT_RETURN,
    status: 100,
    title: `Arvonlisäveroilmoitus ${formatKitsasDate(startDate)} - ${formatKitsasDate(endDate)}`,
    json: {
      alv: {
        ...summary,
        kausialkaa: startDate,
        kausipaattyy: endDate,
        erapvm: summary.due_date,
        maksettava: summary.vat_payable_cents / 100,
      },
    },
    entries: lines,
  })

  // Attach HTML with post-nollaus detail: re-read after save so nollaus lines appear in erittely
  const after = computeVat(db, startDate, endDate)
  // Settlement lines are on TYPE_VAT_RETURN and excluded; nollaus 118/228 are on same tosite — excluded too.
  // Include nollaus in HTML manually from summary + detail from base + synthetic note.
  const htmlSummary: VatSummary = {
    ...after,
    output_vat_cents: outputVat,
    input_vat_cents: inputVat,
    vat_payable_cents: outputVat - inputVat,
    boxes: summary.boxes,
    due_date: summary.due_date,
    cash_basis: summary.cash_basis,
    detail: [
      ...base.detail,
      ...nollausLines.map((n) => ({
        date: endDate,
        voucher_id: voucherId,
        doc_number: null,
        series: '',
        account: n.account,
        account_name: '',
        partner_name: '',
        description: n.description,
        vat_code: n.vat_code,
        vat_percent: Number(n.vat_percent || 0),
        debit_cents: asCents(n.debit_cents),
        credit_cents: asCents(n.credit_cents),
      })),
    ],
  }
  const html = buildVatHtml(htmlSummary, settings.Nimi || '', {
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
