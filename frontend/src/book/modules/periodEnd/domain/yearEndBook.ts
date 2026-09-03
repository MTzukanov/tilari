/**
 * Year-end voucher generators. Mirrors Kitsas `Poistaja`, `Jaksottaja` and
 * `TuloveroDialog`: poisto 9910, jaksotus 9920 (closing + opening pair) and
 * tulovero 9930, whose calculation is also stored in `Tilikausi.json`.
 */
import { formatFiCents } from '../../../cents'
import { PostingError } from '../../../errors'
import { requireFiscalPeriodByEnd, updateFiscalPeriodJson, type TaxCalculation } from '../../../fiscalPeriod'
import { parseJson } from '../../../json'
import { saveVoucher } from '../../../posting'
import { sha256hexSync } from '../../../sha256'
import type { SqliteDb } from '../../../sqlite'
import type { SaveEntryInput } from '../../../types'
import {
  computeAccruals,
  computeDepreciation,
  computeTaxBreakdown,
  taxReceivableCents,
  yearEndAccounts,
  type AccrualLine,
  type DepreciationLine,
  type TaxAccountLine,
  type TaxBreakdown,
} from './yearEnd'
import {
  ENTRY_ACCRUAL_CLOSING,
  ENTRY_ACCRUAL_OPENING,
  ENTRY_COUNTER_POSTING,
  ENTRY_DEPRECIATION,
  ENTRY_DEPRECIATION_COUNTER,
  ENTRY_POSTING,
  STATUS_POSTED,
  TYPE_ACCRUAL,
  TYPE_DEPRECIATION,
  TYPE_INCOME_TAX,
} from '../../../vouchers'

