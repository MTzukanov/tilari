/**
 * Voucher editor line mapping (pure): loaded Vienti rows <-> editable drafts <-> save payload.
 *
 * A draft carries the stored line's hidden fields (id, line type, date, eraid, json, partner)
 * so a save updates the same rows and keeps what the editor does not show (Kitsas
 * `lisaaTaiPaivita` upserts by Vienti id). See AGENTS.md "Save round-trip".
 */
import type { SaveEntryInput, VoucherEntry } from '../../book/types'
import {
  isPurchaseVatCode,
  isReverseCharge,
  isVatBookingLine,
  vatAccount,
  vatBooking,
  vatCompanionCode,
} from '../../book/modules/vat/domain/vatPosting'
import { ENTRY_COUNTER_POSTING, ENTRY_POSTING, ENTRY_VAT_POSTING } from '../../book/vouchers'
import { formatEurInput, parseEurInput } from '../../shared/money'

export type DraftPartner = { id: number; name: string } | null

export type LineDraft = {
  account: string
  description: string
  debit: string
  credit: string
  vat_code: string
  vat_percent: string
  allocation: string
  archive_id: string
  accrual_starts: string
  accrual_ends: string
  /** Hidden, from the stored line: Vienti.id (absent on new lines). */
  id?: number
  entry_type?: number
  date?: string
  item_id?: number | null
  json?: Record<string, unknown>
  partner?: DraftPartner
}

export const EMPTY_LINE: LineDraft = {
  account: '',
  description: '',
  debit: '',
  credit: '',
  vat_code: '0',
  vat_percent: '',
  allocation: '0',
  archive_id: '',
  accrual_starts: '',
  accrual_ends: '',
}

/** Stored lines as drafts. VAT codes are kept as stored (never stripped on load). */
export function draftsFromEntries(
  entries: VoucherEntry[],
  opts: { asCopy?: boolean } = {},
): LineDraft[] {
  return entries.map((v) => {
    const visible: LineDraft = {
      account: String(v.account),
      description: v.description,
      debit: formatEurInput(v.debit_cents ?? 0, { emptyZero: true }),
      credit: formatEurInput(v.credit_cents ?? 0, { emptyZero: true }),
      vat_code: String(v.vat_code ?? 0),
      vat_percent: v.vat_percent != null ? String(v.vat_percent) : '',
      allocation: String(v.allocation ?? 0),
      archive_id: opts.asCopy ? '' : v.archive_id || '',
      accrual_starts: v.accrual_starts || '',
      accrual_ends: v.accrual_ends || '',
    }
    // A copy is a new voucher: no ids, no bank archive ids (importer idempotency), no eras.
    if (opts.asCopy) return { ...visible, entry_type: v.entry_type }
    return {
      ...visible,
      id: v.id,
      entry_type: v.entry_type,
      date: v.date,
      item_id: v.item_id ?? null,
      json: v.json,
      partner: v.partner,
    }
  })
}

/** Header values as loaded, so kept lines can follow a header change. */
export type LoadedHeader = { date: string; title: string; partnerName: string }

export type HeaderNow = { date: string; title: string; partnerName: string }

/**
 * Drafts -> save payload. Kept lines (with id) send their hidden fields back; a header change
 * moves the lines that still carry the old header value (date, title as description,
 * partner), like Kitsas where lines follow the voucher. New lines get the title as
 * description and the voucher partner/date in posting.
 */