function formatFi(iso: string): string {
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${Number(d)}.${Number(m)}.${y}`
}

function periodLabel(starts: string, ends: string): string {
  return `${formatFi(starts)} - ${formatFi(ends)}`
}

function nextDay(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

function attachHtml(db: SqliteDb, voucherId: number, name: string, role: string, html: string): void {
  const bytes = new TextEncoder().encode(html)
  db.run('INSERT INTO Liite (tosite, nimi, roolinimi, tyyppi, sha, data) VALUES (?, ?, ?, ?, ?, ?)', [
    voucherId,
    name,
    role,
    'text/html',
    sha256hexSync(bytes),
    bytes,
  ])
}

export { formatFiCents }

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

const REPORT_CSS = `
  body { font-family: system-ui, sans-serif; margin: 1.25rem; color: #122; line-height: 1.35; }
  h1 { font-size: 1.35rem; letter-spacing: 0.02em; margin: 0 0 0.5rem; }
  .meta { margin: 0.25rem 0 1rem; }
  table { border-collapse: collapse; width: 100%; margin: 0.5rem 0 1rem; }
  th, td { border-bottom: 1px solid #ccd; padding: 0.3rem 0.45rem; text-align: left; }
  th.amt, td.amt { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  tr.sum td { border-top: 1px solid #99a; border-bottom: 2px solid #99a; font-weight: 600; }
`

export function buildDepreciationHtml(
  lines: DepreciationLine[],
  companyName: string,
  ends: string,
): string {
  const rows = lines
    .map((line) => {
      const rule = line.percent != null ? `${line.percent} %` : `${line.months} kk`
      const after = line.balance_before_cents - line.depreciation_cents
      return `<tr><td>${line.account}</td><td>${escapeHtml(line.account_name)}<br/>${escapeHtml(line.label)}</td><td class="amt">${formatFiCents(line.balance_before_cents)}</td><td class="amt">${rule}</td><td class="amt">${formatFiCents(line.depreciation_cents)}</td><td class="amt">${formatFiCents(after)}</td></tr>`
    })
    .join('\n')
  const total = lines.reduce((s, l) => s + l.depreciation_cents, 0)
  return `<!DOCTYPE html>
<html lang="fi"><head><meta charset="utf-8"/><title>Poistolaskelma ${ends}</title>
<style>${REPORT_CSS}</style></head><body>
<h1>POISTOLASKELMA</h1>
<p class="meta"><strong>${escapeHtml(companyName)}</strong><br/>${formatFi(ends)}</p>
<table><thead><tr><th>Tili</th><th>Nimike/Kohdennus</th><th class="amt">Saldo ennen</th><th class="amt">Sääntö</th><th class="amt">Poisto</th><th class="amt">Saldo jälkeen</th></tr></thead>
<tbody>${rows}
<tr class="sum"><td colspan="4">Poistot yhteensä</td><td class="amt">${formatFiCents(total)}</td><td></td></tr>
</tbody></table></body></html>`
}

export function buildAccrualHtml(
  lines: AccrualLine[],
  taxReceivable: number,
  companyName: string,
  ends: string,
): string {
  const rows = lines
    .map(
      (line) =>
        `<tr><td>${line.account}</td><td>${escapeHtml(line.account_name)}</td><td>${escapeHtml(line.description)}</td><td class="amt">${line.debit_cents ? formatFiCents(line.debit_cents) : ''}</td><td class="amt">${line.credit_cents ? formatFiCents(line.credit_cents) : ''}</td></tr>`,
    )
    .join('\n')
  const debit = lines.reduce((s, l) => s + l.debit_cents, 0)
  const credit = lines.reduce((s, l) => s + l.credit_cents, 0)
  return `<!DOCTYPE html>
<html lang="fi"><head><meta charset="utf-8"/><title>Tilinpäätösjaksotukset ${ends}</title>
<style>${REPORT_CSS}</style></head><body>
<h1>TILINPÄÄTÖSJAKSOTUKSET</h1>
<p class="meta"><strong>${escapeHtml(companyName)}</strong><br/>${formatFi(ends)}</p>
<table><thead><tr><th>Tili</th><th>Nimi</th><th>Selite</th><th class="amt">Debet</th><th class="amt">Kredit</th></tr></thead>
<tbody>${rows}
<tr class="sum"><td colspan="3">Jaksotukset yhteensä</td><td class="amt">${formatFiCents(debit)}</td><td class="amt">${formatFiCents(credit)}</td></tr>
${taxReceivable ? `<tr><td colspan="3">Verosaamiseksi kirjattava negatiivinen verovelka</td><td class="amt">${formatFiCents(taxReceivable)}</td><td></td></tr>` : ''}
</tbody></table></body></html>`
}

function accountSectionHtml(title: string, lines: TaxAccountLine[], note?: string): string {
  if (!lines.length) return ''
  const rows = lines
    .map(
      (line) =>
        `<tr><td>${line.account}</td><td>${escapeHtml(line.account_name)}</td><td class="amt">${formatFiCents(line.amount_cents)}</td><td class="muted">${escapeHtml(line.account_type)}</td></tr>`,
    )
    .join('\n')
  const total = lines.reduce((s, l) => s + l.amount_cents, 0)
  return `<h3>${escapeHtml(title)}</h3>
${note ? `<p class="note">${escapeHtml(note)}</p>` : ''}
<table><thead><tr><th>Tili</th><th>Nimi</th><th class="amt">Summa</th><th>Tyyppi</th></tr></thead>
<tbody>${rows}
<tr class="sum"><td colspan="2">Yhteensä</td><td class="amt">${formatFiCents(total)}</td><td></td></tr>
</tbody></table>`
}

export function buildTaxHtml(
  tax: TaxCalculation,
  companyName: string,
  ends: string,
  breakdown?: TaxBreakdown,
): string {
  const row = (label: string, cents: number) =>
    `<tr><td>${label}</td><td class="amt">${formatFiCents(cents)}</td></tr>`
  const sections = breakdown
    ? [
        accountSectionHtml('Veronalainen tulo (C, CL)', breakdown.income),
        accountSectionHtml('Kokonaan vähennyskelpoiset kulut (D, DP)', breakdown.full_deduct),
        accountSectionHtml(
          'Puoleksi vähennyskelpoiset kulut (DH)',
          breakdown.half_deduct,
          'Puolittain vähennyskelpoiset kulut lasketaan 50 %:n veronaliseen vähennykseen.',
        ),
        accountSectionHtml('Maksetut ennakkoverot (DVE)', breakdown.prepaid),
        accountSectionHtml(
          'Ei mukana verolaskelmassa',
          breakdown.skipped,
          'Nämä tuloslaskelman tilit eivät kuulu automaattiseen tuloverolaskelmaan (tyypit C, CL, D, DP, DH, DVE).',
        ),
      ].join('\n')
    : ''
  return `<!DOCTYPE html>
<html lang="fi"><head><meta charset="utf-8"/><title>Tuloverolaskelma ${ends}</title>
<style>${REPORT_CSS} h3 { font-size: 1rem; margin: 1rem 0 0.35rem; } .note { font-size: 0.9rem; color: #456; margin: 0 0 0.35rem; } .muted { color: #667; font-size: 0.85rem; }</style></head><body>
<h1>TULOVEROLASKELMA</h1>
<p class="meta"><strong>${escapeHtml(companyName)}</strong><br/>${formatFi(ends)}</p>
${sections}
<h3>Yhteenveto</h3>
<table><tbody>
${row('Veronalainen tulo yhteensä', tax.tulo_cents)}
${row('Kokonaan vähennyskelpoiset kulut', tax.taysivahennys_cents)}
${row('Puoleksi vähennyskelpoiset kulut', tax.puolivahennys_cents)}
${row('Verotettava tulos', tax.tulos_cents)}
${row('Vähennettävä aiempi tappio', tax.tappio_cents)}
${row('Lopullinen verotettava tulos', tax.loppu_tulos_cents)}
${row('Tuloveron määrä', tax.vero_cents)}
${row('Maksetut ennakkoverot', tax.ennakko_cents)}
<tr class="sum"><td>Maksamaton tulovero</td><td class="amt">${formatFiCents(tax.jaaveroa_cents)}</td></tr>
</tbody></table>
<p>Säilytä veroilmoitus ja mahdolliset verolaskelmasi kirjanpitosi yhteydessä.</p>
</body></html>`
}

function companyName(db: SqliteDb): string {
  const row = db.get<{ arvo: string | null }>("SELECT arvo FROM Asetus WHERE avain = 'Nimi'")
  return row?.arvo || ''
}

/** Post the 9910 depreciation voucher for the period ending `ends`. */
export function createDepreciation(db: SqliteDb, ends: string, lines?: DepreciationLine[]): number {
  const period = requireFiscalPeriodByEnd(db, ends)
  const proposals = lines ?? computeDepreciation(db, ends)
  if (!proposals.length) throw new PostingError('Ei poistettavaa', 400)

  const entries: SaveEntryInput[] = []
  let lineNo = 1
  for (const line of proposals) {
    const account = db.get<{ json: string | null }>('SELECT json FROM Tili WHERE numero = ?', [
      line.account,
    ])
    const expenseAccount = Number(parseJson(account?.json).poistotili || 0)
    if (!expenseAccount) {
      throw new PostingError(
        `Tilille ${line.account} ei ole määritelty poistotiliä; poistoja ei voi kirjata automaattisesti`,
        400,
      )
    }
    const description =
      line.item_id != null ? `Tasaeräpoisto ${line.label}` : `Menojäännöspoisto ${line.account} ${line.account_name}`

    entries.push({
      line_no: lineNo++,
      entry_type: ENTRY_DEPRECIATION_COUNTER,
      account: line.account,
      credit_cents: line.depreciation_cents,
      allocation: line.allocation,
      description,
      item_id: line.item_id ?? undefined,
    })
    entries.push({
      line_no: lineNo++,
      entry_type: ENTRY_DEPRECIATION,
      account: expenseAccount,
      debit_cents: line.depreciation_cents,
      allocation: line.allocation,
      description,
      accrual_starts: period.starts,
      accrual_ends: ends,
      json: { jaksotustili: line.account },
    })
  }

  const voucherId = saveVoucher(db, {
    date: ends,
    type: TYPE_DEPRECIATION,
    status: STATUS_POSTED,
    title: `Suunnitelman mukaiset poistot ${periodLabel(period.starts, ends)}`,
    entries,
  })
  attachHtml(
    db,
    voucherId,
    'poistolaskelma.html',
    'poistolaskelma',
    buildDepreciationHtml(proposals, companyName(db), ends),
  )
  return voucherId
}

/**
 * Post the 9920 closing accrual voucher plus the mirrored opening voucher that
 * reverses it on the first day of the next period.
 */
export function createAccrual(
  db: SqliteDb,
  ends: string,
  lines?: AccrualLine[],
): { closing: number; opening: number | null } {
  const period = requireFiscalPeriodByEnd(db, ends)
  const proposals = lines ?? computeAccruals(db, period.starts, ends)
  const receivable = taxReceivableCents(db, ends)
  if (!proposals.length && !receivable) throw new PostingError('Ei jaksotettavaa', 400)

  const accounts = yearEndAccounts(db)
  const closingEntries: SaveEntryInput[] = []
  const openingEntries: SaveEntryInput[] = []
  let lineNo = 1
  let openingLineNo = 1
  const opening = nextDay(ends)
  const nextPeriodEnd = db.get<{ loppuu: string }>(
    'SELECT loppuu FROM Tilikausi WHERE alkaa <= ? AND loppuu >= ? ORDER BY alkaa DESC LIMIT 1',
    [opening, opening],
  )?.loppuu

  const addPair = (
    account: number,
    counterAccount: number,
    debit: number,
    credit: number,
    description: string,
    allocation: number,
    partnerId: number | null,
    accrualStarts: string | null,
    accrualEnds: string | null,
  ) => {
    closingEntries.push({
      line_no: lineNo++,
      entry_type: ENTRY_ACCRUAL_CLOSING + ENTRY_COUNTER_POSTING,
      account: counterAccount,
      debit_cents: credit || undefined,
      credit_cents: debit || undefined,
      allocation,
      description,
      partner: partnerId,
      item_id: -1,
    })
    closingEntries.push({
      line_no: lineNo++,
      entry_type: ENTRY_ACCRUAL_CLOSING + ENTRY_POSTING,
      account,
      debit_cents: debit || undefined,
      credit_cents: credit || undefined,
      allocation,
      description,
      partner: partnerId,
      accrual_starts: accrualStarts,
      accrual_ends: accrualEnds,
    })

    // Opening voucher mirrors the closing lines with sides swapped.
    openingEntries.push({
      line_no: openingLineNo++,
      entry_type: ENTRY_ACCRUAL_OPENING + ENTRY_COUNTER_POSTING,
      account: counterAccount,
      debit_cents: debit || undefined,
      credit_cents: credit || undefined,
      allocation,
      description,
      partner: partnerId,
    })
    const carry = Boolean(accrualEnds && nextPeriodEnd && accrualEnds > nextPeriodEnd)
    openingEntries.push({
      line_no: openingLineNo++,
      entry_type: ENTRY_ACCRUAL_OPENING + ENTRY_POSTING,
      account,
      debit_cents: credit || undefined,
      credit_cents: debit || undefined,
      allocation,
      description,
      partner: partnerId,
      accrual_starts: carry ? opening : null,
      accrual_ends: carry ? accrualEnds : null,
    })
  }

  for (const line of proposals) {
    const counter = line.debit_cents ? accounts.accruedLiability : accounts.accruedReceivable
    if (!counter) {
      throw new PostingError(
        'Tilikartasta puuttuu siirtovelka- (BJ) tai siirtosaamistili (AJ); jaksotuksia ei voi kirjata',
        400,
      )
    }
    const ref = line.doc_number
      ? `${line.series ? `${line.series} ` : ''}${line.doc_number}/${line.source_date.slice(2, 4)}`
      : ''
    const description = ref ? `${ref} ${line.description}` : line.description
    // Kitsas keeps the accrual window on the closing line only when it still
    // runs past year end, and clamps its start to the first day of next period.
    const stillRunning = Boolean(line.accrual_ends && line.accrual_ends > ends)
    const startsAfter = Boolean(line.accrual_starts && line.accrual_starts >= ends)
    const accrualStarts =
      line.accrual_starts && (stillRunning || startsAfter)
        ? line.accrual_starts > ends
          ? line.accrual_starts
          : opening
        : null
    addPair(
      line.account,
      counter,
      line.debit_cents,
      line.credit_cents,
      description,
      line.allocation,
      line.partner_id,
      accrualStarts,
      stillRunning ? line.accrual_ends : null,
    )
  }

  if (receivable) {
    if (!accounts.vatLiability || !accounts.vatReceivable) {
      throw new PostingError('Tilikartasta puuttuu verovelka- (BV) tai verosaatavatili (AV)', 400)
    }
    const description = 'Negatiivisen verovelan kirjaaminen verosaataviin'
    closingEntries.push({
      line_no: lineNo++,
      entry_type: ENTRY_ACCRUAL_CLOSING + ENTRY_COUNTER_POSTING,
      account: accounts.vatReceivable,
      debit_cents: receivable,
      description,
    })
    closingEntries.push({
      line_no: lineNo++,
      entry_type: ENTRY_ACCRUAL_CLOSING + ENTRY_POSTING,
      account: accounts.vatLiability,
      credit_cents: receivable,
      description,
    })
    const reverse = 'Verosaamisen kirjaaminen negatiiviseksi verovelaksi'
    openingEntries.push({
      line_no: openingLineNo++,
      entry_type: ENTRY_ACCRUAL_OPENING + ENTRY_COUNTER_POSTING,
      account: accounts.vatReceivable,
      credit_cents: receivable,
      description: reverse,
    })
    openingEntries.push({
      line_no: openingLineNo++,
      entry_type: ENTRY_ACCRUAL_OPENING + ENTRY_POSTING,
      account: accounts.vatLiability,
      debit_cents: receivable,
      description: reverse,
    })
  }

  const closing = saveVoucher(db, {
    date: ends,
    type: TYPE_ACCRUAL,
    status: STATUS_POSTED,
    title: 'Tilinpäätösjaksotukset',
    entries: closingEntries,
  })
  attachHtml(
    db,
    closing,
    'jaksotukset.html',
    'jaksotukset',
    buildAccrualHtml(proposals, receivable, companyName(db), ends),
  )

  // The opening voucher needs a fiscal period to land in.
  if (!nextPeriodEnd) return { closing, opening: null }
  const openingId = saveVoucher(db, {
    date: opening,
    type: TYPE_ACCRUAL,
    status: STATUS_POSTED,
    title: 'Tilinavauksen jaksotuskirjaukset',
    entries: openingEntries,
  })
  return { closing, opening: openingId }
}

/**
 * Post the 9930 income tax voucher and store the calculation in
 * `Tilikausi.json.verolaskelma`. When prepaid tax already covers the liability
 * only the calculation is stored — Kitsas skips the voucher in that case.
 */
export function createIncomeTax(
  db: SqliteDb,
  ends: string,
  tax: TaxCalculation,
): { voucher_id: number | null; tax: TaxCalculation } {
  const period = requireFiscalPeriodByEnd(db, ends)
  const accounts = yearEndAccounts(db)
  const label = `Tuloveron jaksotus tilikaudelta ${periodLabel(period.starts, ends)}`

  let voucherId: number | null = null
  if (tax.jaaveroa_cents) {
    const owed = tax.jaaveroa_cents
    voucherId = saveVoucher(db, {
      date: ends,
      type: TYPE_INCOME_TAX,
      status: STATUS_POSTED,
      title: label,
      entries: [
        {
          line_no: 1,
          account: accounts.taxExpense,
          debit_cents: owed > 0 ? owed : undefined,
          credit_cents: owed < 0 ? -owed : undefined,
          description: label,
          accrual_starts: period.starts,
          accrual_ends: ends,
          json: { jaksotustili: accounts.taxAccrual },
        },
        {
          line_no: 2,
          account: owed > 0 ? accounts.taxPayable : accounts.taxReceivable,
          credit_cents: owed > 0 ? owed : undefined,
          debit_cents: owed < 0 ? -owed : undefined,
          description: label,
          item_id: -1,
        },
      ],
    })
    attachHtml(
      db,
      voucherId,
      'verolaskelma.html',
      'verolaskelma',
      buildTaxHtml(
        tax,
        companyName(db),
        ends,
        computeTaxBreakdown(db, period.starts, ends),
      ),
    )
  }

  const stored: TaxCalculation = {
    ...tax,
    booked_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  updateFiscalPeriodJson(db, period.starts, { verolaskelma: stored })
  return { voucher_id: voucherId, tax: stored }
}

/** Persist a tax calculation without booking a voucher (draft in the wizard). */
export function saveTaxCalculation(db: SqliteDb, ends: string, tax: TaxCalculation): TaxCalculation {
  const period = requireFiscalPeriodByEnd(db, ends)
  const stored: TaxCalculation = { ...tax, updated_at: new Date().toISOString() }
  updateFiscalPeriodJson(db, period.starts, { verolaskelma: stored })
  return stored
}

/** Remove the stored tulovero calculation from Tilikausi.json. */
export function clearTaxCalculation(db: SqliteDb, ends: string): void {
  const period = requireFiscalPeriodByEnd(db, ends)
  updateFiscalPeriodJson(db, period.starts, { verolaskelma: undefined })
}