export function entriesFromDrafts(
  drafts: LineDraft[],
  now: HeaderNow,
  loaded: LoadedHeader | null,
): SaveEntryInput[] {
  return drafts.map((line, i) => {
    const vatCode = Number(line.vat_code || 0)
    const base: SaveEntryInput = {
      line_no: i + 1,
      account: Number(line.account),
      debit_cents: line.debit ? parseEurInput(line.debit) : null,
      credit_cents: line.credit ? parseEurInput(line.credit) : null,
      vat_code: vatCode,
      vat_percent: line.vat_percent ? Number(line.vat_percent) : null,
      allocation: Number(line.allocation || 0),
      archive_id: line.archive_id || null,
      accrual_starts: line.accrual_starts || null,
      accrual_ends: line.accrual_ends || null,
      ...(line.entry_type !== undefined ? { entry_type: line.entry_type } : {}),
    }
    if (line.id == null) {
      const parked = vatCode === 418 || vatCode === 428
      return {
        ...base,
        description: line.description || now.title,
        ...(parked ? { item_id: -1, new_era: true } : {}),
      }
    }
    const description =
      loaded && line.description === loaded.title && now.title !== loaded.title
        ? now.title
        : line.description
    const date =
      loaded && line.date === loaded.date && now.date !== loaded.date ? now.date : line.date
    let partner: SaveEntryInput['partner'] = line.partner ?? null
    if (
      loaded &&
      now.partnerName !== loaded.partnerName &&
      (line.partner?.name ?? '') === loaded.partnerName &&
      (line.partner != null || loaded.partnerName === '')
    ) {
      partner = now.partnerName ? { name: now.partnerName } : null
    }
    return {
      ...base,
      id: line.id,
      description,
      ...(date ? { date } : {}),
      item_id: line.item_id ?? null,
      ...(line.json !== undefined ? { json: line.json } : {}),
      partner,
    }
  })
}

export type AssistantFit =
  | { fits: true; paymentIndex: number }
  | { fits: false; reason: 'payment' | 'vat' | 'side' | 'date' | 'not_liable' }

function isPaymentLine(e: VoucherEntry): boolean {
  return Number(e.entry_type || 0) % 100 === ENTRY_COUNTER_POSTING
}

function vatish(e: VoucherEntry): boolean {
  return isVatBookingLine({ vat_code: String(e.vat_code ?? 0), account: String(e.account) })
}

/** VAT codes a row of `code` books besides its main line (Kitsas ApuriRivi). */
function companionCodes(code: number): number[] {
  if (isReverseCharge(code)) return [200 + code, 100 + code]
  const c = vatCompanionCode(code)
  return c !== code ? [c] : []
}

/** Net lines with the VAT lines that follow them (`vats` in Kitsas order). */
export function pairVatLines(entries: VoucherEntry[], paymentIndex: number) {
  const pairs: { net: VoucherEntry; vats: VoucherEntry[] }[] = []
  const unpaired: VoucherEntry[] = []
  entries.forEach((e, i) => {
    if (i === paymentIndex) return
    if (vatish(e)) {
      const last = pairs[pairs.length - 1]
      const expected = last ? companionCodes(Number(last.net.vat_code || 0)) : []
      const next = expected[last?.vats.length ?? 0]
      if (last && next != null && next === Number(e.vat_code || 0)) last.vats.push(e)
      else unpaired.push(e)
      return
    }
    pairs.push({ net: e, vats: [] })
  })
  return { pairs, unpaired }
}

function lineCents(e: VoucherEntry): number {
  return Number(e.debit_cents || 0) || Number(e.credit_cents || 0)
}

/**
 * What the payment line pays for a row: net + VAT for domestic codes, net for reverse charge
 * (its tax and deduction cancel out). This is the assistant's row amount.
 */
export function rowAmountCents(pair: { net: VoucherEntry; vats: VoucherEntry[] }): number {
  const code = Number(pair.net.vat_code || 0)
  if (isReverseCharge(code)) return lineCents(pair.net)
  return lineCents(pair.net) + pair.vats.reduce((sum, v) => sum + lineCents(v), 0)
}

/** Payment line index by Kitsas line type; else the single bank-account line (old tilari saves). */
function paymentIndexOf(entries: VoucherEntry[], isBank: (account: number) => boolean): number[] {
  const typed = entries.map((e, i) => (isPaymentLine(e) ? i : -1)).filter((i) => i >= 0)
  if (typed.length) return typed
  return entries.map((e, i) => (!vatish(e) && isBank(e.account) ? i : -1)).filter((i) => i >= 0)
}

/**
 * Can the expense/income assistant show this voucher without changing it on save?
 * Kitsas `TuloMenoApuri::teeReset` reads the payment line by type (% 100 == 2); every row must
 * rebuild to exactly its stored lines (`vatBooking`), otherwise it stays on "Viennit".
 */
export function assistantFit(
  entries: VoucherEntry[],
  opts: { voucherType: number; voucherDate: string; vatLiable: boolean; isBank: (account: number) => boolean },
): AssistantFit {
  const payments = paymentIndexOf(entries, opts.isBank)
  if (payments.length !== 1) return { fits: false, reason: 'payment' }
  const paymentIndex = payments[0]
  // Open items (eraid) are fine: an unedited rebuild maps every line 1:1 and withLineIdentity
  // keeps each line's eraid (Kitsas keeps the payment line's era the same way).
  if (entries.some((e) => e.date !== opts.voucherDate)) return { fits: false, reason: 'date' }
  if (!opts.vatLiable && entries.some((e) => Number(e.vat_code || 0))) {
    return { fits: false, reason: 'not_liable' }
  }
  const expense = opts.voucherType !== 200
  const { pairs, unpaired } = pairVatLines(entries, paymentIndex)
  if (unpaired.length || !pairs.length) return { fits: false, reason: 'vat' }
  for (const pair of pairs) {
    const { net, vats } = pair
    const onDebit = Number(net.debit_cents || 0) > 0
    if (onDebit !== expense) return { fits: false, reason: 'side' }
    const code = Number(net.vat_code || 0)
    const pct = Number(net.vat_percent || 0)
    const booked = vatBooking(code, pct, rowAmountCents(pair), !expense)
    if (booked.mainCents !== lineCents(net) || booked.lines.length !== vats.length) {
      return { fits: false, reason: 'vat' }
    }
    for (let i = 0; i < vats.length; i++) {
      const want = booked.lines[i]
      const got = vats[i]
      if (
        Number(got.account) !== want.account ||
        Number(got.vat_code || 0) !== want.vat_code ||
        Number(got.debit_cents || 0) !== Number(want.debit_cents || 0) ||
        Number(got.credit_cents || 0) !== Number(want.credit_cents || 0)
      ) {
        return { fits: false, reason: 'vat' }
      }
    }
  }
  const payment = entries[paymentIndex]
  if (Number(payment.debit_cents || 0) > 0 === expense) return { fits: false, reason: 'side' }
  return { fits: true, paymentIndex }
}

/** Transfer form (one from/to pair) fits only a plain two-line voucher. */
export function transferFits(entries: VoucherEntry[], voucherDate: string): boolean {
  if (entries.length !== 2) return false
  const [a, b] = entries
  const debit = [a, b].filter((e) => Number(e.debit_cents || 0) > 0)
  if (debit.length !== 1) return false
  return (
    lineCents(a) === lineCents(b) &&
    entries.every((e) => !Number(e.vat_code || 0) && e.date === voucherDate)
  )
}

/**
 * Reuse stored line identity for lines the assistant rebuilt: payment <-> payment line,
 * net lines and VAT lines in order (Kitsas keeps the payment line id the same way).
 * Lines left over are dropped (deleted on save). Sets Kitsas line types (class + 1/2/3).
 */
export function withLineIdentity(
  rebuilt: LineDraft[],
  previous: LineDraft[],
  opts: { voucherType: number; paymentFirst: boolean },
): LineDraft[] {
  const cls = opts.voucherType === 200 ? 200 : 100
  const isVat = (l: LineDraft) => isVatBookingLine(l)
  const prevPayment = previous.find((l) => Number(l.entry_type || 0) % 100 === ENTRY_COUNTER_POSTING)
  const prevNet = previous.filter((l) => l !== prevPayment && !isVat(l))
  const prevVat = previous.filter((l) => l !== prevPayment && isVat(l))
  let net = 0
  let vat = 0
  return rebuilt.map((line, i) => {
    let prev: LineDraft | undefined
    let kind: number
    if (opts.paymentFirst && i === 0) {
      prev = prevPayment
      kind = ENTRY_COUNTER_POSTING
    } else if (isVat(line)) {
      prev = prevVat[vat++]
      kind = ENTRY_VAT_POSTING
    } else {
      prev = prevNet[net++]
      kind = ENTRY_POSTING
    }
    const identity = prev?.id != null
      ? {
          id: prev.id,
          json: prev.json,
          archive_id: line.archive_id || prev.archive_id,
          partner: prev.partner,
          // The payment line keeps its open item (Kitsas valitutErat_) while its account does.
          item_id: prev.account === line.account ? (prev.item_id ?? null) : null,
        }
      : {}
    return { ...line, ...identity, entry_type: cls + kind }
  })
}

/** VAT cents the assistant books for a gross amount (Kitsas rounds per row). */
export function vatFromGross(grossCents: number, percent: number): number {
  return Math.round((grossCents * percent) / (100 + percent))
}

export { isPurchaseVatCode, vatAccount, vatBooking, vatCompanionCode }
